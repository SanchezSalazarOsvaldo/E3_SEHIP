# SEHIP · Manual para desarrolladores

**Módulos web: Simulación Hidrológica (RF-WEB-01 a RF-WEB-08) y Administración del Sistema (RF-ADM-01 a RF-ADM-07)**

Sistema de Evaluación Hidrológica e Impacto Pluvial · Equipo 3

---

## 1. Propósito del módulo

SEHIP permite que un ingeniero civil **simule, antes de construir**, cuánto escurrimiento pluvial generará una
obra futura y qué tan grave sería el riesgo de encharcamiento o inundación en su entorno. Después puede probar
obras de mitigación (pozos, tanques, jardines de lluvia) y ver en el mapa cómo cambia el riesgo.

El flujo de trabajo del módulo es:

1. Iniciar sesión (RF-WEB-01).
2. Registrar un proyecto colocando su punto en el mapa (RF-WEB-02) o abrir uno del historial (RF-WEB-03).
3. Capturar superficies → coeficiente de escurrimiento (RF-WEB-04).
4. Elegir período de retorno → intensidad de lluvia normativa (RF-WEB-05).
5. Calcular el caudal pico con el Método Racional (RF-WEB-06). Aparece la **zona afectada** en el mapa.
6. Colocar una obra de mitigación dentro de la zona afectada y simularla (RF-WEB-07).
7. Exportar el reporte técnico en PDF (RF-WEB-08).

El fundamento de cada fórmula está en `FUNDAMENTO_CALCULOS.md`.

---

## 2. Dos versiones, un mismo frontend

| | Sin base de datos | Con base de datos |
|---|---|---|
| Carpeta | `sehip-web-sin-bd/` | `sehip-web-con-bd/` |
| Ejecución | Abrir `index.html` en el navegador | `npm start` y abrir `http://localhost:3000` |
| Datos | `localStorage` del navegador | MySQL 8 (`base_de_datos/sehip_base_de_datos.sql`) |
| Cuentas | `localStorage` (iniciales en `USUARIOS_INICIALES` de `js/datos.js`) | Tabla `usuario` + `scripts/crear_usuario.js` |
| Validación | JavaScript en el navegador | JavaScript en el navegador **y** en el servidor (mismo archivo) |
| PDF guardado | Data URI en `localStorage` | Archivo en `reportes/` + fila en `reporte_pdf` |

**Por qué así:** la interfaz (HTML, CSS, `panel.js`, `mapa.js`, `reporte.js`, `validaciones.js`) es idéntica
en ambas versiones. Lo único que cambia es `js/proyectos.js`, la **capa de datos**:

- Sin BD, cada función lee y escribe en `localStorage` y devuelve el resultado directamente.
- Con BD, cada función valida el formulario y hace `fetch` a la API.

Como `panel.js` llama a todas esas funciones con `await`, funciona igual con ambas (un `await` sobre un valor
normal simplemente lo devuelve). Así se puede presentar la versión sin servidor y migrar a MySQL sin tocar la
interfaz.

Todas las funciones de la capa de datos devuelven el mismo formato:

```js
{ ok: false, error: 'Mensaje oficial' }
{ ok: true, proyecto, simulacion, simulaciones, reportes, mensaje }
```

---

## 3. Estructura de archivos

```
sehip-web-sin-bd/                     sehip-web-con-bd/
├── index.html                        ├── package.json
├── panel.html                        ├── base_de_datos/
├── css/estilos.css                   │   ├── sehip_base_de_datos.sql
├── lib/                              │   └── datos_prueba.sql
│   ├── leaflet/                      ├── scripts/crear_usuario.js
│   └── jspdf.umd.min.js              ├── reportes/            (PDF guardados)
└── js/                               ├── src/
    ├── datos.js        (solo sin BD) │   ├── server.js
    ├── config-mapa.js                │   ├── db.js
    ├── limites-alcaldias.js          │   └── rutas/auth.js, proyectos.js
    ├── validaciones.js               ├── public/  (mismo frontend; sin datos.js)
    ├── proyectos.js    (distinto)    └── tests/validaciones.test.js
    ├── mapa.js
    ├── reporte.js
    ├── login.js
    └── panel.js
```

