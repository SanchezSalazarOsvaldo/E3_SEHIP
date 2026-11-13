// Lógica del módulo de simulación (versión sin base de datos): sesión, proyectos, cálculos y reportes.
// Los proyectos, simulaciones y reportes se guardan en el localStorage del navegador.
// Cada operación devuelve { ok: false, error } o { ok: true, proyecto, simulacion, simulaciones, reportes, mensaje }.

const CLAVE_PROYECTOS = 'sehip_proyectos_v3';
const CLAVE_SIMULACIONES = 'sehip_simulaciones_v3';
const CLAVE_REPORTES = 'sehip_reportes_v3';
const PROYECTOS_POR_PAGINA = 10;

// ---------- RF-WEB-01: sesión ----------
// Solo cuentas activas con rol Ingeniero Civil; cualquier fallo devuelve el mismo mensaje.
async function iniciarSesion(correoTexto, contrasena) {
  const correo = String(correoTexto).trim();
  if (!credencialesConFormatoValido(correo, contrasena)) {
    return { ok: false, error: MENSAJES.loginIncorrecto };
  }
  const usuario = (await obtenerUsuarios()).find((u) => u.correo.toLowerCase() === correo.toLowerCase());
  const accesoValido = usuario
    && usuario.contrasenaHash === await cifrarContrasena(contrasena)
    && usuario.activo
    && usuario.rol === ROL_INGENIERO;
  if (!accesoValido) {
    return { ok: false, error: MENSAJES.loginIncorrecto };
  }
  return { ok: true, usuario: guardarSesion(usuario) };
}

// Usuario de la sesión si es un ingeniero civil con cuenta activa; null en otro caso.
async function usuarioActivo() {
  const resultado = await sesionConRol(ROL_INGENIERO);
  return resultado.estado === 'ok' ? resultado.usuario : null;
}

// ---------- Catálogos ----------

function obtenerAlcaldias() {
  return ALCALDIAS;
}

function obtenerCoeficientes() {
  return COEFICIENTES;
}

// Intensidades de la alcaldía por período de retorno: { 2: 40, 5: 55, ... }.
function obtenerIntensidadesAlcaldia(idAlcaldia) {
  return { ...(INTENSIDADES[idAlcaldia] || {}) };
}

// ---------- Consultas internas ----------

// Proyecto por identificador solo si pertenece al usuario activo.
function buscarProyectoPropio(idProyecto) {
  const usuario = leerSesion();
  const id = Number(idProyecto);
  if (!usuario || !Number.isInteger(id) || id < 1) return null;
  return leerLista(CLAVE_PROYECTOS).find((p) => p.id === id && p.idUsuario === usuario.id) || null;
}

// Guarda los cambios de un proyecto en la lista almacenada.
function actualizarProyecto(proyecto) {
  const proyectos = leerLista(CLAVE_PROYECTOS);
  const indice = proyectos.findIndex((p) => p.id === proyecto.id);
  proyectos[indice] = proyecto;
  guardarLista(CLAVE_PROYECTOS, proyectos);
}

// Simulaciones de un proyecto, de la más reciente a la más antigua.
function simulacionesDelProyecto(idProyecto) {
  return leerLista(CLAVE_SIMULACIONES).filter((s) => s.idProyecto === idProyecto).reverse();
}

// Reportes generados de un proyecto, del más reciente al más antiguo.
// La copia del PDF se conserva como data URI y sirve como enlace de descarga.
function reportesDelProyecto(idProyecto) {
  return leerLista(CLAVE_REPORTES)
    .filter((r) => r.idProyecto === idProyecto)
    .reverse()
    .map((r) => ({ ...r, url: r.dataUri }));
}

// Respuesta estándar con el proyecto, su alcaldía, sus simulaciones y sus reportes.
function respuestaProyecto(proyecto, mensaje = '') {
  const simulaciones = simulacionesDelProyecto(proyecto.id);
  return {
    ok: true,
    proyecto: { ...proyecto, alcaldia: nombreAlcaldia(proyecto.idAlcaldia) },
    simulacion: simulaciones[0] || null,
    simulaciones,
    reportes: reportesDelProyecto(proyecto.id),
    mensaje
  };
}

