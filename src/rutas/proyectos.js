// RF-WEB-02 a RF-WEB-08: proyectos, simulación hidrológica y reportes técnicos del ingeniero civil.
const express = require('express');
const db = require('../db');
const { requiereSesion } = require('./auth');
const calc = require('../../public/js/validaciones');
const { alcaldiaEnPunto } = require('../../public/js/limites-alcaldias');

const router = express.Router();
const PROYECTOS_POR_PAGINA = 10;

// Límites diarios por cuenta para que el almacenamiento de la base de datos no pueda llenarse.
const PROYECTOS_POR_DIA = 100;
const BYTES_REPORTES_POR_DIA = 25 * 1024 * 1024;   // 25 MB de reportes PDF por día

// Todas las rutas de este archivo requieren una sesión activa.
router.use(requiereSesion);

// ---------- Conversión de filas de PostgreSQL al formato que usa el navegador ----------

function aProyecto(f) {
  return {
    id: f.id_proyecto,
    idUsuario: f.id_usuario,
    nombre: f.nombre,
    idAlcaldia: f.id_alcaldia,
    alcaldia: f.alcaldia,
    latitud: f.latitud,
    longitud: f.longitud,
    fechaCreacion: f.fecha_creacion,
    estado: f.estado,
    superficiePermeable: f.superficie_permeable,
    superficieImpermeable: f.superficie_impermeable,
    superficieTotal: f.superficie_total,
    coeficiente: f.coeficiente_c,
    intensidad: f.intensidad_mm_h,
    periodoRetorno: f.periodo_retorno,
    caudalPico: f.caudal_pico
  };
}

function aSimulacion(f) {
  return {
    id: f.id_simulacion,
    idProyecto: f.id_proyecto,
    tipoObra: f.tipo_obra,
    capacidad: f.capacidad_almacenamiento,
    caudalPico: f.caudal_pico,
    latitud: f.latitud,
    longitud: f.longitud,
    distancia: f.distancia_m,
    eficiencia: f.eficiencia,
    retencion: f.retencion,
    caudalAjustado: f.caudal_ajustado,
    caudalPermitido: f.caudal_permitido,
    dentroDeCapacidad: f.dentro_de_capacidad === true,
    fechaHora: f.fecha_hora
  };
}

function aReporte(f) {
  return {
    id: f.id_reporte,
    idProyecto: f.id_proyecto,
    nombreArchivo: f.nombre_archivo,
    tamanoBytes: f.tamano_bytes,
    fechaGeneracion: f.fecha_generacion,
    url: `/api/reportes/${f.id_reporte}/descargar`
  };
}

// ---------- Consultas ----------

// Fila del proyecto solo si pertenece al usuario activo.
async function buscarProyectoPropio(idTexto, idUsuario) {
  if (!calc.identificadorValido(idTexto)) return null;
  const id = Number(idTexto);

  const { rows: filas } = await db.query(
    `SELECT p.*, a.nombre AS alcaldia
       FROM proyecto p
       JOIN alcaldia a ON a.id_alcaldia = p.id_alcaldia
      WHERE p.id_proyecto = $1 AND p.id_usuario = $2`,
    [id, idUsuario]
  );
  return filas[0] || null;
}

// Coeficientes Cp y Ci vigentes de la tabla maestra normativa.
async function coeficientesNormativos() {
  const { rows: filas } = await db.query('SELECT tipo, valor FROM coeficiente_normativo');
  const coeficientes = { Cp: null, Ci: null };
  filas.forEach((fila) => { coeficientes[fila.tipo] = fila.valor; });
  return coeficientes;
}

// Caudal pico y estado después de un cambio de datos: si el proyecto ya estaba calculado se recalcula
// para que la simulación se actualice; si faltan datos o salen de rango, se borra.
function caudalActualizado(estadoActual, coeficiente, intensidad, superficieTotal) {
  const error = calc.validarParametrosCaudal(coeficiente, intensidad, superficieTotal);
  if (estadoActual === 'Calculado' && !error) {
    return { caudal: calc.calcularCaudalPico(coeficiente, intensidad, superficieTotal), estado: 'Calculado' };
  }
  return { caudal: null, estado: 'En proceso' };
}