### Orden de carga de scripts en `panel.html`

El orden importa porque cada archivo usa funciones globales de los anteriores:

```
leaflet.js → jspdf → config-mapa.js → limites-alcaldias.js → (datos.js) → validaciones.js
→ proyectos.js → mapa.js → reporte.js → panel.js
```

---

## 4. Responsabilidad de cada archivo

### `js/validaciones.js` — reglas de negocio (fuente única)

Contiene **todos los mensajes oficiales** (`MENSAJES`), las validaciones de formularios y todas las fórmulas.
No toca el DOM ni el almacenamiento, por eso:

- el navegador lo carga como script normal;
- el servidor lo usa con `require('../../public/js/validaciones')` gracias a la línea final
  `if (typeof module !== 'undefined') module.exports = {...}`;
- las pruebas (`npm test`) lo prueban sin navegador.

| Grupo | Funciones |
|---|---|
| Validación de formularios | `credencialesConFormatoValido`, `nombreProyectoValido`, `validarSuperficies`, `periodoValido`, `validarParametrosCaudal`, `tipoObraValido`, `leerCapacidad`, `coordenadasValidas`, `datosCompletosParaReporte` |
| Método Racional | `calcularCoeficiente`, `calcularCaudalPico`, `simularMitigacion` |
| Semáforo | `UMBRALES_SEMAFORO`, `limitesSemaforo`, `evaluarSemaforo`, `capacidadNecesaria` (con eficiencia) |
| Simulación espacial | `distanciaMetros`, `volumenExcedente`, `radioAfectacion`, `areaZonaAfectada`, `radioPredio`, `eficienciaPorUbicacion`, `simulacionVigente` |
| Utilidades | `redondear`, `leerCantidad` |

**Por qué:** si una regla cambia (por ejemplo, el umbral del semáforo) se cambia en un solo lugar y la
interfaz, el servidor y el PDF quedan consistentes.

### `js/limites-alcaldias.js` — geografía

- `LIMITES_ALCALDIAS`: GeoJSON de las 16 alcaldías (INEGI, Marco Geoestadístico 2022, simplificado).
- `alcaldiaEnPunto(lat, lng)`: devuelve el nombre de la alcaldía que contiene el punto o `null` si está fuera
  de la CDMX (algoritmo de rayos).
- `centroAlcaldia(nombre)`: centroide del polígono; se usa cuando el usuario elige la alcaldía en la lista.

Se usa en el navegador (detectar la alcaldía al hacer clic) y en el servidor (verificar que nadie envíe un
punto falso).

### `js/config-mapa.js` — proveedores del mapa base

Leaflet **no usa llave (API key)**. Las calles se descargan como imágenes desde un proveedor; los
configurados (Esri y OpenStreetMap) no requieren llave. Si el primero falla, `mapa.js` pasa automáticamente al
siguiente. Para agregar otro proveedor basta con añadir un objeto `{ nombre, url, opciones }`.

### `js/proyectos.js` — capa de datos

| Función | Requerimiento | Sin BD | Con BD |
|---|---|---|---|
| `iniciarSesion`, `usuarioActivo`, `cerrarSesion` | RF-WEB-01 | `sessionStorage` + `USUARIOS` | `/api/login`, `/api/sesion`, `/api/logout` |
| `obtenerAlcaldias`, `obtenerCoeficientes` | catálogos | `datos.js` | `/api/alcaldias`, `/api/coeficientes` |
| `obtenerIntensidadesAlcaldia` | intensidades de una alcaldía (gráfica del paso 02) | `datos.js` | `/api/alcaldias/:id/intensidades` |
| `registrarProyecto` | RF-WEB-02 | `localStorage` | `POST /api/proyectos` |
| `moverProyecto` | ubicación | `localStorage` | `POST /api/proyectos/:id/ubicacion` |
| `listarProyectos`, `consultarProyecto` | RF-WEB-03 | `localStorage` | `GET /api/proyectos`, `/api/proyectos/:id` |
| `calcularCoeficienteProyecto` | RF-WEB-04 | `localStorage` | `POST .../coeficiente` |
| `consultarIntensidadProyecto` | RF-WEB-05 | `localStorage` | `POST .../intensidad` |
| `calcularCaudalProyecto` | RF-WEB-06 | `localStorage` | `POST .../caudal` |
| `simularMitigacionProyecto` | RF-WEB-07 | `localStorage` | `POST .../mitigacion` |
| `guardarReporte` | RF-WEB-08 | `localStorage` | `POST .../reportes` |

