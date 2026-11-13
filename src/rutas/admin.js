// RF-ADM-01 a RF-ADM-07: módulo web de administración del sistema.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const calc = require('../../public/js/validaciones');
const { enviarCorreo } = require('../correo');
const { cuentaHabilitada, datosSesion, sesionVigente } = require('./auth');

const router = express.Router();
const ROL_ADMIN = calc.ROL_ADMINISTRADOR;

// Códigos de error de PostgreSQL: 23505 = valor duplicado (índice único), P0001 = RAISE EXCEPTION de un trigger.
const ERROR_DUPLICADO = '23505';
const ERROR_TRIGGER = 'P0001';

function fechaHoraActual() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

// ---------- RF-ADM-01: inicio de sesión ----------
// Cualquier incumplimiento (formato, correo, contraseña, rol o cuenta inactiva) devuelve el mismo mensaje.
router.post('/login', async (req, res) => {
  const datos = req.body || {};
  const correo = String(datos.correo ?? '').trim();
  const contrasena = String(datos.contrasena ?? '');
  if (!calc.credencialesConFormatoValido(correo, contrasena)) {
    return res.status(401).json({ error: calc.MENSAJES.adminLoginIncorrecto });
  }
  const { rows: filas } = await db.query(
    `SELECT u.id_usuario, u.nombre, u.correo, u.contrasena_hash, u.activo, u.debe_cambiar_contrasena,
            r.nombre AS rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE LOWER(u.correo) = LOWER($1)`,
    [correo]
  );
  const u = filas[0];
  const accesoValido = u && u.rol === ROL_ADMIN && u.activo
    && await bcrypt.compare(contrasena, u.contrasena_hash);
  if (!accesoValido) {
    return res.status(401).json({ error: calc.MENSAJES.adminLoginIncorrecto });
  }
  req.session.usuario = datosSesion(u);
  res.json({ usuario: req.session.usuario });
});

// ---------- Configuración del administrador inicial ----------
// Mientras no exista el administrador inicial (cuenta protegida), admin.html muestra un formulario para
// crearlo. En cuanto existe, estas rutas dejan de permitir altas.
async function administradorInicialExiste() {
  const { rows: filas } = await db.query('SELECT COUNT(*) AS total FROM usuario WHERE protegido');
  return filas[0].total > 0;
}

router.get('/configuracion-inicial', async (req, res) => {
  res.json({ pendiente: !await administradorInicialExiste() });
});

router.post('/configuracion-inicial', async (req, res) => {
  if (await administradorInicialExiste()) {
    return res.status(409).json({ error: calc.MENSAJES.configuracionHecha });
  }
  const datos = req.body || {};
  const nombre = String(datos.nombre ?? '').trim();
  const correo = String(datos.correo ?? '').trim();
  const contrasena = String(datos.contrasena ?? '');
  if (!calc.datosCuentaValidos(nombre, correo, ROL_ADMIN)) {
    return res.status(400).json({ error: calc.MENSAJES.cuentaInvalida });
  }
  const errorContrasena = calc.validarNuevaContrasena(contrasena, String(datos.confirmacion ?? ''));
  if (errorContrasena) return res.status(400).json({ error: errorContrasena });

  const hash = await bcrypt.hash(contrasena, 10);
  let idNuevo;
  try {
    const { rows: insertados } = await db.query(
      `INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol, activo, protegido)
       VALUES ($1, $2, $3, (SELECT id_rol FROM rol WHERE nombre = $4), TRUE, TRUE)
       RETURNING id_usuario`,
      [nombre, correo, hash, ROL_ADMIN]
    );
    idNuevo = insertados[0].id_usuario;
  } catch (error) {
    // P0001: el trigger impidió un segundo administrador protegido (dos altas simultáneas).
    if (error.code === ERROR_TRIGGER) return res.status(409).json({ error: calc.MENSAJES.configuracionHecha });
    if (error.code === ERROR_DUPLICADO) return res.status(400).json({ error: calc.MENSAJES.cuentaInvalida });
    throw error;
  }
  req.session.usuario = datosSesion({
    id_usuario: idNuevo, nombre, correo, rol: ROL_ADMIN, debe_cambiar_contrasena: false
  });
  res.status(201).json({ usuario: req.session.usuario, mensaje: calc.MENSAJES.administradorInicialCreado });
});