function textoRecalculo(caudal) {
  return caudal != null ? ` · Caudal pico recalculado: ${caudal.toFixed(3)} m³/s` : '';
}

// Middleware: carga el proyecto de la URL en req.proyecto o responde con el mensaje de no encontrado.
async function cargarProyecto(req, res, next) {
  const fila = await buscarProyectoPropio(req.params.id, req.session.usuario.id);
  if (!fila) {
    return res.status(404).json({ error: calc.MENSAJES.proyectoNoEncontrado });
  }
  req.fila = fila;
  next();
}

// Respuesta estándar: proyecto actualizado, simulaciones (la más reciente primero) y reportes.
async function responderProyecto(res, idProyecto, idUsuario, mensaje = '') {
  const fila = await buscarProyectoPropio(idProyecto, idUsuario);
  const { rows: simulaciones } = await db.query(
    `SELECT * FROM simulacion_mitigacion WHERE id_proyecto = $1
      ORDER BY fecha_hora DESC, id_simulacion DESC`,
    [idProyecto]
  );
  const { rows: reportes } = await db.query(
    `SELECT * FROM reporte_pdf WHERE id_proyecto = $1
      ORDER BY fecha_generacion DESC, id_reporte DESC`,
    [idProyecto]
  );
  const listaSimulaciones = simulaciones.map(aSimulacion);
  res.json({
    proyecto: aProyecto(fila),
    simulacion: listaSimulaciones[0] || null,
    simulaciones: listaSimulaciones,
    reportes: reportes.map(aReporte),
    mensaje
  });
}

// ---------- Catálogos ----------

router.get('/alcaldias', async (req, res) => {
  const { rows: filas } = await db.query('SELECT id_alcaldia AS id, nombre FROM alcaldia ORDER BY nombre');
  res.json({ alcaldias: filas });
});

router.get('/coeficientes', async (req, res) => {
  res.json({ coeficientes: await coeficientesNormativos() });
});

// Intensidades normativas de una alcaldía para los cinco períodos de retorno (null = pendiente de capturar).
router.get('/alcaldias/:id/intensidades', async (req, res) => {
  if (!calc.identificadorValido(req.params.id)) {
    return res.status(400).json({ error: calc.MENSAJES.periodoInvalido });
  }
  const { rows: filas } = await db.query(
    'SELECT periodo_retorno, intensidad_mm_h FROM intensidad_lluvia WHERE id_alcaldia = $1 ORDER BY periodo_retorno',
    [Number(req.params.id)]
  );
  const intensidades = {};
  filas.forEach((f) => { intensidades[f.periodo_retorno] = f.intensidad_mm_h; });
  res.json({ intensidades });
});

// ---------- RF-WEB-03: historial paginado de proyectos propios ----------
router.get('/proyectos', async (req, res) => {
  const idUsuario = req.session.usuario.id;

  const { rows: conteo } = await db.query('SELECT COUNT(*) AS total FROM proyecto WHERE id_usuario = $1', [idUsuario]);
  const total = conteo[0].total;
  if (total === 0) {
    return res.status(404).json({ proyectos: [], error: calc.MENSAJES.proyectoNoEncontrado });
  }

  const totalPaginas = Math.ceil(total / PROYECTOS_POR_PAGINA);
  const pagina = Math.min(Math.max(1, parseInt(req.query.pagina, 10) || 1), totalPaginas);

  const { rows: filas } = await db.query(
    `SELECT p.*, a.nombre AS alcaldia
       FROM proyecto p
       JOIN alcaldia a ON a.id_alcaldia = p.id_alcaldia
      WHERE p.id_usuario = $1
      ORDER BY p.fecha_creacion DESC, p.id_proyecto DESC
      LIMIT $2 OFFSET $3`,
    [idUsuario, PROYECTOS_POR_PAGINA, (pagina - 1) * PROYECTOS_POR_PAGINA]
  );

  res.json({ proyectos: filas.map(aProyecto), pagina, totalPaginas });
});