Reglas que aplica esta capa (y el servidor en la versión con BD):

- **Un proyecto solo es visible para su dueño** (`buscarProyectoPropio` / `cargarProyecto`).
- **Recálculo automático:** si un proyecto ya calculado cambia de superficies, intensidad o ubicación, el caudal
  pico se recalcula al momento (`actualizarCaudal` / `caudalActualizado`). Así el mapa siempre refleja los
  datos actuales. Si faltan datos, el caudal se borra y el estado vuelve a “En proceso”.
- **Mover el proyecto:** la alcaldía se detecta del nuevo punto y, si ya hay período de retorno, la intensidad
  se consulta para la nueva alcaldía. Si esa combinación no tiene intensidad, el movimiento se rechaza.
- Cada simulación guarda el **caudal pico base** con el que se hizo, para saber después si sigue vigente.

### `js/mapa.js` — dibujo de la simulación

Solo dibuja; no decide reglas. Mantiene **un único pin** y las capas de la simulación del proyecto activo.

| Capa | Qué representa | Estilo |
|---|---|---|
| Pin | Ubicación del proyecto (arrastrable en la pestaña Proyectos) | Gota con icono de edificio, color del semáforo |
| `predio` | Huella de la construcción (círculo con el área del predio) | Gris punteado |
| `zonaActual` | Zona afectada actual o vista previa | Relleno del color del semáforo |
| `zonaAntes` | Zona afectada sin obra, para comparar | Contorno punteado |
| `obra` + `linea` | Obra de mitigación y su distancia al proyecto | Icono morado por tipo y línea punteada |
| Panel | Datos de la simulación (medidor de riesgo, caudales, radios, reducción) | Recuadro en la esquina superior derecha |
| `guia` | Anillos de eficiencia 90 % y 75 % (solo en Mitigación) | Contorno morado punteado con etiquetas |
| Cursor | Distancia y eficiencia que tendría la obra en el punto del cursor (solo en Mitigación) | Etiqueta junto al cursor |
| Botón centrar | Vuelve a encuadrar la zona afectada, el pin o la CDMX | Debajo del zoom |

Funciones públicas: `iniciarMapa`, `mostrarPin`, `quitarPin`, `centrarEn`, `resaltarAlcaldia`,
`dibujarSimulacion`, `limpiarSimulacion`, `encuadrarZona`, `actualizarPanelMapa`, `ajustarMapa`,
`mostrarGuiaObra`, `ocultarGuiaObra`, `centrarSimulacion`.

Los círculos se **animan** al cambiar de radio (`animarRadio`) para que se note el efecto de cada cálculo, y se
mueven junto con el pin mientras se arrastra.

### `js/panel.js` — controlador de la interfaz

Guarda el estado de la pantalla (`estado`) y conecta formularios, pestañas, mapa y capa de datos.

- `modeloSimulacion()` es el corazón del simulador. A partir del proyecto activo construye tres escenarios:
  - `antes`: sin obra (caudal pico);
  - `despues`: con la última obra guardada **vigente**;
  - `previa`: con la obra que se está colocando (sin guardar), recalculada al escribir la capacidad.

  Cada escenario tiene caudal, evaluación del semáforo, radio y área de la zona afectada.
- `pintarTodo()` usa ese modelo para pintar la barra del proyecto, las métricas, los semáforos, la tabla de
  simulaciones, la lista del reporte y el mapa (`pintarMapa()`).
