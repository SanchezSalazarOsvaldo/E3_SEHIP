// Validaciones, fórmulas del Método Racional y mensajes oficiales de la
// especificación de requerimientos (RF-WEB-01 a RF-WEB-07).

const PERIODOS_RETORNO = [2, 5, 10, 20, 50];
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
  cpNoRegistrado: 'La tabla maestra normativa no contiene un coeficiente vigente para superficie permeable (Cp)',
  dentroDeCapacidad: 'El caudal ajustado está dentro de la capacidad de descarga permitida',
  excedeCapacidad: 'El caudal ajustado excede la capacidad de descarga permitida',
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

// ---------- RF-WEB-01: credenciales ----------
function credencialesConFormatoValido(correo, contrasena) {
  const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof correo === 'string' && typeof contrasena === 'string'
    && correo.length >= 5 && correo.length <= 50 && formatoCorreo.test(correo)
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
// capacidad = (Qpico − Qobjetivo) × 3,600, redondeada hacia arriba a 2 decimales.
function capacidadNecesaria(caudalPico, caudalObjetivo) {
  const capacidad = Math.ceil(((caudalPico - caudalObjetivo) * 3600 - 1e-9) * 100) / 100;
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

// Eficiencia (0.5 a 1) de una obra a cierta distancia del proyecto; null si queda fuera de la zona.
function eficienciaPorUbicacion(distancia, radio) {
  if (!(radio > 0) || distancia > radio) return null;
  return redondear(1 - (1 - EFICIENCIA_EN_BORDE) * (distancia / radio), 3);
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
    PERIODOS_RETORNO, TIPOS_OBRA, MENSAJES, TAMANO_MAXIMO_REPORTE, UMBRALES_SEMAFORO, NIVELES_SEMAFORO,
    coordenadasValidas, limitesSemaforo, evaluarSemaforo, capacidadNecesaria,
    LAMINA_ENCHARCAMIENTO, distanciaMetros, volumenExcedente, radioAfectacion, eficienciaPorUbicacion,
    redondear, leerCantidad, credencialesConFormatoValido, nombreProyectoValido,
    validarSuperficies, calcularCoeficiente, periodoValido, validarParametrosCaudal,
    calcularCaudalPico, tipoObraValido, leerCapacidad, simularMitigacion, datosCompletosParaReporte
  };
}
