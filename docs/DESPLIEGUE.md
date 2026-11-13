# SEHIP – Guía de despliegue en la nube (Supabase + Render + Vercel)

## 1. Arquitectura distribuida

```
                 HTTPS                      HTTPS (/api/...)                    TLS (puerto 5432)
 Navegador  ─────────────▶  VERCEL  ──────────────────────────▶  RENDER  ─────────────────────────▶  SUPABASE
 (usuario)                 Páginas, CSS, JS,                    Servidor Node.js + Express           PostgreSQL
                           mapa (carpeta public/)               (carpeta src/): reglas,              (tablas, trigger,
                                                                sesiones, correo, API REST            sesiones, PDF)
```

| Nodo | Plataforma | Qué contiene | Por qué ahí |
|---|---|---|---|
| Cliente | Navegador | HTML, CSS y JavaScript que se descargan de Vercel | — |
| Frontend | **Vercel** | Carpeta `public/` (archivos estáticos) | Red de distribución (CDN): entrega las páginas rápido desde el servidor más cercano. |
| Backend | **Render** | Servidor Node.js (`src/`) | Ejecuta un proceso de Node.js permanente, que es lo que necesita Express con sesiones. |
| Base de datos | **Supabase** | PostgreSQL (`base_de_datos/*.sql`) | PostgreSQL administrado y gratuito; también lo podrá usar la app móvil. |

Es un sistema **distribuido** porque sus partes corren en tres servidores distintos, de tres proveedores
distintos, y se comunican por la red. Vercel reenvía las peticiones `/api/...` a Render (archivo
`public/vercel.json`), así el navegador solo habla con una dirección y la cookie de sesión funciona sin
configuración adicional. Render también sirve las páginas por sí mismo, así que su dirección funciona sola si
Vercel no estuviera disponible.

## 2. Cifrado: qué es y cómo lo aplica SEHIP

**Cifrar** es transformar la información para que solo pueda leerla quien tiene la llave. En un sistema en la
nube se protege en tres momentos:

| Qué se protege | Riesgo sin protección | Cómo se protege en SEHIP | Dónde |
|---|---|---|---|
| **Datos en tránsito** entre navegador, Vercel y Render | Alguien en la misma red (wifi pública) lee contraseñas o cookies | **HTTPS (TLS)**: Vercel y Render emiten certificados automáticamente. El servidor redirige HTTP a HTTPS, envía **HSTS** (el navegador ya no intentará HTTP) y la cookie de sesión es **Secure** (solo viaja por HTTPS) y **HttpOnly** (JavaScript no puede leerla) | `src/server.js`, `public/vercel.json` |
| **Datos en tránsito** entre Render y Supabase | Se leen las consultas y resultados entre servidores | Conexión **TLS** a PostgreSQL (`ssl` en el pool). Con el certificado de Supabase (`BD_CERTIFICADO_CA`) además se verifica que el servidor sea realmente Supabase. En Supabase se activa *Enforce SSL* para rechazar conexiones sin cifrar | `src/db.js`, carpeta `certificados/` |
| **Datos en reposo** (discos de la base) | Robo o acceso al disco físico | Supabase cifra el almacenamiento con **AES-256** | Supabase (automático) |
| **Contraseñas y códigos de recuperación** | Si alguien obtiene la base, ve las contraseñas | **bcrypt**: hash de un solo sentido con *sal* (no se puede descifrar; para validar se vuelve a calcular y se compara) | `src/rutas/*.js` (`bcrypt.hash`, `bcrypt.compare`) |
| **Llaves y contraseñas del sistema** | Quedan públicas en GitHub | Variables de entorno (`.env` en local, panel *Environment* en Render). `.env` está en `.gitignore` | `.env.ejemplo`, `src/entorno.js` |
| **Acceso directo a las tablas** | Supabase publica una API REST de las tablas | **Row Level Security** activado sin políticas: la API pública no puede leer ni escribir; solo el servidor (dueño de las tablas) | Final de `sehip_base_de_datos.sql` |
| **Cookie de sesión** | Alguien la modifica para hacerse pasar por otro | La cookie solo lleva un identificador **firmado** con `SESION_SECRETO`; los datos de la sesión están en la tabla `sesion` | `src/server.js`, `src/almacen-sesiones.js` |

Diferencia importante para explicar: **cifrar** es reversible con la llave (TLS, AES-256); **hashear** (bcrypt)
no es reversible y por eso es lo correcto para contraseñas.

## 3. Antes de empezar

1. Cuentas gratuitas en **GitHub**, **Supabase** (supabase.com), **Render** (render.com), **Vercel** (vercel.com)
   y **Brevo** (brevo.com). En Render y Vercel conviene registrarse con la cuenta de GitHub.
2. El código en un repositorio de GitHub que contenga la carpeta `sehip-web-con-bd`. Render y Vercel se
   conectan a ese repositorio y vuelven a desplegar solos cada vez que alguien hace *push*.

## 4. Supabase (base de datos)

1. **New project**: nombre `sehip`, *Database Password* de al menos 16 caracteres **solo con letras y números**
   (guárdela; los símbolos rompen la cadena de conexión), región *East US (North Virginia)*, plan *Free*.
2. **Crear las tablas**: menú *SQL Editor* → *New query* → pegar todo `base_de_datos/sehip_base_de_datos.sql` →
   *Run*. Luego una nueva consulta con `base_de_datos/datos_prueba.sql` → *Run*.
   En *Table Editor* deben aparecer 10 tablas.
