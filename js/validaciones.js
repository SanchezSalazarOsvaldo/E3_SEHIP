// Validaciones, fórmulas del Método Racional y mensajes oficiales de la
// especificación de requerimientos (RF-WEB-01 a RF-WEB-07).

const PERIODOS_RETORNO = [2, 5, 10, 20, 50];
const ROL_INGENIERO = 'Ingeniero Civil';
const ROL_ADMINISTRADOR = 'Administrador del Sistema';
const ROLES = [ROL_INGENIERO, ROL_ADMINISTRADOR];
const TIPOS_OBRA = ['Pozo de Infiltración', 'Tanque de Tormenta', 'Jardín de Lluvia'];

const MENSAJES = {
  // RF-WEB-01
  loginIncorrecto: 'El correo electrónico o la contraseña son incorrectos',
  // RF-WEB-02
  proyectoInvalido: 'El nombre del proyecto debe contener entre 1 y 100 caracteres y una alcaldía válida',
  ubicacionFuera: 'Seleccione una ubicación dentro de los límites de la Ciudad de México',
  // RF-WEB-03
  proyectoNoEncontrado: 'El proyecto no fue encontrado o no existen registros disponibles',
  // RF-WEB-04
  superficiesFaltantes: 'Debe registrar las superficies antes de calcular el coeficiente',
  superficiesFueraDeRango: 'Cada superficie debe estar entre 0.00 y 1,000,000.00 metros cuadrados y la superficie total entre 0.01 y 1,000,000.00 metros cuadrados',
  coeficientesNoRegistrados: 'La tabla maestra normativa no contiene coeficientes vigentes para superficie permeable (Cp) e impermeable (Ci)',
  // RF-WEB-05
  periodoInvalido: 'Seleccione una alcaldía válida y un período de retorno permitido',
  intensidadNoRegistrada: 'No existe una intensidad de lluvia registrada para la alcaldía y el período de retorno seleccionados',
  // RF-WEB-06
  parametrosIncompletos: 'Parámetros incompletos para el cálculo del caudal pico',
  parametrosFueraDeRango: 'Parámetros fuera de rango para el cálculo del caudal pico',
  // RF-WEB-07
  capacidadFueraDeRango: 'La capacidad de almacenamiento debe estar entre 0.01 y 50000.00 metros cúbicos',
  tipoObraFaltante: 'Seleccione un tipo de obra de mitigación pluvial',
  caudalFaltante: 'Debe calcular el caudal pico antes de simular la mitigación',
  obraSinUbicacion: 'Coloque la obra de mitigación en el mapa dentro de la zona afectada',
  obraFueraDeZona: 'La obra de mitigación debe colocarse dentro de la zona afectada',
  ubicacionActualizada: 'Ubicación del proyecto actualizada',
  cpNoRegistrado: 'La tabla maestra normativa no contiene un coeficiente vigente para superficie permeable (Cp)',
  dentroDeCapacidad: 'El caudal ajustado está dentro de la capacidad de descarga permitida',
  excedeCapacidad: 'El caudal ajustado excede la capacidad de descarga permitida',
  // RF-ADM-01
  adminLoginIncorrecto: 'Las credenciales o los privilegios de administrador son incorrectos',
  // RF-ADM-02
  accesoDenegado: 'Acceso denegado: se requiere rol de administrador',
  sinIncidencias: 'No hay incidencias registradas',
  // RF-ADM-03
  parametroActualizado: 'El parámetro fue actualizado con éxito',
  valorFueraDeNorma: 'El valor está fuera de norma',
  valorNoNumerico: 'Ingrese un valor numérico con máximo dos decimales',
  // RF-ADM-04
  cuentaInvalida: 'El correo electrónico ya se encuentra registrado o los datos son inválidos',
  correoFallido: 'No fue posible enviar la contraseña temporal; la cuenta no fue creada',
  // RF-ADM-05
  busquedaLongitud: 'Ingrese entre 1 y 50 caracteres',
  sinUsuarios: 'No se encontraron usuarios con el criterio ingresado',
  // RF-ADM-06
  rolModificado: 'El rol de usuario fue modificado exitosamente',
  ultimoAdministrador: 'No es posible eliminar el último rol de administrador activo',
  rolIgual: 'El rol seleccionado es igual al rol actual de la cuenta',
  usuarioNoExiste: 'El usuario seleccionado no existe',
  administradorProtegido: 'El administrador inicial no puede cambiar de rol ni deshabilitarse',
  // RF-ADM-07
  cuentaPropia: 'No es posible desactivar la cuenta propia en uso',
  cuentaYaInactiva: 'La cuenta seleccionada ya se encuentra inactiva',
  cuentaDesactivada: 'La cuenta fue desactivada; ya no podrá iniciar sesión y su historial se conserva',
  // RF-WEB-08
  reporteIncompleto: 'Debe completar todos los cálculos antes de exportar',
  reporteFallido: 'No fue posible generar el reporte técnico'
};

