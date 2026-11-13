// Lógica del módulo de administración (versión con base de datos): comunicación con /api/admin.
// Los formularios se validan primero aquí con js/validaciones.js y después en el servidor.
// Cada operación devuelve { ok: false, error, estado } o { ok: true, ... }.
// estado: 'sin-sesion' (401), 'denegado' (403, el usuario no es administrador) o 'cambio-obligatorio'
// (403, la cuenta aún tiene contraseña temporal).

async function apiAdmin(url, metodo = 'GET', cuerpo = null) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  try {
    const respuesta = await fetch(url, opciones);
    const datos = await respuesta.json();
    if (respuesta.status === 401) return { ok: false, estado: 'sin-sesion', ...datos };
    if (respuesta.status === 403) return { ok: false, estado: datos.estado || 'denegado', ...datos };
    return { ok: respuesta.ok, ...datos };
  } catch (error) {
    return { ok: false, error: 'No fue posible conectar con el servidor.' };
  }
}

// ---------- RF-ADM-01: sesión ----------

async function iniciarSesionAdmin(correoTexto, contrasena) {
  const correo = String(correoTexto).trim();
  if (!credencialesConFormatoValido(correo, contrasena)) {
    return { ok: false, error: MENSAJES.adminLoginIncorrecto };
  }
  return apiAdmin('/api/admin/login', 'POST', { correo, contrasena });
}

async function sesionAdministrador() {
  const resultado = await apiAdmin('/api/admin/sesion');
  if (resultado.ok) return { estado: 'ok', usuario: resultado.usuario };
  if (resultado.estado === 'denegado') return { estado: 'denegado', usuario: resultado.usuario };
  return { estado: 'sin-sesion' };
}

async function cerrarSesionAdmin() {
  await apiAdmin('/api/logout', 'POST');
}

// ---------- Configuración del administrador inicial ----------

async function estadoConfiguracionInicial() {
  const resultado = await apiAdmin('/api/admin/configuracion-inicial');
  return { pendiente: resultado.ok && resultado.pendiente };
}

async function configurarAdministradorInicial(nombre, correo, contrasena, confirmacion) {
  if (!datosCuentaValidos(String(nombre).trim(), String(correo).trim(), ROL_ADMINISTRADOR)) {
    return { ok: false, error: MENSAJES.cuentaInvalida };
  }
  const errorContrasena = validarNuevaContrasena(contrasena, confirmacion);
  if (errorContrasena) return { ok: false, error: errorContrasena };
  return apiAdmin('/api/admin/configuracion-inicial', 'POST', { nombre, correo, contrasena, confirmacion });
}

// ---------- RF-ADM-02 y RF-ADM-03 ----------

async function obtenerPanelControl() {
  return apiAdmin('/api/admin/panel');
}

async function obtenerTablaMaestra() {
  return apiAdmin('/api/admin/tabla-maestra');
}

async function actualizarParametro(parametro) {
  const validacion = validarValorParametro(parametro.tipo, parametro.valor);
  if (validacion.error) return { ok: false, error: validacion.error };
  return apiAdmin('/api/admin/tabla-maestra', 'POST', parametro);
}

// ---------- RF-ADM-04 a RF-ADM-07: usuarios ----------

async function buscarUsuarios(texto = null) {
  if (texto === null) return apiAdmin('/api/admin/usuarios');
  if (!busquedaValida(texto)) return { ok: false, error: MENSAJES.busquedaLongitud };
  return apiAdmin(`/api/admin/usuarios?buscar=${encodeURIComponent(texto)}`);
}

async function crearCuenta(nombre, correo, rol) {
  if (!datosCuentaValidos(nombre, String(correo).trim(), rol)) {
    return { ok: false, error: MENSAJES.cuentaInvalida };
  }
  return apiAdmin('/api/admin/usuarios', 'POST', { nombre, correo, rol });
}

async function modificarRol(idUsuario, rol) {
  return apiAdmin(`/api/admin/usuarios/${idUsuario}/rol`, 'POST', { rol });
}

async function desactivarCuenta(idUsuario) {
  return apiAdmin(`/api/admin/usuarios/${idUsuario}/desactivar`, 'POST');
}

// ---------- Reactivar cuenta ----------
async function reactivarCuenta(idUsuario) {
  return apiAdmin(`/api/admin/usuarios/${idUsuario}/reactivar`, 'POST');
}
