// Panel del ingeniero civil. Las pestañas (Proyectos, Cálculo, Mitigación y Reporte) comparten un mapa
// siempre visible donde se dibuja la simulación del proyecto activo.
// Las funciones de js/proyectos.js se usan con await para que el panel funcione igual
// con almacenamiento local o con un servidor.

const estado = {
  usuario: null,
  proyecto: null,            // proyecto activo
  simulaciones: [],          // simulaciones guardadas del proyecto activo (la más reciente primero)
  simulacionVigente: null,   // última simulación hecha con los datos y la ubicación actuales
  pagina: 1,
  alcaldias: [],
  coeficientes: null,        // Cp y Ci vigentes
  punto: null,               // { latitud, longitud, alcaldia } del proyecto por registrar
  obra: null,                // { latitud, longitud, distancia, eficiencia } de la obra por simular
  reportes: [],
  pestana: 'proyectos'
};

const INSTRUCCIONES_MAPA = {
  proyectos: {
    nuevo: 'Haga clic en el mapa para colocar el punto del nuevo proyecto. Puede arrastrar el pin para ajustarlo.',
    activo: 'Arrastre el pin o haga clic en otro punto para mover el proyecto activo.'
  },
  calculo: 'El círculo de color es la zona afectada: crece con el agua que el terreno ya no puede desalojar.',
  mitigacion: 'Haga clic dentro de la zona afectada para colocar la obra; la vista previa se actualiza al escribir su capacidad.',
  reporte: 'El reporte incluye la ubicación, la zona afectada y el semáforo antes y después de la obra.'
};

const $ = (id) => document.getElementById(id);