// Estado de la sesión: 200 administrador, 403 otro rol, 401 sin sesión.
router.get('/sesion', async (req, res) => {
  const usuario = await sesionVigente(req);
  if (!usuario) return res.status(401).json({ error: 'No hay una sesión activa' });
  if (usuario.rol !== ROL_ADMIN) return res.status(403).json({ error: calc.MENSAJES.accesoDenegado, usuario });
  res.json({ usuario });
});

// Las demás rutas exigen sesión de administrador con cuenta activa (RF-ADM-02, flujo alterno 1).
// El rol se toma de la sesión: un cambio de rol rige desde el siguiente inicio de sesión (RF-ADM-06).
async function requiereAdmin(req, res, next) {
  const usuario = req.session.usuario;
  if (!usuario) return res.status(401).json({ error: 'Debe iniciar sesión' });
  if (!await cuentaHabilitada(req, res)) return;
  if (usuario.rol !== ROL_ADMIN) return res.status(403).json({ error: calc.MENSAJES.accesoDenegado });
  next();
}
router.use(requiereAdmin);

// ---------- RF-ADM-02: panel de control ----------
router.get('/panel', async (req, res) => {
  const { rows: totales } = await db.query(
    `SELECT (SELECT COUNT(*) FROM proyecto) AS proyectos,
            (SELECT COUNT(*) FROM simulacion_mitigacion) AS simulaciones`
  );
  const { rows: incidencias } = await db.query(
    `SELECT p.latitud, p.longitud, p.fecha_registro AS "fechaRegistro", a.nombre AS alcaldia
       FROM punto_critico p
       JOIN alcaldia a ON a.id_alcaldia = p.id_alcaldia
      ORDER BY p.fecha_registro DESC`
  );
  res.json({
    totalProyectos: totales[0].proyectos,
    totalSimulaciones: totales[0].simulaciones,
    incidencias,
    fechaConsulta: fechaHoraActual(),
    mensaje: incidencias.length === 0 ? calc.MENSAJES.sinIncidencias : ''
  });
});

// ---------- RF-ADM-03: tabla maestra ----------
async function tablaMaestra() {
  const { rows: coef } = await db.query('SELECT tipo, valor FROM coeficiente_normativo');
  const coeficientes = { Cp: null, Ci: null };
  coef.forEach((f) => { coeficientes[f.tipo] = f.valor; });

  const { rows: filas } = await db.query(
    `SELECT a.id_alcaldia, a.nombre, i.periodo_retorno, i.intensidad_mm_h
       FROM alcaldia a
       LEFT JOIN intensidad_lluvia i ON i.id_alcaldia = a.id_alcaldia
      ORDER BY a.nombre, i.periodo_retorno`
  );
  const porAlcaldia = new Map();
  filas.forEach((f) => {
    if (!porAlcaldia.has(f.id_alcaldia)) {
      porAlcaldia.set(f.id_alcaldia, { idAlcaldia: f.id_alcaldia, alcaldia: f.nombre, valores: {} });
    }
    if (f.periodo_retorno != null) porAlcaldia.get(f.id_alcaldia).valores[f.periodo_retorno] = f.intensidad_mm_h;
  });
  return { coeficientes, intensidades: [...porAlcaldia.values()] };
}

router.get('/tabla-maestra', async (req, res) => {
  res.json(await tablaMaestra());
});

router.post('/tabla-maestra', async (req, res) => {
  const datos = req.body || {};
  const tipo = datos.tipo;
  const esIntensidad = tipo === 'intensidad';
  if (!esIntensidad && tipo !== 'Cp' && tipo !== 'Ci') {
    return res.status(400).json({ error: calc.MENSAJES.valorNoNumerico });
  }
  const validacion = calc.validarValorParametro(tipo, datos.valor);
  if (validacion.error) return res.status(400).json({ error: validacion.error });

  // El valor se sobrescribe sin conservar el anterior; los proyectos ya calculados no se recalculan.
  // rowCount indica cuántas filas cambió el UPDATE (0 si la alcaldía o el período no existen).
  let resultado;
  if (esIntensidad) {
    resultado = await db.query(
      `UPDATE intensidad_lluvia SET intensidad_mm_h = $1, fecha_actualizacion = LOCALTIMESTAMP(0)
        WHERE id_alcaldia = $2 AND periodo_retorno = $3`,
      [validacion.valor, Number(datos.idAlcaldia), Number(datos.periodo)]
    );
  } else {
    resultado = await db.query(
      'UPDATE coeficiente_normativo SET valor = $1, fecha_actualizacion = LOCALTIMESTAMP(0) WHERE tipo = $2',
      [validacion.valor, tipo]
    );
  }
  if (resultado.rowCount === 0) return res.status(400).json({ error: calc.MENSAJES.valorNoNumerico });

  res.json({ ...(await tablaMaestra()), mensaje: calc.MENSAJES.parametroActualizado });
});

