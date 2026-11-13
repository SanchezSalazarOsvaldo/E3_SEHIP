// Datos del sistema sin base de datos: cuentas, catálogo de alcaldías, tabla maestra normativa,
// incidencias, sesión y bandeja de correo simulada. Lo que el usuario modifica se guarda en localStorage.

const CLAVE_USUARIOS = 'sehip_usuarios_v1';
const CLAVE_TABLA_MAESTRA = 'sehip_tabla_maestra_v1';
const CLAVE_CORREOS = 'sehip_correos_v1';
const CLAVE_SESION = 'sehip_sesion';

// Cuentas con las que arranca el sistema. La primera es el Administrador del Sistema inicial (protegido).
// Las cuentas nuevas se crean desde el módulo de administración (RF-ADM-04).
const USUARIOS_INICIALES = [
  { id: 1, nombre: 'Administrador SEHIP', correo: 'admin@sehip.mx', contrasena: 'Admin12345', rol: 'Administrador del Sistema', activo: true, protegido: true },
  { id: 2, nombre: 'Regina Cerón', correo: 'ingeniero@sehip.mx', contrasena: 'Clave1234', rol: 'Ingeniero Civil', activo: true, protegido: false },
  { id: 3, nombre: 'Cuenta Inactiva', correo: 'inactivo@sehip.mx', contrasena: 'Clave1234', rol: 'Ingeniero Civil', activo: false, protegido: false }
];

// true simula una falla del servicio de correo para probar el flujo alterno 2 de RF-ADM-04.
const SIMULAR_FALLA_CORREO = false;

// Las 16 alcaldías de la Ciudad de México.
const ALCALDIAS = [
  { id: 1, nombre: 'Álvaro Obregón' },
  { id: 2, nombre: 'Azcapotzalco' },
  { id: 3, nombre: 'Benito Juárez' },
  { id: 4, nombre: 'Coyoacán' },
  { id: 5, nombre: 'Cuajimalpa de Morelos' },
  { id: 6, nombre: 'Cuauhtémoc' },
  { id: 7, nombre: 'Gustavo A. Madero' },
  { id: 8, nombre: 'Iztacalco' },
  { id: 9, nombre: 'Iztapalapa' },
  { id: 10, nombre: 'La Magdalena Contreras' },
  { id: 11, nombre: 'Miguel Hidalgo' },
  { id: 12, nombre: 'Milpa Alta' },
  { id: 13, nombre: 'Tláhuac' },
  { id: 14, nombre: 'Tlalpan' },
  { id: 15, nombre: 'Venustiano Carranza' },
  { id: 16, nombre: 'Xochimilco' }
];

// ---------- Tabla maestra normativa ----------
// Valores de prueba con los que arranca el sistema; el administrador los actualiza con RF-ADM-03.
const COEFICIENTES_INICIALES = { Cp: 0.20, Ci: 0.90 };
const INTENSIDAD_BASE = { 2: 40.00, 5: 55.00, 10: 65.00, 20: 75.00, 50: 90.00 };

function tablaMaestraInicial() {
  const intensidades = {};
  ALCALDIAS.forEach((alcaldia) => { intensidades[alcaldia.id] = { ...INTENSIDAD_BASE }; });
  // Milpa Alta con 50 años queda sin registro para probar el flujo alterno 2 de RF-WEB-05.
  intensidades[12][50] = null;
  return { coeficientes: { ...COEFICIENTES_INICIALES }, intensidades };
}

// Tabla vigente: la guardada por el administrador o, si no existe, la inicial.
const TABLA_MAESTRA = JSON.parse(localStorage.getItem(CLAVE_TABLA_MAESTRA) || 'null') || tablaMaestraInicial();
const COEFICIENTES = TABLA_MAESTRA.coeficientes;
const INTENSIDADES = TABLA_MAESTRA.intensidades;

function guardarTablaMaestra() {
  localStorage.setItem(CLAVE_TABLA_MAESTRA, JSON.stringify(TABLA_MAESTRA));
}

// ---------- Incidencias (puntos críticos de encharcamiento, RF-MOV-05) ----------
// Puntos de prueba para el mapa del panel de control (RF-ADM-02).
const PUNTOS_CRITICOS = [
  { latitud: 19.411600, longitud: -99.062400, fechaRegistro: '2026-06-14 18:20:00' },
  { latitud: 19.403200, longitud: -99.156900, fechaRegistro: '2026-06-21 19:05:00' },
  { latitud: 19.359200, longitud: -99.104700, fechaRegistro: '2026-07-02 17:45:00' },
  { latitud: 19.343600, longitud: -99.140600, fechaRegistro: '2026-07-09 20:10:00' },
  { latitud: 19.498700, longitud: -99.120500, fechaRegistro: '2026-07-15 16:30:00' },
  { latitud: 19.441700, longitud: -99.090100, fechaRegistro: '2026-07-22 18:55:00' },
  { latitud: 19.302000, longitud: -99.189000, fechaRegistro: '2026-08-03 19:40:00' },
  { latitud: 19.296000, longitud: -99.061000, fechaRegistro: '2026-08-11 17:15:00' },
  { latitud: 19.387000, longitud: -99.054000, fechaRegistro: '2026-08-19 21:00:00' },
  { latitud: 19.459000, longitud: -99.188000, fechaRegistro: '2026-08-27 18:05:00' },
  { latitud: 19.374000, longitud: -99.081000, fechaRegistro: '2026-09-04 19:25:00' },
  { latitud: 19.260000, longitud: -99.105000, fechaRegistro: '2026-09-12 16:50:00' }
];

