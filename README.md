# SEHIP – Módulos web de Simulación Hidrológica y de Administración (versión sin base de datos)

Sistema de Evaluación Hidrológica e Impacto Pluvial · Equipo 3

HTML, CSS y JavaScript puro. No requiere servidor ni base de datos: todas las validaciones se hacen en
JavaScript y los datos (cuentas, tabla maestra, proyectos, simulaciones y reportes) se guardan en el
`localStorage` del navegador. Implementa RF-WEB-01 a RF-WEB-08 y RF-ADM-01 a RF-ADM-07.

## Cómo ejecutarlo

Abre `index.html` en el navegador (doble clic) o usa la extensión **Live Server** de Visual Studio Code.
El mapa base necesita conexión a internet; sin ella, el mapa muestra solo los límites de las alcaldías.

## Estructura

```
sehip-web-sin-bd/
├── index.html                # Inicio de sesión de ingenieros (RF-WEB-01)
├── panel.html                # Panel del ingeniero civil con pestañas
├── admin.html                # Acceso administrativo (RF-ADM-01)
├── admin-panel.html          # Panel de administración (RF-ADM-02 a RF-ADM-07)
├── bandeja.html              # Bandeja de correo simulada (contraseñas temporales)
├── css/estilos.css           # Guía visual de Figma
├── lib/                      # Librerías incluidas (funcionan sin internet)
│   ├── leaflet/              # Mapa interactivo
│   └── jspdf.umd.min.js      # Generación de PDF
└── js/
    ├── datos.js              # Cuentas, sesión, alcaldías, tabla maestra, incidencias y correo simulado
    ├── config-mapa.js        # Proveedores del mapa base
    ├── limites-alcaldias.js  # Límites de las 16 alcaldías (INEGI) y detección de alcaldía por punto
    ├── validaciones.js       # Validaciones, fórmulas y mensajes oficiales
    ├── proyectos.js          # Sesión del ingeniero, proyectos, cálculos y reportes (localStorage)
    ├── administracion.js     # Operaciones del módulo de administración (localStorage)
    ├── mapa.js               # Mapa de alcaldías
    ├── reporte.js            # Reporte técnico en PDF
    ├── login.js, panel.js    # Comportamiento de index.html y panel.html
    ├── admin-login.js        # Comportamiento de admin.html
    ├── admin-panel.js        # Comportamiento de admin-panel.html
    └── bandeja.js            # Comportamiento de bandeja.html
```

## Organización de la interfaz

| Pestaña | Contenido | Requerimientos |
|---|---|---|
| **Proyectos** | Registro de proyecto con su punto de ubicación en el mapa, historial paginado y marcador del proyecto activo con el color de su semáforo | RF-WEB-02, RF-WEB-03 |
| **Cálculo hidrológico** | Coeficiente de escurrimiento, intensidad de lluvia, caudal pico y semáforo sin obra | RF-WEB-04, 05, 06 |
| **Mitigación** | Simulación de obras, semáforo antes/después, capacidad recomendada y simulaciones guardadas | RF-WEB-07 |
| **Reporte técnico** | Lista de datos obligatorios, exportación a PDF e historial de reportes | RF-WEB-08 |

Arriba de las pestañas está la barra del proyecto activo, con el botón **Exportar PDF**.

## Cuentas de prueba (js/datos.js)

| Cuenta | Correo | Contraseña | Acceso al módulo |
|---|---|---|---|
| Administrador del Sistema inicial (protegido) | admin@sehip.mx | Admin12345 | Administración (`admin.html`) |
| Ingeniero Civil | ingeniero@sehip.mx | Clave1234 | Simulación (`index.html`) |
| Ingeniero Civil inactivo | inactivo@sehip.mx | Clave1234 | Ninguno (cuenta inactiva) |

Las cuentas nuevas se crean desde el módulo de administración. Las contraseñas se guardan cifradas (SHA-256).
Para volver al estado inicial: F12 → Application → Local Storage → borrar las claves que empiezan con `sehip_`.

## Módulo de administración (RF-ADM-01 a RF-ADM-07)

Acceso: **admin.html** (enlace “Acceso administrativo” en el inicio de sesión de ingenieros). Solo entran
cuentas activas con rol **Administrador del Sistema**; un ingeniero que abra el panel ve “Acceso denegado: se
requiere rol de administrador”.