// ---------- RF-ADM-05: consultar usuarios ----------
async function todosLosUsuarios(idSesion) {
  const { rows: filas } = await db.query(
    `SELECT u.id_usuario, u.nombre, u.correo, u.activo, u.protegido, r.nombre AS rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      ORDER BY u.id_usuario`
  );
  return filas.map((f) => ({
    id: f.id_usuario, nombre: f.nombre, correo: f.correo, rol: f.rol,
    activo: f.activo, protegido: f.protegido, propio: f.id_usuario === idSesion
  }));
}

// Sin el parámetro buscar devuelve todas las cuentas; con él aplica las reglas de RF-ADM-05.
router.get('/usuarios', async (req, res) => {
  const usuarios = await todosLosUsuarios(req.session.usuario.id);
  if (req.query.buscar === undefined) return res.json({ usuarios });

  const texto = String(req.query.buscar);
  if (!calc.busquedaValida(texto)) return res.status(400).json({ error: calc.MENSAJES.busquedaLongitud });
  const encontrados = usuarios.filter((u) => calc.usuarioCoincide(u, texto));
  if (encontrados.length === 0) return res.status(404).json({ error: calc.MENSAJES.sinUsuarios, usuarios: [] });
  res.json({ usuarios: encontrados });
});

// ---------- RF-ADM-04: crear cuenta ----------
function textoCuentaCreada(nombre, correo, rol, temporal) {
  const acceso = rol === ROL_ADMIN ? 'Acceso administrativo (admin.html)' : 'inicio de sesión de SEHIP';
  return `Hola ${nombre}:\n\nSe creó tu cuenta en SEHIP con el rol ${rol}.\n\n`
    + `Correo: ${correo}\nContraseña temporal: ${temporal}\n\n`
    + `Ingresa por el ${acceso}. Al iniciar sesión por primera vez se te pedirá cambiar la contraseña temporal `
    + 'por una propia.\n\nSi no esperabas este correo, ignóralo.';
}

router.post('/usuarios', async (req, res) => {
  const datos = req.body || {};
  const nombre = String(datos.nombre ?? '').trim();
  const correo = String(datos.correo ?? '').trim();
  const rol = datos.rol;

  if (!calc.datosCuentaValidos(nombre, correo, rol)) {
    return res.status(400).json({ error: calc.MENSAJES.cuentaInvalida });
  }
  const { rows: existentes } = await db.query('SELECT id_usuario FROM usuario WHERE LOWER(correo) = LOWER($1)', [correo]);
  if (existentes.length > 0) return res.status(400).json({ error: calc.MENSAJES.cuentaInvalida });

  // Contraseña temporal de 12 caracteres, guardada cifrada con bcrypt.
  const temporal = calc.generarContrasenaTemporal((n) => Array.from(crypto.randomBytes(n)));
  const hash = await bcrypt.hash(temporal, 10);
  let idNuevo;
  try {
    const { rows: insertados } = await db.query(
      `INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol, activo, protegido, debe_cambiar_contrasena)
       VALUES ($1, $2, $3, (SELECT id_rol FROM rol WHERE nombre = $4), TRUE, FALSE, TRUE)
       RETURNING id_usuario`,
      [nombre, correo, hash, rol]
    );
    idNuevo = insertados[0].id_usuario;
  } catch (error) {
    if (error.code === ERROR_DUPLICADO) return res.status(400).json({ error: calc.MENSAJES.cuentaInvalida });
    throw error;
  }

  // Si el correo falla, la cuenta creada se revierte (flujo alterno 2).
  try {
    await enviarCorreo({
      para: correo,
      asunto: 'SEHIP · Tu cuenta y contraseña temporal',
      texto: textoCuentaCreada(nombre, correo, rol, temporal)
    });
  } catch (error) {
    console.error('Fallo al enviar la contraseña temporal:', error.message);
    await db.query('DELETE FROM usuario WHERE id_usuario = $1', [idNuevo]);
    return res.status(502).json({ error: calc.MENSAJES.correoFallido });
  }

  res.status(201).json({
    usuarios: await todosLosUsuarios(req.session.usuario.id),
    mensaje: `Cuenta creada. La contraseña temporal se envió a ${correo}`
  });
});

