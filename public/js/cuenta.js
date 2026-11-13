// Cuenta de usuario (versión con base de datos): cambio de contraseña y recuperación por código.
// Los datos se validan primero aquí con js/validaciones.js y después en el servidor (/api/contrasena y
// /api/recuperacion/...). Cada operación devuelve { ok: false, error } o { ok: true, mensaje, ... }.

async function apiCuenta(url, metodo = 'GET', cuerpo = null) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  try {
    const respuesta = await fetch(url, opciones);
    const datos = await respuesta.json();
    if (respuesta.status === 401) return { ok: false, estado: 'sin-sesion', ...datos };
    return { ok: respuesta.ok, ...datos };
  } catch (error) {
    return { ok: false, error: 'No fue posible conectar con el servidor.' };
  }
}

// Usuario de la sesión (cualquier rol), o null.
async function sesionCuenta() {
  const resultado = await apiCuenta('/api/sesion');
  return resultado.ok ? resultado.usuario : null;
}

async function salirCuenta() {
  await apiCuenta('/api/logout', 'POST');
}

async function cambiarContrasena(actual, nueva, confirmacion) {
  const error = validarNuevaContrasena(nueva, confirmacion, actual);
  if (error) return { ok: false, error };
  return apiCuenta('/api/contrasena', 'POST', { actual, nueva, confirmacion });
}

async function solicitarCodigoRecuperacion(correoTexto) {
  const correo = String(correoTexto ?? '').trim();
  if (!correoValido(correo)) return { ok: false, error: MENSAJES.correoInvalido };
  return apiCuenta('/api/recuperacion/solicitar', 'POST', { correo });
}

async function restablecerContrasena(correoTexto, codigoTexto, nueva, confirmacion) {
  const correo = String(correoTexto ?? '').trim();
  const codigo = String(codigoTexto ?? '').trim();
  const errorContrasena = validarNuevaContrasena(nueva, confirmacion);
  if (errorContrasena) return { ok: false, error: errorContrasena };
  if (!correoValido(correo) || !codigoRecuperacionValido(codigo)) return { ok: false, error: MENSAJES.codigoInvalido };
  return apiCuenta('/api/recuperacion/restablecer', 'POST', { correo, codigo, nueva, confirmacion });
}