// Semáforo de impacto pluvial: relación entre el caudal resultante y la capacidad de descarga permitida.
// Verde: hasta 100 %; amarillo: más de 100 % y hasta 150 %; rojo: más de 150 %.
const UMBRALES_SEMAFORO = { verde: 1.0, amarillo: 1.5 };

const NIVELES_SEMAFORO = {
  verde: { etiqueta: 'Riesgo bajo', descripcion: 'El caudal está dentro de la capacidad de descarga permitida.' },
  amarillo: { etiqueta: 'Riesgo medio', descripcion: 'El caudal excede hasta en 50 % la capacidad de descarga permitida; existe riesgo de encharcamiento.' },
  rojo: { etiqueta: 'Riesgo alto', descripcion: 'El caudal excede en más de 50 % la capacidad de descarga permitida; existe riesgo alto de encharcamiento o inundación.' }
};

// Zona afectada: el volumen que excede la descarga permitida durante la tormenta de diseño (1 h)
// se reparte con una lámina de encharcamiento de 5 cm alrededor del predio.
const LAMINA_ENCHARCAMIENTO = 0.05;

// Eficiencia de la obra según su ubicación: 100 % en el punto del proyecto y 50 % en el borde de la zona.
const EFICIENCIA_EN_BORDE = 0.5;

// Tamaño máximo del reporte técnico en PDF: 10 MB (RF-WEB-08).
const TAMANO_MAXIMO_REPORTE = 10 * 1024 * 1024;

