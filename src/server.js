// Servidor web de SEHIP: sirve las páginas de /public y la API REST bajo /api.
// En la nube corre en Render; la base de datos está en Supabase (PostgreSQL).
const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./db');
const AlmacenSesiones = require('./almacen-sesiones');
const { modoCorreo } = require('./correo');
const { MENSAJES } = require('../public/js/validaciones');
const { limiteGeneral, limiteEscrituraPorUsuario } = require('./limites');
const { router: rutasAuth } = require('./rutas/auth');
const rutasCuenta = require('./rutas/cuenta');
const rutasProyectos = require('./rutas/proyectos');
const rutasAdmin = require('./rutas/admin');

const PUERTO = Number(process.env.PORT || process.env.PUERTO || 3000);
const EN_PRODUCCION = process.env.NODE_ENV === 'production';
const app = express();

// No anuncia en las respuestas que el servidor usa Express.
app.disable('x-powered-by');

// En la nube las peticiones llegan a través del balanceador de Render (y del proxy de Vercel), que
// indican en X-Forwarded-Proto si el navegador usó HTTPS. trust proxy hace que Express confíe en ese dato.
if (EN_PRODUCCION) app.set('trust proxy', 1);

// Encabezados de seguridad en todas las respuestas.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');       // el navegador no adivina el tipo de archivo
  res.setHeader('X-Frame-Options', 'DENY');                 // las páginas no se pueden incrustar en otro sitio
  res.setHeader('Referrer-Policy', 'same-origin');
  if (EN_PRODUCCION) {
    // HSTS: el navegador usará solo HTTPS con este sitio durante un año.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
});

// En producción, una petición por HTTP se redirige a HTTPS (conexión cifrada).
app.use((req, res, next) => {
  if (EN_PRODUCCION && req.get('x-forwarded-proto') === 'http') {
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

// Límite de solicitudes por dirección IP en toda la API (antes de leer el cuerpo o la sesión, para que
// una inundación de peticiones no llegue a la base de datos).
app.use('/api', limiteGeneral);

// Tamaño máximo del cuerpo JSON: 100 KB en general y 15 MB solo para guardar el PDF del reporte técnico
// en base64 (máximo 10 MB de archivo). Un cuerpo mayor se rechaza sin procesarlo.
const jsonNormal = express.json({ limit: '100kb' });
const jsonReporte = express.json({ limit: '15mb' });
app.use((req, res, next) => {
  const esReporte = /^\/api\/proyectos\/[^/]+\/reportes$/.test(req.path);
  return esReporte ? jsonReporte(req, res, next) : jsonNormal(req, res, next);
});

// Sesión guardada en la tabla sesion de PostgreSQL; el navegador solo conserva una cookie con el
// identificador firmado. secure: la cookie solo viaja por HTTPS (en producción).
app.use(session({
  store: new AlmacenSesiones(),
  secret: process.env.SESION_SECRETO || 'sehip-clave-de-sesion',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: EN_PRODUCCION, maxAge: 8 * 60 * 60 * 1000 }
}));

// Estado del servidor y de la base de datos (Render lo usa para saber si el servicio está listo).
app.get('/api/salud', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ estado: 'ok' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Solicitudes que modifican datos: límite por cuenta además del límite por IP.
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && req.session.usuario) return limiteEscrituraPorUsuario(req, res, next);
  next();
});

app.use('/api/admin', rutasAdmin);
app.use('/api', rutasAuth);
app.use('/api', rutasCuenta);
app.use('/api', rutasProyectos);

// Cualquier otra ruta de la API responde 404 en JSON.
app.use('/api', (req, res) => res.status(404).json({ error: MENSAJES.rutaNoEncontrada }));

// Manejador de errores no controlados (Express 5 dirige aquí también los errores de funciones async).
// Los errores de lectura del cuerpo responden con su propio estado: 413 si excede el tamaño y 400 si no
// es JSON válido.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: MENSAJES.solicitudMuyGrande });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: MENSAJES.solicitudInvalida });
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud. Intente de nuevo.' });
});

// Una promesa rechazada sin manejar se registra en lugar de detener el servidor.
process.on('unhandledRejection', (error) => console.error('Promesa rechazada sin manejar:', error));

// Verifica la conexión a PostgreSQL antes de aceptar peticiones.
db.query('SELECT 1')
  .then(() => {
    const servidor = app.listen(PUERTO, () => {
      console.log(`SEHIP en ejecución en el puerto ${PUERTO}${EN_PRODUCCION ? ' (producción)' : ''}`);
      console.log(`Envío de correo: ${modoCorreo()}`);
    });
    // Tiempos máximos: 15 s para recibir los encabezados y 60 s para la solicitud completa. Una conexión
    // que envía datos demasiado lento se cierra en lugar de ocupar el servidor.
    servidor.headersTimeout = 15000;
    servidor.requestTimeout = 60000;
  })
  .catch((err) => {
    console.error('No fue posible conectar con PostgreSQL:', err.message);
    process.exit(1);
  });
