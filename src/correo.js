// Envío de correo electrónico: contraseña temporal (RF-ADM-04) y código de recuperación de contraseña.
// El medio de envío se elige con las variables de entorno (archivo .env):
//   - BREVO_API_KEY            → API HTTP de Brevo (funciona también en servidores que bloquean SMTP).
//   - SMTP_USUARIO + SMTP_CONTRASENA → servidor SMTP con nodemailer (por ejemplo, Gmail con contraseña de aplicación).
//   - ninguna                  → modo de desarrollo: cada correo se guarda como .txt en correos_enviados/.
// CORREO_REMITENTE es la dirección que aparece como remitente (en Brevo debe ser un remitente verificado).
require('./entorno');
const fs = require('fs');
const path = require('path');

const CARPETA_CORREOS = path.join(__dirname, '..', 'correos_enviados');
const TIEMPO_MAXIMO_MS = 5000; // RF-ADM-04: máximo 5 segundos para el envío

function modoCorreo() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.SMTP_USUARIO && process.env.SMTP_CONTRASENA) return 'smtp';
  return 'archivo';
}

function remitente() {
  return process.env.CORREO_REMITENTE || process.env.SMTP_USUARIO || 'no-responder@sehip.mx';
}

function marcaDeTiempo() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

// API de Brevo: POST /v3/smtp/email con la llave en el encabezado api-key.
async function enviarConBrevo({ para, asunto, texto }) {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'SEHIP', email: remitente() },
      to: [{ email: para }],
      subject: asunto,
      textContent: texto
    }),
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS)
  });
  if (!respuesta.ok) {
    throw new Error(`Brevo respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}

async function enviarConSmtp({ para, asunto, texto }) {
  const nodemailer = require('nodemailer');
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PUERTO || 465),
    secure: Number(process.env.SMTP_PUERTO || 465) === 465,
    auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CONTRASENA },
    connectionTimeout: TIEMPO_MAXIMO_MS
  });
  await transporte.sendMail({ from: `SEHIP <${remitente()}>`, to: para, subject: asunto, text: texto });
}

function guardarEnArchivo({ para, asunto, texto }) {
  fs.mkdirSync(CARPETA_CORREOS, { recursive: true });
  const fecha = marcaDeTiempo();
  const archivo = `${fecha.replace(/[: ]/g, '-')}_${para.replace(/[^\w.@-]/g, '_')}.txt`;
  fs.writeFileSync(
    path.join(CARPETA_CORREOS, archivo),
    `De: ${remitente()}\nPara: ${para}\nFecha: ${fecha}\nAsunto: ${asunto}\n\n${texto}\n`
  );
}

// Lanza un error si el correo no pudo enviarse.
async function enviarCorreo(mensaje) {
  const modo = modoCorreo();
  if (modo === 'brevo') return enviarConBrevo(mensaje);
  if (modo === 'smtp') return enviarConSmtp(mensaje);
  return guardarEnArchivo(mensaje);
}

module.exports = { enviarCorreo, modoCorreo };
