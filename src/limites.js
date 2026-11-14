// Límites de solicitudes para proteger el servidor contra abusos: fuerza bruta de contraseñas,
// envío masivo de correos y saturación por exceso de peticiones.
// Cada contador cuenta las solicitudes de una clave (dirección IP, correo o usuario) dentro de una
// ventana de tiempo fija. Al superar el máximo, la clave queda bloqueada hasta que termina la ventana.
// Los contadores viven en la memoria del servidor y se reinician cuando el servidor se reinicia.
const { MENSAJES } = require('../public/js/validaciones');

const MINUTO = 60 * 1000;
const LIMPIEZA_CADA_MS = MINUTO;
const MAXIMO_CLAVES = 50000;   // tope de claves por contador para no agotar la memoria

const contadores = [];

class Contador {
  constructor(ventanaMs, maximo) {
    this.ventanaMs = ventanaMs;
    this.maximo = maximo;
    this.registros = new Map();   // clave → { conteo, inicio }
    contadores.push(this);
  }

  // Registro vigente de la clave o null si no existe o su ventana ya terminó.
  vigente(clave, ahora) {
    const registro = this.registros.get(clave);
    if (!registro || ahora - registro.inicio >= this.ventanaMs) return null;
    return registro;
  }

  // Segundos que faltan para que termine el bloqueo de la clave (0 si no está bloqueada).
  espera(clave) {
    const ahora = Date.now();
    const registro = this.vigente(clave, ahora);
    if (!registro || registro.conteo < this.maximo) return 0;
    return Math.ceil((registro.inicio + this.ventanaMs - ahora) / 1000);
  }

  // Cuenta una solicitud y devuelve los segundos de espera si con ella se superó el máximo (0 si no).
  registrar(clave) {
    const ahora = Date.now();
    const registro = this.vigente(clave, ahora);
    if (registro) {
      registro.conteo += 1;
      if (registro.conteo > this.maximo) {
        return Math.ceil((registro.inicio + this.ventanaMs - ahora) / 1000);
      }
      return 0;
    }
    if (this.registros.size >= MAXIMO_CLAVES) {
      this.limpiar();
      // Si sigue lleno se descarta la clave más antigua (un Map conserva el orden de inserción).
      if (this.registros.size >= MAXIMO_CLAVES) this.registros.delete(this.registros.keys().next().value);
    }
    this.registros.set(clave, { conteo: 1, inicio: ahora });
    return 0;
  }

  reiniciar(clave) {
    this.registros.delete(clave);
  }

  // Elimina los registros cuya ventana ya terminó.
  limpiar() {
    const ahora = Date.now();
    for (const [clave, registro] of this.registros) {
      if (ahora - registro.inicio >= this.ventanaMs) this.registros.delete(clave);
    }
  }
}

setInterval(() => contadores.forEach((c) => c.limpiar()), LIMPIEZA_CADA_MS).unref();

// Respuesta 429 (Too Many Requests). Retry-After indica en segundos cuándo se puede reintentar.
function responderLimite(res, segundos, mensaje = MENSAJES.demasiadasSolicitudes) {
  res.setHeader('Retry-After', String(segundos));
  return res.status(429).json({ error: mensaje, reintentarEn: segundos });
}

// Middleware que limita las solicitudes por clave (por defecto, la dirección IP del cliente).
function limitar({ ventanaMs, maximo, mensaje, clave = (req) => req.ip }) {
  const contador = new Contador(ventanaMs, maximo);
  return (req, res, next) => {
    const segundos = contador.registrar(clave(req));
    if (segundos > 0) return responderLimite(res, segundos, mensaje);
    next();
  };
}

// ---------- Límites del servidor ----------

// Todas las rutas /api: 300 solicitudes por minuto por dirección IP (protección contra saturación).
const limiteGeneral = limitar({ ventanaMs: MINUTO, maximo: 300 });

// Solicitudes que modifican datos (POST) de un usuario con sesión: 30 por minuto por cuenta.
const limiteEscrituraPorUsuario = limitar({
  ventanaMs: MINUTO,
  maximo: 30,
  clave: (req) => `usuario:${req.session.usuario.id}`
});

// Inicio de sesión (ambos módulos): 20 intentos por minuto por IP, exitosos o no.
const limiteInicioSesion = limitar({ ventanaMs: MINUTO, maximo: 20 });

// Solicitar código de recuperación: 5 por cada 15 minutos por IP.
const limiteSolicitudCodigo = limitar({ ventanaMs: 15 * MINUTO, maximo: 5 });

// Restablecer con código: 10 por cada 15 minutos por IP.
const limiteRestablecer = limitar({ ventanaMs: 15 * MINUTO, maximo: 10 });

// Configuración del administrador inicial: 5 por cada 15 minutos por IP.
const limiteConfiguracion = limitar({ ventanaMs: 15 * MINUTO, maximo: 5 });

// Crear cuentas (cada una envía un correo): 20 por hora por administrador.
const limiteCreacionCuentas = limitar({
  ventanaMs: 60 * MINUTO,
  maximo: 20,
  clave: (req) => `usuario:${req.session.usuario.id}`
});

// Códigos de recuperación enviados a un mismo correo: 3 por hora, sin importar desde dónde se pidan.
const codigosPorCorreo = new Contador(60 * MINUTO, 3);

// ---------- Intentos fallidos de contraseña ----------
// 5 fallos seguidos con un mismo correo lo bloquean 15 minutos (aunque cambie la IP), y 30 fallos desde
// una misma IP la bloquean 15 minutos (aunque pruebe con correos distintos). Un acceso correcto reinicia
// el contador del correo.
const fallosPorCuenta = new Contador(15 * MINUTO, 5);
const fallosPorIp = new Contador(15 * MINUTO, 30);

function esperaPorFallos(req, cuenta) {
  return Math.max(fallosPorCuenta.espera(cuenta), fallosPorIp.espera(req.ip));
}

function registrarFallo(req, cuenta) {
  fallosPorCuenta.registrar(cuenta);
  fallosPorIp.registrar(req.ip);
}

function limpiarFallos(cuenta) {
  fallosPorCuenta.reiniciar(cuenta);
}

module.exports = {
  Contador,
  responderLimite,
  limiteGeneral,
  limiteEscrituraPorUsuario,
  limiteInicioSesion,
  limiteSolicitudCodigo,
  limiteRestablecer,
  limiteConfiguracion,
  limiteCreacionCuentas,
  codigosPorCorreo,
  esperaPorFallos,
  registrarFallo,
  limpiarFallos
};
