// Cuenta de usuario (versión sin base de datos): cambio de contraseña y recuperación por código.
// Usa las cuentas de js/datos.js; el código de recuperación llega a la bandeja de correo simulada.
// Cada operación devuelve { ok: false, error } o { ok: true, mensaje, ... }.

// Usuario de la sesión (cualquier rol) con cuenta activa, o null.
async function sesionCuenta() {
  const resultado = await sesionConRol(null);
  return resultado.estado === 'ok' ? resultado.usuario : null;
}

async function salirCuenta() {
  cerrarSesion();
}

// Cambio de contraseña del usuario con sesión; quita la marca de contraseña temporal.
async function cambiarContrasena(actual, nueva, confirmacion) {
  const sesion = await sesionCuenta();
  if (!sesion) return { ok: false, error: 'Debe iniciar sesión', estado: 'sin-sesion' };
  const usuarios = await obtenerUsuarios();
  const usuario = usuarios.find((u) => u.id === sesion.id);
  if (usuario.contrasenaHash !== await cifrarContrasena(actual)) {
    return { ok: false, error: MENSAJES.contrasenaActualIncorrecta };
  }
  const error = validarNuevaContrasena(nueva, confirmacion, actual);
  if (error) return { ok: false, error };

  usuario.contrasenaHash = await cifrarContrasena(nueva);
  usuario.debeCambiarContrasena = false;
  usuario.codigoRecuperacion = null;
  guardarUsuarios(usuarios);
  return { ok: true, usuario: guardarSesion(usuario), mensaje: MENSAJES.contrasenaActualizada };
}

// Paso 1: genera un código de 6 dígitos (vigente 15 minutos) y lo envía al correo de la cuenta activa.
// La respuesta es la misma exista o no la cuenta, para no revelar qué correos están registrados.
async function solicitarCodigoRecuperacion(correoTexto) {
  const correo = String(correoTexto ?? '').trim();
  if (!correoValido(correo)) return { ok: false, error: MENSAJES.correoInvalido };
  const usuarios = await obtenerUsuarios();
  const usuario = usuarios.find((u) => u.correo.toLowerCase() === correo.toLowerCase() && u.activo);
  if (usuario) {
    const codigo = generarCodigoRecuperacion(enterosAleatorios);
    const enviado = enviarCorreoSimulado(
      usuario.correo,
      'SEHIP · Código para restablecer tu contraseña',
      `Hola ${usuario.nombre}:\n\nTu código de verificación es: ${codigo}\n\n`
        + `Es válido por ${MINUTOS_VIGENCIA_CODIGO} minutos y solo puede usarse una vez.\n`
        + 'Si no solicitaste restablecer tu contraseña, ignora este correo; tu contraseña actual sigue funcionando.'
    );
    if (!enviado) return { ok: false, error: MENSAJES.codigoFallido };
    usuario.codigoRecuperacion = {
      hash: await cifrarContrasena(codigo),
      expira: Date.now() + MINUTOS_VIGENCIA_CODIGO * 60 * 1000,
      intentos: 0
    };
    guardarUsuarios(usuarios);
  }
  return { ok: true, mensaje: MENSAJES.codigoEnviado };
}

// Paso 2: valida el código (5 intentos como máximo) y guarda la nueva contraseña.
async function restablecerContrasena(correoTexto, codigoTexto, nueva, confirmacion) {
  const correo = String(correoTexto ?? '').trim();
  const codigo = String(codigoTexto ?? '').trim();
  const errorContrasena = validarNuevaContrasena(nueva, confirmacion);
  if (errorContrasena) return { ok: false, error: errorContrasena };
  if (!correoValido(correo) || !codigoRecuperacionValido(codigo)) return { ok: false, error: MENSAJES.codigoInvalido };

  const usuarios = await obtenerUsuarios();
  const usuario = usuarios.find((u) => u.correo.toLowerCase() === correo.toLowerCase() && u.activo);
  const datosCodigo = usuario && usuario.codigoRecuperacion;
  const codigoUtilizable = datosCodigo && datosCodigo.expira > Date.now() && datosCodigo.intentos < INTENTOS_MAXIMOS_CODIGO;
  if (!codigoUtilizable) return { ok: false, error: MENSAJES.codigoInvalido };

  if (datosCodigo.hash !== await cifrarContrasena(codigo)) {
    datosCodigo.intentos += 1;
    guardarUsuarios(usuarios);
    return { ok: false, error: MENSAJES.codigoInvalido };
  }
  usuario.contrasenaHash = await cifrarContrasena(nueva);
  usuario.debeCambiarContrasena = false;
  usuario.codigoRecuperacion = null;
  guardarUsuarios(usuarios);
  return { ok: true, mensaje: MENSAJES.contrasenaRestablecida };
}