| Pestaña | Qué hace | Requerimiento |
|---|---|---|
| **Panel de control** | Total de proyectos registrados, total de simulaciones realizadas, total de incidencias y mapa de la CDMX con los puntos críticos de encharcamiento (las alcaldías con más incidencias se ven más intensas) | RF-ADM-02 |
| **Tabla maestra** | Actualiza Cp, Ci o la intensidad de una alcaldía y período de retorno (clic en un valor de la tabla para editarlo). El valor se sobrescribe y rige para los cálculos siguientes; los proyectos ya calculados no se recalculan | RF-ADM-03 |
| **Usuarios** | Crear cuenta con contraseña temporal enviada por correo, buscar por nombre, correo o rol, cambiar rol y desactivar cuenta (pide una segunda pulsación para confirmar) | RF-ADM-04 a 07 |

Reglas adicionales:

- Debe quedar siempre al menos un administrador activo.
- El administrador inicial (protegido) no puede cambiar de rol ni desactivarse.
- Un cambio de rol rige desde el siguiente inicio de sesión del usuario.
- Una cuenta desactivada no puede iniciar sesión y su sesión abierta se cierra en la siguiente acción;
  sus proyectos se conservan. La reactivación no forma parte del módulo.
- **Correo simulado:** sin servidor no se envían correos reales. La contraseña temporal aparece en
  `bandeja.html` (enlace “Bandeja de correo (simulación)”). Para probar la falla del correo, cambia
  `SIMULAR_FALLA_CORREO` a `true` en `js/datos.js`.

### Mensajes del módulo de administración

| Requerimiento | Cómo provocarlo | Mensaje |
|---|---|---|
| RF-ADM-01 | Cuenta de ingeniero, contraseña incorrecta, cuenta inactiva o formato inválido | Las credenciales o los privilegios de administrador son incorrectos |
| RF-ADM-02 | Abrir el panel con sesión de ingeniero | Acceso denegado: se requiere rol de administrador |
| RF-ADM-02 | Sin puntos críticos registrados | No hay incidencias registradas |
| RF-ADM-03 | Cp = 0.25 | El parámetro fue actualizado con éxito |
| RF-ADM-03 | Cp = 0.99 o intensidad = 300 | El valor está fuera de norma |
| RF-ADM-03 | Vacío, texto o 0.251 | Ingrese un valor numérico con máximo dos decimales |
| RF-ADM-04 | Correo ya registrado, nombre vacío, correo inválido o sin rol | El correo electrónico ya se encuentra registrado o los datos son inválidos |
| RF-ADM-04 | Falla el envío del correo | No fue posible enviar la contraseña temporal; la cuenta no fue creada |
| RF-ADM-05 | Búsqueda vacía o de más de 50 caracteres | Ingrese entre 1 y 50 caracteres |
| RF-ADM-05 | Búsqueda sin coincidencias (“zzz”) | No se encontraron usuarios con el criterio ingresado |
| RF-ADM-06 | Cambio correcto | El rol de usuario fue modificado exitosamente |
| RF-ADM-06 | Pasar a ingeniero al único administrador activo | No es posible eliminar el último rol de administrador activo |
| RF-ADM-06 | Elegir el mismo rol | El rol seleccionado es igual al rol actual de la cuenta |
| RF-ADM-06 | Usuario eliminado mientras se mostraba la lista | El usuario seleccionado no existe |
| RF-ADM-07 | Desactivar la propia cuenta | No es posible desactivar la cuenta propia en uso |
| RF-ADM-07 | Desactivar una cuenta ya inactiva | La cuenta seleccionada ya se encuentra inactiva |



## Mapa (Leaflet)

Leaflet es una librería libre y **no usa llave (API key)**. Las calles del fondo se descargan como imágenes
desde un proveedor de mapas configurado en `js/config-mapa.js` (Esri, OpenStreetMap y vista satelital;
ninguno requiere llave). Si un proveedor no responde, el mapa cambia solo al siguiente, y el botón de capas
(esquina superior derecha) permite elegirlo manualmente. Se necesita conexión a internet para ver las calles;
sin ella se ven los límites de las alcaldías y el mapa sigue funcionando para colocar el punto.

