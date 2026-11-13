// Lógica del módulo de administración (versión sin base de datos), RF-ADM-01 a RF-ADM-07.
// Usa las cuentas, la tabla maestra y las incidencias de js/datos.js (guardadas en localStorage).
// Cada operación devuelve { ok: false, error } o { ok: true, ... }.

// ---------- RF-ADM-01: inicio de sesión del administrador ----------
async function iniciarSesionAdmin(correoTexto, contrasena) {
  const correo = String(correoTexto).trim();
  if (!credencialesConFormatoValido(correo, contrasena)) {
    return { ok: false, error: MENSAJES.adminLoginIncorrecto };
  }
  const usuario = (await obtenerUsuarios()).find((u) => u.correo.toLowerCase() === correo.toLowerCase());
  const accesoValido = usuario
    && usuario.rol === ROL_ADMINISTRADOR
    && usuario.contrasenaHash === await cifrarContrasena(contrasena)
    && usuario.activo;
  if (!accesoValido) {
    return { ok: false, error: MENSAJES.adminLoginIncorrecto };
  }
  return { ok: true, usuario: guardarSesion(usuario) };
}

// Estado de la sesión para el módulo: 'ok' (administrador), 'denegado' (otro rol) o 'sin-sesion'.
async function sesionAdministrador() {
  return sesionConRol(ROL_ADMINISTRADOR);
}

async function cerrarSesionAdmin() {
  cerrarSesion();
}

// Verificación de rol antes de cada operación (RF-ADM-02, flujo alterno 1).
async function exigirAdministrador() {
  const sesion = await sesionAdministrador();
  if (sesion.estado !== 'ok') return { ok: false, error: MENSAJES.accesoDenegado, estado: sesion.estado };
  if (sesion.usuario.debeCambiarContrasena) {
    return { ok: false, error: MENSAJES.cambioObligatorio, estado: 'cambio-obligatorio' };
  }
  return null;
}

// ---------- Configuración del administrador inicial ----------
// Mientras no exista el administrador inicial (cuenta protegida), admin.html muestra el formulario para crearlo.
async function estadoConfiguracionInicial() {
  const usuarios = await obtenerUsuarios();
  return { pendiente: !usuarios.some((u) => u.protegido) };
}

async function configurarAdministradorInicial(nombreTexto, correoTexto, contrasena, confirmacion) {
  if (!(await estadoConfiguracionInicial()).pendiente) return { ok: false, error: MENSAJES.configuracionHecha };
  const nombre = String(nombreTexto ?? '').trim();
  const correo = String(correoTexto ?? '').trim();
  const usuarios = await obtenerUsuarios();
  const correoRepetido = usuarios.some((u) => u.correo.toLowerCase() === correo.toLowerCase());
  if (!datosCuentaValidos(nombre, correo, ROL_ADMINISTRADOR) || correoRepetido) {
    return { ok: false, error: MENSAJES.cuentaInvalida };
  }
  const errorContrasena = validarNuevaContrasena(contrasena, confirmacion);
  if (errorContrasena) return { ok: false, error: errorContrasena };

  const administrador = {
    id: siguienteId(usuarios), nombre, correo, rol: ROL_ADMINISTRADOR, activo: true, protegido: true,
    debeCambiarContrasena: false, contrasenaHash: await cifrarContrasena(contrasena), fechaCreacion: fechaHoraActual()
  };
  usuarios.push(administrador);
  guardarUsuarios(usuarios);
  return { ok: true, usuario: guardarSesion(administrador), mensaje: MENSAJES.administradorInicialCreado };
}

// ---------- RF-ADM-02: panel de control ----------
async function obtenerPanelControl() {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;
  const incidencias = PUNTOS_CRITICOS.map((p) => ({ ...p, alcaldia: alcaldiaEnPunto(p.latitud, p.longitud) }));
  return {
    ok: true,
    totalProyectos: leerLista('sehip_proyectos_v3').length,
    totalSimulaciones: leerLista('sehip_simulaciones_v3').length,
    incidencias,
    fechaConsulta: fechaHoraActual(),
    mensaje: incidencias.length === 0 ? MENSAJES.sinIncidencias : ''
  };
}

// ---------- RF-ADM-03: tabla maestra ----------
async function obtenerTablaMaestra() {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;
  return {
    ok: true,
    coeficientes: { ...COEFICIENTES },
    intensidades: ALCALDIAS.map((a) => ({ idAlcaldia: a.id, alcaldia: a.nombre, valores: { ...INTENSIDADES[a.id] } }))
  };
}

// parametro = { tipo: 'Cp' | 'Ci' | 'intensidad', idAlcaldia, periodo, valor }
async function actualizarParametro(parametro) {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;

  const { tipo } = parametro;
  const esIntensidad = tipo === 'intensidad';
  const idAlcaldia = Number(parametro.idAlcaldia);
  const periodo = Number(parametro.periodo);
  const parametroValido = esIntensidad
    ? ALCALDIAS.some((a) => a.id === idAlcaldia) && periodoValido(periodo)
    : tipo === 'Cp' || tipo === 'Ci';
  if (!parametroValido) return { ok: false, error: MENSAJES.valorNoNumerico };

  const validacion = validarValorParametro(tipo, parametro.valor);
  if (validacion.error) return { ok: false, error: validacion.error };

  // Se sobrescribe el valor sin conservar el anterior; los proyectos ya calculados no se recalculan.
  if (esIntensidad) INTENSIDADES[idAlcaldia][periodo] = validacion.valor;
  else COEFICIENTES[tipo] = validacion.valor;
  guardarTablaMaestra();

  const tabla = await obtenerTablaMaestra();
  return { ...tabla, mensaje: MENSAJES.parametroActualizado };
}