- Ayudas visuales (solo presentación; no guardan nada):
  - `pintarProgreso`: barra de avance de la pestaña Cálculo (coeficiente, intensidad, caudal, semáforo).
  - `pintarVistaCoeficiente`: barra permeable/impermeable y C calculado mientras se escriben las superficies.
  - `pintarGraficaIntensidad`: barras con la intensidad de los cinco períodos de la alcaldía; clic = elegir período.
  - `pintarDesarrolloCaudal`: fórmula del Método Racional con los valores sustituidos y su equivalencia en L/s.
  - `htmlMedidor`: barra de 0 % a 250 % de la descarga permitida con marcas para sin obra, con obra y vista previa.
  - `pintarRecomendacion`: capacidad para riesgo medio y bajo según la eficiencia de la obra, con botón **Usar**.
- Los clics en el mapa dependen de la pestaña (`alHacerClicEnMapa`):

| Pestaña | Sin proyecto activo | Con proyecto activo |
|---|---|---|
| Proyectos | Coloca el punto del proyecto nuevo | Mueve el proyecto activo |
| Cálculo / Reporte | — | — (solo visualización) |
| Mitigación | — | Coloca la obra (debe quedar dentro de la zona afectada) |

**Regla de un solo punto:** nunca se ven dos proyectos a la vez. Para registrar otro, el botón
**Nuevo proyecto** cierra el proyecto activo y deja el mapa libre. Solo en Mitigación coexisten dos puntos: el
proyecto y su obra.

**Vigencia de simulaciones:** una simulación guardada es vigente si se hizo con el mismo caudal pico, la misma
descarga permitida y la misma ubicación del proyecto (`simulacionVigente`). Si el proyecto cambió, la
simulación queda en la tabla como “Desactualizada” y no se dibuja ni entra al PDF.

### `js/reporte.js` — PDF (RF-WEB-08)

Genera el PDF con jsPDF en el navegador: datos generales, memoria descriptiva, tablas de cálculo, semáforo
antes/después y gráfica de caudales. Devuelve `{ nombreArchivo, dataUri, base64, tamanoBytes, documento }`.
Se usan unidades en texto plano (m2, m3/s) porque las fuentes básicas de jsPDF no dibujan bien los superíndices.

### Servidor (solo con BD)

- `src/server.js`: Express, sesión en memoria (`express-session`), archivos estáticos de `public/` y
  manejador de errores. `express.json({ limit: '15mb' })` permite recibir el PDF en base64.
- `src/db.js`: pool de conexiones `mysql2` con `decimalNumbers: true` (los DECIMAL llegan como número) y
  `dateStrings: true` (las fechas llegan como texto `YYYY-MM-DD`).
- `src/rutas/auth.js`: login, logout, sesión y el middleware `requiereSesion` (también verifica que la cuenta
  siga activa en cada petición).
- `src/rutas/proyectos.js`: rutas del módulo. Convierte las filas de MySQL (snake_case) al formato del
  navegador (camelCase) con `aProyecto`, `aSimulacion` y `aReporte`.

---

## 5. Modelo de datos

### Proyecto (formato del navegador)

| Campo | Tipo | Origen |
|---|---|---|
| `id`, `idUsuario`, `nombre`, `fechaCreacion`, `estado` | — | RF-WEB-02 |
| `idAlcaldia`, `alcaldia`, `latitud`, `longitud` | — | Punto en el mapa |
| `superficiePermeable`, `superficieImpermeable`, `superficieTotal`, `coeficiente` | m², m², m², adimensional | RF-WEB-04 |
| `periodoRetorno`, `intensidad` | años, mm/h | RF-WEB-05 |
| `caudalPico` | m³/s | RF-WEB-06 |

`estado` es `En proceso` o `Calculado`; la base de datos exige caudal pico cuando es `Calculado`.

### Simulación de mitigación

`tipoObra`, `capacidad` (m³), `caudalPico` (base, m³/s), `latitud`, `longitud`, `distancia` (m), `eficiencia`
(0.5–1), `retencion` (m³/s), `caudalAjustado`, `caudalPermitido` (m³/s), `dentroDeCapacidad`, `fechaHora`.

