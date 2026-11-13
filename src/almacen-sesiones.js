// Almacén de sesiones de express-session guardado en la tabla sesion de PostgreSQL.
// Con sesiones en la base, la sesión no se pierde cuando el servidor se reinicia o se suspende
// (Render gratis lo suspende tras 15 minutos sin uso) y varios servidores pueden compartirlas.
const session = require('express-session');
const db = require('./db');

const DURACION_POR_DEFECTO_MS = 8 * 60 * 60 * 1000;
const LIMPIEZA_CADA_MS = 60 * 60 * 1000;

// Fecha de vencimiento de la sesión según su cookie.
function vencimiento(datos) {
  const expira = datos && datos.cookie && datos.cookie.expires;
  return new Date(expira || Date.now() + DURACION_POR_DEFECTO_MS).toISOString();
}

class AlmacenSesiones extends session.Store {
  constructor() {
    super();
    // Borra cada hora las sesiones vencidas.
    setInterval(() => {
      db.query('DELETE FROM sesion WHERE expira < NOW()').catch((error) => console.error(error.message));
    }, LIMPIEZA_CADA_MS).unref();
  }

  // Devuelve los datos de la sesión o null si no existe o ya venció.
  get(sid, callback) {
    db.query('SELECT datos FROM sesion WHERE sid = $1 AND expira > NOW()', [sid])
      .then(({ rows }) => callback(null, rows[0] ? rows[0].datos : null))
      .catch(callback);
  }

  // Crea la sesión o la reemplaza si ya existe (ON CONFLICT).
  set(sid, datos, callback = () => {}) {
    db.query(
      `INSERT INTO sesion (sid, datos, expira) VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET datos = EXCLUDED.datos, expira = EXCLUDED.expira`,
      [sid, JSON.stringify(datos), vencimiento(datos)]
    ).then(() => callback(null)).catch(callback);
  }

  // Extiende el vencimiento de una sesión que sigue en uso.
  touch(sid, datos, callback = () => {}) {
    db.query('UPDATE sesion SET expira = $2 WHERE sid = $1', [sid, vencimiento(datos)])
      .then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    db.query('DELETE FROM sesion WHERE sid = $1', [sid])
      .then(() => callback(null)).catch(callback);
  }
}

module.exports = AlmacenSesiones;
