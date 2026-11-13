// Conexión a PostgreSQL (Supabase) mediante un pool de conexiones del paquete pg.
// La dirección de la base se lee de DATABASE_URL (archivo .env o variables del servidor en la nube).
require('./entorno');
const fs = require('fs');
const { Pool, types } = require('pg');

// Conversión de tipos de PostgreSQL a JavaScript (por defecto pg entrega NUMERIC y BIGINT como texto
// y DATE/TIMESTAMP como objetos Date).
types.setTypeParser(1700, (valor) => parseFloat(valor));     // NUMERIC   → number
types.setTypeParser(20, (valor) => parseInt(valor, 10));     // BIGINT    → number (resultados de COUNT)
types.setTypeParser(1082, (valor) => valor);                 // DATE      → 'YYYY-MM-DD'
types.setTypeParser(1114, (valor) => valor);                 // TIMESTAMP → 'YYYY-MM-DD HH:MM:SS'

const URL_LOCAL = 'postgresql://postgres@localhost:5432/sehip';
const direccion = new URL(process.env.DATABASE_URL || URL_LOCAL);
const esLocal = ['localhost', '127.0.0.1'].includes(direccion.hostname);

// El cifrado de la conexión se controla con la opción ssl; se quita sslmode de la dirección para que
// no la reemplace.
direccion.searchParams.delete('sslmode');

// Conexión cifrada con TLS:
//   - BD_SSL=desactivado          → sin cifrado (solo para una base en la propia computadora).
//   - BD_CERTIFICADO_CA=<archivo> → cifrado y verificación del certificado del servidor (recomendado).
//   - en otro caso                → cifrado sin verificar el certificado.
function configuracionSsl() {
  if (process.env.BD_SSL === 'desactivado' || (esLocal && !process.env.BD_SSL)) return false;
  if (process.env.BD_CERTIFICADO_CA) {
    return { ca: fs.readFileSync(process.env.BD_CERTIFICADO_CA, 'utf8'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: direccion.toString(),
  ssl: configuracionSsl(),
  max: 5,
  connectionTimeoutMillis: 10000
});

// Las fechas y horas que genera la base (LOCALTIMESTAMP, CURRENT_DATE) se calculan en la hora de la CDMX.
pool.on('connect', (cliente) => {
  cliente.query("SET TIME ZONE 'America/Mexico_City'").catch((error) => console.error(error.message));
});

// Un error en una conexión inactiva (por ejemplo, la base se reinició) no detiene el servidor.
pool.on('error', (error) => console.error('Error en la conexión con PostgreSQL:', error.message));

module.exports = pool;
