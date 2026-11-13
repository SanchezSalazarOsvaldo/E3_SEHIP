// Configuración del mapa base (Leaflet).
// Leaflet es una librería libre y no usa llave (API key). Las calles del fondo se descargan como
// imágenes ("teselas") desde un proveedor; ninguno de los siguientes requiere llave de acceso.
// Si el primero no responde, el mapa cambia automáticamente al siguiente de la lista.

const PROVEEDORES_MAPA = [
  {
    nombre: 'Calles (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    opciones: { attribution: 'Tiles &copy; Esri', maxZoom: 18 }
  },
  {
    nombre: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opciones: { attribution: '&copy; OpenStreetMap', maxZoom: 18 }
  },
  {
    nombre: 'Satélite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opciones: { attribution: 'Tiles &copy; Esri', maxZoom: 18 }
  }
];

// Número de teselas fallidas (sin ninguna cargada) para cambiar al siguiente proveedor.
const ERRORES_PARA_CAMBIAR_MAPA = 4;