**Ubicación del proyecto:** al hacer clic en el mapa se coloca el punto del proyecto, se guardan su latitud y
longitud y se detecta automáticamente la alcaldía (límites oficiales de INEGI). Si el clic queda fuera de la
CDMX aparece “Seleccione una ubicación dentro de los límites de la Ciudad de México”. Al elegir la alcaldía en
la lista, el punto se coloca en su centro y después puede moverse con otro clic. La intensidad de lluvia se
toma de la alcaldía donde está el punto.

## Simulación en el mapa

El mapa está siempre visible a la derecha y muestra **un solo proyecto a la vez**.

1. **Proyectos:** clic en el mapa para colocar el punto del proyecto nuevo (el pin se puede arrastrar). Con un
   proyecto activo, arrastrar el pin o hacer clic en otro punto **mueve el proyecto**: la alcaldía, la intensidad
   y el caudal se actualizan solos. El botón **Nuevo proyecto** libera el mapa para registrar otro.
2. **Cálculo:** al calcular el caudal pico aparecen la huella del predio (gris) y la **zona afectada** (color del
   semáforo). Cada cambio de superficies, intensidad o ubicación recalcula y anima el círculo.
3. **Mitigación:** clic dentro de la zona afectada para colocar la obra. Al escribir la capacidad se muestra una
   **vista previa** (zona, semáforo y panel del mapa) sin guardar; **Simular mitigación** la guarda. La zona sin
   obra queda como contorno punteado para comparar. Si el proyecto cambia después, la simulación queda como
   “Desactualizada”.
4. El panel dentro del mapa resume caudal pico, descarga permitida, % del semáforo, radios y reducción del área.

| Ejemplo (Ap = 6000, Ai = 14000, 10 años) | Caudal (m³/s) | Radio de la zona | Semáforo |
|---|---|---|---|
| Sin obra | 0.249 | 102.1 m | 🔴 Riesgo alto (346 %) |
| Tanque de Tormenta 700 m³ a 51 m del proyecto (eficiencia 75 %) | 0.103 | 84.1 m | 🟡 Riesgo medio (143 %) |
| La misma obra junto al proyecto (eficiencia ≈ 100 %) | 0.055 | 79.8 m | 🟢 Riesgo bajo (76 %) |

**Documentación:** `docs/MANUAL_DESARROLLADOR.md` (cómo funciona cada parte) y `docs/FUNDAMENTO_CALCULOS.md`
(fundamento de cada fórmula).

## Semáforo de impacto pluvial

Compara el caudal del proyecto con la capacidad de descarga permitida (Qpermitido = Cp · I · A / 360):

| Nivel | Condición | Significado |
|---|---|---|
| 🟢 Riesgo bajo | Caudal ≤ 100 % de Qpermitido | Dentro de la capacidad de descarga |
| 🟡 Riesgo medio | Más de 100 % y hasta 150 % | Riesgo de encharcamiento |
| 🔴 Riesgo alto | Más de 150 % | Riesgo alto de encharcamiento o inundación |

- En **Cálculo hidrológico** se muestra el semáforo del proyecto sin obra (caudal pico).
- En **Mitigación** se comparan el semáforo **antes** (caudal pico) y **después** de la última obra simulada
  (caudal ajustado), y se recomienda la capacidad mínima de obra para bajar de nivel:
  capacidad = (Qpico − Qobjetivo) × 3,600.
- El marcador del proyecto en el mapa toma el color de su semáforo actual.
- Los umbrales (100 % y 150 %) están en `UMBRALES_SEMAFORO` de `js/validaciones.js` y pueden ajustarse al
  criterio del equipo.

## Fórmulas

| Cálculo | Fórmula | Resultado |
|---|---|---|
| Coeficiente ponderado (RF-WEB-04) | C = (Cp·Ap + Ci·Ai) / (Ap + Ai) | 2 decimales |
| Caudal pico (RF-WEB-06) | Q = C · I · A / 360, A en hectáreas (m² ÷ 10,000) | m³/s, 3 decimales |
| Retención (RF-WEB-07) | R = capacidad / 3,600 | m³/s |
| Caudal ajustado | Qmitigado = Qpico − R (mínimo 0.000) | m³/s, 3 decimales |
| Descarga permitida | Qpermitido = Cp · I · A / 360 | m³/s, 3 decimales |

## Reporte técnico (RF-WEB-08)