// ---------- RF-WEB-02: registrar proyecto ----------
router.post('/proyectos', async (req, res) => {
  const datos = req.body || {};
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const idAlcaldia = Number(datos.idAlcaldia);

  let alcaldia = null;
  if (Number.isInteger(idAlcaldia) && idAlcaldia > 0) {
    const { rows: filas } = await db.query('SELECT id_alcaldia, nombre FROM alcaldia WHERE id_alcaldia = $1', [idAlcaldia]);
    alcaldia = filas[0] || null;
  }
  if (!calc.nombreProyectoValido(nombre) || !alcaldia) {
    return res.status(400).json({ error: calc.MENSAJES.proyectoInvalido });
  }

  // El punto debe estar dentro de la CDMX y dentro de la alcaldía seleccionada.
  const alcaldiaDelPunto = calc.coordenadasValidas(datos.latitud, datos.longitud)
    ? alcaldiaEnPunto(datos.latitud, datos.longitud)
    : null;
  if (!alcaldiaDelPunto) {
    return res.status(400).json({ error: calc.MENSAJES.ubicacionFuera });
  }
  if (alcaldiaDelPunto !== alcaldia.nombre) {
    return res.status(400).json({ error: calc.MENSAJES.proyectoInvalido });
  }
  const latitud = Number(Number(datos.latitud).toFixed(6));
  const longitud = Number(Number(datos.longitud).toFixed(6));

  const { rows: hoy } = await db.query(
    'SELECT COUNT(*) AS total FROM proyecto WHERE id_usuario = $1 AND fecha_creacion = CURRENT_DATE',
    [req.session.usuario.id]
  );
  if (hoy[0].total >= PROYECTOS_POR_DIA) {
    return res.status(429).json({ error: calc.MENSAJES.limiteProyectos });
  }

  // fecha_creacion y estado ('En proceso') toman su valor por defecto en la base de datos.
  // RETURNING devuelve el identificador que asignó la base de datos.
  const { rows: insertados } = await db.query(
    `INSERT INTO proyecto (id_usuario, nombre, id_alcaldia, latitud, longitud)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_proyecto`,
    [req.session.usuario.id, nombre, idAlcaldia, latitud, longitud]
  );
  const idProyecto = insertados[0].id_proyecto;
  res.status(201);
  await responderProyecto(res, idProyecto, req.session.usuario.id,
    `Proyecto registrado correctamente con el identificador ${idProyecto}`);
});

// ---------- RF-WEB-03: abrir un proyecto propio ----------
router.get('/proyectos/:id', cargarProyecto, async (req, res) => {
  await responderProyecto(res, req.fila.id_proyecto, req.session.usuario.id);
});

// ---------- RF-WEB-04: coeficiente de escurrimiento ponderado ----------
router.post('/proyectos/:id/coeficiente', cargarProyecto, async (req, res) => {
  const datos = req.body || {};
  const superficies = calc.validarSuperficies(datos.superficiePermeable, datos.superficieImpermeable);
  if (superficies.error) return res.status(400).json({ error: superficies.error });

  const { Cp, Ci } = await coeficientesNormativos();
  if (Cp == null || Ci == null) {
    return res.status(400).json({ error: calc.MENSAJES.coeficientesNoRegistrados });
  }

  const { ap, ai, total } = superficies;
  const coeficiente = calc.calcularCoeficiente(Cp, Ci, ap, ai);
  const p = req.fila;

  // Si cambian las superficies o el coeficiente, el caudal pico se recalcula.
  let caudal = p.caudal_pico;
  if (p.superficie_permeable !== ap || p.superficie_impermeable !== ai || p.coeficiente_c !== coeficiente) {
    const nuevo = caudalActualizado(p.estado, coeficiente, p.intensidad_mm_h, total);
    caudal = nuevo.caudal;
    await db.query(
      `UPDATE proyecto
          SET superficie_permeable = $1, superficie_impermeable = $2, superficie_total = $3,
              coeficiente_c = $4, caudal_pico = $5, estado = $6
        WHERE id_proyecto = $7`,
      [ap, ai, total, coeficiente, nuevo.caudal, nuevo.estado, p.id_proyecto]
    );
  }
  await responderProyecto(res, p.id_proyecto, req.session.usuario.id,
    `Coeficiente de escurrimiento calculado: C = ${coeficiente.toFixed(2)}${textoRecalculo(caudal)}`);
});

