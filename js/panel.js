// Panel del ingeniero civil organizado en pestañas:
// Proyectos (RF-WEB-02, 03 y mapa), Cálculo hidrológico (RF-WEB-04 a 06),
// Mitigación (RF-WEB-07, con semáforo de impacto pluvial) y Reporte técnico (RF-WEB-08).
// Las funciones de js/proyectos.js se usan con await para que el panel funcione igual
// con almacenamiento local o con un servidor.

const estado = {
  usuario: null,
  proyecto: null,      // proyecto activo
  simulacion: null,    // última simulación del proyecto activo
  pagina: 1,           // página actual del historial
  alcaldias: [],       // catálogo de alcaldías { id, nombre }
  coeficientes: null,  // Cp y Ci vigentes de la tabla maestra
  punto: null,         // { latitud, longitud } del proyecto por registrar
  obra: null,          // { latitud, longitud, distancia, eficiencia } de la obra por simular
  pestana: 'proyectos',
  radio: null          // radio (m) de la zona afectada sin obra
};

const INSTRUCCIONES_MAPA = {
  proyectos: 'Haga clic en el mapa para colocar el punto donde se construirá el proyecto.',
  calculo: 'El círculo muestra la zona afectada por el escurrimiento del proyecto; su color es el semáforo.',
  mitigacion: 'Haga clic dentro de la zona afectada para colocar la obra de mitigación.',
  reporte: 'El reporte técnico incluye la ubicación, la zona afectada y el semáforo antes y después de la obra.'
};

const $ = (id) => document.getElementById(id);

// ---------- Utilidades ----------