### Tablas MySQL que usa el módulo

`rol`, `usuario`, `alcaldia`, `coeficiente_normativo`, `intensidad_lluvia`, `proyecto`,
`simulacion_mitigacion`, `reporte_pdf`. Las restricciones `CHECK` y los triggers del script refuerzan las
mismas reglas que valida JavaScript (rango de superficies, coherencia de estado, administrador protegido).

> Si ya tenían creada la base de una versión anterior, vuelvan a ejecutar `sehip_base_de_datos.sql` (con la
> línea `DROP DATABASE` descomentada) y después `datos_prueba.sql`: esta versión agrega `latitud`, `longitud` y
> `caudal_pico` a las simulaciones.

---

## 6. API (versión con BD)

Todas las rutas, excepto login y sesión, exigen sesión iniciada; las de proyecto solo operan sobre proyectos
del usuario activo (si no, responden 404 con el mensaje oficial).

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/login` | `correo`, `contrasena` | `{ usuario }` o 401 |
| POST | `/api/logout` | — | `{ ok }` |
| GET | `/api/sesion` | — | `{ usuario }` o 401 |
| GET | `/api/alcaldias` | — | `{ alcaldias: [{ id, nombre }] }` |
| GET | `/api/coeficientes` | — | `{ coeficientes: { Cp, Ci } }` |
| GET | `/api/alcaldias/:id/intensidades` | — | `{ intensidades: { 2: 40, 5: 55, ... } }` (null = sin capturar) |
| GET | `/api/proyectos?pagina=n` | — | `{ proyectos, pagina, totalPaginas }` |
| POST | `/api/proyectos` | `nombre`, `idAlcaldia`, `latitud`, `longitud` | proyecto (201) |
| GET | `/api/proyectos/:id` | — | proyecto |
| POST | `/api/proyectos/:id/ubicacion` | `latitud`, `longitud` | proyecto |
| POST | `/api/proyectos/:id/coeficiente` | `superficiePermeable`, `superficieImpermeable` | proyecto |
| POST | `/api/proyectos/:id/intensidad` | `periodoRetorno` | proyecto |
| POST | `/api/proyectos/:id/caudal` | — | proyecto |
| POST | `/api/proyectos/:id/mitigacion` | `tipoObra`, `capacidad`, `latitud`, `longitud` | proyecto |
| POST | `/api/proyectos/:id/reportes` | `nombreArchivo`, `contenidoBase64` | proyecto |
| GET | `/api/reportes/:id/descargar` | — | archivo PDF |

“proyecto” significa `{ proyecto, simulacion, simulaciones, reportes, mensaje }`. Los errores siempre llegan
como `{ error: 'Mensaje oficial' }` con código 400, 401 o 404.

---

## 7. Validaciones y mensajes

| Dato | Regla | Mensaje |
|---|---|---|
| Correo / contraseña | 5–50 caracteres con formato de correo / 8–16 caracteres; cuenta activa y rol Ingeniero Civil | El correo electrónico o la contraseña son incorrectos |
| Nombre del proyecto | 1–100 caracteres (sin contar espacios de los extremos) y alcaldía del catálogo | El nombre del proyecto debe contener entre 1 y 100 caracteres y una alcaldía válida |
| Punto del proyecto | Dentro de la CDMX | Seleccione una ubicación dentro de los límites de la Ciudad de México |
| Superficies | Ambas capturadas; cada una 0–1,000,000 m² con hasta 2 decimales; total 0.01–1,000,000 m² | Debe registrar las superficies… / Cada superficie debe estar entre… |
| Período de retorno | 2, 5, 10, 20 o 50 años | Seleccione una alcaldía válida y un período de retorno permitido |
| Intensidad | Debe existir en la tabla maestra | No existe una intensidad de lluvia registrada… |
| Caudal | C, I y A existentes y en rango (C 0.05–0.95, I 10–250 mm/h, A 0.01–1,000,000 m²) | Parámetros incompletos… / Parámetros fuera de rango… |
| Obra | Tipo del catálogo; capacidad 0.01–50,000 m³ con hasta 2 decimales; caudal calculado; punto dentro de la zona afectada | Seleccione un tipo de obra… / La capacidad de almacenamiento debe estar entre… / Debe calcular el caudal pico… / La obra de mitigación debe colocarse dentro de la zona afectada |
| Reporte | Todos los datos del proyecto calculados; PDF de máximo 10 MB | Debe completar todos los cálculos antes de exportar / No fue posible generar el reporte técnico |

En la versión con BD, el navegador valida primero (respuesta inmediata) y el servidor vuelve a validar con
el mismo archivo, porque cualquier persona podría enviar peticiones directas a la API.

---

## 8. Seguridad

- Contraseñas con `bcrypt` (versión con BD); el login nunca revela si falló el correo o la contraseña.
- Sesión del lado del servidor con cookie `httpOnly`.
- Cada consulta filtra por `id_usuario` de la sesión: un ingeniero no puede abrir proyectos ajenos.
- Consultas parametrizadas (`?`) contra inyección SQL.
- Textos del usuario se escapan antes de insertarse como HTML (`escapar`).
- El servidor verifica que el archivo recibido sea realmente un PDF (`%PDF`) y que no exceda 10 MB.

La versión sin BD es para demostración: las cuentas están en `datos.js` en texto plano y los datos viven en el
navegador.

---

## 9. Pruebas

- **Unitarias** (con BD): `npm test` ejecuta `tests/validaciones.test.js` con el corredor de pruebas de Node:
  validaciones, fórmulas, semáforo, zona afectada, eficiencia, vigencia y detección de alcaldía.
- **Manual:** el README de cada versión tiene un caso completo con los resultados esperados y una tabla para
  provocar cada mensaje de error.

---

## 10. Cómo modificar

| Quiero… | Dónde |
|---|---|
| Cargar los valores normativos oficiales | Pestaña **Tabla maestra** del módulo de administración (RF-ADM-03) |
| Cambiar los umbrales del semáforo | `UMBRALES_SEMAFORO` en `validaciones.js` |
| Cambiar la lámina de encharcamiento | `LAMINA_ENCHARCAMIENTO` en `validaciones.js` |
| Cambiar la eficiencia en el borde de la zona | `EFICIENCIA_EN_BORDE` en `validaciones.js` |
| Agregar un tipo de obra | `TIPOS_OBRA` y `ICONOS_OBRA` (mapa), opción en `panel.html` y el `ENUM` de la tabla `simulacion_mitigacion` |
| Cambiar el mapa base | `PROVEEDORES_MAPA` en `config-mapa.js` |
| Agregar un ingeniero o administrador | Pestaña **Usuarios** del módulo de administración (RF-ADM-04) |

---

## 11. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| El mapa no muestra calles | Sin internet o proveedor caído; el mapa cambia solo de proveedor y se puede elegir otro con el botón de capas. Los límites y la simulación funcionan sin internet. |
| “API KEY REQUIRED” en el mapa | Es de CARTO (versión anterior). Esta versión ya no lo usa. |
| Panel en blanco en la versión con BD | Se abrió `panel.html` con doble clic; debe abrirse desde `http://localhost:3000`. |
| “No fue posible conectar con MySQL” | Usuario o contraseña incorrectos en `src/db.js`, o MySQL apagado. |
| El caudal no se calcula | Faltan coeficiente o intensidad (ver la lista del panel del mapa). |
| La simulación aparece “Desactualizada” | El proyecto cambió después de simular; se debe colocar y simular la obra de nuevo. |
| No aparecen proyectos de la versión anterior (sin BD) | Cambió el formato; las claves de `localStorage` ahora terminan en `_v3`. |
| Un administrador no puede entrar a `index.html` (o un ingeniero a `admin.html`) | Es correcto: cada módulo solo acepta su rol. |
| Al iniciar sesión en otra pestaña se cerró la del administrador (con BD) | La sesión es una cookie por navegador; para usar dos cuentas a la vez use otro navegador o una ventana privada. |
| La cuenta nueva no recibe correo (con BD) | En modo `archivo` el correo está en `correos_enviados/`; para correo real configure `smtp` en `src/correo.js`. |