// Cuando cambian los datos de un proyecto ya calculado (superficies, intensidad o ubicación), el caudal
// pico se recalcula al momento para que la simulación del mapa se actualice; si faltan datos, se borra.
function actualizarCaudal(proyecto) {
  const error = validarParametrosCaudal(proyecto.coeficiente, proyecto.intensidad, proyecto.superficieTotal);
  if (proyecto.estado === 'Calculado' && !error) {
    proyecto.caudalPico = calcularCaudalPico(proyecto.coeficiente, proyecto.intensidad, proyecto.superficieTotal);
  } else {
    proyecto.caudalPico = null;
    proyecto.estado = 'En proceso';
  }
}

// Texto que se agrega al mensaje cuando el caudal pico se recalculó automáticamente.
function textoRecalculo(proyecto) {
  return proyecto.caudalPico != null ? ` · Caudal pico recalculado: ${proyecto.caudalPico.toFixed(3)} m³/s` : '';
}

// ---------- RF-WEB-02: registrar proyecto ----------

function registrarProyecto(nombreTexto, idAlcaldiaTexto, latitudTexto, longitudTexto) {
  const nombre = typeof nombreTexto === 'string' ? nombreTexto.trim() : '';
  const idAlcaldia = Number(idAlcaldiaTexto);
  const alcaldiaValida = ALCALDIAS.some((a) => a.id === idAlcaldia);

  if (!nombreProyectoValido(nombre) || !alcaldiaValida) {
    return { ok: false, error: MENSAJES.proyectoInvalido };
  }

  // El punto debe estar dentro de la CDMX y dentro de la alcaldía seleccionada.
  const alcaldiaDelPunto = coordenadasValidas(latitudTexto, longitudTexto)
    ? alcaldiaEnPunto(latitudTexto, longitudTexto)
    : null;
  if (!alcaldiaDelPunto) {
    return { ok: false, error: MENSAJES.ubicacionFuera };
  }
  if (alcaldiaDelPunto !== nombreAlcaldia(idAlcaldia)) {
    return { ok: false, error: MENSAJES.proyectoInvalido };
  }

  const proyectos = leerLista(CLAVE_PROYECTOS);
  const proyecto = {
    id: siguienteId(proyectos),
    idUsuario: leerSesion().id,
    nombre,
    idAlcaldia,
    latitud: Number(Number(latitudTexto).toFixed(6)),
    longitud: Number(Number(longitudTexto).toFixed(6)),
    fechaCreacion: fechaHoy(),
    estado: 'En proceso',
    superficiePermeable: null,
    superficieImpermeable: null,
    superficieTotal: null,
    coeficiente: null,
    intensidad: null,
    periodoRetorno: null,
    caudalPico: null
  };
  proyectos.push(proyecto);
  guardarLista(CLAVE_PROYECTOS, proyectos);

  return respuestaProyecto(proyecto, `Proyecto registrado correctamente con el identificador ${proyecto.id}`);
}

// ---------- Mover el punto de un proyecto ----------
// El punto puede cambiar dentro de la CDMX; la alcaldía y la intensidad se toman de la nueva ubicación.
function moverProyecto(idProyecto, latitudTexto, longitudTexto) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };

  const nombreNuevaAlcaldia = coordenadasValidas(latitudTexto, longitudTexto)
    ? alcaldiaEnPunto(latitudTexto, longitudTexto)
    : null;
  if (!nombreNuevaAlcaldia) return { ok: false, error: MENSAJES.ubicacionFuera };
  const nuevaAlcaldia = ALCALDIAS.find((a) => a.nombre === nombreNuevaAlcaldia);

  // Si el proyecto ya tiene período de retorno, la intensidad se consulta para la nueva alcaldía.
  let intensidad = proyecto.intensidad;
  if (proyecto.periodoRetorno != null) {
    intensidad = INTENSIDADES[nuevaAlcaldia.id][proyecto.periodoRetorno];
    if (intensidad == null) return { ok: false, error: MENSAJES.intensidadNoRegistrada };
  }

  proyecto.latitud = Number(Number(latitudTexto).toFixed(6));
  proyecto.longitud = Number(Number(longitudTexto).toFixed(6));
  proyecto.idAlcaldia = nuevaAlcaldia.id;
  proyecto.intensidad = intensidad;
  actualizarCaudal(proyecto);
  actualizarProyecto(proyecto);

  return respuestaProyecto(proyecto, `${MENSAJES.ubicacionActualizada}: ${nuevaAlcaldia.nombre}${textoRecalculo(proyecto)}`);
}