// Escapa texto antes de insertarlo como HTML.
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// Número con separador de miles y decimales fijos; null si no hay valor.
function numero(valor, decimales) {
  if (valor === null || valor === undefined) return null;
  return Number(valor).toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

// Escribe un valor en una métrica; si no existe muestra la leyenda "Sin calcular".
function pintarMetrica(id, valor, decimales, unidad = '') {
  const elemento = $(id);
  const texto = numero(valor, decimales);
  elemento.classList.toggle('sin-calcular', texto === null);
  elemento.textContent = texto === null ? 'Sin calcular' : `${texto}${unidad}`;
}

// Banner de mensaje dentro de un contenedor: tipo = 'error' | 'exito' | 'info'.
function mostrarMensaje(idContenedor, tipo, texto) {
  const iconos = { error: 'i-triangulo', exito: 'i-check', info: 'i-info' };
  $(idContenedor).innerHTML = `
    <div class="alerta alerta-${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">
      <svg class="icono"><use href="#${iconos[tipo]}"/></svg>
      <span>${escapar(texto)}</span>
    </div>`;
}

function limpiarMensajes() {
  ['msg-proyecto', 'msg-historial', 'msg-coeficiente', 'msg-intensidad', 'msg-caudal', 'msg-mitigacion', 'msg-reporte']
    .forEach((id) => { $(id).innerHTML = ''; });
}

// Aviso temporal en la parte inferior de la pantalla.
let temporizadorSnackbar;
function snackbar(texto) {
  const caja = $('snackbar');
  caja.querySelector('span').textContent = texto;
  caja.classList.remove('oculto');
  clearTimeout(temporizadorSnackbar);
  temporizadorSnackbar = setTimeout(() => caja.classList.add('oculto'), 4000);
}

function claseEstado(estadoProyecto) {
  return estadoProyecto === 'Calculado' ? 'chip-calculado' : 'chip-proceso';
}

function idAlcaldiaPorNombre(nombre) {
  const alcaldia = estado.alcaldias.find((a) => a.nombre === nombre);
  return alcaldia ? alcaldia.id : '';
}

function nombreAlcaldiaPorId(id) {
  const alcaldia = estado.alcaldias.find((a) => String(a.id) === String(id));
  return alcaldia ? alcaldia.nombre : null;
}

// ---------- Pestañas ----------

function mostrarPestana(nombre) {
  document.querySelectorAll('.pestana').forEach((boton) => {
    boton.classList.toggle('activa', boton.dataset.pestana === nombre);
  });
  document.querySelectorAll('.panel-pestana').forEach((panel) => {
    panel.classList.toggle('oculto', panel.id !== `pestana-${nombre}`);
  });
  estado.pestana = nombre;
  $('mapa-instruccion').textContent = INSTRUCCIONES_MAPA[nombre];
  $('mapa-seleccion').classList.toggle('oculto', nombre !== 'proyectos');
  ajustarMapa();
}

// ---------- RF-WEB-03: historial ----------

async function cargarHistorial(pagina = estado.pagina) {
  const resultado = await listarProyectos(pagina);
  const lista = $('lista-proyectos');
  lista.innerHTML = '';
  $('msg-historial').innerHTML = '';

  if (!resultado.ok) {
    mostrarMensaje('msg-historial', 'error', resultado.error);
    $('paginacion').classList.add('oculto');
    return;
  }

  estado.pagina = resultado.pagina;

  resultado.proyectos.forEach((p) => {
    const activo = estado.proyecto && estado.proyecto.id === p.id;
    const item = document.createElement('li');
    item.innerHTML = `
      <button type="button" class="item-proyecto ${activo ? 'activo' : ''}" data-id="${p.id}">
        <span class="item-nombre">#${p.id} · ${escapar(p.nombre)}</span>
        <span class="item-detalle">${escapar(p.alcaldia)} · ${p.fechaCreacion}</span>
        <span class="chip ${claseEstado(p.estado)}">${p.estado}</span>
      </button>`;
    lista.appendChild(item);
  });

  $('paginacion').classList.toggle('oculto', resultado.totalPaginas <= 1);
  $('texto-pagina').textContent = `Página ${resultado.pagina} de ${resultado.totalPaginas}`;
  $('pagina-anterior').disabled = resultado.pagina <= 1;
  $('pagina-siguiente').disabled = resultado.pagina >= resultado.totalPaginas;
}

// ---------- Semáforo de impacto pluvial ----------

// Caudal permitido del proyecto: Cp · I · A / 360 (null si faltan datos).
function caudalPermitidoProyecto(p) {
  if (!estado.coeficientes || estado.coeficientes.Cp == null || p.intensidad == null || p.superficieTotal == null) {
    return null;
  }
  return calcularCaudalPico(estado.coeficientes.Cp, p.intensidad, p.superficieTotal);
}

// Semáforo sin obra (caudal pico) y con la última obra simulada (caudal ajustado).
function semaforosProyecto(p, simulacion) {
  const permitido = caudalPermitidoProyecto(p);
  if (p.caudalPico == null || permitido == null) {
    return { permitido, antes: null, despues: null, actual: null, radioAntes: null, radioActual: null };
  }
  const antes = evaluarSemaforo(p.caudalPico, permitido);
  const despues = simulacion ? evaluarSemaforo(simulacion.caudalAjustado, simulacion.caudalPermitido) : null;
  const radioAntes = radioAfectacion(p.superficieTotal, p.caudalPico, permitido);
  const radioActual = simulacion
    ? radioAfectacion(p.superficieTotal, simulacion.caudalAjustado, simulacion.caudalPermitido)
    : radioAntes;
  return { permitido, antes, despues, actual: despues || antes, radioAntes, radioActual };
}

// HTML del semáforo con su nivel encendido.
function htmlSemaforo(evaluacion, caudal, permitido, etiquetaCaudal) {
  if (!evaluacion) {
    return '<p class="texto-vacio">Sin calcular. Calcule el caudal pico del proyecto para evaluar el riesgo.</p>';
  }
  const luz = (color) => `<span class="luz luz-${color} ${evaluacion.nivel === color ? 'encendida' : ''}"></span>`;
  return `
    <div class="semaforo semaforo-${evaluacion.nivel}" role="img" aria-label="Semáforo: ${evaluacion.etiqueta}">
      <div class="semaforo-caja">${luz('rojo')}${luz('amarillo')}${luz('verde')}</div>
      <div class="semaforo-texto">
        <strong>${evaluacion.etiqueta}</strong>
        <p>${evaluacion.descripcion}</p>
        <div class="semaforo-datos">
          <span>${etiquetaCaudal}: <b>${numero(caudal, 3)} m³/s</b></span>
          <span>Descarga permitida: <b>${numero(permitido, 3)} m³/s</b></span>
          ${evaluacion.porcentaje !== null ? `<span>Relación: <b>${evaluacion.porcentaje} %</b> de lo permitido</span>` : ''}
          ${evaluacion.radio ? `<span>Radio de la zona afectada: <b>${numero(evaluacion.radio, 1)} m</b></span>` : ''}
        </div>
      </div>
    </div>`;
}

// Capacidad mínima de obra para llegar a amarillo y a verde.
function pintarRecomendacion(p, semaforos) {
  const caja = $('recomendacion-mitigacion');
  if (!semaforos.antes) {
    caja.innerHTML = '';
    return;
  }
  if (semaforos.antes.nivel === 'verde') {
    caja.innerHTML = `<div class="recomendacion"><h3>Recomendación</h3>
      El proyecto ya está en riesgo bajo sin obra de mitigación; una obra adicional es opcional.</div>`;
    return;
  }
  const limites = limitesSemaforo(semaforos.permitido);
  const paraVerde = capacidadNecesaria(p.caudalPico, limites.verde);
  const paraAmarillo = capacidadNecesaria(p.caudalPico, limites.amarillo);
  const fueraDeRango = paraVerde > 50000
    ? '<span class="ayuda">La capacidad para riesgo bajo supera el máximo de una obra (50,000 m³): conviene reducir la superficie impermeable o combinar obras.</span>'
    : '';
  caja.innerHTML = `<div class="recomendacion"><h3>¿Cómo reaccionar ante el encharcamiento?</h3>
    <ul>
      ${semaforos.antes.nivel === 'rojo' ? `<li>Para bajar a <b>riesgo medio</b>: capacidad mínima de <b>${numero(paraAmarillo, 2)} m³</b>.</li>` : ''}
      <li>Para llegar a <b>riesgo bajo</b>: capacidad mínima de <b>${numero(paraVerde, 2)} m³</b>.</li>
    </ul>
    <span class="ayuda">Capacidad = (Qpico − Qobjetivo) × 3,600 s, con la obra junto al proyecto (eficiencia 100 %).
    Más lejos del proyecto se requiere más capacidad.</span>${fueraDeRango}</div>`;
}

// ---------- Proyecto activo ----------

// Pinta en todas las pestañas los datos del proyecto activo.
function pintarProyecto(datos) {
  const p = datos.proyecto;
  const cambioDeProyecto = !estado.proyecto || estado.proyecto.id !== p.id;
  estado.proyecto = p;
  estado.simulacion = datos.simulacion;
  document.body.classList.add('hay-proyecto');
  const semaforos = semaforosProyecto(p, datos.simulacion);
  const zonaNueva = semaforos.radioAntes && semaforos.radioAntes !== estado.radio;
  estado.radio = semaforos.radioAntes;
  if (semaforos.antes) semaforos.antes.radio = semaforos.radioAntes;
  if (semaforos.despues) semaforos.despues.radio = semaforos.radioActual;

  // Barra del proyecto activo
  $('p-nombre').textContent = p.nombre;
  $('p-estado').className = `chip ${claseEstado(p.estado)}`;
  $('p-estado').textContent = p.estado;
  $('p-id').textContent = `ID ${p.id}`;
  $('p-alcaldia').textContent = p.alcaldia;
  $('p-fecha').textContent = p.fechaCreacion;
  $('p-coordenadas').textContent = p.latitud != null ? `${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)}` : '';
  $('p-semaforo').textContent = semaforos.actual ? semaforos.actual.etiqueta : '';
  $('p-semaforo').style.setProperty('--color-nivel', semaforos.actual ? COLORES_SEMAFORO[semaforos.actual.nivel] : '');
  marcarProyectoActivo(p, semaforos.actual ? semaforos.actual.nivel : null, cambioDeProyecto && !semaforos.radioAntes);
  pintarSimulacionMapa({
    proyecto: p,
    radioAntes: semaforos.radioAntes,
    radioActual: semaforos.radioActual,
    nivelAntes: semaforos.antes ? semaforos.antes.nivel : null,
    nivelActual: semaforos.actual ? semaforos.actual.nivel : null,
    simulacion: datos.simulacion
  });
  if (semaforos.radioAntes && (cambioDeProyecto || zonaNueva)) encuadrarZona();
  if (cambioDeProyecto) limpiarObra();

  // Pestaña de cálculo
  pintarMetrica('m-superficie', p.superficieTotal, 2, ' m²');
  $('m-superficie-detalle').textContent = p.superficieTotal == null ? ''
    : `Permeable ${numero(p.superficiePermeable, 2)} · Impermeable ${numero(p.superficieImpermeable, 2)}`;
  pintarMetrica('m-coeficiente', p.coeficiente, 2);
  pintarMetrica('m-intensidad', p.intensidad, 2, ' mm/h');
  $('m-periodo').textContent = p.periodoRetorno ? `Período de retorno: ${p.periodoRetorno} años` : '';
  pintarMetrica('m-caudal', p.caudalPico, 3, ' m³/s');
  $('ap').value = p.superficiePermeable ?? '';
  $('ai').value = p.superficieImpermeable ?? '';
  $('periodo').value = p.periodoRetorno ?? '';
  $('semaforo-calculo').innerHTML = htmlSemaforo(semaforos.antes, p.caudalPico, semaforos.permitido, 'Caudal pico');
  $('accion-mitigar').innerHTML = semaforos.antes && semaforos.antes.nivel !== 'verde'
    ? '<button type="button" class="boton boton-contorno" id="ir-mitigacion">Simular obra de mitigación</button>'
    : '';

  // Pestaña de mitigación
  pintarMetrica('mit-caudal-pico', p.caudalPico, 3, ' m³/s');
  $('semaforo-antes').innerHTML = htmlSemaforo(semaforos.antes, p.caudalPico, semaforos.permitido, 'Caudal pico');
  $('semaforo-despues').innerHTML = datos.simulacion
    ? htmlSemaforo(semaforos.despues, datos.simulacion.caudalAjustado, datos.simulacion.caudalPermitido,
      `Caudal ajustado (${escapar(datos.simulacion.tipoObra)}, ${numero(datos.simulacion.capacidad, 2)} m³)`)
    : '<p class="texto-vacio">Sin calcular. Simule una obra para ver cómo cambia el riesgo.</p>';
  pintarRecomendacion(p, semaforos);
  pintarSimulaciones(datos.simulaciones);

  // Pestaña de reporte
  pintarChecklist(p);
  pintarReportes(datos.reportes);
}

function chipSemaforo(evaluacion) {
  return `<span class="chip-semaforo" style="--color-nivel:${COLORES_SEMAFORO[evaluacion.nivel]}">${evaluacion.etiqueta}</span>`;
}

function pintarSimulaciones(simulaciones) {
  const cuerpo = $('tabla-simulaciones');
  if (!simulaciones || simulaciones.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="7" class="tabla-vacia">Sin calcular</td></tr>';
    return;
  }
  cuerpo.innerHTML = simulaciones.map((s) => `
    <tr>
      <td>${escapar(s.fechaHora)}</td>
      <td>${escapar(s.tipoObra)}</td>
      <td class="num">${numero(s.capacidad, 2)}</td>
      <td class="num">${s.eficiencia != null ? Math.round(s.eficiencia * 100) + ' %' : '-'}</td>
      <td class="num">${numero(s.caudalAjustado, 3)}</td>
      <td class="num">${numero(s.caudalPermitido, 3)}</td>
      <td>${chipSemaforo(evaluarSemaforo(s.caudalAjustado, s.caudalPermitido))}</td>
    </tr>`).join('');
}

// Lista de datos obligatorios para exportar el reporte, con su estado.
function pintarChecklist(p) {
  const requisitos = [
    ['Nombre y alcaldía del proyecto', Boolean(p.nombre && p.idAlcaldia)],
    ['Ubicación (punto en el mapa)', p.latitud != null && p.longitud != null],
    ['Superficies permeable e impermeable', p.superficieTotal != null],
    ['Coeficiente de escurrimiento', p.coeficiente != null],
    ['Intensidad de lluvia y período de retorno', p.intensidad != null],
    ['Caudal pico', p.caudalPico != null],
    ['Simulación de mitigación (opcional)', estado.simulacion != null]
  ];
  $('checklist-reporte').innerHTML = requisitos.map(([texto, listo]) => `
    <li class="${listo ? 'listo' : 'pendiente'}">
      <svg class="icono"><use href="#${listo ? 'i-check' : 'i-cruz'}"/></svg>
      ${texto}
    </li>`).join('');
}

function pintarReportes(reportes) {
  const lista = $('lista-reportes');
  if (!reportes || reportes.length === 0) {
    lista.innerHTML = '<li class="texto-vacio">Aún no se han generado reportes para este proyecto.</li>';
    return;
  }
  lista.innerHTML = reportes.map((r) => `
    <li>
      <div>
        <div class="reporte-nombre">${escapar(r.nombreArchivo)}</div>
        <div class="reporte-detalle">${escapar(r.fechaGeneracion)} · ${numero(r.tamanoBytes / 1024, 1)} KB</div>
      </div>
      <a class="enlace-descarga" href="${r.url}" download="${escapar(r.nombreArchivo)}">
        <svg class="icono"><use href="#i-descarga"/></svg>Descargar
      </a>
    </li>`).join('');
}

// Muestra el resultado de una operación: mensaje de error en su contenedor o datos actualizados.
async function aplicarResultado(resultado, idMensaje) {
  if (!resultado.ok) {
    mostrarMensaje(idMensaje, 'error', resultado.error);
    return false;
  }
  limpiarMensajes();
  pintarProyecto(resultado);
  await cargarHistorial();
  return true;
}

// ---------- RF-WEB-08: exportar reporte técnico ----------

async function exportarReporte() {
  mostrarPestana('reporte');
  $('msg-reporte').innerHTML = '';

  if (!datosCompletosParaReporte(estado.proyecto)) {
    mostrarMensaje('msg-reporte', 'error', MENSAJES.reporteIncompleto);
    return;
  }

  // Generación del PDF; si falla o excede 10 MB no se descarga ni se guarda copia.
  let reporte;
  try {
    reporte = generarReportePDF({
      proyecto: estado.proyecto,
      simulacion: estado.simulacion,
      coeficientes: estado.coeficientes,
      usuario: estado.usuario
    });
  } catch (error) {
    console.error(error);
    mostrarMensaje('msg-reporte', 'error', MENSAJES.reporteFallido);
    return;
  }
  if (reporte.tamanoBytes > TAMANO_MAXIMO_REPORTE) {
    mostrarMensaje('msg-reporte', 'error', MENSAJES.reporteFallido);
    return;
  }

  // Copia en el historial del proyecto y descarga del archivo.
  const resultado = await guardarReporte(estado.proyecto.id, reporte);
  if (await aplicarResultado(resultado, 'msg-reporte')) {
    reporte.documento.save(reporte.nombreArchivo);
    mostrarMensaje('msg-reporte', 'exito', resultado.mensaje);
  }
}

// ---------- Eventos ----------

document.querySelectorAll('.pestana').forEach((boton) => {
  boton.addEventListener('click', () => mostrarPestana(boton.dataset.pestana));
});
document.querySelectorAll('.ir-proyectos').forEach((boton) => {
  boton.addEventListener('click', () => mostrarPestana('proyectos'));
});

// Muestra la ubicación elegida en el formulario.
function pintarUbicacion() {
  const caja = $('ubicacion-texto');
  const p = estado.punto;
  caja.classList.toggle('lista', Boolean(p));
  caja.querySelector('span').textContent = p
    ? `${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)} · ${p.alcaldia}`
    : 'Haga clic en el mapa para colocar el punto del proyecto.';
  $('mapa-seleccion').textContent = p ? `Punto en ${p.alcaldia}` : 'Haga clic dentro de la CDMX para colocar el punto';
}

function limpiarUbicacion() {
  estado.punto = null;
  quitarPuntoNuevo();
  pintarUbicacion();
}

// ---------- Obra de mitigación en el mapa ----------

function pintarObraElegida() {
  const caja = $('obra-ubicacion');
  const o = estado.obra;
  caja.classList.toggle('lista', Boolean(o));
  caja.querySelector('span').textContent = o
    ? `${o.latitud.toFixed(6)}, ${o.longitud.toFixed(6)} · a ${numero(o.distancia, 1)} m del proyecto · eficiencia ${Math.round(o.eficiencia * 100)} %`
    : 'Haga clic en el mapa dentro del círculo de la zona afectada.';
}

function limpiarObra() {
  estado.obra = null;
  quitarObraTemporal();
  pintarObraElegida();
}

// Clic en la pestaña Mitigación: coloca la obra si está dentro de la zona afectada.
function colocarObraEnMapa(latitud, longitud) {
  const p = estado.proyecto;
  if (!p || p.caudalPico == null || !estado.radio) {
    mostrarMensaje('msg-mitigacion', 'error', MENSAJES.caudalFaltante);
    return;
  }
  const distancia = redondear(distanciaMetros(p.latitud, p.longitud, latitud, longitud), 2);
  const eficiencia = eficienciaPorUbicacion(distancia, estado.radio);
  if (eficiencia === null) {
    mostrarMensaje('msg-mitigacion', 'error', MENSAJES.obraFueraDeZona);
    return;
  }
  $('msg-mitigacion').innerHTML = '';
  estado.obra = { latitud, longitud, distancia, eficiencia };
  colocarObraTemporal(latitud, longitud);
  pintarObraElegida();
}

// Cada pestaña decide qué hace un clic en el mapa.
function alHacerClicEnMapa(latitud, longitud, nombreAlcaldia) {
  if (estado.pestana === 'mitigacion') {
    colocarObraEnMapa(latitud, longitud);
  } else if (estado.pestana === 'proyectos') {
    colocarPuntoProyecto(latitud, longitud, nombreAlcaldia);
  }
}

// Clic en la pestaña Proyectos: coloca el punto y detecta la alcaldía; fuera de la CDMX muestra el error.
function colocarPuntoProyecto(latitud, longitud, nombreAlcaldia) {
  if (!nombreAlcaldia) {
    mostrarMensaje('msg-proyecto', 'error', MENSAJES.ubicacionFuera);
    return;
  }
  $('msg-proyecto').innerHTML = '';
  estado.punto = { latitud, longitud, alcaldia: nombreAlcaldia };
  $('alcaldia').value = idAlcaldiaPorNombre(nombreAlcaldia);
  colocarPuntoNuevo(latitud, longitud, nombreAlcaldia);
  pintarUbicacion();
}

// Elegir la alcaldía en la lista coloca el punto en su centro (después puede moverse con un clic).
$('alcaldia').addEventListener('change', (evento) => {
  const nombre = nombreAlcaldiaPorId(evento.target.value);
  if (!nombre) {
    limpiarUbicacion();
    return;
  }
  const centro = centroAlcaldia(nombre);
  estado.punto = { ...centro, alcaldia: nombre };
  colocarPuntoNuevo(centro.latitud, centro.longitud, nombre, true);
  pintarUbicacion();
});

// RF-WEB-02: registrar proyecto.
$('form-proyecto').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const formulario = evento.target;
  const punto = estado.punto || {};
  const resultado = await registrarProyecto(
    formulario.nombre.value, formulario.idAlcaldia.value, punto.latitud, punto.longitud
  );

  if (!resultado.ok) {
    mostrarMensaje('msg-proyecto', 'error', resultado.error);
    return;
  }
  formulario.reset();
  limpiarUbicacion();
  estado.pagina = 1;
  await aplicarResultado(resultado, 'msg-proyecto');
  snackbar(resultado.mensaje);
});