// ---------- Utilidades compartidas ----------

function leerLista(clave) {
  return JSON.parse(localStorage.getItem(clave) || '[]');
}

function guardarLista(clave, lista) {
  localStorage.setItem(clave, JSON.stringify(lista));
}

// Siguiente identificador numérico único (mayor o igual a 1).
function siguienteId(lista) {
  return lista.reduce((maximo, elemento) => Math.max(maximo, elemento.id), 0) + 1;
}

function fechaHoy() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function fechaHoraActual() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${fechaHoy()} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

// n enteros aleatorios seguros (para contraseñas temporales).
function enterosAleatorios(n) {
  return Array.from(crypto.getRandomValues(new Uint32Array(n)));
}

// ---------- Contraseñas ----------
// Se guardan cifradas con SHA-256; nunca en texto plano.
async function cifrarContrasena(texto) {
  const datos = new TextEncoder().encode(`sehip:${texto}`);
  if (window.crypto && crypto.subtle) {
    const resumen = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(resumen)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Respaldo para navegadores que no permiten crypto.subtle al abrir el archivo directamente.
  let h = 2166136261;
  datos.forEach((b) => { h = Math.imul(h ^ b, 16777619) >>> 0; });
  return `fnv-${h.toString(16)}`;
}

// ---------- Cuentas ----------

// Lista de cuentas guardadas; la primera vez se crea con USUARIOS_INICIALES.
async function obtenerUsuarios() {
  let usuarios = JSON.parse(localStorage.getItem(CLAVE_USUARIOS) || 'null');
  if (!usuarios) {
    usuarios = [];
    for (const u of USUARIOS_INICIALES) {
      const { contrasena, ...datos } = u;
      usuarios.push({ ...datos, contrasenaHash: await cifrarContrasena(contrasena), fechaCreacion: fechaHoraActual() });
    }
    guardarLista(CLAVE_USUARIOS, usuarios);
  }
  return usuarios;
}

function guardarUsuarios(usuarios) {
  guardarLista(CLAVE_USUARIOS, usuarios);
}

// ---------- Sesión ----------
// La sesión guarda id, nombre, correo, el rol con el que se inició (un cambio de rol rige desde
// el siguiente inicio de sesión, RF-ADM-06) y si la contraseña es temporal y debe cambiarse.

function leerSesion() {
  return JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null');
}

function guardarSesion(usuario) {
  const sesion = {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    debeCambiarContrasena: usuario.debeCambiarContrasena === true
  };
  sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  return sesion;
}

function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_SESION);
}

// Sesión vigente si la cuenta sigue activa y el rol de la sesión es el requerido (rol = null acepta
// cualquier rol); si la cuenta fue desactivada (RF-ADM-07), la sesión se cierra.
async function sesionConRol(rol) {
  const sesion = leerSesion();
  if (!sesion) return { estado: 'sin-sesion' };
  const usuario = (await obtenerUsuarios()).find((u) => u.id === sesion.id);
  if (!usuario || !usuario.activo) {
    cerrarSesion();
    return { estado: 'sin-sesion' };
  }
  const vigente = { ...sesion, debeCambiarContrasena: usuario.debeCambiarContrasena === true };
  if (rol && vigente.rol !== rol) return { estado: 'denegado', usuario: vigente };
  return { estado: 'ok', usuario: vigente };
}

// ---------- Bandeja de correo simulada ----------
// Sin servidor no se puede enviar correo real; los mensajes se guardan aquí y se ven en bandeja.html.
function enviarCorreoSimulado(destinatario, asunto, cuerpo) {
  if (SIMULAR_FALLA_CORREO) return false;
  const correos = leerLista(CLAVE_CORREOS);
  correos.push({ id: siguienteId(correos), destinatario, asunto, cuerpo, fechaHora: fechaHoraActual() });
  guardarLista(CLAVE_CORREOS, correos);
  return true;
}

function nombreAlcaldia(idAlcaldia) {
  const alcaldia = ALCALDIAS.find((a) => a.id === idAlcaldia);
  return alcaldia ? alcaldia.nombre : '';
}
