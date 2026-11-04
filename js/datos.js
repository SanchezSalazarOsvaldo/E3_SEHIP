// Datos fijos del sistema: cuentas iniciales, catálogo de alcaldías y tabla maestra normativa.

// Cuentas registradas. El primer registro es el Administrador del Sistema inicial (protegido).
// Para agregar ingenieros civiles se añade un objeto más a esta lista.
const USUARIOS = [
  { id: 1, nombre: 'Administrador SEHIP', correo: 'admin@sehip.mx', contrasena: 'Admin12345', rol: 'Administrador', activo: true, protegido: true },
  { id: 2, nombre: 'Regina Cerón', correo: 'ingeniero@sehip.mx', contrasena: 'Clave1234', rol: 'Ingeniero Civil', activo: true, protegido: false },
  { id: 3, nombre: 'Cuenta Inactiva', correo: 'inactivo@sehip.mx', contrasena: 'Clave1234', rol: 'Ingeniero Civil', activo: false, protegido: false }
];

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

// Tabla maestra normativa (valores de prueba; se sustituyen por los oficiales).
// Coeficientes de escurrimiento: Cp (superficie permeable) y Ci (superficie impermeable).
const COEFICIENTES = { Cp: 0.20, Ci: 0.90 };

// Intensidad de lluvia en mm/h por alcaldía y período de retorno (años).
// null = sin intensidad registrada.
const INTENSIDAD_BASE = { 2: 40.00, 5: 55.00, 10: 65.00, 20: 75.00, 50: 90.00 };
const INTENSIDADES = {};
ALCALDIAS.forEach((alcaldia) => {
  INTENSIDADES[alcaldia.id] = { ...INTENSIDAD_BASE };
});
// Milpa Alta con 50 años queda sin registro para probar el flujo alterno 2 de RF-WEB-05.
INTENSIDADES[12][50] = null;

function nombreAlcaldia(idAlcaldia) {
  const alcaldia = ALCALDIAS.find((a) => a.id === idAlcaldia);
  return alcaldia ? alcaldia.nombre : '';
}