// RF-WEB-03: abrir un proyecto del historial.
$('lista-proyectos').addEventListener('click', async (evento) => {
  const boton = evento.target.closest('.item-proyecto');
  if (boton) await aplicarResultado(await consultarProyecto(boton.dataset.id), 'msg-historial');
});

$('pagina-anterior').addEventListener('click', () => cargarHistorial(estado.pagina - 1));
$('pagina-siguiente').addEventListener('click', () => cargarHistorial(estado.pagina + 1));

// RF-WEB-04: coeficiente de escurrimiento.
$('form-coeficiente').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const resultado = await calcularCoeficienteProyecto(estado.proyecto.id, $('ap').value, $('ai').value);
  if (await aplicarResultado(resultado, 'msg-coeficiente')) {
    mostrarMensaje('msg-coeficiente', 'exito', resultado.mensaje);
  }
});

// RF-WEB-05: intensidad de lluvia.
$('form-intensidad').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const resultado = await consultarIntensidadProyecto(estado.proyecto.id, $('periodo').value);
  if (await aplicarResultado(resultado, 'msg-intensidad')) {
    mostrarMensaje('msg-intensidad', 'exito', resultado.mensaje);
  }
});

// RF-WEB-06: caudal pico.
$('form-caudal').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const resultado = await calcularCaudalProyecto(estado.proyecto.id);
  if (await aplicarResultado(resultado, 'msg-caudal')) {
    mostrarMensaje('msg-caudal', 'exito', resultado.mensaje);
  }
});