El PDF incluye datos generales (nombre, alcaldía, ubicación, fechas de creación y emisión, autor), memoria descriptiva,
tablas de cálculo (datos de entrada, resultados y obra de mitigación), el semáforo de impacto pluvial
antes y después de la obra, y una gráfica de barras con el caudal
pico, el caudal ajustado y la descarga permitida. Al exportar se descarga el archivo y se guarda una copia en
el historial del proyecto, desde donde puede volver a descargarse.

## Caso de prueba completo

Con los valores de `js/datos.js` (Cp = 0.20, Ci = 0.90, intensidad de 10 años = 65 mm/h):

| Paso | Entrada | Resultado esperado |
|---|---|---|
| Registrar proyecto | “Conjunto Norte”, clic en Ciudad Universitaria | Punto en Coyoacán, estado “En proceso” |
| Coeficiente | Ap = 6000, Ai = 14000 | C = 0.69, superficie total 20,000.00 m² |
| Intensidad | 10 años | 65.00 mm/h |
| Caudal pico | — | Q = 0.249 m³/s, estado “Calculado”, semáforo 🔴 (346 % de 0.072 m³/s) |
| Recomendación | — | 507.60 m³ para riesgo medio y 637.20 m³ para riesgo bajo |
| Mitigación | Tanque de Tormenta, 300 m³ | 0.166 m³/s, “El caudal ajustado excede la capacidad de descarga permitida”, 🔴 231 % |
| Mitigación | Jardín de Lluvia, 550 m³ | 0.096 m³/s, “El caudal ajustado excede la capacidad de descarga permitida”, 🟡 133 % |
| Mitigación | Pozo de Infiltración, 700 m³ | 0.055 m³/s, “El caudal ajustado está dentro de la capacidad de descarga permitida”, 🟢 76 % |
| Exportar PDF | — | Descarga del PDF y copia en el historial de reportes |

### Mensajes de error que se pueden provocar

| Requerimiento | Cómo provocarlo | Mensaje |
|---|---|---|
| RF-WEB-01 | Contraseña incorrecta, correo inexistente, cuenta inactiva o formato inválido | El correo electrónico o la contraseña son incorrectos |
| RF-WEB-02 | Nombre vacío o sin alcaldía | El nombre del proyecto debe contener entre 1 y 100 caracteres y una alcaldía válida |
| Ubicación | Clic en el mapa fuera de la CDMX | Seleccione una ubicación dentro de los límites de la Ciudad de México |
| RF-WEB-03 | Historial sin proyectos | El proyecto no fue encontrado o no existen registros disponibles |
| RF-WEB-04 | Dejar una superficie vacía | Debe registrar las superficies antes de calcular el coeficiente |
| RF-WEB-04 | Ap = 600000 y Ai = 600000 | Cada superficie debe estar entre 0.00 y 1,000,000.00 metros cuadrados y la superficie total entre 0.01 y 1,000,000.00 metros cuadrados |
| RF-WEB-05 | Consultar sin elegir período | Seleccione una alcaldía válida y un período de retorno permitido |
| RF-WEB-05 | Proyecto en Milpa Alta con 50 años (sin intensidad a propósito) | No existe una intensidad de lluvia registrada para la alcaldía y el período de retorno seleccionados |
| RF-WEB-06 | Calcular caudal en un proyecto nuevo | Parámetros incompletos para el cálculo del caudal pico |
| RF-WEB-07 | Simular sin elegir obra | Seleccione un tipo de obra de mitigación pluvial |
| RF-WEB-07 | Capacidad 0 o 50000.01 | La capacidad de almacenamiento debe estar entre 0.01 y 50000.00 metros cúbicos |
| RF-WEB-07 | Simular antes de calcular el caudal | Debe calcular el caudal pico antes de simular la mitigación |
| RF-WEB-08 | Exportar sin caudal pico | Debe completar todos los cálculos antes de exportar |

## Notas

- Los datos se conservan al recargar, pero solo en ese navegador. Para borrarlos: F12 → Application →
  Local Storage → eliminar las claves que empiezan con `sehip_`.
- Los valores de Cp, Ci e intensidades de `js/datos.js` son ilustrativos y deben sustituirse por los oficiales.
- Límites de alcaldías: INEGI, Marco Geoestadístico 2022, vía [PhantomInsights/mexico-geojson](https://github.com/PhantomInsights/mexico-geojson) (simplificados).
  Mapas base: © Esri, © OpenStreetMap.
