// Mapa de simulación con Leaflet. Siempre está visible y muestra un solo proyecto a la vez:
// - Pin del proyecto (se puede arrastrar para cambiar su ubicación).
// - Huella del predio: círculo gris con el área de la construcción.
// - Zona afectada: círculo del color del semáforo cuyo radio crece con el volumen que no puede descargarse.
// - Zona sin obra: contorno punteado que permite comparar antes y después de la mitigación.
// - Obra de mitigación: icono según el tipo, unido al proyecto con una línea que indica distancia y eficiencia.

const COLORES_SEMAFORO = {
  verde: '#3F6B22',
  amarillo: '#E0A800',
  rojo: '#C62828',
  ninguno: '#006B78',
  nuevo: '#0B3954'
};
const COLOR_OBRA = '#6A1B9A';

const ICONOS_OBRA = {
  'Pozo de Infiltración': '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  'Tanque de Tormenta': '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.5"/><path d="M5.5 6.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11"/>',
  'Jardín de Lluvia': '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>'
};

const estadoMapa = {
  mapa: null,
  capas: {},          // polígono de cada alcaldía
  resaltada: null,    // alcaldía del punto mostrado
  pin: null,          // marcador del proyecto (nuevo o activo)
  predio: null,       // huella del predio
  zonaAntes: null,    // zona afectada sin obra (punteada)
  zonaActual: null,   // zona afectada actual (rellena)
  obra: null,         // marcador de la obra
  linea: null,        // línea proyecto-obra
  panel: null,        // panel de datos de la simulación
  capaBase: null,
  alArrastrarPin: null
};

// ---------- Utilidades ----------

function escaparMapa(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function quitarCapa(nombre) {
  if (estadoMapa[nombre]) {
    estadoMapa.mapa.removeLayer(estadoMapa[nombre]);
    estadoMapa[nombre] = null;
  }
}

// Cambia el radio de un círculo de forma gradual (0.5 s) para que el cambio de la simulación se note.
function animarRadio(circulo, radioFinal) {
  const radioInicial = circulo.getRadius();
  if (Math.abs(radioInicial - radioFinal) < 0.1) return;
  const inicio = performance.now();
  const duracion = 500;
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - (1 - t) ** 3;
    circulo.setRadius(radioInicial + (radioFinal - radioInicial) * suave);
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Crea un círculo o, si ya existe, lo mueve, lo anima al nuevo radio y actualiza su estilo.
function circuloSimulacion(nombre, centro, radio, estilo) {
  if (!radio) {
    quitarCapa(nombre);
    return;
  }
  if (!estadoMapa[nombre]) {
    estadoMapa[nombre] = L.circle(centro, { radius: radio, interactive: false, ...estilo }).addTo(estadoMapa.mapa);
    return;
  }
  estadoMapa[nombre].setLatLng(centro);
  estadoMapa[nombre].setStyle(estilo);
  animarRadio(estadoMapa[nombre], radio);
}

// ---------- Mapa base con cambio automático de proveedor ----------

const capasBase = [];
function obtenerCapaBase(indice) {
  if (capasBase[indice]) return capasBase[indice];
  const proveedor = PROVEEDORES_MAPA[indice];
  const capa = L.tileLayer(proveedor.url, proveedor.opciones);
  let errores = 0;
  let cargadas = 0;
  capa.on('tileload', () => { cargadas += 1; });
  capa.on('tileerror', () => {
    errores += 1;
    const siguiente = indice + 1;
    if (cargadas === 0 && errores >= ERRORES_PARA_CAMBIAR_MAPA && siguiente < PROVEEDORES_MAPA.length
        && estadoMapa.capaBase === capa) {
      estadoMapa.mapa.removeLayer(capa);
      estadoMapa.capaBase = obtenerCapaBase(siguiente).addTo(estadoMapa.mapa);
    }
  });
  capasBase[indice] = capa;
  return capa;
}

// ---------- Creación ----------

// eventos.alHacerClic(lat, lng, alcaldia) y eventos.alArrastrarPin(lat, lng, alcaldia);
// alcaldia es null cuando el punto queda fuera de la Ciudad de México.
function iniciarMapa(idContenedor, eventos) {
  const mapa = L.map(idContenedor, { minZoom: 10, maxZoom: 18 });
  estadoMapa.mapa = mapa;
  estadoMapa.alArrastrarPin = eventos.alArrastrarPin;

  estadoMapa.capaBase = obtenerCapaBase(0).addTo(mapa);
  const opcionesBase = {};
  PROVEEDORES_MAPA.forEach((proveedor, i) => { opcionesBase[proveedor.nombre] = obtenerCapaBase(i); });
  L.control.layers(opcionesBase, null, { position: 'bottomright' }).addTo(mapa);
  mapa.on('baselayerchange', (evento) => { estadoMapa.capaBase = evento.layer; });

  const capaGeo = L.geoJSON(LIMITES_ALCALDIAS, {
    style: { color: '#006B78', weight: 1.2, fillColor: '#006B78', fillOpacity: 0.04 },
    onEachFeature: (feature, capa) => {
      estadoMapa.capas[feature.properties.nombre] = capa;
      capa.bindTooltip(feature.properties.nombre, { sticky: true, className: 'etiqueta-mapa' });
    }
  }).addTo(mapa);

  mapa.on('click', (evento) => {
    const latitud = Number(evento.latlng.lat.toFixed(6));
    const longitud = Number(evento.latlng.lng.toFixed(6));
    eventos.alHacerClic(latitud, longitud, alcaldiaEnPunto(latitud, longitud));
  });

  // Panel de datos de la simulación (esquina superior derecha).
  const Panel = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create('div', 'panel-mapa oculto');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    }
  });
  estadoMapa.panel = new Panel({ position: 'topright' }).addTo(mapa);

  mapa.fitBounds(capaGeo.getBounds());
  mapa.setMaxBounds(capaGeo.getBounds().pad(0.3));
}