// ---------- Utilidades ----------

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function numero(valor, decimales) {
  if (valor === null || valor === undefined) return null;
  return Number(valor).toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

function pintarMetrica(id, valor, decimales, unidad = '') {
  const elemento = $(id);
  const texto = numero(valor, decimales);
  elemento.classList.toggle('sin-calcular', texto === null);
  elemento.textContent = texto === null ? 'Sin calcular' : `${texto}${unidad}`;
}

function mostrarMensaje(idContenedor, tipo, texto) {
  const iconos = { error: 'i-triangulo', exito: 'i-check', info: 'i-info' };
  $(idContenedor).innerHTML = `
    <div class="alerta alerta-${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">
      <svg class="icono"><use href="#${iconos[tipo]}"/></svg>
      <span>${escapar(texto)}</span>
    </div>`;
}

function limpiarMensajes() {
  ['msg-proyecto', 'msg-historial', 'msg-ubicacion', 'msg-coeficiente', 'msg-intensidad', 'msg-caudal',
    'msg-mitigacion', 'msg-reporte'].forEach((id) => { $(id).innerHTML = ''; });
}

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

// ---------- Modelo de la simulación ----------

function caudalPermitidoProyecto(p) {
  if (!estado.coeficientes || estado.coeficientes.Cp == null || p.intensidad == null || p.superficieTotal == null) {
    return null;
  }
  return calcularCaudalPico(estado.coeficientes.Cp, p.intensidad, p.superficieTotal);
}

// Escenario: caudal, semáforo y radio de la zona afectada.
function escenario(p, caudal, permitido) {
  return {
    caudal,
    permitido,
    evaluacion: evaluarSemaforo(caudal, permitido),
    radio: radioAfectacion(p.superficieTotal, caudal, permitido),
    area: areaZonaAfectada(p.superficieTotal, caudal, permitido)
  };
}

// Datos de la obra que se está colocando (vista previa) si tipo, capacidad y ubicación son válidos.
function obraEnPreparacion() {
  const capacidad = leerCapacidad($('capacidad').value);
  const tipoObra = $('tipo-obra').value;
  if (!estado.obra || capacidad === null || !tipoObraValido(tipoObra)) return null;
  return { ...estado.obra, capacidad, tipoObra };
}

// Escenarios del proyecto activo: sin obra (antes), con la obra guardada vigente y vista previa.
function modeloSimulacion() {
  const p = estado.proyecto;
  const modelo = { permitido: null, antes: null, despues: null, previa: null, actual: null };
  if (!p) return modelo;
  modelo.permitido = caudalPermitidoProyecto(p);
  if (p.caudalPico == null || modelo.permitido == null) return modelo;

  modelo.antes = escenario(p, p.caudalPico, modelo.permitido);

  const s = estado.simulacionVigente;
  if (s) modelo.despues = { ...escenario(p, s.caudalAjustado, s.caudalPermitido), obra: s };

  const obra = obraEnPreparacion();
  if (obra && estado.pestana === 'mitigacion') {
    const r = simularMitigacion({
      caudalPico: p.caudalPico, capacidad: obra.capacidad, cp: estado.coeficientes.Cp,
      intensidad: p.intensidad, superficieM2: p.superficieTotal, eficiencia: obra.eficiencia
    });
    modelo.previa = { ...escenario(p, r.caudalAjustado, r.caudalPermitido), obra: { ...obra, ...r } };
  }
  modelo.actual = modelo.despues || modelo.antes;
  return modelo;
}

// ---------- Semáforo (tarjetas) ----------

function htmlSemaforo(esc, etiquetaCaudal) {
  if (!esc) {
    return '<p class="texto-vacio">Sin calcular. Calcule el caudal pico del proyecto para evaluar el riesgo.</p>';
  }
  const e = esc.evaluacion;
  const luz = (color) => `<span class="luz luz-${color} ${e.nivel === color ? 'encendida' : ''}"></span>`;
  return `
    <div class="semaforo semaforo-${e.nivel}" role="img" aria-label="Semáforo: ${e.etiqueta}">
      <div class="semaforo-caja">${luz('rojo')}${luz('amarillo')}${luz('verde')}</div>
      <div class="semaforo-texto">
        <strong>${e.etiqueta}</strong>
        <p>${e.descripcion}</p>
        <div class="semaforo-datos">
          <span>${etiquetaCaudal}: <b>${numero(esc.caudal, 3)} m³/s</b></span>
          <span>Descarga permitida: <b>${numero(esc.permitido, 3)} m³/s</b></span>
          ${e.porcentaje !== null ? `<span>Relación: <b>${e.porcentaje} %</b> de lo permitido</span>` : ''}
          <span>Zona afectada: <b>${numero(esc.radio, 1)} m</b> de radio (${numero(esc.area, 0)} m²)</span>
        </div>
      </div>
    </div>`;
}

function chipSemaforo(evaluacion) {
  return `<span class="chip-semaforo" style="--color-nivel:${COLORES_SEMAFORO[evaluacion.nivel]}">${evaluacion.etiqueta}</span>`;
}

function pintarRecomendacion(p, modelo) {
  const caja = $('recomendacion-mitigacion');
  if (!modelo.antes) {
    caja.innerHTML = '';
    return;
  }
  if (modelo.antes.evaluacion.nivel === 'verde') {
    caja.innerHTML = `<div class="recomendacion"><h3>Recomendación</h3>
      El proyecto ya está en riesgo bajo sin obra de mitigación; una obra adicional es opcional.</div>`;
    return;
  }
  const limites = limitesSemaforo(modelo.permitido);
  const paraVerde = capacidadNecesaria(p.caudalPico, limites.verde);
  const paraAmarillo = capacidadNecesaria(p.caudalPico, limites.amarillo);
  const fueraDeRango = paraVerde > 50000
    ? '<span class="ayuda">La capacidad para riesgo bajo supera el máximo de una obra (50,000 m³): conviene reducir la superficie impermeable.</span>'
    : '';
  caja.innerHTML = `<div class="recomendacion"><h3>¿Cómo reaccionar ante el encharcamiento?</h3>
    <ul>
      ${modelo.antes.evaluacion.nivel === 'rojo' ? `<li>Para bajar a <b>riesgo medio</b>: capacidad mínima de <b>${numero(paraAmarillo, 2)} m³</b>.</li>` : ''}
      <li>Para llegar a <b>riesgo bajo</b>: capacidad mínima de <b>${numero(paraVerde, 2)} m³</b>.</li>
    </ul>
    <span class="ayuda">Capacidad = (Qpico − Qobjetivo) × 3,600 s, con la obra junto al proyecto (eficiencia 100 %).
    Lejos del proyecto se requiere más capacidad (hasta el doble en el borde de la zona).</span>${fueraDeRango}</div>`;
}

// ---------- Mapa ----------

function filaPanel(etiqueta, valor) {
  return `<div class="fila"><span>${etiqueta}</span><b>${valor}</b></div>`;
}

// Contenido del panel de datos dentro del mapa.
function htmlPanelMapa(p, modelo) {
  if (!p) {
    if (!estado.punto) return '';
    return `<h4>Nuevo proyecto</h4>
      ${filaPanel('Alcaldía', escapar(estado.punto.alcaldia))}
      ${filaPanel('Coordenadas', `${estado.punto.latitud.toFixed(5)}, ${estado.punto.longitud.toFixed(5)}`)}
      <div class="nota">Escriba el nombre y guarde el proyecto para empezar la simulación.</div>`;
  }
  let html = `<h4>${escapar(p.nombre)}</h4>${filaPanel('Alcaldía', escapar(p.alcaldia))}`;
  if (!modelo.antes) {
    const pasos = [
      ['Superficies y coeficiente C', p.coeficiente != null],
      ['Intensidad de lluvia', p.intensidad != null],
      ['Caudal pico', p.caudalPico != null]
    ];
    return `${html}<div class="separador"></div>
      <div class="nota">Para ver la zona afectada complete en la pestaña Cálculo:</div>
      ${pasos.map(([t, ok]) => filaPanel(t, ok ? '✓' : 'pendiente')).join('')}`;
  }

  const actual = modelo.previa || modelo.actual;
  const e = actual.evaluacion;
  const ancho = Math.min(100, (e.porcentaje ?? 200) / 2);
  html += `<div class="separador"></div>
    <div class="etiqueta-nivel" style="--color-nivel:${COLORES_SEMAFORO[e.nivel]}">${e.etiqueta} · ${e.porcentaje ?? '-'} %</div>
    <div class="barra-riesgo" style="--color-nivel:${COLORES_SEMAFORO[e.nivel]}"><i style="width:${ancho}%"></i></div>
    ${filaPanel('Caudal pico (sin obra)', `${numero(p.caudalPico, 3)} m³/s`)}
    ${filaPanel('Descarga permitida', `${numero(modelo.permitido, 3)} m³/s`)}
    ${filaPanel('Zona sin obra', `${numero(modelo.antes.radio, 1)} m`)}`;

  const conObra = modelo.previa || modelo.despues;
  if (conObra) {
    const o = conObra.obra;
    const reduccion = Math.round((1 - conObra.area / modelo.antes.area) * 100);
    html += `<div class="separador"></div>
      <div class="nota">${modelo.previa ? 'Vista previa (sin guardar)' : 'Con la obra guardada'}:
        ${escapar(o.tipoObra)}, ${numero(o.capacidad, 2)} m³, eficiencia ${Math.round(o.eficiencia * 100)} %</div>
      ${filaPanel('Caudal ajustado', `${numero(conObra.caudal, 3)} m³/s`)}
      ${filaPanel('Zona con obra', `${numero(conObra.radio, 1)} m`)}
      <div class="fila"><span>Área afectada</span><b class="mejora">−${reduccion} %</b></div>`;
  }
  return html;
}

// Redibuja el mapa a partir del estado: un solo pin y la simulación del proyecto activo.
function pintarMapa(opciones = {}) {
  const p = estado.proyecto;
  const modelo = modeloSimulacion();

  if (!p) {
    limpiarSimulacion();
    if (estado.punto) {
      mostrarPin(estado.punto.latitud, estado.punto.longitud, {
        color: COLORES_SEMAFORO.nuevo, etiqueta: '', arrastrable: true
      });
      resaltarAlcaldia(estado.punto.alcaldia);
    } else {
      quitarPin();
      resaltarAlcaldia(null);
    }
    actualizarPanelMapa(htmlPanelMapa(null, modelo));
    return modelo;
  }

  const mostrado = modelo.previa || modelo.actual;
  const nivel = mostrado ? mostrado.evaluacion.nivel : 'ninguno';
  mostrarPin(p.latitud, p.longitud, {
    color: COLORES_SEMAFORO[nivel], etiqueta: '', arrastrable: estado.pestana === 'proyectos'
  });
  resaltarAlcaldia(p.alcaldia);

  const conObra = modelo.previa || modelo.despues;
  dibujarSimulacion({
    centro: [p.latitud, p.longitud],
    radioPredio: p.superficieTotal != null ? radioPredio(p.superficieTotal) : null,
    zonaAntes: conObra ? { radio: modelo.antes.radio, nivel: modelo.antes.evaluacion.nivel } : null,
    zonaActual: modelo.antes
      ? { radio: (conObra || modelo.antes).radio, nivel: (conObra || modelo.antes).evaluacion.nivel }
      : null,
    obra: conObra ? conObra.obra : (estado.obra && estado.pestana === 'mitigacion'
      ? { ...estado.obra, tipoObra: $('tipo-obra').value || 'Pozo de Infiltración', capacidad: 0 }
      : null),
    previa: Boolean(modelo.previa),
    obraPrevia: Boolean(estado.obra && estado.pestana === 'mitigacion')
  });
  actualizarPanelMapa(htmlPanelMapa(p, modelo));
  if (opciones.encuadrar) encuadrarZona();
  return modelo;
}

// ---------- Pestañas ----------

function mostrarPestana(nombre) {
  estado.pestana = nombre;
  document.querySelectorAll('.pestana').forEach((boton) => {
    boton.classList.toggle('activa', boton.dataset.pestana === nombre);
  });
  document.querySelectorAll('.panel-pestana').forEach((panel) => {
    panel.classList.toggle('oculto', panel.id !== `pestana-${nombre}`);
  });
  const instruccion = INSTRUCCIONES_MAPA[nombre];
  $('mapa-instruccion').textContent = typeof instruccion === 'string'
    ? instruccion
    : instruccion[estado.proyecto ? 'activo' : 'nuevo'];
  $('mapa-seleccion').classList.add('oculto');
  if (nombre !== 'mitigacion') limpiarObra(false);
  ajustarMapa();
  if (estado.proyecto) {
    pintarTodo({ encuadrar: (nombre === 'calculo' || nombre === 'mitigacion') && estado.proyecto.caudalPico != null });
  }
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

// ---------- Proyecto activo ----------

// Guarda en el estado los datos devueltos por una operación y redibuja todo.
function cargarDatosProyecto(datos) {
  const cambioDeProyecto = !estado.proyecto || estado.proyecto.id !== datos.proyecto.id;
  const teniaZona = estado.proyecto && estado.proyecto.caudalPico != null;
  estado.proyecto = datos.proyecto;
  estado.simulaciones = datos.simulaciones || [];
  estado.reportes = datos.reportes || [];
  const permitido = caudalPermitidoProyecto(estado.proyecto);
  estado.simulacionVigente = estado.simulaciones.find((s) => simulacionVigente(s, estado.proyecto, permitido)) || null;
  document.body.classList.add('hay-proyecto');
  if (cambioDeProyecto) limpiarObra(false);

  pintarTodo({ encuadrar: cambioDeProyecto || (!teniaZona && estado.proyecto.caudalPico != null) });
  if (cambioDeProyecto && estado.proyecto.caudalPico == null) {
    centrarEn(estado.proyecto.latitud, estado.proyecto.longitud);
  }
}

// Pinta todas las pestañas y el mapa con el estado actual.
function pintarTodo(opcionesMapa = {}) {
  const p = estado.proyecto;
  const modelo = pintarMapa(opcionesMapa);
  if (!p) return;

  // Barra del proyecto activo
  $('p-nombre').textContent = p.nombre;
  $('p-estado').className = `chip ${claseEstado(p.estado)}`;
  $('p-estado').textContent = p.estado;
  $('p-id').textContent = `ID ${p.id}`;
  $('p-alcaldia').textContent = p.alcaldia;
  $('p-fecha').textContent = p.fechaCreacion;
  $('p-coordenadas').textContent = `${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)}`;
  $('p-semaforo').textContent = modelo.actual ? modelo.actual.evaluacion.etiqueta : '';
  $('p-semaforo').style.setProperty('--color-nivel', modelo.actual ? COLORES_SEMAFORO[modelo.actual.evaluacion.nivel] : '');

  // Pestaña Proyectos
  $('ubicacion-activa').querySelector('span').textContent =
    `${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)} · ${p.alcaldia}`;

  // Pestaña Cálculo
  pintarMetrica('m-superficie', p.superficieTotal, 2, ' m²');
  $('m-superficie-detalle').textContent = p.superficieTotal == null ? ''
    : `Permeable ${numero(p.superficiePermeable, 2)} · Impermeable ${numero(p.superficieImpermeable, 2)}`;
  pintarMetrica('m-coeficiente', p.coeficiente, 2);
  pintarMetrica('m-intensidad', p.intensidad, 2, ' mm/h');
  $('m-periodo').textContent = p.periodoRetorno ? `Período de retorno: ${p.periodoRetorno} años` : '';
  pintarMetrica('m-caudal', p.caudalPico, 3, ' m³/s');
  pintarMetrica('m-permitido', modelo.permitido, 3, ' m³/s');
  pintarMetrica('m-zona', modelo.antes ? modelo.antes.radio : null, 1, ' m');
  $('m-zona-detalle').textContent = modelo.antes ? `Radio sin obra · ${numero(modelo.antes.area, 0)} m²` : '';
  if (document.activeElement !== $('ap') && document.activeElement !== $('ai')) {
    $('ap').value = p.superficiePermeable ?? '';
    $('ai').value = p.superficieImpermeable ?? '';
  }
  $('periodo').value = p.periodoRetorno ?? '';
  $('semaforo-calculo').innerHTML = htmlSemaforo(modelo.antes, 'Caudal pico');
  $('accion-mitigar').innerHTML = modelo.antes && modelo.antes.evaluacion.nivel !== 'verde'
    ? '<button type="button" class="boton boton-contorno" id="ir-mitigacion">Simular obra de mitigación</button>'
    : '';

  // Pestaña Mitigación
  pintarMetrica('mit-caudal-pico', p.caudalPico, 3, ' m³/s');
  $('semaforo-antes').innerHTML = htmlSemaforo(modelo.antes, 'Caudal pico');
  pintarDespues(modelo);
  pintarVistaPrevia(modelo);
  pintarRecomendacion(p, modelo);
  pintarSimulaciones();

  // Pestaña Reporte
  pintarChecklist(p);
  pintarReportes(estado.reportes);
}

function pintarDespues(modelo) {
  const ultima = estado.simulaciones[0];
  if (modelo.previa) {
    $('titulo-despues').textContent = 'Con la obra (vista previa, sin guardar)';
    $('semaforo-despues').innerHTML = htmlSemaforo(modelo.previa, 'Caudal ajustado');
  } else if (modelo.despues) {
    const o = modelo.despues.obra;
    $('titulo-despues').textContent = `Con la obra guardada: ${o.tipoObra}, ${numero(o.capacidad, 2)} m³`;
    $('semaforo-despues').innerHTML = htmlSemaforo(modelo.despues, 'Caudal ajustado');
  } else {
    $('titulo-despues').textContent = 'Con la obra';
    $('semaforo-despues').innerHTML = ultima
      ? '<p class="texto-vacio">La última simulación quedó desactualizada porque cambiaron los datos o la ubicación del proyecto. Simule de nuevo.</p>'
      : '<p class="texto-vacio">Sin calcular. Coloque una obra en el mapa para ver cómo cambia el riesgo.</p>';
  }
}

function pintarVistaPrevia(modelo) {
  const caja = $('vista-previa');
  if (!modelo.previa) {
    caja.innerHTML = '';
    return;
  }
  const antes = modelo.antes;
  const previa = modelo.previa;
  caja.innerHTML = `<div class="vista-previa">
    <strong>Vista previa:</strong> el caudal pasa de ${numero(antes.caudal, 3)} a <b>${numero(previa.caudal, 3)} m³/s</b>
    y la zona afectada de ${numero(antes.radio, 1)} m a <b>${numero(previa.radio, 1)} m</b> de radio
    → ${chipSemaforo(previa.evaluacion)}. Pulse <b>Simular mitigación</b> para guardarla.</div>`;
}

function pintarSimulaciones() {
  const cuerpo = $('tabla-simulaciones');
  if (estado.simulaciones.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="7" class="tabla-vacia">Sin calcular</td></tr>';
    return;
  }
  const permitido = caudalPermitidoProyecto(estado.proyecto);
  cuerpo.innerHTML = estado.simulaciones.map((s) => {
    const vigente = simulacionVigente(s, estado.proyecto, permitido);
    return `
    <tr class="${vigente ? '' : 'fila-desactualizada'}">
      <td>${escapar(s.fechaHora)}</td>
      <td>${escapar(s.tipoObra)}</td>
      <td class="num">${numero(s.capacidad, 2)}</td>
      <td class="num">${s.eficiencia != null ? `${Math.round(s.eficiencia * 100)} %` : '-'}</td>
      <td class="num">${numero(s.caudalAjustado, 3)}</td>
      <td class="num">${numero(s.caudalPermitido, 3)}</td>
      <td>${vigente ? chipSemaforo(evaluarSemaforo(s.caudalAjustado, s.caudalPermitido))
        : '<span class="estado-desactualizada">Desactualizada</span>'}</td>
    </tr>`;
  }).join('');
}

function pintarChecklist(p) {
  const requisitos = [
    ['Nombre y alcaldía del proyecto', Boolean(p.nombre && p.idAlcaldia)],
    ['Ubicación (punto en el mapa)', p.latitud != null && p.longitud != null],
    ['Superficies permeable e impermeable', p.superficieTotal != null],
    ['Coeficiente de escurrimiento', p.coeficiente != null],
    ['Intensidad de lluvia y período de retorno', p.intensidad != null],
    ['Caudal pico', p.caudalPico != null],
    ['Simulación de mitigación vigente (opcional)', estado.simulacionVigente != null]
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

// Muestra el error de una operación o carga sus datos y redibuja.
async function aplicarResultado(resultado, idMensaje) {
  if (!resultado.ok) {
    mostrarMensaje(idMensaje, 'error', resultado.error);
    return false;
  }
  limpiarMensajes();
  cargarDatosProyecto(resultado);
  await cargarHistorial();
  return true;
}

// Deja el mapa libre para registrar un proyecto nuevo.
function cerrarProyecto() {
  estado.proyecto = null;
  estado.simulaciones = [];
  estado.simulacionVigente = null;
  estado.punto = null;
  limpiarObra(false);
  document.body.classList.remove('hay-proyecto');
  limpiarMensajes();
  pintarUbicacionNueva();
  mostrarPestana('proyectos');
  pintarMapa();
  cargarHistorial();
}

// ---------- Punto del proyecto ----------

function pintarUbicacionNueva() {
  const caja = $('ubicacion-texto');
  const p = estado.punto;
  caja.classList.toggle('lista', Boolean(p));
  caja.querySelector('span').textContent = p
    ? `${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)} · ${p.alcaldia}`
    : 'Haga clic en el mapa para colocar el punto del proyecto.';
}

// Punto del proyecto por registrar (clic o arrastre sin proyecto activo).
function colocarPuntoNuevo(latitud, longitud, nombreAlcaldia) {
  if (!nombreAlcaldia) {
    mostrarMensaje('msg-proyecto', 'error', MENSAJES.ubicacionFuera);
    pintarMapa();
    return;
  }
  $('msg-proyecto').innerHTML = '';
  estado.punto = { latitud, longitud, alcaldia: nombreAlcaldia };
  $('alcaldia').value = idAlcaldiaPorNombre(nombreAlcaldia);
  pintarUbicacionNueva();
  pintarMapa();
}

// Mueve el proyecto activo (clic o arrastre en la pestaña Proyectos).
async function moverProyectoA(latitud, longitud) {
  const resultado = await moverProyecto(estado.proyecto.id, latitud, longitud);
  if (!resultado.ok) {
    mostrarMensaje('msg-ubicacion', 'error', resultado.error);
    pintarMapa();
    return;
  }
  if (await aplicarResultado(resultado, 'msg-ubicacion')) {
    mostrarMensaje('msg-ubicacion', 'exito', resultado.mensaje);
  }
}

// ---------- Obra de mitigación ----------

function pintarObraElegida() {
  const caja = $('obra-ubicacion');
  const o = estado.obra;
  caja.classList.toggle('lista', Boolean(o));
  caja.querySelector('span').textContent = o
    ? `A ${numero(o.distancia, 1)} m del proyecto · eficiencia ${Math.round(o.eficiencia * 100)} %`
    : 'Haga clic en el mapa dentro del círculo de la zona afectada.';
}

function limpiarObra(redibujar = true) {
  estado.obra = null;
  pintarObraElegida();
  $('vista-previa').innerHTML = '';
  if (redibujar && estado.proyecto) pintarTodo();
}

// Coloca la obra dentro de la zona afectada sin obra.
function colocarObra(latitud, longitud) {
  const p = estado.proyecto;
  const modelo = modeloSimulacion();
  if (!p || !modelo.antes) {
    mostrarMensaje('msg-mitigacion', 'error', MENSAJES.caudalFaltante);
    return;
  }
  const distancia = redondear(distanciaMetros(p.latitud, p.longitud, latitud, longitud), 2);
  const eficiencia = eficienciaPorUbicacion(distancia, modelo.antes.radio);
  if (eficiencia === null) {
    mostrarMensaje('msg-mitigacion', 'error', MENSAJES.obraFueraDeZona);
    return;
  }
  $('msg-mitigacion').innerHTML = '';
  estado.obra = { latitud, longitud, distancia, eficiencia };
  pintarObraElegida();
  pintarTodo();
}

// ---------- Eventos del mapa ----------

function alHacerClicEnMapa(latitud, longitud, nombreAlcaldia) {
  if (estado.pestana === 'proyectos') {
    if (estado.proyecto) moverProyectoA(latitud, longitud);
    else colocarPuntoNuevo(latitud, longitud, nombreAlcaldia);
  } else if (estado.pestana === 'mitigacion' && estado.proyecto) {
    colocarObra(latitud, longitud);
  }
}

function alArrastrarPin(latitud, longitud, nombreAlcaldia) {
  if (estado.proyecto) moverProyectoA(latitud, longitud);
  else colocarPuntoNuevo(latitud, longitud, nombreAlcaldia);
}

// ---------- RF-WEB-08: exportar reporte técnico ----------

async function exportarReporte() {
  mostrarPestana('reporte');
  $('msg-reporte').innerHTML = '';

  if (!datosCompletosParaReporte(estado.proyecto)) {
    mostrarMensaje('msg-reporte', 'error', MENSAJES.reporteIncompleto);
    return;
  }
  let reporte;
  try {
    reporte = generarReportePDF({
      proyecto: estado.proyecto,
      simulacion: estado.simulacionVigente,
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
  const resultado = await guardarReporte(estado.proyecto.id, reporte);
  if (await aplicarResultado(resultado, 'msg-reporte')) {
    reporte.documento.save(reporte.nombreArchivo);
    mostrarMensaje('msg-reporte', 'exito', resultado.mensaje);
  }
}

// ---------- Eventos de la interfaz ----------

document.querySelectorAll('.pestana').forEach((boton) => {
  boton.addEventListener('click', () => mostrarPestana(boton.dataset.pestana));
});
document.querySelectorAll('.ir-proyectos').forEach((boton) => {
  boton.addEventListener('click', () => mostrarPestana('proyectos'));
});
$('boton-nuevo-proyecto').addEventListener('click', cerrarProyecto);

// Elegir la alcaldía en la lista coloca el punto en su centro.
$('alcaldia').addEventListener('change', (evento) => {
  const nombre = nombreAlcaldiaPorId(evento.target.value);
  if (!nombre) {
    estado.punto = null;
    pintarUbicacionNueva();
    pintarMapa();
    return;
  }
  const centro = centroAlcaldia(nombre);
  colocarPuntoNuevo(centro.latitud, centro.longitud, nombre);
  centrarEn(centro.latitud, centro.longitud, 13);
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
  estado.punto = null;
  pintarUbicacionNueva();
  estado.pagina = 1;
  await aplicarResultado(resultado, 'msg-proyecto');
  mostrarPestana('proyectos');
  snackbar(resultado.mensaje);
});

// RF-WEB-03: abrir un proyecto del historial.
$('lista-proyectos').addEventListener('click', async (evento) => {
  const boton = evento.target.closest('.item-proyecto');
  if (!boton) return;
  estado.punto = null;
  if (await aplicarResultado(await consultarProyecto(boton.dataset.id), 'msg-historial')) {
    mostrarPestana(estado.pestana);
  }
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

// Vista previa de la obra mientras se eligen tipo y capacidad.
$('tipo-obra').addEventListener('change', () => { if (estado.proyecto) pintarTodo(); });
$('capacidad').addEventListener('input', () => { if (estado.proyecto) pintarTodo(); });

// RF-WEB-07: simulación de mitigación.
$('form-mitigacion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const obra = estado.obra || {};
  const resultado = await simularMitigacionProyecto(
    estado.proyecto.id, $('tipo-obra').value, $('capacidad').value, obra.latitud, obra.longitud
  );
  if (!resultado.ok) {
    mostrarMensaje('msg-mitigacion', 'error', resultado.error);
    return;
  }
  estado.obra = null;
  pintarObraElegida();
  await aplicarResultado(resultado, 'msg-mitigacion');
  const s = resultado.simulacion;
  const semaforo = evaluarSemaforo(s.caudalAjustado, s.caudalPermitido);
  const texto = `${s.tipoObra} (eficiencia ${Math.round(s.eficiencia * 100)} %): caudal ajustado `
    + `${numero(s.caudalAjustado, 3)} m³/s. ${resultado.mensaje}. Semáforo: ${semaforo.etiqueta}.`;
  mostrarMensaje('msg-mitigacion', s.dentroDeCapacidad ? 'exito' : 'error', texto);
});

// RF-WEB-08: botones de exportación.
$('boton-exportar-barra').addEventListener('click', exportarReporte);
$('boton-exportar').addEventListener('click', exportarReporte);
$('accion-mitigar').addEventListener('click', (evento) => {
  if (evento.target.closest('#ir-mitigacion')) mostrarPestana('mitigacion');
});

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
  iniciarMapa('mapa', { alHacerClic: alHacerClicEnMapa, alArrastrarPin });
  mostrarPestana('proyectos');
  await cargarHistorial(1);
}

iniciarPanel();