---

## 12. Módulo de administración (RF-ADM-01 a RF-ADM-07)

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `admin.html` + `js/admin-login.js` | Acceso administrativo (RF-ADM-01) |
| `admin-panel.html` + `js/admin-panel.js` | Interfaz con las pestañas Panel de control, Tabla maestra y Usuarios; igual en ambas versiones |
| `js/administracion.js` | Capa de datos del módulo. Sin BD: opera sobre `localStorage`. Con BD: llama a `/api/admin/*` |
| `src/rutas/admin.js` (con BD) | Rutas del servidor y reglas de negocio |
| `src/correo.js` (con BD) | Envío de la contraseña temporal (modo `archivo` o `smtp`) |
| `bandeja.html` + `js/bandeja.js` (sin BD) | Bandeja de correo simulada |

Igual que en la simulación, `admin-panel.js` llama a la capa de datos con `await` y recibe siempre
`{ ok, error, estado, ... }`, donde `estado` es `sin-sesion` (regresa a `admin.html`) o `denegado`
(muestra “Acceso denegado: se requiere rol de administrador”).

### Roles y sesión

- Los roles son `Ingeniero Civil` y `Administrador del Sistema` (`ROLES` en `validaciones.js`).
- Cada módulo acepta solo su rol: el login de ingenieros rechaza administradores y viceversa, y las rutas
  del servidor responden 403 si el rol de la sesión no corresponde.