function resaltarAlcaldia(nombre) {
  if (estadoMapa.resaltada && estadoMapa.capas[estadoMapa.resaltada]) {
    estadoMapa.capas[estadoMapa.resaltada].setStyle({ weight: 1.2, fillOpacity: 0.04, color: '#006B78' });
  }
  estadoMapa.resaltada = nombre || null;
  if (nombre && estadoMapa.capas[nombre]) {
    estadoMapa.capas[nombre].setStyle({ weight: 2.5, fillOpacity: 0.1, color: '#0B3954' });
  }
}

// ---------- Pin del proyecto (uno solo a la vez) ----------

function iconoPin(color, etiqueta) {
  return L.divIcon({
    className: 'pin-proyecto',
    html: `<div class="pin" style="--color-pin:${color}">
             <svg viewBox="0 0 24 24"><path d="M4 20V9.5l8-5.5 8 5.5V20"/><path d="M9.5 20v-5.5h5V20"/></svg>
           </div>
           ${etiqueta ? `<span class="pin-etiqueta">${escaparMapa(etiqueta)}</span>` : ''}`,
    iconSize: [36, 46],
    iconAnchor: [18, 46]
  });
}

// opciones = { color, etiqueta, arrastrable }
function mostrarPin(latitud, longitud, opciones) {
  const posicion = [latitud, longitud];
  if (!estadoMapa.pin) {
    estadoMapa.pin = L.marker(posicion, { draggable: true, autoPan: true, zIndexOffset: 1000 }).addTo(estadoMapa.mapa);
    // Mientras se arrastra, los círculos acompañan al pin.
    estadoMapa.pin.on('drag', (evento) => {
      ['predio', 'zonaAntes', 'zonaActual'].forEach((nombre) => {
        if (estadoMapa[nombre]) estadoMapa[nombre].setLatLng(evento.latlng);
      });
      if (estadoMapa.linea && estadoMapa.obra) estadoMapa.linea.setLatLngs([evento.latlng, estadoMapa.obra.getLatLng()]);
    });
    estadoMapa.pin.on('dragend', () => {
      const { lat, lng } = estadoMapa.pin.getLatLng();
      const latitud = Number(lat.toFixed(6));
      const longitud = Number(lng.toFixed(6));
      estadoMapa.alArrastrarPin(latitud, longitud, alcaldiaEnPunto(latitud, longitud));
    });
  }
  estadoMapa.pin.setLatLng(posicion);
  estadoMapa.pin.setIcon(iconoPin(opciones.color, opciones.etiqueta));
  if (opciones.arrastrable) estadoMapa.pin.dragging.enable();
  else estadoMapa.pin.dragging.disable();
}

function quitarPin() {
  quitarCapa('pin');
}

function centrarEn(latitud, longitud, zoom = 16) {
  estadoMapa.mapa.flyTo([latitud, longitud], zoom, { duration: 0.6 });
}

// ---------- Simulación ----------