// ---------- RF-WEB-03: historial y consulta ----------

function listarProyectos(paginaSolicitada) {
  const usuario = leerSesion();
  const propios = leerLista(CLAVE_PROYECTOS)
    .filter((p) => p.idUsuario === usuario.id)
    .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion) || b.id - a.id);

  if (propios.length === 0) {
    return { ok: false, proyectos: [], error: MENSAJES.proyectoNoEncontrado };
  }

  const totalPaginas = Math.ceil(propios.length / PROYECTOS_POR_PAGINA);
  const pagina = Math.min(Math.max(1, parseInt(paginaSolicitada, 10) || 1), totalPaginas);
  const inicio = (pagina - 1) * PROYECTOS_POR_PAGINA;

  return {
    ok: true,
    pagina,
    totalPaginas,
    proyectos: propios.slice(inicio, inicio + PROYECTOS_POR_PAGINA)
      .map((p) => ({ ...p, alcaldia: nombreAlcaldia(p.idAlcaldia) }))
  };
}

function consultarProyecto(idProyecto) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };
  return respuestaProyecto(proyecto);
}

// ---------- RF-WEB-04: coeficiente de escurrimiento ----------

function calcularCoeficienteProyecto(idProyecto, permeable, impermeable) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };

  const superficies = validarSuperficies(permeable, impermeable);
  if (superficies.error) return { ok: false, error: superficies.error };

  if (COEFICIENTES.Cp == null || COEFICIENTES.Ci == null) {
    return { ok: false, error: MENSAJES.coeficientesNoRegistrados };
  }

  const { ap, ai, total } = superficies;
  const coeficiente = calcularCoeficiente(COEFICIENTES.Cp, COEFICIENTES.Ci, ap, ai);

  const huboCambio = proyecto.superficiePermeable !== ap
    || proyecto.superficieImpermeable !== ai
    || proyecto.coeficiente !== coeficiente;

  if (huboCambio) {
    proyecto.superficiePermeable = ap;
    proyecto.superficieImpermeable = ai;
    proyecto.superficieTotal = total;
    proyecto.coeficiente = coeficiente;
    actualizarCaudal(proyecto);
    actualizarProyecto(proyecto);
  }

  return respuestaProyecto(proyecto, `Coeficiente de escurrimiento calculado: C = ${coeficiente.toFixed(2)}${textoRecalculo(proyecto)}`);
}

// ---------- RF-WEB-05: intensidad de lluvia ----------

function consultarIntensidadProyecto(idProyecto, periodoTexto) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };

  const periodo = Number(periodoTexto);
  if (!INTENSIDADES[proyecto.idAlcaldia] || !periodoValido(periodo)) {
    return { ok: false, error: MENSAJES.periodoInvalido };
  }

  const intensidad = INTENSIDADES[proyecto.idAlcaldia][periodo];
  if (intensidad == null) {
    return { ok: false, error: MENSAJES.intensidadNoRegistrada };
  }

  if (proyecto.intensidad !== intensidad || proyecto.periodoRetorno !== periodo) {
    proyecto.intensidad = intensidad;
    proyecto.periodoRetorno = periodo;
    actualizarCaudal(proyecto);
    actualizarProyecto(proyecto);
  }

  return respuestaProyecto(proyecto, `Intensidad de lluvia para ${periodo} años: ${intensidad.toFixed(2)} mm/h${textoRecalculo(proyecto)}`);
}

// ---------- RF-WEB-06: caudal pico ----------

function calcularCaudalProyecto(idProyecto) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };

  const error = validarParametrosCaudal(proyecto.coeficiente, proyecto.intensidad, proyecto.superficieTotal);
  if (error) return { ok: false, error };

  proyecto.caudalPico = calcularCaudalPico(proyecto.coeficiente, proyecto.intensidad, proyecto.superficieTotal);
  proyecto.estado = 'Calculado';
  actualizarProyecto(proyecto);

  return respuestaProyecto(proyecto, `Caudal pico calculado: Q = ${proyecto.caudalPico.toFixed(3)} m³/s`);
}

