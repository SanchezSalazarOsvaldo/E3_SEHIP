# SEHIP – Módulos web de Simulación Hidrológica y de Administración (versión con base de datos)

Sistema de Evaluación Hidrológica e Impacto Pluvial · Equipo 3

Node.js + Express en el servidor, **PostgreSQL** (Supabase) como base de datos y HTML, CSS y JavaScript en el
navegador. Implementa RF-WEB-01 a RF-WEB-08 y RF-ADM-01 a RF-ADM-07. Los datos se validan en el navegador con
`public/js/validaciones.js` y el servidor vuelve a validarlos con ese mismo archivo antes de guardar en la base.

**Arquitectura distribuida (en la nube):**

```
Navegador ──HTTPS──▶ Vercel (páginas: public/) ──HTTPS /api──▶ Render (servidor Node.js) ──TLS──▶ Supabase (PostgreSQL)
```

La guía paso a paso para subirlo está en **docs/DESPLIEGUE.md** (Supabase, Render y Vercel, más la explicación
del cifrado).

## Puesta en marcha en su computadora

Requisitos: Node.js 20 o superior y una base PostgreSQL. Lo más sencillo es usar el mismo proyecto de
Supabase de la nube (no hace falta instalar PostgreSQL).

1. **Crear la base de datos** (una sola vez por proyecto de Supabase). En Supabase: *SQL Editor* → *New query*,
   pegar `base_de_datos/sehip_base_de_datos.sql` → *Run*; después lo mismo con `base_de_datos/datos_prueba.sql`
   (Cp, Ci, intensidades de prueba y 12 incidencias para el mapa del panel de control).
   Con un PostgreSQL local: `psql -d sehip -f base_de_datos/sehip_base_de_datos.sql` y luego `datos_prueba.sql`.

2. **Configurar el entorno.** Copia `.env.ejemplo` como `.env` y completa:
   - `DATABASE_URL`: cadena de conexión de Supabase (*Connect* → *Session pooler*) con la contraseña de la base.
   - `SESION_SECRETO`: un texto largo cualquiera.
   - El **correo** (sección “Correo electrónico” más abajo). Sin configurarlo, los correos se guardan como
     archivos `.txt` en `correos_enviados/` y no llegan a ningún buzón.

   El archivo `.env` contiene contraseñas: no se sube al repositorio (está en `.gitignore`). Cada integrante
   tiene el suyo.

3. **Instalar dependencias:**
   ```
   npm install
   ```

4. **Iniciar el servidor:**
   ```
   npm start
   ```
   La consola muestra el puerto y el medio de envío de correo (`brevo`, `smtp` o `archivo`).

5. **Crear el administrador inicial (solo la primera vez).** Abre http://localhost:3000/admin.html. Mientras
   la base no tenga administrador, en lugar del inicio de sesión aparece **Configuración inicial**: escribe
   nombre, correo y contraseña. Esa cuenta es el **administrador inicial protegido** (solo puede existir uno; no
   puede desactivarse ni cambiar de rol) y entra directo al panel. Desde ese momento admin.html muestra el
   inicio de sesión normal.

6. **Crear las demás cuentas desde el panel** (pestaña Usuarios, RF-ADM-04). Cada persona recibe por correo una
   contraseña temporal; al entrar por primera vez el sistema le pide cambiarla por una propia.

- Simulación: http://localhost:3000 (cuenta de ingeniero).
- Administración: http://localhost:3000/admin.html (cuenta de administrador).

Alternativa por terminal (útil si no se puede abrir el navegador del servidor):
```
node scripts/crear_usuario.js admin "Administrador SEHIP" admin@sehip.mx Admin12345
node scripts/crear_usuario.js ingeniero "Regina Cerón" ingeniero@sehip.mx Clave1234
```
Las cuentas creadas así no piden cambio de contraseña.

El mapa base necesita conexión a internet; sin ella, el mapa muestra solo los límites de las alcaldías.

## Estructura

