// Lógica del módulo de simulación (versión con base de datos): comunicación con la API del servidor.
// Los datos de los formularios se validan primero aquí con js/validaciones.js y después en el servidor.
// Cada operación devuelve { ok: false, error } o { ok: true, proyecto, simulacion, simulaciones, reportes, mensaje }.

// Petición a la API con JSON. Una respuesta 401 (sin sesión) regresa al inicio de sesión y una 403 con
// estado 'cambio-obligatorio' lleva a la página para cambiar la contraseña temporal.
async function api(url, metodo = 'GET', cuerpo = null, redirigirSinSesion = true) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  try {
    const respuesta = await fetch(url, opciones);
    if (respuesta.status === 401 && redirigirSinSesion) {
      window.location.href = 'index.html';
      return { ok: false, error: 'Debe iniciar sesión' };
    }
    const datos = await respuesta.json();
    if (respuesta.status === 403 && datos.estado === 'cambio-obligatorio') {
      window.location.href = 'contrasena.html';
      return { ok: false, error: datos.error };
    }
    return { ok: respuesta.ok, ...datos };
  } catch (error) {
    return { ok: false, error: 'No fue posible conectar con el servidor.' };
  }
}

// ---------- RF-WEB-01: sesión ----------

async function iniciarSesion(correoTexto, contrasena) {
  const correo = String(correoTexto).trim();
  if (!credencialesConFormatoValido(correo, contrasena)) {
    return { ok: false, error: MENSAJES.loginIncorrecto };
  }
  return api('/api/login', 'POST', { correo, contrasena }, false);
}

// Usuario de la sesión activa, o null si no hay sesión.
// Solo cuentas con rol Ingeniero Civil entran al módulo de simulación.
async function usuarioActivo() {
  const resultado = await api('/api/sesion', 'GET', null, false);
  return resultado.ok && resultado.usuario.rol === ROL_INGENIERO ? resultado.usuario : null;
}

async function cerrarSesion() {
  await api('/api/logout', 'POST', null, false);
}

// ---------- Catálogos ----------

async function obtenerAlcaldias() {
  const resultado = await api('/api/alcaldias');
  return resultado.ok ? resultado.alcaldias : [];
}

async function obtenerCoeficientes() {
  const resultado = await api('/api/coeficientes');
  return resultado.ok ? resultado.coeficientes : { Cp: null, Ci: null };
}

// Intensidades de la alcaldía por período de retorno: { 2: 40, 5: 55, ... }.
async function obtenerIntensidadesAlcaldia(idAlcaldia) {
  const resultado = await api(`/api/alcaldias/${idAlcaldia}/intensidades`);
  return resultado.ok ? resultado.intensidades : {};
}

// ---------- RF-WEB-02 y RF-WEB-03: proyectos ----------

async function registrarProyecto(nombre, idAlcaldia, latitud, longitud) {
  if (!nombreProyectoValido(nombre) || !idAlcaldia) {
    return { ok: false, error: MENSAJES.proyectoInvalido };
  }
  if (!coordenadasValidas(latitud, longitud) || !alcaldiaEnPunto(latitud, longitud)) {
    return { ok: false, error: MENSAJES.ubicacionFuera };
  }
  return api('/api/proyectos', 'POST', { nombre, idAlcaldia, latitud, longitud });
}

// Mueve el punto del proyecto; la alcaldía, la intensidad y el caudal se actualizan en el servidor.
async function moverProyecto(idProyecto, latitud, longitud) {
  if (!coordenadasValidas(latitud, longitud) || !alcaldiaEnPunto(latitud, longitud)) {
    return { ok: false, error: MENSAJES.ubicacionFuera };
  }
  return api(`/api/proyectos/${idProyecto}/ubicacion`, 'POST', { latitud, longitud });
}

async function listarProyectos(pagina) {
  return api(`/api/proyectos?pagina=${pagina}`);
}

async function consultarProyecto(idProyecto) {
  return api(`/api/proyectos/${idProyecto}`);
}

// ---------- RF-WEB-04 a RF-WEB-07: cálculos ----------

async function calcularCoeficienteProyecto(idProyecto, superficiePermeable, superficieImpermeable) {
  const superficies = validarSuperficies(superficiePermeable, superficieImpermeable);
  if (superficies.error) return { ok: false, error: superficies.error };
  return api(`/api/proyectos/${idProyecto}/coeficiente`, 'POST', { superficiePermeable, superficieImpermeable });
}

async function consultarIntensidadProyecto(idProyecto, periodoRetorno) {
  if (!periodoValido(periodoRetorno)) return { ok: false, error: MENSAJES.periodoInvalido };
  return api(`/api/proyectos/${idProyecto}/intensidad`, 'POST', { periodoRetorno });
}

async function calcularCaudalProyecto(idProyecto) {
  return api(`/api/proyectos/${idProyecto}/caudal`, 'POST');
}

async function simularMitigacionProyecto(idProyecto, tipoObra, capacidad, latitud, longitud) {
  if (!tipoObraValido(tipoObra)) return { ok: false, error: MENSAJES.tipoObraFaltante };
  if (leerCapacidad(capacidad) === null) return { ok: false, error: MENSAJES.capacidadFueraDeRango };
  if (!coordenadasValidas(latitud, longitud)) return { ok: false, error: MENSAJES.obraSinUbicacion };
  return api(`/api/proyectos/${idProyecto}/mitigacion`, 'POST', { tipoObra, capacidad, latitud, longitud });
}

// ---------- RF-WEB-08: copia del reporte técnico en el historial ----------

async function guardarReporte(idProyecto, reporte) {
  return api(`/api/proyectos/${idProyecto}/reportes`, 'POST', {
    nombreArchivo: reporte.nombreArchivo,
    contenidoBase64: reporte.base64
  });
}
