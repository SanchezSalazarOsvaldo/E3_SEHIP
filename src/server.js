// Servidor web de SEHIP: sirve las páginas de /public y la API REST bajo /api.
// En la nube corre en Render; la base de datos está en Supabase (PostgreSQL).
const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./db');
const AlmacenSesiones = require('./almacen-sesiones');
const { modoCorreo } = require('./correo');
const { router: rutasAuth } = require('./rutas/auth');
const rutasCuenta = require('./rutas/cuenta');
const rutasProyectos = require('./rutas/proyectos');
const rutasAdmin = require('./rutas/admin');

const PUERTO = Number(process.env.PORT || process.env.PUERTO || 3000);
const EN_PRODUCCION = process.env.NODE_ENV === 'production';
const app = express();

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

// Límite de 15 MB para recibir el PDF del reporte técnico en base64 (máximo 10 MB de archivo).
app.use(express.json({ limit: '15mb' }));

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

app.use('/api/admin', rutasAdmin);
app.use('/api', rutasAuth);
app.use('/api', rutasCuenta);
app.use('/api', rutasProyectos);

// Manejador de errores no controlados (Express 5 dirige aquí también los errores de funciones async).
app.use((err, req, res, next) => {
  console.error(err);
  const estado = err.status && err.status < 500 ? err.status : 500;
  res.status(estado).json({ error: 'Ocurrió un error al procesar la solicitud. Intente de nuevo.' });
});

// Verifica la conexión a PostgreSQL antes de aceptar peticiones.
db.query('SELECT 1')
  .then(() => {
    app.listen(PUERTO, () => {
      console.log(`SEHIP en ejecución en el puerto ${PUERTO}${EN_PRODUCCION ? ' (producción)' : ''}`);
      console.log(`Envío de correo: ${modoCorreo()}`);
    });
  })
  .catch((err) => {
    console.error('No fue posible conectar con PostgreSQL:', err.message);
    process.exit(1);
  });