// ---------- RF-ADM-05: consultar usuarios ----------
function vistaUsuario(u, idSesion) {
  return {
    id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo,
    protegido: u.protegido, propio: u.id === idSesion
  };
}

// Sin texto devuelve todas las cuentas; con texto aplica las reglas de RF-ADM-05.
async function buscarUsuarios(texto = null) {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;
  const idSesion = leerSesion().id;
  const usuarios = await obtenerUsuarios();

  if (texto === null) {
    return { ok: true, usuarios: usuarios.map((u) => vistaUsuario(u, idSesion)) };
  }
  if (!busquedaValida(texto)) return { ok: false, error: MENSAJES.busquedaLongitud };
  const encontrados = usuarios.filter((u) => usuarioCoincide(u, texto));
  if (encontrados.length === 0) return { ok: false, error: MENSAJES.sinUsuarios, usuarios: [] };
  return { ok: true, usuarios: encontrados.map((u) => vistaUsuario(u, idSesion)) };
}

// ---------- RF-ADM-04: crear cuenta ----------
async function crearCuenta(nombreTexto, correoTexto, rol) {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;

  const nombre = String(nombreTexto ?? '').trim();
  const correo = String(correoTexto ?? '').trim();
  const usuarios = await obtenerUsuarios();
  const correoRepetido = usuarios.some((u) => u.correo.toLowerCase() === correo.toLowerCase());
  if (!datosCuentaValidos(nombre, correo, rol) || correoRepetido) {
    return { ok: false, error: MENSAJES.cuentaInvalida };
  }

  const contrasenaTemporal = generarContrasenaTemporal(enterosAleatorios);
  const acceso = rol === ROL_ADMINISTRADOR ? 'Acceso administrativo (admin.html)' : 'inicio de sesión de SEHIP';
  const enviado = enviarCorreoSimulado(
    correo,
    'SEHIP · Tu cuenta y contraseña temporal',
    `Hola ${nombre}:\n\nSe creó tu cuenta en SEHIP con el rol ${rol}.\n\n`
      + `Correo: ${correo}\nContraseña temporal: ${contrasenaTemporal}\n\n`
      + `Ingresa por el ${acceso}. Al iniciar sesión por primera vez se te pedirá cambiar la contraseña temporal `
      + 'por una propia.\n\nSi no esperabas este correo, ignóralo.'
  );
  // Si el correo falla, la cuenta no se crea (flujo alterno 2).
  if (!enviado) return { ok: false, error: MENSAJES.correoFallido };

  usuarios.push({
    id: siguienteId(usuarios), nombre, correo, rol, activo: true, protegido: false, debeCambiarContrasena: true,
    contrasenaHash: await cifrarContrasena(contrasenaTemporal), fechaCreacion: fechaHoraActual()
  });
  guardarUsuarios(usuarios);
  const lista = await buscarUsuarios();
  return { ...lista, mensaje: `Cuenta creada. La contraseña temporal se envió a ${correo}` };
}

// ---------- RF-ADM-06: modificar rol ----------
async function modificarRol(idUsuario, rolNuevo) {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;

  const usuarios = await obtenerUsuarios();
  const usuario = usuarios.find((u) => u.id === Number(idUsuario));
  if (!usuario) return { ok: false, error: MENSAJES.usuarioNoExiste };
  if (!ROLES.includes(rolNuevo)) return { ok: false, error: MENSAJES.cuentaInvalida };
  if (usuario.rol === rolNuevo) return { ok: false, error: MENSAJES.rolIgual };

  // Debe quedar al menos un administrador activo.
  const adminsActivosRestantes = usuarios.filter(
    (u) => u.rol === ROL_ADMINISTRADOR && u.activo && u.id !== usuario.id
  ).length;
  if (usuario.rol === ROL_ADMINISTRADOR && usuario.activo && adminsActivosRestantes === 0) {
    return { ok: false, error: MENSAJES.ultimoAdministrador };
  }
  if (usuario.protegido) return { ok: false, error: MENSAJES.administradorProtegido };

  usuario.rol = rolNuevo;
  guardarUsuarios(usuarios);
  const lista = await buscarUsuarios();
  return { ...lista, mensaje: MENSAJES.rolModificado };
}

// ---------- RF-ADM-07: deshabilitar cuenta ----------
async function desactivarCuenta(idUsuario) {
  const denegado = await exigirAdministrador();
  if (denegado) return denegado;

  const usuarios = await obtenerUsuarios();
  const usuario = usuarios.find((u) => u.id === Number(idUsuario));
  if (!usuario) return { ok: false, error: MENSAJES.usuarioNoExiste };
  if (usuario.id === leerSesion().id) return { ok: false, error: MENSAJES.cuentaPropia };
  if (!usuario.activo) return { ok: false, error: MENSAJES.cuentaYaInactiva };
  if (usuario.protegido) return { ok: false, error: MENSAJES.administradorProtegido };

  // La cuenta queda inactiva; sus sesiones se cierran en la siguiente verificación y sus proyectos se conservan.
  usuario.activo = false;
  guardarUsuarios(usuarios);
  const lista = await buscarUsuarios();
  return { ...lista, mensaje: MENSAJES.cuentaDesactivada };
}