// ---------- RF-WEB-07: obra de mitigación ----------

function simularMitigacionProyecto(idProyecto, tipoObra, capacidadTexto, latitudObra, longitudObra) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };

  if (!tipoObraValido(tipoObra)) return { ok: false, error: MENSAJES.tipoObraFaltante };

  const capacidad = leerCapacidad(capacidadTexto);
  if (capacidad === null) return { ok: false, error: MENSAJES.capacidadFueraDeRango };

  if (proyecto.caudalPico == null) return { ok: false, error: MENSAJES.caudalFaltante };

  if (COEFICIENTES.Cp == null) return { ok: false, error: MENSAJES.cpNoRegistrado };

  // La obra debe estar dentro de la zona afectada; su eficiencia depende de la distancia al proyecto.
  if (!coordenadasValidas(latitudObra, longitudObra)) return { ok: false, error: MENSAJES.obraSinUbicacion };
  const caudalPermitido = calcularCaudalPico(COEFICIENTES.Cp, proyecto.intensidad, proyecto.superficieTotal);
  const radio = radioAfectacion(proyecto.superficieTotal, proyecto.caudalPico, caudalPermitido);
  const distancia = redondear(distanciaMetros(proyecto.latitud, proyecto.longitud, Number(latitudObra), Number(longitudObra)), 2);
  const eficiencia = eficienciaPorUbicacion(distancia, radio);
  if (eficiencia === null) return { ok: false, error: MENSAJES.obraFueraDeZona };

  const resultado = simularMitigacion({
    caudalPico: proyecto.caudalPico,
    capacidad,
    cp: COEFICIENTES.Cp,
    intensidad: proyecto.intensidad,
    superficieM2: proyecto.superficieTotal,
    eficiencia
  });

  const simulaciones = leerLista(CLAVE_SIMULACIONES);
  simulaciones.push({
    id: siguienteId(simulaciones),
    idProyecto: proyecto.id,
    tipoObra,
    capacidad,
    caudalPico: proyecto.caudalPico,
    latitud: Number(Number(latitudObra).toFixed(6)),
    longitud: Number(Number(longitudObra).toFixed(6)),
    distancia,
    eficiencia,
    retencion: resultado.retencion,
    caudalAjustado: resultado.caudalAjustado,
    caudalPermitido: resultado.caudalPermitido,
    dentroDeCapacidad: resultado.dentroDeCapacidad,
    fechaHora: fechaHoraActual()
  });
  guardarLista(CLAVE_SIMULACIONES, simulaciones);

  return respuestaProyecto(proyecto, resultado.mensaje);
}

// ---------- RF-WEB-08: copia del reporte técnico en el historial ----------

function guardarReporte(idProyecto, reporte) {
  const proyecto = buscarProyectoPropio(idProyecto);
  if (!proyecto) return { ok: false, error: MENSAJES.proyectoNoEncontrado };
  if (!datosCompletosParaReporte(proyecto)) return { ok: false, error: MENSAJES.reporteIncompleto };
  if (reporte.tamanoBytes < 1 || reporte.tamanoBytes > TAMANO_MAXIMO_REPORTE) {
    return { ok: false, error: MENSAJES.reporteFallido };
  }

  const reportes = leerLista(CLAVE_REPORTES);
  reportes.push({
    id: siguienteId(reportes),
    idProyecto: proyecto.id,
    nombreArchivo: reporte.nombreArchivo,
    tamanoBytes: reporte.tamanoBytes,
    fechaGeneracion: fechaHoraActual(),
    dataUri: reporte.dataUri
  });

  // El localStorage tiene un límite de espacio; si se llena, el reporte no se guarda.
  try {
    guardarLista(CLAVE_REPORTES, reportes);
  } catch (error) {
    return { ok: false, error: MENSAJES.reporteFallido };
  }
  return respuestaProyecto(proyecto, `Reporte técnico descargado: ${reporte.nombreArchivo}`);
}
