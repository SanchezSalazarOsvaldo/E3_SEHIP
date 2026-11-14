// Cuenta de usuario (ambos roles): cambio de contraseña y recuperación de contraseña por código.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const calc = require('../../public/js/validaciones');
const { enviarCorreo } = require('../correo');
const {
  limiteSolicitudCodigo, limiteRestablecer, codigosPorCorreo,
  responderLimite, esperaPorFallos, registrarFallo, limpiarFallos
} = require('../limites');

const router = express.Router();
const aleatorios = (n) => Array.from(crypto.randomBytes(n));

// ---------- Cambio de contraseña ----------
// Exige sesión con cuenta activa. Se usa por voluntad del usuario o de forma obligatoria cuando la
// contraseña es temporal (debe_cambiar_contrasena = TRUE).
router.post('/contrasena', async (req, res) => {
  const usuario = req.session.usuario;
  if (!usuario) return res.status(401).json({ error: 'Debe iniciar sesión' });

  const datos = req.body || {};
  const actual = String(datos.actual ?? '');
  const nueva = String(datos.nueva ?? '');
  const confirmacion = String(datos.confirmacion ?? '');

  const { rows: filas } = await db.query(
    'SELECT contrasena_hash, activo FROM usuario WHERE id_usuario = $1',
    [usuario.id]
  );
  if (filas.length === 0 || !filas[0].activo) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Debe iniciar sesión' });
  }
  // Intentos fallidos con la contraseña actual: mismo bloqueo que el inicio de sesión.
  const cuenta = `id:${usuario.id}`;
  const espera = esperaPorFallos(req, cuenta);
  if (espera > 0) return responderLimite(res, espera, calc.MENSAJES.demasiadosIntentos);
  if (!await bcrypt.compare(actual, filas[0].contrasena_hash)) {
    registrarFallo(req, cuenta);
    return res.status(400).json({ error: calc.MENSAJES.contrasenaActualIncorrecta });
  }
  limpiarFallos(cuenta);
  const error = calc.validarNuevaContrasena(nueva, confirmacion, actual);
  if (error) return res.status(400).json({ error });

  await db.query(
    `UPDATE usuario
        SET contrasena_hash = $1, debe_cambiar_contrasena = FALSE,
            codigo_recuperacion_hash = NULL, codigo_expira = NULL, intentos_codigo = 0
      WHERE id_usuario = $2`,
    [await bcrypt.hash(nueva, 10), usuario.id]
  );
  req.session.usuario = { ...usuario, debeCambiarContrasena: false };
  res.json({ usuario: req.session.usuario, mensaje: calc.MENSAJES.contrasenaActualizada });
});

// ---------- Recuperación de contraseña, paso 1: enviar código ----------
// La respuesta es la misma exista o no la cuenta, para no revelar qué correos están registrados.
// El código se guarda cifrado y vence a los 15 minutos; pedir otro reemplaza al anterior.
// Límites: 5 solicitudes por IP cada 15 minutos y 3 códigos por correo cada hora (protegen la cuota de
// correos y evitan llenar el buzón de otra persona).
router.post('/recuperacion/solicitar', limiteSolicitudCodigo, async (req, res) => {
  const correo = String((req.body || {}).correo ?? '').trim();
  if (!calc.correoValido(correo)) return res.status(400).json({ error: calc.MENSAJES.correoInvalido });

  const espera = codigosPorCorreo.registrar(correo.toLowerCase());
  if (espera > 0) return responderLimite(res, espera, calc.MENSAJES.demasiadosCodigos);

  const { rows: filas } = await db.query(
    'SELECT id_usuario, nombre FROM usuario WHERE LOWER(correo) = LOWER($1) AND activo',
    [correo]
  );
  if (filas.length > 0) {
    const cuenta = filas[0];
    const codigo = calc.generarCodigoRecuperacion(aleatorios);
    await db.query(
      `UPDATE usuario
          SET codigo_recuperacion_hash = $1, intentos_codigo = 0,
              codigo_expira = LOCALTIMESTAMP(0) + make_interval(mins => $2)
        WHERE id_usuario = $3`,
      [await bcrypt.hash(codigo, 10), calc.MINUTOS_VIGENCIA_CODIGO, cuenta.id_usuario]
    );
    try {
      await enviarCorreo({
        para: correo,
        asunto: 'SEHIP · Código para restablecer tu contraseña',
        texto: `Hola ${cuenta.nombre}:\n\nTu código de verificación es: ${codigo}\n\n`
          + `Es válido por ${calc.MINUTOS_VIGENCIA_CODIGO} minutos y solo puede usarse una vez.\n`
          + 'Si no solicitaste restablecer tu contraseña, ignora este correo; tu contraseña actual sigue funcionando.'
      });
    } catch (error) {
      console.error('Fallo al enviar el código de recuperación:', error.message);
      await db.query(
        'UPDATE usuario SET codigo_recuperacion_hash = NULL, codigo_expira = NULL WHERE id_usuario = $1',
        [cuenta.id_usuario]
      );
      return res.status(502).json({ error: calc.MENSAJES.codigoFallido });
    }
  }
  res.json({ mensaje: calc.MENSAJES.codigoEnviado });
});

// ---------- Recuperación de contraseña, paso 2: código y nueva contraseña ----------
// Cada código admite 5 intentos; al usarse correctamente se borra.
router.post('/recuperacion/restablecer', limiteRestablecer, async (req, res) => {
  const datos = req.body || {};
  const correo = String(datos.correo ?? '').trim();
  const codigo = String(datos.codigo ?? '').trim();
  const nueva = String(datos.nueva ?? '');

  const errorContrasena = calc.validarNuevaContrasena(nueva, String(datos.confirmacion ?? ''));
  if (errorContrasena) return res.status(400).json({ error: errorContrasena });
  if (!calc.correoValido(correo) || !calc.codigoRecuperacionValido(codigo)) {
    return res.status(400).json({ error: calc.MENSAJES.codigoInvalido });
  }

  const { rows: filas } = await db.query(
    `SELECT id_usuario, codigo_recuperacion_hash, intentos_codigo,
            (codigo_expira > LOCALTIMESTAMP) AS vigente
       FROM usuario
      WHERE LOWER(correo) = LOWER($1) AND activo`,
    [correo]
  );
  const cuenta = filas[0];
  const codigoUtilizable = cuenta && cuenta.codigo_recuperacion_hash && cuenta.vigente === true
    && cuenta.intentos_codigo < calc.INTENTOS_MAXIMOS_CODIGO;
  if (!codigoUtilizable) return res.status(400).json({ error: calc.MENSAJES.codigoInvalido });

  if (!await bcrypt.compare(codigo, cuenta.codigo_recuperacion_hash)) {
    await db.query('UPDATE usuario SET intentos_codigo = intentos_codigo + 1 WHERE id_usuario = $1', [cuenta.id_usuario]);
    return res.status(400).json({ error: calc.MENSAJES.codigoInvalido });
  }

  await db.query(
    `UPDATE usuario
        SET contrasena_hash = $1, debe_cambiar_contrasena = FALSE,
            codigo_recuperacion_hash = NULL, codigo_expira = NULL, intentos_codigo = 0
      WHERE id_usuario = $2`,
    [await bcrypt.hash(nueva, 10), cuenta.id_usuario]
  );
  res.json({ mensaje: calc.MENSAJES.contrasenaRestablecida });
});

module.exports = router;
