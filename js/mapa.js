// Mapa interactivo de la CDMX con Leaflet (pestaña Proyectos).
// - Clic en el mapa: coloca el punto de ubicación del nuevo proyecto y detecta su alcaldía.
// - El proyecto activo se muestra con un círculo de zona afectada del color de su semáforo.
// - La obra de mitigación se coloca dentro de esa zona y el círculo se recalcula con su efecto.

const COLORES_SEMAFORO = {
  verde: '#3F6B22',
  amarillo: '#E0A800',
  rojo: '#C62828',
  ninguno: '#006B78'
};

const ESTILOS_MAPA = {
  base: { color: '#006B78', weight: 1.5, fillColor: '#006B78', fillOpacity: 0.08 },
  seleccion: { color: '#0B3954', weight: 3, fillColor: '#0B3954', fillOpacity: 0.25 },
  activa: { color: '#3F6B22', weight: 3, fillColor: '#3F6B22', fillOpacity: 0.18 },
  encima: { weight: 3, fillOpacity: 0.2 }
};

const estadoMapa = {
  mapa: null,
  capas: {},            // capa de cada alcaldía, por nombre
  seleccionada: null,   // alcaldía del punto nuevo
  activa: null,         // alcaldía del proyecto activo
  puntoNuevo: null,     // marcador del punto del proyecto por registrar
  puntoActivo: null,    // marcador del proyecto activo
  zonaActual: null,     // círculo de zona afectada actual (con la última obra)
  zonaAntes: null,      // círculo de zona afectada sin obra (contorno punteado)
  obra: null,           // marcador de la última obra simulada
  obraTemporal: null,   // marcador de la obra por simular
  capaBase: null,
  indiceProveedor: 0
};

function estiloAlcaldia(nombre) {
  if (nombre === estadoMapa.seleccionada) return ESTILOS_MAPA.seleccion;
  if (nombre === estadoMapa.activa) return ESTILOS_MAPA.activa;
  return ESTILOS_MAPA.base;
}

function repintarAlcaldias() {
  Object.entries(estadoMapa.capas).forEach(([nombre, capa]) => capa.setStyle(estiloAlcaldia(nombre)));
}

// ---------- Mapa base con cambio automático de proveedor ----------

// Crea la capa de un proveedor. Si fallan varias teselas sin que ninguna cargue, pasa al siguiente.
function crearCapaBase(indice) {
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
  return capa;
}

const capasBase = [];
function obtenerCapaBase(indice) {
  if (!capasBase[indice]) capasBase[indice] = crearCapaBase(indice);
  return capasBase[indice];
}

// ---------- Creación del mapa ----------

// alHacerClic(latitud, longitud, nombreAlcaldia) se ejecuta al hacer clic en el mapa;
// nombreAlcaldia es null si el punto está fuera de la Ciudad de México.
function iniciarMapa(idContenedor, alHacerClic) {
  const mapa = L.map(idContenedor, { minZoom: 10, maxZoom: 18 });
  estadoMapa.mapa = mapa;

  estadoMapa.capaBase = obtenerCapaBase(0).addTo(mapa);

  // Selector manual de mapa base (esquina superior derecha).
  const opcionesBase = {};
  PROVEEDORES_MAPA.forEach((proveedor, i) => { opcionesBase[proveedor.nombre] = obtenerCapaBase(i); });
  L.control.layers(opcionesBase, null, { position: 'topright' }).addTo(mapa);
  mapa.on('baselayerchange', (evento) => { estadoMapa.capaBase = evento.layer; });

  const capaGeo = L.geoJSON(LIMITES_ALCALDIAS, {
    style: (feature) => estiloAlcaldia(feature.properties.nombre),
    onEachFeature: (feature, capa) => {
      const nombre = feature.properties.nombre;
      estadoMapa.capas[nombre] = capa;
      capa.bindTooltip(nombre, { sticky: true, className: 'etiqueta-alcaldia' });
      capa.on('mouseover', () => capa.setStyle(ESTILOS_MAPA.encima));
      capa.on('mouseout', () => capa.setStyle(estiloAlcaldia(nombre)));
    }
  }).addTo(mapa);

  // Un solo manejador para todo el mapa: dentro o fuera de la CDMX.
  mapa.on('click', (evento) => {
    const latitud = Number(evento.latlng.lat.toFixed(6));
    const longitud = Number(evento.latlng.lng.toFixed(6));
    alHacerClic(latitud, longitud, alcaldiaEnPunto(latitud, longitud));
  });

  mapa.fitBounds(capaGeo.getBounds());
  mapa.setMaxBounds(capaGeo.getBounds().pad(0.3));
}

// ---------- Punto del nuevo proyecto ----------

// Coloca (o mueve) el punto del proyecto por registrar y resalta su alcaldía.
function colocarPuntoNuevo(latitud, longitud, nombreAlcaldia, centrar = false) {
  if (!estadoMapa.puntoNuevo) {
    estadoMapa.puntoNuevo = L.circleMarker([latitud, longitud], {
      radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#0B3954', fillOpacity: 1
    }).addTo(estadoMapa.mapa);
    estadoMapa.puntoNuevo.bindTooltip('Ubicación del nuevo proyecto', { direction: 'top', offset: [0, -8] });
  } else {
    estadoMapa.puntoNuevo.setLatLng([latitud, longitud]);
  }
  estadoMapa.seleccionada = nombreAlcaldia;
  repintarAlcaldias();
  if (centrar) estadoMapa.mapa.flyTo([latitud, longitud], 12, { duration: 0.6 });
}