// RF-WEB-07: simulación de mitigación (verde si está dentro de capacidad, rojo si la excede).
$('form-mitigacion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const obra = estado.obra || {};
  const resultado = await simularMitigacionProyecto(
    estado.proyecto.id, $('tipo-obra').value, $('capacidad').value, obra.latitud, obra.longitud
  );
  if (await aplicarResultado(resultado, 'msg-mitigacion')) {
    const s = resultado.simulacion;
    const semaforo = evaluarSemaforo(s.caudalAjustado, s.caudalPermitido);
    const texto = `${s.tipoObra} (eficiencia ${Math.round(s.eficiencia * 100)} %): caudal ajustado ${numero(s.caudalAjustado, 3)} m³/s. ${resultado.mensaje}. Semáforo: ${semaforo.etiqueta}.`;
    limpiarObra();
    mostrarMensaje('msg-mitigacion', s.dentroDeCapacidad ? 'exito' : 'error', texto);
  }
});

// RF-WEB-08: botón de la barra de herramientas y botón de la pestaña de reporte.
$('boton-exportar-barra').addEventListener('click', exportarReporte);
$('accion-mitigar').addEventListener('click', (evento) => {
  if (evento.target.closest('#ir-mitigacion')) mostrarPestana('mitigacion');
});
$('boton-exportar').addEventListener('click', exportarReporte);

$('boton-salir').addEventListener('click', async () => {
  await cerrarSesion();
  window.location.href = 'index.html';
});

// ---------- Inicio ----------

async function iniciarPanel() {
  estado.usuario = await usuarioActivo();
  if (!estado.usuario) {
    window.location.href = 'index.html';
    return;
  }
  $('nombre-usuario').textContent = estado.usuario.nombre;

  estado.alcaldias = await obtenerAlcaldias();
  const select = $('alcaldia');
  estado.alcaldias.forEach((a) => {
    const opcion = document.createElement('option');
    opcion.value = a.id;
    opcion.textContent = a.nombre;
    select.appendChild(opcion);
  });

  estado.coeficientes = await obtenerCoeficientes();
  iniciarMapa('mapa', alHacerClicEnMapa);
  mostrarPestana('proyectos');

  await cargarHistorial(1);
}

iniciarPanel();