// Redondeo a un número fijo de decimales (EPSILON corrige errores de punto flotante como 1.005).
function redondear(valor, decimales) {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

// Convierte la entrada de un formulario en número.
// Devuelve null si está vacía y NaN si no es un número no negativo con máximo 2 decimales.
function leerCantidad(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return NaN;
  return Number(texto);
}

// ---------- RF-WEB-01 y RF-ADM-01: credenciales ----------
// Correo con formato usuario@dominio.com y longitud de 5 a 50 caracteres.
function correoValido(correo) {
  return typeof correo === 'string' && correo.length >= 5 && correo.length <= 50
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function credencialesConFormatoValido(correo, contrasena) {
  return correoValido(correo) && typeof contrasena === 'string'
    && contrasena.length >= 8 && contrasena.length <= 16;
}

// ---------- RF-WEB-02: nombre del proyecto ----------
function nombreProyectoValido(nombre) {
  if (typeof nombre !== 'string') return false;
  const largo = nombre.trim().length;
  return largo >= 1 && largo <= 100;
}

// ---------- RF-WEB-04: superficies y coeficiente ----------
function validarSuperficies(permeable, impermeable) {
  const ap = leerCantidad(permeable);
  const ai = leerCantidad(impermeable);

  if (ap === null || ai === null) {
    return { error: MENSAJES.superficiesFaltantes };
  }
  if (Number.isNaN(ap) || Number.isNaN(ai) || ap > 1000000 || ai > 1000000) {
    return { error: MENSAJES.superficiesFueraDeRango };
  }
  const total = redondear(ap + ai, 2);
  if (total < 0.01 || total > 1000000) {
    return { error: MENSAJES.superficiesFueraDeRango };
  }
  return { ap, ai, total };
}

// C = (Cp · Ap + Ci · Ai) / (Ap + Ai), con dos decimales.
function calcularCoeficiente(cp, ci, ap, ai) {
  return redondear((cp * ap + ci * ai) / (ap + ai), 2);
}

// ---------- RF-WEB-05: período de retorno ----------
function periodoValido(periodo) {
  return PERIODOS_RETORNO.includes(Number(periodo));
}

// ---------- RF-WEB-06: caudal pico ----------
// Devuelve el mensaje de error correspondiente, o null si los parámetros son válidos.
function validarParametrosCaudal(coeficiente, intensidad, superficieTotal) {
  if (coeficiente == null || intensidad == null || superficieTotal == null) {
    return MENSAJES.parametrosIncompletos;
  }
  const fueraDeRango = coeficiente < 0.05 || coeficiente > 0.95
    || intensidad < 10 || intensidad > 250
    || superficieTotal < 0.01 || superficieTotal > 1000000;
  return fueraDeRango ? MENSAJES.parametrosFueraDeRango : null;
}

// Método Racional: Q = C · I · A / 360, con A en hectáreas (m² ÷ 10,000). Resultado en m³/s con 3 decimales.
function calcularCaudalPico(coeficiente, intensidad, superficieM2) {
  const hectareas = superficieM2 / 10000;
  return redondear((coeficiente * intensidad * hectareas) / 360, 3);
}

// ---------- RF-WEB-07: obra de mitigación ----------
function tipoObraValido(tipo) {
  return TIPOS_OBRA.includes(tipo);
}

// Devuelve la capacidad en m³ o null si no cumple el rango de 0.01 a 50,000.00 con hasta 2 decimales.
function leerCapacidad(valor) {
  const capacidad = leerCantidad(valor);
  if (capacidad === null || Number.isNaN(capacidad)) return null;
  if (capacidad < 0.01 || capacidad > 50000) return null;
  return capacidad;
}

// R = (capacidad / 3,600 s) × eficiencia; Qmitigado = Qpico − R (mínimo 0); Qpermitido = Cp · I · A / 360.
function simularMitigacion({ caudalPico, capacidad, cp, intensidad, superficieM2, eficiencia = 1 }) {
  const retencion = redondear((capacidad / 3600) * eficiencia, 6);
  const caudalAjustado = Math.max(0, redondear(caudalPico - retencion, 3));
  const caudalPermitido = calcularCaudalPico(cp, intensidad, superficieM2);
  const dentroDeCapacidad = caudalAjustado <= caudalPermitido;
  return {
    retencion,
    caudalAjustado,
    caudalPermitido,
    dentroDeCapacidad,
    mensaje: dentroDeCapacidad ? MENSAJES.dentroDeCapacidad : MENSAJES.excedeCapacidad
  };
}

// ---------- Ubicación del proyecto ----------
// Coordenadas decimales con hasta 6 decimales dentro del rango geográfico válido.
function coordenadasValidas(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  return latitud !== null && longitud !== null && latitud !== '' && longitud !== ''
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// ---------- Semáforo de impacto pluvial ----------
// Caudales máximos (m³/s, 3 decimales) para los niveles verde y amarillo.
function limitesSemaforo(caudalPermitido) {
  return {
    verde: redondear(caudalPermitido * UMBRALES_SEMAFORO.verde, 3),
    amarillo: redondear(caudalPermitido * UMBRALES_SEMAFORO.amarillo, 3)
  };
}

// Devuelve { nivel, etiqueta, descripcion, porcentaje } para un caudal comparado con el permitido.
function evaluarSemaforo(caudal, caudalPermitido) {
  const limites = limitesSemaforo(caudalPermitido);
  let nivel;
  if (caudal <= limites.verde) {
    nivel = 'verde';
  } else if (caudalPermitido > 0 && caudal <= limites.amarillo) {
    nivel = 'amarillo';
  } else {
    nivel = 'rojo';
  }
  const porcentaje = caudalPermitido > 0 ? Math.round((caudal / caudalPermitido) * 100) : null;
  return { nivel, porcentaje, ...NIVELES_SEMAFORO[nivel] };
}

// Capacidad mínima de almacenamiento (m³) para que el caudal ajustado llegue a un caudal objetivo:
// capacidad = (Qpico − Qobjetivo) × 3,600 / eficiencia, redondeada hacia arriba a 2 decimales.
function capacidadNecesaria(caudalPico, caudalObjetivo, eficiencia = 1) {
  const capacidad = Math.ceil(((caudalPico - caudalObjetivo) * 3600 / eficiencia - 1e-9) * 100) / 100;
  return Math.max(0, capacidad);
}

// ---------- Zona afectada y ubicación de la obra ----------

// Distancia en metros entre dos coordenadas (fórmula de Haversine).
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const radianes = (g) => (g * Math.PI) / 180;
  const dLat = radianes(lat2 - lat1);
  const dLng = radianes(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radianes(lat1)) * Math.cos(radianes(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Volumen (m³) que excede la descarga permitida durante 1 hora.
function volumenExcedente(caudal, caudalPermitido) {
  return redondear(Math.max(0, caudal - caudalPermitido) * 3600, 2);
}

// Radio (m) de la zona afectada: círculo con el área del predio más el área encharcada (volumen / lámina).
function radioAfectacion(superficieM2, caudal, caudalPermitido) {
  const areaEncharcada = volumenExcedente(caudal, caudalPermitido) / LAMINA_ENCHARCAMIENTO;
  return redondear(Math.sqrt((superficieM2 + areaEncharcada) / Math.PI), 1);
}

// Radio (m) de un círculo con la misma área que el predio; representa la huella de la construcción.
function radioPredio(superficieM2) {
  return redondear(Math.sqrt(superficieM2 / Math.PI), 1);
}

// Área (m²) de la zona afectada: predio más superficie encharcada.
function areaZonaAfectada(superficieM2, caudal, caudalPermitido) {
  return redondear(superficieM2 + volumenExcedente(caudal, caudalPermitido) / LAMINA_ENCHARCAMIENTO, 2);
}

// Una simulación guardada solo es vigente si se hizo con el caudal pico, la descarga permitida y la
// ubicación actuales del proyecto; si el proyecto cambió, queda en el historial como desactualizada.
function simulacionVigente(simulacion, proyecto, caudalPermitido) {
  if (!simulacion || proyecto.caudalPico == null || simulacion.caudalPico == null) return false;
  const distanciaActual = distanciaMetros(proyecto.latitud, proyecto.longitud, simulacion.latitud, simulacion.longitud);
  return simulacion.caudalPico === proyecto.caudalPico
    && simulacion.caudalPermitido === caudalPermitido
    && Math.abs(distanciaActual - simulacion.distancia) <= 1;
}

// Eficiencia (0.5 a 1) de una obra a cierta distancia del proyecto; null si queda fuera de la zona.
function eficienciaPorUbicacion(distancia, radio) {
  if (!(radio > 0) || distancia > radio) return null;
  return redondear(1 - (1 - EFICIENCIA_EN_BORDE) * (distancia / radio), 3);
}

// Distancia (m) al proyecto en la que una obra tiene la eficiencia indicada (inversa de la función anterior).
function distanciaParaEficiencia(eficiencia, radio) {
  return redondear(radio * (1 - eficiencia) / (1 - EFICIENCIA_EN_BORDE), 1);
}

// ---------- RF-ADM-03: tabla maestra ----------
// tipo: 'Cp', 'Ci' o 'intensidad'. Devuelve { valor } o { error } con el mensaje oficial.
function validarValorParametro(tipo, texto) {
  const limpio = String(texto ?? '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpio)) return { error: MENSAJES.valorNoNumerico };
  const valor = Number(limpio);
  const enRango = tipo === 'intensidad'
    ? valor >= 10 && valor <= 250
    : valor >= 0.05 && valor <= 0.95;
  return enRango ? { valor } : { error: MENSAJES.valorFueraDeNorma };
}

// ---------- RF-ADM-04: datos de una cuenta nueva ----------
function datosCuentaValidos(nombre, correo, rol) {
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
  return nombreLimpio.length >= 1 && nombreLimpio.length <= 100
    && correoValido(typeof correo === 'string' ? correo.trim() : '')
    && ROLES.includes(rol);
}

// Contraseña temporal de 12 caracteres (dentro del rango de 8 a 16) sin caracteres ambiguos.
// obtenerAleatorios(n) devuelve n enteros aleatorios (crypto del navegador o de Node.js).
function generarContrasenaTemporal(obtenerAleatorios) {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '#$%&*+?'];
  const todos = grupos.join('');
  const aleatorios = obtenerAleatorios(12);
  const caracteres = aleatorios.map((n, i) => (i < grupos.length ? grupos[i] : todos)[n % (i < grupos.length ? grupos[i] : todos).length]);
  // Mezcla para que los caracteres obligatorios no queden siempre al inicio.
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = aleatorios[(i + 3) % aleatorios.length] % (i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}

// ---------- RF-ADM-05: búsqueda de usuarios ----------
function busquedaValida(texto) {
  return typeof texto === 'string' && texto.length >= 1 && texto.length <= 50;
}

// Coincidencia parcial sin distinguir mayúsculas ni acentos en nombre, correo o rol.
function usuarioCoincide(usuario, texto) {
  const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const buscado = normalizar(texto.trim());
  return [usuario.nombre, usuario.correo, usuario.rol].some((campo) => normalizar(campo).includes(buscado));
}

// ---------- RF-WEB-08: reporte técnico ----------
// El proyecto debe tener nombre, alcaldía, superficies, coeficiente, intensidad y caudal pico.
function datosCompletosParaReporte(proyecto) {
  return Boolean(proyecto)
    && Boolean(proyecto.nombre)
    && Boolean(proyecto.idAlcaldia)
    && proyecto.superficiePermeable != null
    && proyecto.superficieImpermeable != null
    && proyecto.superficieTotal != null
    && proyecto.coeficiente != null
    && proyecto.intensidad != null
    && proyecto.periodoRetorno != null
    && proyecto.caudalPico != null
    && proyecto.latitud != null
    && proyecto.longitud != null;
}

// Permite usar este mismo archivo desde Node.js (servidor y pruebas); en el navegador se ignora.
if (typeof module !== 'undefined') {
  module.exports = {
    PERIODOS_RETORNO, TIPOS_OBRA, MENSAJES, ROL_INGENIERO, ROL_ADMINISTRADOR, ROLES,
    correoValido, validarValorParametro, datosCuentaValidos, generarContrasenaTemporal, busquedaValida, usuarioCoincide, TAMANO_MAXIMO_REPORTE, UMBRALES_SEMAFORO, NIVELES_SEMAFORO,
    coordenadasValidas, limitesSemaforo, evaluarSemaforo, capacidadNecesaria,
    LAMINA_ENCHARCAMIENTO, distanciaMetros, volumenExcedente, radioAfectacion, eficienciaPorUbicacion,
    distanciaParaEficiencia,
    radioPredio, areaZonaAfectada, simulacionVigente,
    redondear, leerCantidad, credencialesConFormatoValido, nombreProyectoValido,
    validarSuperficies, calcularCoeficiente, periodoValido, validarParametrosCaudal,
    calcularCaudalPico, tipoObraValido, leerCapacidad, simularMitigacion, datosCompletosParaReporte
  };
}