```
sehip-web-con-bd/
├── package.json
├── base_de_datos/
│   ├── sehip_base_de_datos.sql   # Script PostgreSQL (10 tablas, trigger, RLS, catálogos)
│   └── datos_prueba.sql          # Valores de prueba de Cp, Ci, intensidades e incidencias
├── .env.ejemplo                  # Variables de entorno (copiar como .env)
├── scripts/crear_usuario.js      # Alta de cuentas por terminal (opcional)
├── certificados/                 # Certificado de Supabase para verificar la conexión cifrada
├── correos_enviados/             # Correos guardados en modo 'archivo' (RF-ADM-04)
├── src/
│   ├── server.js                 # Servidor Express
│   ├── entorno.js                # Lee el archivo .env
│   ├── db.js                     # Conexión a PostgreSQL con TLS (DATABASE_URL en .env)
│   ├── almacen-sesiones.js       # Sesiones guardadas en la tabla sesion
│   ├── correo.js                 # Envío de correo: Brevo, SMTP o archivo
│   └── rutas/
│       ├── auth.js               # RF-WEB-01 y verificación de la sesión
│       ├── cuenta.js             # Cambio y recuperación de contraseña
│       ├── proyectos.js          # RF-WEB-02 a RF-WEB-08
│       └── admin.js              # RF-ADM-01 a RF-ADM-07
├── public/
│   ├── vercel.json               # Configuración de Vercel (reenvía /api a Render)
│   ├── index.html, panel.html    # Módulo de simulación
│   ├── admin.html, admin-panel.html  # Módulo de administración (y configuración inicial)
│   ├── contrasena.html, recuperar.html  # Cambio y recuperación de contraseña
│   ├── css/estilos.css
│   ├── lib/                      # Leaflet (mapa) y jsPDF (reporte), incluidos
│   └── js/
│       ├── validaciones.js       # Validaciones y fórmulas (las usan navegador y servidor)
│       ├── proyectos.js          # Comunicación con la API de simulación
│       ├── administracion.js     # Comunicación con la API de administración
│       ├── cuenta.js             # Comunicación con la API de cambio y recuperación de contraseña
│       ├── contrasena.js, recuperar.js
│       ├── admin-login.js, admin-panel.js
│       ├── config-mapa.js        # Proveedores del mapa base
│       ├── limites-alcaldias.js  # Límites de las 16 alcaldías (INEGI) y detección de alcaldía por punto
│       ├── mapa.js, reporte.js, panel.js, login.js
└── tests/validaciones.test.js    # npm test
```

## Organización de la interfaz

| Pestaña | Contenido | Requerimientos |
|---|---|---|
| **Proyectos** | Registro de proyecto con su punto de ubicación en el mapa, historial paginado y marcador del proyecto activo con el color de su semáforo | RF-WEB-02, RF-WEB-03 |
| **Cálculo hidrológico** | Barra de avance, coeficiente con vista previa (composición permeable/impermeable), gráfica de intensidades de la alcaldía, caudal pico con la fórmula sustituida, medidor de riesgo y semáforo sin obra | RF-WEB-04, 05, 06 |
| **Mitigación** | Simulación de obras, medidor y semáforo antes/después, capacidad recomendada según la eficiencia (botón **Usar**) y simulaciones guardadas | RF-WEB-07 |
| **Reporte técnico** | Datos obligatorios, exportación a PDF e historial de reportes | RF-WEB-08 |

## Módulo de administración (RF-ADM-01 a RF-ADM-07)

Acceso: **http://localhost:3000/admin.html** (enlace “Acceso administrativo” en el inicio de sesión de ingenieros). Solo entran
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
  sus proyectos se conservan. Una cuenta inactiva muestra el botón **Reactivar cuenta**: vuelve a quedar activa
  con su misma contraseña, rol e historial (no pide confirmación).
- Si el correo con la contraseña temporal no se puede enviar, la cuenta no se crea.

## Cuentas y contraseñas

| Función | Dónde | Cómo funciona |
|---|---|---|
| **Contraseña temporal** | Pestaña Usuarios del administrador | Se genera (12 caracteres) y se envía al correo de la cuenta nueva. La cuenta queda marcada con `debe_cambiar_contrasena = 1`. |
| **Cambio obligatorio** | `contrasena.html` | Al iniciar sesión con la temporal, el sistema lleva a esta página. Mientras no la cambie, el servidor responde 403 a cualquier otra operación. |
| **Cambiar contraseña** | Botón *Cambiar contraseña* del encabezado (ambos paneles) | Pide la contraseña actual, la nueva y su confirmación. |
| **Recuperar contraseña** | Enlace *¿Olvidó su contraseña?* en ambos inicios de sesión | 1) Escribe su correo y recibe un código de 6 dígitos (vigente 15 minutos, 5 intentos). 2) Escribe el código y la nueva contraseña. La respuesta del paso 1 es la misma exista o no la cuenta. |

Reglas de una contraseña nueva: 8 a 16 caracteres, al menos una letra y un número, distinta de la actual y
confirmada. El código de recuperación y las contraseñas se guardan cifrados con bcrypt.