// datos = {
//   centro: [lat, lng], radioPredio,
//   zonaAntes: { radio, nivel } | null,   (contorno punteado: sin obra)
//   zonaActual: { radio, nivel } | null,  (relleno: estado actual o vista previa)
//   obra: { latitud, longitud, tipoObra, capacidad, eficiencia, distancia } | null,
//   previa: true si la zona actual es una vista previa sin guardar,
//   obraPrevia: true si la obra mostrada aún no se guarda
// }
function dibujarSimulacion(datos) {
  const { centro } = datos;

  circuloSimulacion('predio', centro, datos.radioPredio, {
    color: '#4A6272', weight: 1.5, dashArray: '2 4', fillColor: '#4A6272', fillOpacity: 0.12
  });

  const antes = datos.zonaAntes;
  circuloSimulacion('zonaAntes', centro, antes ? antes.radio : null, {
    color: antes ? COLORES_SEMAFORO[antes.nivel] : '#000', weight: 2, dashArray: '8 6', fill: false
  });

  const actual = datos.zonaActual;
  circuloSimulacion('zonaActual', centro, actual ? actual.radio : null, {
    color: actual ? COLORES_SEMAFORO[actual.nivel] : '#000',
    weight: datos.previa ? 2 : 2.5,
    dashArray: datos.previa ? '4 4' : null,
    fillColor: actual ? COLORES_SEMAFORO[actual.nivel] : '#000',
    fillOpacity: datos.previa ? 0.18 : 0.28
  });
  if (estadoMapa.predio) estadoMapa.predio.bringToFront();

  // Obra de mitigación y línea al proyecto
  const o = datos.obra;
  if (!o) {
    quitarCapa('obra');
    quitarCapa('linea');
    return;
  }
  const posicionObra = [o.latitud, o.longitud];
  const icono = L.divIcon({
    className: 'icono-obra',
    html: `<div class="obra ${datos.obraPrevia ? 'obra-previa' : ''}" style="--color-obra:${COLOR_OBRA}">
             <svg viewBox="0 0 24 24">${ICONOS_OBRA[o.tipoObra] || ICONOS_OBRA['Pozo de Infiltración']}</svg>
           </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  if (!estadoMapa.obra) {
    estadoMapa.obra = L.marker(posicionObra, { icon: icono, interactive: false, zIndexOffset: 500 }).addTo(estadoMapa.mapa);
  } else {
    estadoMapa.obra.setLatLng(posicionObra);
    estadoMapa.obra.setIcon(icono);
  }
  const textoLinea = `${Math.round(o.distancia)} m · eficiencia ${Math.round(o.eficiencia * 100)} %`;
  if (!estadoMapa.linea) {
    estadoMapa.linea = L.polyline([centro, posicionObra], {
      color: COLOR_OBRA, weight: 2, dashArray: '4 6', interactive: false
    }).addTo(estadoMapa.mapa);
  } else {
    estadoMapa.linea.setLatLngs([centro, posicionObra]);
  }
  estadoMapa.obra.unbindTooltip();
  estadoMapa.obra.bindTooltip(textoLinea, {
    permanent: true, direction: 'right', offset: [16, 0], className: 'etiqueta-linea'
  });
}

function limpiarSimulacion() {
  ['predio', 'zonaAntes', 'zonaActual', 'obra', 'linea'].forEach(quitarCapa);
}

// Encuadra el mapa para ver la zona afectada completa.
function encuadrarZona() {
  const zona = estadoMapa.zonaAntes || estadoMapa.zonaActual || estadoMapa.predio;
  if (!zona) return;
  const centro = zona.getLatLng();
  const radio = Math.max(zona.getRadius(), estadoMapa.zonaActual ? estadoMapa.zonaActual.getRadius() : 0);
  // El margen derecho deja la zona a la vista junto al panel de datos.
  const panelVisible = !estadoMapa.panel.getContainer().classList.contains('oculto');
  estadoMapa.mapa.flyToBounds(centro.toBounds(radio * 2.3), {
    maxZoom: 18,
    duration: 0.6,
    paddingTopLeft: [20, 20],
    paddingBottomRight: [panelVisible && estadoMapa.mapa.getSize().x > 600 ? 310 : 20, 20]
  });
}

// Contenido HTML del panel de datos; vacío lo oculta.
function actualizarPanelMapa(html) {
  const div = estadoMapa.panel.getContainer();
  div.innerHTML = html || '';
  div.classList.toggle('oculto', !html);
}

// Recalcula el tamaño del mapa cuando cambia el diseño de la página.
function ajustarMapa() {
  if (estadoMapa.mapa) estadoMapa.mapa.invalidateSize();
}