// Cuenta por identificador con su rol actual (o null si no existe).
async function buscarCuenta(idTexto) {
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows: filas } = await db.query(
    `SELECT u.id_usuario, u.activo, u.protegido, r.nombre AS rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = $1`,
    [id]
  );
  return filas[0] || null;
}

// ---------- RF-ADM-06: modificar rol ----------
router.post('/usuarios/:id/rol', async (req, res) => {
  const rolNuevo = (req.body || {}).rol;
  const cuenta = await buscarCuenta(req.params.id);
  if (!cuenta) return res.status(404).json({ error: calc.MENSAJES.usuarioNoExiste });
  if (!calc.ROLES.includes(rolNuevo)) return res.status(400).json({ error: calc.MENSAJES.cuentaInvalida });
  if (cuenta.rol === rolNuevo) return res.status(400).json({ error: calc.MENSAJES.rolIgual });

  // Debe quedar al menos un administrador activo.
  if (cuenta.rol === ROL_ADMIN && cuenta.activo) {
    const { rows: otros } = await db.query(
      `SELECT COUNT(*) AS total
         FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol
        WHERE r.nombre = $1 AND u.activo AND u.id_usuario <> $2`,
      [ROL_ADMIN, cuenta.id_usuario]
    );
    if (otros[0].total === 0) return res.status(400).json({ error: calc.MENSAJES.ultimoAdministrador });
  }
  if (cuenta.protegido) return res.status(400).json({ error: calc.MENSAJES.administradorProtegido });

  try {
    await db.query(
      'UPDATE usuario SET id_rol = (SELECT id_rol FROM rol WHERE nombre = $1) WHERE id_usuario = $2',
      [rolNuevo, cuenta.id_usuario]
    );
  } catch (error) {
    // Los triggers de la base de datos protegen al administrador inicial.
    if (error.code === ERROR_TRIGGER) return res.status(400).json({ error: calc.MENSAJES.administradorProtegido });
    throw error;
  }
  res.json({ usuarios: await todosLosUsuarios(req.session.usuario.id), mensaje: calc.MENSAJES.rolModificado });
});

// ---------- RF-ADM-07: deshabilitar cuenta ----------
// La cuenta queda inactiva; sus sesiones abiertas se cierran porque cada petición verifica el estado de la
// cuenta, y su historial de proyectos se conserva.
router.post('/usuarios/:id/desactivar', async (req, res) => {
  const cuenta = await buscarCuenta(req.params.id);
  if (!cuenta) return res.status(404).json({ error: calc.MENSAJES.usuarioNoExiste });
  if (cuenta.id_usuario === req.session.usuario.id) return res.status(400).json({ error: calc.MENSAJES.cuentaPropia });
  if (!cuenta.activo) return res.status(400).json({ error: calc.MENSAJES.cuentaYaInactiva });
  if (cuenta.protegido) return res.status(400).json({ error: calc.MENSAJES.administradorProtegido });

  try {
    await db.query('UPDATE usuario SET activo = FALSE WHERE id_usuario = $1', [cuenta.id_usuario]);
  } catch (error) {
    if (error.code === ERROR_TRIGGER) return res.status(400).json({ error: calc.MENSAJES.administradorProtegido });
    throw error;
  }
  res.json({ usuarios: await todosLosUsuarios(req.session.usuario.id), mensaje: calc.MENSAJES.cuentaDesactivada });
});

// ---------- Reactivar cuenta ----------
// La cuenta vuelve a estar activa con su misma contraseña, rol e historial de proyectos.
router.post('/usuarios/:id/reactivar', async (req, res) => {
  const cuenta = await buscarCuenta(req.params.id);
  if (!cuenta) return res.status(404).json({ error: calc.MENSAJES.usuarioNoExiste });
  if (cuenta.activo) return res.status(400).json({ error: calc.MENSAJES.cuentaYaActiva });

  await db.query('UPDATE usuario SET activo = TRUE WHERE id_usuario = $1', [cuenta.id_usuario]);
  res.json({ usuarios: await todosLosUsuarios(req.session.usuario.id), mensaje: calc.MENSAJES.cuentaReactivada });
});

module.exports = router;