- El rol se guarda en la sesión al iniciarla; por eso un cambio de rol rige desde el siguiente inicio de
  sesión (RF-ADM-06).
- En cada petición se verifica que la cuenta siga activa: al desactivarla (RF-ADM-07) su sesión se cierra en
  la siguiente acción.

### Reglas por requerimiento

| RF | Regla implementada | Dónde |
|---|---|---|
| ADM-01 | Formato de correo y contraseña, rol Administrador del Sistema, contraseña correcta y cuenta activa; un solo mensaje para cualquier fallo | `iniciarSesionAdmin` / `POST /api/admin/login` |
| ADM-02 | Totales de `proyecto` y `simulacion_mitigacion` y puntos de `punto_critico` hasta la fecha y hora de consulta; mensaje si no hay incidencias | `obtenerPanelControl` / `GET /api/admin/panel` |
| ADM-03 | Cp y Ci de 0.05 a 0.95; intensidad de 10.00 a 250.00 mm/h; número con hasta 2 decimales; el valor se sobrescribe y no se recalculan proyectos | `validarValorParametro` + `actualizarParametro` |
| ADM-04 | Nombre de 1 a 100, correo válido y no repetido, rol válido; contraseña temporal de 12 caracteres cifrada; si el correo falla la cuenta se revierte | `datosCuentaValidos`, `generarContrasenaTemporal`, `crearCuenta` |
| ADM-05 | Texto de 1 a 50 caracteres; coincidencia parcial sin mayúsculas ni acentos en nombre, correo o rol; lista cuentas activas e inactivas | `busquedaValida`, `usuarioCoincide` |
| ADM-06 | El usuario existe, el rol es distinto, queda al menos un administrador activo; el administrador inicial no cambia de rol (trigger) | `modificarRol` / `POST /api/admin/usuarios/:id/rol` |
| ADM-07 | La cuenta está activa y no es la propia; el administrador inicial no se desactiva (trigger); el historial se conserva | `desactivarCuenta` / `POST /api/admin/usuarios/:id/desactivar` |

### Efecto en el módulo de simulación

La tabla maestra es la misma que usa el simulador: un nuevo Cp, Ci o intensidad se aplica a los cálculos que
se hagan a partir de ese momento (por ejemplo, al recalcular o mover un proyecto), mientras que los caudales ya
guardados no cambian. La descarga permitida y el semáforo se calculan con el Cp vigente.

## 13. Cuentas: contraseña temporal, cambio y recuperación de contraseña

### Archivos

