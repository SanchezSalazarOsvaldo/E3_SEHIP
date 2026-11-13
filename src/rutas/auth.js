// RF-WEB-01: inicio y cierre de sesión del ingeniero civil.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { MENSAJES, ROL_INGENIERO, credencialesConFormatoValido } = require('../../public/js/validaciones');

const router = express.Router();

// Inicio de sesión: valida formato, existencia del correo, contraseña, cuenta activa y rol.
// Cualquier incumplimiento devuelve el mismo mensaje para no revelar la causa.
router.post('/login', async (req, res) => {
  const datos = req.body || {};
  const correo = String(datos.correo ?? '').trim();
  const contrasena = String(datos.contrasena ?? '');

  if (!credencialesConFormatoValido(correo, contrasena)) {
    return res.status(401).json({ error: MENSAJES.loginIncorrecto });
  }

  const { rows: filas } = await db.query(
    `SELECT u.id_usuario, u.nombre, u.correo, u.contrasena_hash, u.activo, u.debe_cambiar_contrasena,
            r.nombre AS rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
      WHERE LOWER(u.correo) = LOWER($1)`,
    [correo]
  );
  const usuario = filas[0];

  const accesoValido = usuario
    && usuario.activo
    && usuario.rol === ROL_INGENIERO
    && await bcrypt.compare(contrasena, usuario.contrasena_hash);

  if (!accesoValido) {
    return res.status(401).json({ error: MENSAJES.loginIncorrecto });
  }

  req.session.usuario = datosSesion(usuario);
  res.json({ usuario: req.session.usuario });
});

// Datos que se guardan en la sesión. debeCambiarContrasena = true mientras la contraseña sea temporal.
function datosSesion(fila) {
  return {
    id: fila.id_usuario,
    nombre: fila.nombre,
    correo: fila.correo,
    rol: fila.rol,
    debeCambiarContrasena: fila.debe_cambiar_contrasena === true
  };
}

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Usuario de la sesión, comprobado contra la base de datos: si la cuenta fue desactivada la sesión se
// cierra (null) y la marca de contraseña temporal se actualiza con su valor vigente.
async function sesionVigente(req) {
  const usuario = req.session.usuario;
  if (!usuario) return null;
  const { rows: filas } = await db.query(
    'SELECT activo, debe_cambiar_contrasena FROM usuario WHERE id_usuario = $1',
    [usuario.id]
  );
  if (filas.length === 0 || !filas[0].activo) {
    req.session.destroy(() => {});
    return null;
  }
  req.session.usuario = { ...usuario, debeCambiarContrasena: filas[0].debe_cambiar_contrasena };
  return req.session.usuario;
}

// Datos del usuario con sesión activa (cualquier rol).
router.get('/sesion', async (req, res) => {
  const usuario = await sesionVigente(req);
  if (!usuario) return res.status(401).json({ error: 'No hay una sesión activa' });
  res.json({ usuario });
});

// Comprueba en cada petición que la cuenta de la sesión siga activa y que ya no tenga contraseña temporal.
// Responde y devuelve false si no puede continuar: 401 si la cuenta fue desactivada (RF-ADM-07; la sesión
// se cierra) y 403 con estado 'cambio-obligatorio' si aún debe cambiar la contraseña temporal.
async function cuentaHabilitada(req, res) {
  const { rows: filas } = await db.query(
    'SELECT activo, debe_cambiar_contrasena FROM usuario WHERE id_usuario = $1',
    [req.session.usuario.id]
  );
  if (filas.length === 0 || !filas[0].activo) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'Debe iniciar sesión' });
    return false;
  }
  if (filas[0].debe_cambiar_contrasena) {
    res.status(403).json({ error: MENSAJES.cambioObligatorio, estado: 'cambio-obligatorio' });
    return false;
  }
  return true;
}

// Middleware para rutas del módulo de simulación: exige sesión de Ingeniero Civil con cuenta habilitada.
async function requiereSesion(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).json({ error: 'Debe iniciar sesión' });
  }
  if (!await cuentaHabilitada(req, res)) return;
  if (req.session.usuario.rol !== ROL_INGENIERO) {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol de Ingeniero Civil' });
  }
  next();
}

module.exports = { router, requiereSesion, cuentaHabilitada, datosSesion, sesionVigente };