3. **Cadena de conexión**: botón **Connect** (arriba) → *Connection String* → tipo **Session pooler** → copiar
   la URI y cambiar `[YOUR-PASSWORD]` por la contraseña del paso 1:
   ```
   postgresql://postgres.abcdefghijklmnop:CONTRASENA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```
   Se usa el *Session pooler* porque funciona con IPv4 (Render no se conecta a la dirección directa, que es IPv6).
4. **Cifrado obligatorio**: *Project Settings* → *Database* → *SSL Configuration* → activar
   **Enforce SSL on incoming connections** (reinicia la base un par de minutos).
5. **Certificado**: en la misma sección, **Download certificate**. Guarde el archivo en la carpeta
   `certificados/` del proyecto (por ejemplo `certificados/prod-ca-2021.crt`) y súbalo al repositorio
   (es público, no es una contraseña).

> Un proyecto gratuito se pausa tras una semana sin uso. Se reactiva desde el panel de Supabase (*Restore*).

## 5. Render (servidor)

1. **New** → **Web Service** → elegir el repositorio de GitHub.
2. Configuración:

   | Campo | Valor |
   |---|---|
   | Name | `sehip-api` (define la dirección `https://sehip-api.onrender.com`) |
   | Region | *Virginia (US East)*, la más cercana a la base de Supabase |
   | Branch | `main` |
   | Root Directory | `sehip-web-con-bd` (la carpeta del proyecto dentro del repositorio) |
   | Runtime / Language | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |

3. **Environment Variables** (*Add Environment Variable*):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la cadena del paso 4.3 |
   | `BD_CERTIFICADO_CA` | `certificados/prod-ca-2021.crt` (el nombre del archivo que descargó) |
   | `SESION_SECRETO` | botón *Generate* (texto aleatorio) |
   | `NODE_ENV` | `production` |
   | `BREVO_API_KEY` | la llave de Brevo |
   | `CORREO_REMITENTE` | el correo verificado en Brevo |

4. **Advanced** → **Health Check Path**: `/api/salud`.
5. **Create Web Service**. En *Logs* debe aparecer:
   ```
   SEHIP en ejecución en el puerto 10000 (producción)
   Envío de correo: brevo
   ```
6. Abra `https://sehip-api.onrender.com`: la aplicación ya funciona completa desde Render.

> El plan gratuito se duerme tras 15 minutos sin uso y tarda cerca de un minuto en despertar. Antes de una
> demostración abra `https://sehip-api.onrender.com/api/salud` y espere a ver `{"estado":"ok"}`.

## 6. Vercel (frontend)

1. En `public/vercel.json` cambie `https://TU-SERVICIO.onrender.com` por la dirección real de Render, guarde y
   haga *commit* y *push*.
2. Vercel → **Add New** → **Project** → *Import* el repositorio.
3. Configuración:

   | Campo | Valor |
   |---|---|
   | Framework Preset | Other |
   | Root Directory | `sehip-web-con-bd/public` |
   | Build Command / Output Directory | vacíos (no hay compilación) |

4. **Deploy**. La dirección será del tipo `https://sehip-xxxx.vercel.app`. Esa es la que se comparte.

## 7. Primer uso en la nube

1. Despierte Render (`/api/salud`).
2. Abra `https://sehip-xxxx.vercel.app/admin.html`. Como la base no tiene administrador, aparece
   **Configuración inicial**: cree el administrador inicial (protegido).
3. En la pestaña **Usuarios** cree las cuentas de los integrantes y del equipo que hará las pruebas. A cada
   quien le llega su contraseña temporal por correo y al entrar la cambia.

## 8. Verificación

| Prueba | Resultado esperado |
|---|---|
| `https://sehip-api.onrender.com/api/salud` | `{"estado":"ok"}` |
| Abrir la dirección de Vercel con `http://` | Cambia sola a `https://` |
| Iniciar sesión como ingeniero, registrar un proyecto, calcular, simular y exportar el PDF | Todo funciona; el PDF aparece en el historial |
| Esperar 20 minutos (Render se duerme) y volver a entrar | La sesión y el historial de reportes siguen ahí (están en Supabase) |
| Crear una cuenta desde el panel | El correo con la contraseña temporal llega al buzón (revise spam) |
| Supabase → *Table Editor* → `sesion`, `reporte_pdf` | Se ven las sesiones abiertas y los PDF guardados |

## 9. Problemas comunes

| Síntoma (en los *Logs* de Render) | Causa y solución |
|---|---|
| `No fue posible conectar con PostgreSQL: password authentication failed` | Contraseña equivocada en `DATABASE_URL`. |
| `getaddrinfo ENOTFOUND` o `ENETUNREACH` | Se copió la conexión directa; use la de **Session pooler**. |
| `self-signed certificate in certificate chain` | El archivo de `BD_CERTIFICADO_CA` no es el de su proyecto. Descárguelo otra vez o quite la variable (la conexión sigue cifrada, sin verificar el certificado). |
| `ENOENT ... certificados/...` | El certificado no se subió al repositorio o el nombre no coincide. |
| `relation "usuario" does not exist` | No se ejecutó `sehip_base_de_datos.sql` en Supabase. |
| La página de Vercel carga pero el inicio de sesión dice “No fue posible conectar con el servidor” | `vercel.json` aún tiene `TU-SERVICIO` o Render está dormido. |
| `Envío de correo: archivo` en producción | Falta `BREVO_API_KEY` en Render. |
| La base no responde después de varios días | Supabase pausó el proyecto: *Restore* en su panel. |

## 10. Versión sin base de datos (opcional)

La carpeta `sehip-web-sin-bd` se puede publicar en Vercel como demostración sin servidor: *Add New* →
*Project* → mismo repositorio → *Root Directory* `sehip-web-sin-bd` → *Deploy*.