| Archivo | Versión | Función |
|---|---|---|
| `contrasena.html` + `js/contrasena.js` | Ambas | Cambio de contraseña (voluntario u obligatorio). |
| `recuperar.html` + `js/recuperar.js` | Ambas | Recuperación en dos pasos. `?origen=admin` regresa a `admin.html`. |
| `js/cuenta.js` | Dos variantes | Capa de datos: `sesionCuenta`, `salirCuenta`, `cambiarContrasena`, `solicitarCodigoRecuperacion`, `restablecerContrasena`. Sin BD usa `datos.js`; con BD llama a la API. |
| `src/rutas/cuenta.js` | Con BD | `POST /api/contrasena`, `POST /api/recuperacion/solicitar`, `POST /api/recuperacion/restablecer`. |
| `src/rutas/admin.js` | Con BD | `GET/POST /api/admin/configuracion-inicial` (administrador inicial). |
| `src/correo.js` + `src/entorno.js` | Con BD | Envío por Brevo, SMTP o archivo según `.env`. |

### Reglas (validaciones.js)

- `validarNuevaContrasena(nueva, confirmacion, actual)`: 8 a 16 caracteres con letra y número (`contrasenaSegura`),
  confirmación igual y distinta de la actual.
- `generarCodigoRecuperacion(aleatorios)` y `codigoRecuperacionValido(codigo)`: código de 6 dígitos.
- `MINUTOS_VIGENCIA_CODIGO = 15`, `INTENTOS_MAXIMOS_CODIGO = 5`.

### Flujo de la contraseña temporal

1. RF-ADM-04 crea la cuenta con `debe_cambiar_contrasena = 1` y envía la temporal.
2. El inicio de sesión responde `usuario.debeCambiarContrasena = true` y `login.js`/`admin-login.js` llevan a `contrasena.html`.
3. `requiereSesion` y `requiereAdmin` usan `cuentaHabilitada()`: mientras la marca siga en 1 responden 403 con
   `estado: 'cambio-obligatorio'`; el navegador (`api()` y `revisarAcceso()`) redirige a `contrasena.html`.
4. `POST /api/contrasena` comprueba la actual con bcrypt, guarda la nueva y pone la marca en 0.

`GET /api/sesion` y `GET /api/admin/sesion` usan `sesionVigente()`: vuelven a leer `activo` y la marca desde la base,
así una cuenta desactivada pierde la sesión y la marca siempre está actualizada.

### Flujo de recuperación

1. `solicitar`: si el correo es de una cuenta activa, genera el código, guarda su hash bcrypt en
   `codigo_recuperacion_hash`, `codigo_expira = NOW() + 15 min`, `intentos_codigo = 0` y envía el correo. La respuesta
   es igual exista o no la cuenta (no revela correos registrados). Si el correo falla, borra el código y responde 502.
2. `restablecer`: el código debe existir, estar vigente (`codigo_expira > NOW()`) y tener menos de 5 intentos.
   Un código incorrecto suma un intento; uno correcto guarda la nueva contraseña, borra el código y quita la marca
   de contraseña temporal.

### Administrador inicial

`admin-login.js` consulta `estadoConfiguracionInicial()`. Si no hay ninguna cuenta con `protegido = 1`, muestra el
formulario de configuración en lugar del inicio de sesión; `configurarAdministradorInicial()` crea la cuenta
protegida (sin contraseña temporal) e inicia su sesión. Si ya existe, la ruta responde 409; el trigger de la base
también impide un segundo administrador protegido.

### Columnas nuevas de `usuario`

| Columna | Tipo | Uso |
|---|---|---|
| `debe_cambiar_contrasena` | TINYINT(1) | 1 mientras la contraseña sea temporal. |
| `codigo_recuperacion_hash` | VARCHAR(255) NULL | Hash bcrypt del código vigente. |
| `codigo_expira` | DATETIME NULL | Vencimiento del código. |
| `intentos_codigo` | TINYINT UNSIGNED | Intentos fallidos (máximo 5). |

`base_de_datos/actualizar_cuentas.sql` agrega estas columnas a una base creada con la versión anterior.