// ---------- RF-WEB-05: intensidad de lluvia normativa ----------
router.post('/proyectos/:id/intensidad', cargarProyecto, async (req, res) => {
  const periodo = Number((req.body || {}).periodoRetorno);
  const p = req.fila;

  if (!p.id_alcaldia || !calc.periodoValido(periodo)) {
    return res.status(400).json({ error: calc.MENSAJES.periodoInvalido });
  }

  const { rows: filas } = await db.query(
    'SELECT intensidad_mm_h FROM intensidad_lluvia WHERE id_alcaldia = $1 AND periodo_retorno = $2',
    [p.id_alcaldia, periodo]
  );
  const intensidad = filas.length ? filas[0].intensidad_mm_h : null;
  if (intensidad == null) {
    return res.status(400).json({ error: calc.MENSAJES.intensidadNoRegistrada });
  }

  // Si cambia la intensidad, el caudal pico se recalcula.
  let caudal = p.caudal_pico;
  if (p.intensidad_mm_h !== intensidad || p.periodo_retorno !== periodo) {
    const nuevo = caudalActualizado(p.estado, p.coeficiente_c, intensidad, p.superficie_total);
    caudal = nuevo.caudal;
    await db.query(
      `UPDATE proyecto
          SET intensidad_mm_h = $1, periodo_retorno = $2, caudal_pico = $3, estado = $4
        WHERE id_proyecto = $5`,
      [intensidad, periodo, nuevo.caudal, nuevo.estado, p.id_proyecto]
    );
  }
  await responderProyecto(res, p.id_proyecto, req.session.usuario.id,
    `Intensidad de lluvia para ${periodo} años: ${intensidad.toFixed(2)} mm/h${textoRecalculo(caudal)}`);
});

// ---------- Mover el punto del proyecto ----------
// La alcaldía y la intensidad se toman de la nueva ubicación y el caudal pico se recalcula.
router.post('/proyectos/:id/ubicacion', cargarProyecto, async (req, res) => {
  const datos = req.body || {};
  const p = req.fila;
  const nombreAlcaldia = calc.coordenadasValidas(datos.latitud, datos.longitud)
    ? alcaldiaEnPunto(datos.latitud, datos.longitud)
    : null;
  if (!nombreAlcaldia) {
    return res.status(400).json({ error: calc.MENSAJES.ubicacionFuera });
  }
  const { rows: alcaldias } = await db.query('SELECT id_alcaldia FROM alcaldia WHERE nombre = $1', [nombreAlcaldia]);
  if (alcaldias.length === 0) {
    return res.status(400).json({ error: calc.MENSAJES.proyectoInvalido });
  }
  const idAlcaldia = alcaldias[0].id_alcaldia;

  let intensidad = p.intensidad_mm_h;
  if (p.periodo_retorno != null) {
    const { rows: filas } = await db.query(
      'SELECT intensidad_mm_h FROM intensidad_lluvia WHERE id_alcaldia = $1 AND periodo_retorno = $2',
      [idAlcaldia, p.periodo_retorno]
    );
    intensidad = filas.length ? filas[0].intensidad_mm_h : null;
    if (intensidad == null) {
      return res.status(400).json({ error: calc.MENSAJES.intensidadNoRegistrada });
    }
  }

  const nuevo = caudalActualizado(p.estado, p.coeficiente_c, intensidad, p.superficie_total);
  await db.query(
    `UPDATE proyecto
        SET latitud = $1, longitud = $2, id_alcaldia = $3, intensidad_mm_h = $4, caudal_pico = $5, estado = $6
      WHERE id_proyecto = $7`,
    [Number(Number(datos.latitud).toFixed(6)), Number(Number(datos.longitud).toFixed(6)),
      idAlcaldia, intensidad, nuevo.caudal, nuevo.estado, p.id_proyecto]
  );
  await responderProyecto(res, p.id_proyecto, req.session.usuario.id,
    `${calc.MENSAJES.ubicacionActualizada}: ${nombreAlcaldia}${textoRecalculo(nuevo.caudal)}`);
});