## Correo electrónico

El servidor elige el medio de envío según el archivo `.env`:

| Opción | Variables | Cuándo usarla |
|---|---|---|
| **Brevo** (recomendada) | `BREVO_API_KEY`, `CORREO_REMITENTE` | En su computadora y en la nube. Envía por HTTPS, así que funciona aunque el servidor bloquee SMTP (por ejemplo, Render gratis). Plan gratis: 300 correos al día. |
| **Gmail (SMTP)** | `SMTP_USUARIO`, `SMTP_CONTRASENA` | Solo en su computadora. Requiere verificación en dos pasos y una *contraseña de aplicación*. |
| **Archivo** | ninguna | Desarrollo: cada correo se guarda como `.txt` en `correos_enviados/`. |

Configurar Brevo:
1. Crear una cuenta gratis en brevo.com.
2. *Senders, Domains & Dedicated IPs* → *Senders* → *Add a sender*: registrar el correo del equipo (por ejemplo,
   una cuenta de Gmail) y confirmarlo con el enlace que llega a ese buzón.
3. *SMTP & API* → *API Keys* → *Generate a new API key*.
4. En `.env`: `BREVO_API_KEY=<la llave>` y `CORREO_REMITENTE=<el correo verificado>`. Reiniciar el servidor.

Si un correo no llega, revisar la carpeta de spam. Si el envío falla, la consola del servidor muestra la causa.

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
desde un proveedor de mapas configurado en `public/js/config-mapa.js` (Esri, OpenStreetMap y vista satelital;
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
3. **Mitigación:** el mapa muestra los anillos de eficiencia (90 %, 75 % y 50 % en el borde) y, junto al
   cursor, la distancia y la eficiencia que tendría la obra en ese punto. Clic dentro de la zona afectada para colocar la obra. Al escribir la capacidad se muestra una
   **vista previa** (zona, semáforo y panel del mapa) sin guardar; **Simular mitigación** la guarda. La zona sin
   obra queda como contorno punteado para comparar. Si el proyecto cambia después, la simulación queda como
   “Desactualizada”.
4. El panel dentro del mapa resume el medidor de riesgo, caudal pico, descarga permitida, radios y la reducción
   del caudal y del área. El botón con la mira (debajo del zoom) vuelve a encuadrar la simulación.
5. El reporte PDF incluye el medidor de riesgo con las marcas sin obra y con la obra.

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
- Los umbrales (100 % y 150 %) están en `UMBRALES_SEMAFORO` de `public/js/validaciones.js` y pueden ajustarse al
  criterio del equipo.

## Reporte técnico (RF-WEB-08)

El navegador genera el PDF con jsPDF (memoria descriptiva, tablas de cálculo, semáforo de impacto pluvial y gráfica de caudales), lo
descarga y envía una copia al servidor. El servidor verifica que el proyecto tenga todos los cálculos, que el
archivo sea un PDF de máximo 10 MB y lo guarda completo en la columna `contenido` (BYTEA) de la tabla
`reporte_pdf` (en la nube el disco del servidor se borra al reiniciarse, la base no). El historial permite volver a descargarlo.

## API

| Método | Ruta | Cuerpo JSON | Requerimiento |
|---|---|---|---|
| POST | /api/login | `correo`, `contrasena` | RF-WEB-01 |
| POST | /api/logout | — | RF-WEB-01 |
| GET | /api/salud | — | Estado del servidor y de la base |
| GET | /api/sesion | — | RF-WEB-01 |
| POST | /api/contrasena | `actual`, `nueva`, `confirmacion` | Cambio de contraseña |
| POST | /api/recuperacion/solicitar | `correo` | Recuperación (paso 1) |
| POST | /api/recuperacion/restablecer | `correo`, `codigo`, `nueva`, `confirmacion` | Recuperación (paso 2) |
| GET | /api/alcaldias | — | RF-WEB-02 |
| GET | /api/coeficientes | — | RF-WEB-08 |
| POST | /api/proyectos | `nombre`, `idAlcaldia`, `latitud`, `longitud` | RF-WEB-02 |
| GET | /api/proyectos?pagina=1 | — | RF-WEB-03 |
| GET | /api/proyectos/:id | — | RF-WEB-03 |
| POST | /api/proyectos/:id/ubicacion | `latitud`, `longitud` | Mover el proyecto |
| POST | /api/proyectos/:id/coeficiente | `superficiePermeable`, `superficieImpermeable` | RF-WEB-04 |
| POST | /api/proyectos/:id/intensidad | `periodoRetorno` | RF-WEB-05 |
| POST | /api/proyectos/:id/caudal | — | RF-WEB-06 |
| POST | /api/proyectos/:id/mitigacion | `tipoObra`, `capacidad`, `latitud`, `longitud` | RF-WEB-07 |
| POST | /api/proyectos/:id/reportes | `nombreArchivo`, `contenidoBase64` | RF-WEB-08 |
| GET | /api/reportes/:id/descargar | — | RF-WEB-08 |
| POST | /api/admin/login | `correo`, `contrasena` | RF-ADM-01 |
| GET | /api/admin/sesion | — | RF-ADM-01 |
| GET / POST | /api/admin/configuracion-inicial | `nombre`, `correo`, `contrasena`, `confirmacion` | Administrador inicial |
| GET | /api/admin/panel | — | RF-ADM-02 |
| GET / POST | /api/admin/tabla-maestra | `tipo` (Cp, Ci o intensidad), `idAlcaldia`, `periodo`, `valor` | RF-ADM-03 |
| GET | /api/admin/usuarios?buscar=texto | — | RF-ADM-05 |
| POST | /api/admin/usuarios | `nombre`, `correo`, `rol` | RF-ADM-04 |
| POST | /api/admin/usuarios/:id/rol | `rol` | RF-ADM-06 |
| POST | /api/admin/usuarios/:id/desactivar | — | RF-ADM-07 |
| POST | /api/admin/usuarios/:id/reactivar | — | Reactivar cuenta |

Las rutas de proyectos y reportes exigen sesión y solo operan sobre proyectos del usuario activo.

## Caso de prueba completo

Con los valores de `datos_prueba.sql` (Cp = 0.20, Ci = 0.90, intensidad de 10 años = 65 mm/h):

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
| Exportar PDF | — | Descarga del PDF y copia guardada en `reporte_pdf` |

### Mensajes de error que se pueden provocar

| Requerimiento | Cómo provocarlo | Mensaje |
|---|---|---|
| RF-WEB-01 | Contraseña incorrecta, correo inexistente, cuenta inactiva o formato inválido | El correo electrónico o la contraseña son incorrectos |
| RF-WEB-02 | Nombre vacío o sin alcaldía | El nombre del proyecto debe contener entre 1 y 100 caracteres y una alcaldía válida |
| Ubicación | Clic en el mapa fuera de la CDMX | Seleccione una ubicación dentro de los límites de la Ciudad de México |
| RF-WEB-03 | Historial sin proyectos / proyecto de otro usuario | El proyecto no fue encontrado o no existen registros disponibles |
| RF-WEB-04 | Dejar una superficie vacía | Debe registrar las superficies antes de calcular el coeficiente |
| RF-WEB-04 | Ap = 600000 y Ai = 600000 | Cada superficie debe estar entre 0.00 y 1,000,000.00 metros cuadrados y la superficie total entre 0.01 y 1,000,000.00 metros cuadrados |
| RF-WEB-05 | Consultar sin elegir período | Seleccione una alcaldía válida y un período de retorno permitido |
| RF-WEB-05 | Proyecto en Milpa Alta con 50 años (NULL a propósito) | No existe una intensidad de lluvia registrada para la alcaldía y el período de retorno seleccionados |
| RF-WEB-06 | Calcular caudal en un proyecto nuevo | Parámetros incompletos para el cálculo del caudal pico |
| RF-WEB-07 | Simular sin elegir obra | Seleccione un tipo de obra de mitigación pluvial |
| RF-WEB-07 | Capacidad 0 o 50000.01 | La capacidad de almacenamiento debe estar entre 0.01 y 50000.00 metros cúbicos |
| RF-WEB-07 | Simular antes de calcular el caudal | Debe calcular el caudal pico antes de simular la mitigación |
| RF-WEB-08 | Exportar sin caudal pico | Debe completar todos los cálculos antes de exportar |

## Notas

- `npm test` ejecuta las pruebas unitarias de validaciones y fórmulas (no requiere base de datos).
- Los valores de `datos_prueba.sql` son ilustrativos y deben sustituirse por los oficiales.
- Límites de alcaldías: INEGI, Marco Geoestadístico 2022, vía [PhantomInsights/mexico-geojson](https://github.com/PhantomInsights/mexico-geojson) (simplificados).
  Mapas base: © Esri, © OpenStreetMap.