function quitarPuntoNuevo() {
  if (estadoMapa.puntoNuevo) {
    estadoMapa.mapa.removeLayer(estadoMapa.puntoNuevo);
    estadoMapa.puntoNuevo = null;
  }
  estadoMapa.seleccionada = null;
  repintarAlcaldias();
}

// ---------- Proyecto activo ----------

// Marca la ubicación del proyecto activo con el color de su semáforo (nivel: verde, amarillo, rojo o null).
function marcarProyectoActivo(proyecto, nivel, centrar) {
  estadoMapa.activa = proyecto.alcaldia;
  repintarAlcaldias();
  if (proyecto.latitud == null || proyecto.longitud == null) return;

  const posicion = [proyecto.latitud, proyecto.longitud];
  const color = COLORES_SEMAFORO[nivel] || COLORES_SEMAFORO.ninguno;
  const texto = nivel ? NIVELES_SEMAFORO[nivel].etiqueta : 'Sin calcular';

  if (!estadoMapa.puntoActivo) {
    estadoMapa.puntoActivo = L.circleMarker(posicion, { radius: 11, color: '#FFFFFF', weight: 3, fillOpacity: 1 })
      .addTo(estadoMapa.mapa);
  }
  estadoMapa.puntoActivo.setLatLng(posicion);
  estadoMapa.puntoActivo.setStyle({ fillColor: color });
  estadoMapa.puntoActivo.unbindTooltip();
  estadoMapa.puntoActivo.bindTooltip(`<strong>${escaparMapa(proyecto.nombre)}</strong><br>${texto}`, {
    permanent: true, direction: 'right', offset: [14, 0], className: 'etiqueta-alcaldia'
  });
  estadoMapa.puntoActivo.bringToFront();
  if (centrar) estadoMapa.mapa.flyTo(posicion, 16, { duration: 0.6 });
}

// ---------- Simulación en el mapa ----------

function quitarCapa(nombre) {
  if (estadoMapa[nombre]) {
    estadoMapa.mapa.removeLayer(estadoMapa[nombre]);
    estadoMapa[nombre] = null;
  }
}

// Dibuja la zona afectada del proyecto activo:
// datos = { proyecto, radioAntes, radioActual, nivelAntes, nivelActual, simulacion }.
function pintarSimulacionMapa(datos) {
  ['zonaActual', 'zonaAntes', 'obra'].forEach(quitarCapa);
  const p = datos.proyecto;
  if (p.latitud == null || !datos.radioActual) return;
  const centro = [p.latitud, p.longitud];

  if (datos.simulacion) {
    estadoMapa.zonaAntes = L.circle(centro, {
      radius: datos.radioAntes, color: COLORES_SEMAFORO[datos.nivelAntes], weight: 2,
      dashArray: '6 6', fill: false, interactive: false
    }).addTo(estadoMapa.mapa);
  }
  estadoMapa.zonaActual = L.circle(centro, {
    radius: datos.radioActual, color: COLORES_SEMAFORO[datos.nivelActual], weight: 2,
    fillColor: COLORES_SEMAFORO[datos.nivelActual], fillOpacity: 0.3, interactive: false
  }).addTo(estadoMapa.mapa);

  const s = datos.simulacion;
  if (s && s.latitud != null) {
    estadoMapa.obra = L.circleMarker([s.latitud, s.longitud], {
      radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#6A1B9A', fillOpacity: 1
    }).addTo(estadoMapa.mapa);
    estadoMapa.obra.bindTooltip(
      `<strong>${escaparMapa(s.tipoObra)}</strong><br>${s.capacidad} m³ · eficiencia ${Math.round(s.eficiencia * 100)} %`,
      { direction: 'bottom', offset: [0, 8], className: 'etiqueta-alcaldia' }
    );
  }
  if (estadoMapa.puntoActivo) estadoMapa.puntoActivo.bringToFront();
}

// Muestra la zona afectada completa en la vista del mapa.
function encuadrarZona() {
  const zona = estadoMapa.zonaAntes || estadoMapa.zonaActual;
  if (zona) estadoMapa.mapa.flyToBounds(zona.getBounds(), { padding: [60, 60], maxZoom: 17, duration: 0.6 });
}

// Marcador de la obra que se va a simular (antes de pulsar "Simular mitigación").
function colocarObraTemporal(latitud, longitud) {
  if (!estadoMapa.obraTemporal) {
    estadoMapa.obraTemporal = L.circleMarker([latitud, longitud], {
      radius: 8, color: '#6A1B9A', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1, dashArray: '3 3'
    }).addTo(estadoMapa.mapa);
    estadoMapa.obraTemporal.bindTooltip('Nueva obra', { direction: 'top', offset: [0, -8] });
  } else {
    estadoMapa.obraTemporal.setLatLng([latitud, longitud]);
  }
}

function quitarObraTemporal() {
  quitarCapa('obraTemporal');
}

function escaparMapa(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// Recalcula el tamaño del mapa cuando su pestaña vuelve a mostrarse.
function ajustarMapa() {
  if (estadoMapa.mapa) estadoMapa.mapa.invalidateSize();
}