// ---------- RF-WEB-06: caudal pico por el Método Racional ----------
router.post('/proyectos/:id/caudal', cargarProyecto, async (req, res) => {
  const p = req.fila;
  const error = calc.validarParametrosCaudal(p.coeficiente_c, p.intensidad_mm_h, p.superficie_total);
  if (error) return res.status(400).json({ error });

  const caudal = calc.calcularCaudalPico(p.coeficiente_c, p.intensidad_mm_h, p.superficie_total);
  await db.query(
    `UPDATE proyecto SET caudal_pico = $1, estado = 'Calculado' WHERE id_proyecto = $2`,
    [caudal, p.id_proyecto]
  );
  await responderProyecto(res, p.id_proyecto, req.session.usuario.id,
    `Caudal pico calculado: Q = ${caudal.toFixed(3)} m³/s`);
});

// ---------- RF-WEB-07: simulación de obra de mitigación pluvial ----------
router.post('/proyectos/:id/mitigacion', cargarProyecto, async (req, res) => {
  const datos = req.body || {};
  const p = req.fila;

  if (!calc.tipoObraValido(datos.tipoObra)) {
    return res.status(400).json({ error: calc.MENSAJES.tipoObraFaltante });
  }
  const capacidad = calc.leerCapacidad(datos.capacidad);
  if (capacidad === null) {
    return res.status(400).json({ error: calc.MENSAJES.capacidadFueraDeRango });
  }
  if (p.caudal_pico == null) {
    return res.status(400).json({ error: calc.MENSAJES.caudalFaltante });
  }
  const { Cp } = await coeficientesNormativos();
  if (Cp == null) {
    return res.status(400).json({ error: calc.MENSAJES.cpNoRegistrado });
  }

  // La obra debe estar dentro de la zona afectada; su eficiencia depende de la distancia al proyecto.
  if (!calc.coordenadasValidas(datos.latitud, datos.longitud)) {
    return res.status(400).json({ error: calc.MENSAJES.obraSinUbicacion });
  }
  const latitud = Number(Number(datos.latitud).toFixed(6));
  const longitud = Number(Number(datos.longitud).toFixed(6));
  const caudalPermitido = calc.calcularCaudalPico(Cp, p.intensidad_mm_h, p.superficie_total);
  const radio = calc.radioAfectacion(p.superficie_total, p.caudal_pico, caudalPermitido);
  const distancia = calc.redondear(calc.distanciaMetros(p.latitud, p.longitud, latitud, longitud), 2);
  const eficiencia = calc.eficienciaPorUbicacion(distancia, radio);
  if (eficiencia === null) {
    return res.status(400).json({ error: calc.MENSAJES.obraFueraDeZona });
  }

  const resultado = calc.simularMitigacion({
    caudalPico: p.caudal_pico,
    capacidad,
    cp: Cp,
    intensidad: p.intensidad_mm_h,
    superficieM2: p.superficie_total,
    eficiencia
  });

  await db.query(
    `INSERT INTO simulacion_mitigacion
       (id_proyecto, tipo_obra, capacidad_almacenamiento, caudal_pico, latitud, longitud, distancia_m, eficiencia,
        retencion, caudal_ajustado, caudal_permitido, dentro_de_capacidad)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [p.id_proyecto, datos.tipoObra, capacidad, p.caudal_pico, latitud, longitud, distancia, eficiencia,
      resultado.retencion, resultado.caudalAjustado, resultado.caudalPermitido, resultado.dentroDeCapacidad]
  );
  await responderProyecto(res, p.id_proyecto, req.session.usuario.id, resultado.mensaje);
});

// ---------- RF-WEB-08: copia del reporte técnico en el historial ----------
// El navegador genera el PDF y envía su contenido en base64; el archivo completo se guarda en la columna
// reporte_pdf.contenido (BYTEA), porque el disco de un servidor en la nube se borra al reiniciarse.
router.post('/proyectos/:id/reportes', cargarProyecto, async (req, res) => {
  const datos = req.body || {};
  if (!calc.datosCompletosParaReporte(aProyecto(req.fila))) {
    return res.status(400).json({ error: calc.MENSAJES.reporteIncompleto });
  }

  const contenido = Buffer.from(String(datos.contenidoBase64 || ''), 'base64');
  const esPdf = contenido.subarray(0, 4).toString() === '%PDF';
  if (!esPdf || contenido.length < 1 || contenido.length > calc.TAMANO_MAXIMO_REPORTE) {
    return res.status(400).json({ error: calc.MENSAJES.reporteFallido });
  }

  // Suma de los reportes guardados por el usuario en las últimas 24 horas.
  const { rows: usados } = await db.query(
    `SELECT COALESCE(SUM(r.tamano_bytes), 0) AS total
       FROM reporte_pdf r
       JOIN proyecto p ON p.id_proyecto = r.id_proyecto
      WHERE p.id_usuario = $1 AND r.fecha_generacion > LOCALTIMESTAMP - INTERVAL '1 day'`,
    [req.session.usuario.id]
  );
  if (usados[0].total + contenido.length > BYTES_REPORTES_POR_DIA) {
    return res.status(429).json({ error: calc.MENSAJES.limiteReportes });
  }

  const p = req.fila;
  const nombreArchivo = String(datos.nombreArchivo || `SEHIP_Reporte_Proyecto_${p.id_proyecto}.pdf`)
    .replace(/[^\w.-]/g, '_')
    .slice(0, 150);

  await db.query(
    `INSERT INTO reporte_pdf (id_proyecto, nombre_archivo, contenido, tamano_bytes)
     VALUES ($1, $2, $3, $4)`,
    [p.id_proyecto, nombreArchivo, contenido, contenido.length]
  );
  await responderProyecto(res, p.id_proyecto, req.session.usuario.id,
    `Reporte técnico descargado: ${nombreArchivo}`);
});

// Descarga de un reporte del historial (solo si el proyecto pertenece al usuario activo).
router.get('/reportes/:id/descargar', async (req, res) => {
  if (!calc.identificadorValido(req.params.id)) {
    return res.status(404).json({ error: calc.MENSAJES.proyectoNoEncontrado });
  }
  const { rows: filas } = await db.query(
    `SELECT r.nombre_archivo, r.contenido
       FROM reporte_pdf r
       JOIN proyecto p ON p.id_proyecto = r.id_proyecto
      WHERE r.id_reporte = $1 AND p.id_usuario = $2`,
    [Number(req.params.id), req.session.usuario.id]
  );
  if (filas.length === 0) {
    return res.status(404).json({ error: calc.MENSAJES.proyectoNoEncontrado });
  }
  // contenido llega como Buffer (BYTEA) y se envía tal cual como archivo adjunto.
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filas[0].nombre_archivo}"`);
  res.send(filas[0].contenido);
});

module.exports = router;
