// Pruebas unitarias de validaciones y fórmulas (se ejecutan con: npm test).
const test = require('node:test');
const assert = require('node:assert');
const calc = require('../public/js/validaciones');

test('RF-WEB-01: formato de credenciales', () => {
  assert.ok(calc.credencialesConFormatoValido('ing@sehip.mx', 'Clave1234'));
  assert.ok(!calc.credencialesConFormatoValido('a@b', 'Clave1234'));            // correo sin dominio válido
  assert.ok(!calc.credencialesConFormatoValido('ing@sehip.mx', 'corta'));       // menos de 8
  assert.ok(!calc.credencialesConFormatoValido('ing@sehip.mx', '12345678901234567')); // más de 16
  assert.ok(!calc.credencialesConFormatoValido(`${'a'.repeat(45)}@x.com`, 'Clave1234')); // más de 50
});

test('RF-WEB-02: nombre del proyecto', () => {
  assert.ok(calc.nombreProyectoValido('Plaza Norte'));
  assert.ok(calc.nombreProyectoValido('x'.repeat(100)));
  assert.ok(!calc.nombreProyectoValido(''));
  assert.ok(!calc.nombreProyectoValido('   '));
  assert.ok(!calc.nombreProyectoValido('x'.repeat(101)));
});

test('RF-WEB-04: validación de superficies', () => {
  assert.strictEqual(calc.validarSuperficies('', '100').error, calc.MENSAJES.superficiesFaltantes);
  assert.strictEqual(calc.validarSuperficies('100', undefined).error, calc.MENSAJES.superficiesFaltantes);
  assert.strictEqual(calc.validarSuperficies('-1', '100').error, calc.MENSAJES.superficiesFueraDeRango);
  assert.strictEqual(calc.validarSuperficies('1000000.01', '0').error, calc.MENSAJES.superficiesFueraDeRango);
  assert.strictEqual(calc.validarSuperficies('600000', '600000').error, calc.MENSAJES.superficiesFueraDeRango);
  assert.strictEqual(calc.validarSuperficies('0', '0').error, calc.MENSAJES.superficiesFueraDeRango);
  assert.strictEqual(calc.validarSuperficies('10.123', '5').error, calc.MENSAJES.superficiesFueraDeRango);
  assert.strictEqual(calc.validarSuperficies('abc', '5').error, calc.MENSAJES.superficiesFueraDeRango);
  assert.deepStrictEqual(calc.validarSuperficies('0.1', '0.2'), { ap: 0.1, ai: 0.2, total: 0.3 });
  assert.deepStrictEqual(calc.validarSuperficies('0', '0.01'), { ap: 0, ai: 0.01, total: 0.01 });
});

test('RF-WEB-04: coeficiente ponderado', () => {
  // (0.20·6000 + 0.90·14000) / 20000 = 0.69
  assert.strictEqual(calc.calcularCoeficiente(0.20, 0.90, 6000, 14000), 0.69);
  assert.strictEqual(calc.calcularCoeficiente(0.20, 0.90, 1000, 0), 0.20);
  assert.strictEqual(calc.calcularCoeficiente(0.20, 0.90, 0, 1000), 0.90);
});

test('RF-WEB-05: períodos de retorno permitidos', () => {
  [2, 5, 10, 20, 50, '10'].forEach((p) => assert.ok(calc.periodoValido(p)));
  [0, 1, 3, 25, 100, '', 'x'].forEach((p) => assert.ok(!calc.periodoValido(p)));
});

test('RF-WEB-06: validación y cálculo del caudal pico', () => {
  assert.strictEqual(calc.validarParametrosCaudal(null, 65, 20000), calc.MENSAJES.parametrosIncompletos);
  assert.strictEqual(calc.validarParametrosCaudal(0.69, null, 20000), calc.MENSAJES.parametrosIncompletos);
  assert.strictEqual(calc.validarParametrosCaudal(0.69, 65, null), calc.MENSAJES.parametrosIncompletos);
  assert.strictEqual(calc.validarParametrosCaudal(0.99, 65, 20000), calc.MENSAJES.parametrosFueraDeRango);
  assert.strictEqual(calc.validarParametrosCaudal(0.69, 300, 20000), calc.MENSAJES.parametrosFueraDeRango);
  assert.strictEqual(calc.validarParametrosCaudal(0.69, 65, 20000), null);
  // 0.69 · 65 · 2 ha / 360 = 0.24917 -> 0.249
  assert.strictEqual(calc.calcularCaudalPico(0.69, 65, 20000), 0.249);
});

test('RF-WEB-07: capacidad de almacenamiento', () => {
  assert.strictEqual(calc.leerCapacidad('0.01'), 0.01);
  assert.strictEqual(calc.leerCapacidad('50000'), 50000);
  assert.strictEqual(calc.leerCapacidad('50000.00'), 50000);
  assert.strictEqual(calc.leerCapacidad('0'), null);
  assert.strictEqual(calc.leerCapacidad('50000.01'), null);
  assert.strictEqual(calc.leerCapacidad('-5'), null);
  assert.strictEqual(calc.leerCapacidad('1.234'), null);
  assert.strictEqual(calc.leerCapacidad(''), null);
  assert.ok(calc.tipoObraValido('Tanque de Tormenta'));
  assert.ok(!calc.tipoObraValido(''));
});

test('RF-WEB-07: simulación de mitigación', () => {
  const base = { caudalPico: 0.249, cp: 0.20, intensidad: 65, superficieM2: 20000 };

  // R = 300/3600 = 0.083333; Qmit = 0.166; Qperm = 0.2·65·2/360 = 0.072 -> excede
  const excede = calc.simularMitigacion({ ...base, capacidad: 300 });
  assert.strictEqual(excede.retencion, 0.083333);
  assert.strictEqual(excede.caudalAjustado, 0.166);
  assert.strictEqual(excede.caudalPermitido, 0.072);
  assert.strictEqual(excede.dentroDeCapacidad, false);
  assert.strictEqual(excede.mensaje, calc.MENSAJES.excedeCapacidad);

  // R = 700/3600 = 0.194444; Qmit = 0.055 <= 0.072 -> dentro
  const dentro = calc.simularMitigacion({ ...base, capacidad: 700 });
  assert.strictEqual(dentro.caudalAjustado, 0.055);
  assert.strictEqual(dentro.dentroDeCapacidad, true);
  assert.strictEqual(dentro.mensaje, calc.MENSAJES.dentroDeCapacidad);

  // La retención mayor que el caudal pico deja el caudal ajustado en 0.000
  const minimo = calc.simularMitigacion({ ...base, capacidad: 50000 });
  assert.strictEqual(minimo.caudalAjustado, 0);
});

test('RF-WEB-08: datos obligatorios del reporte', () => {
  const completo = {
    nombre: 'Plaza', idAlcaldia: 3, superficiePermeable: 6000, superficieImpermeable: 14000,
    superficieTotal: 20000, coeficiente: 0.69, intensidad: 65, periodoRetorno: 10, caudalPico: 0.249,
    latitud: 19.33285, longitud: -99.187317
  };
  assert.ok(calc.datosCompletosParaReporte(completo));
  assert.ok(!calc.datosCompletosParaReporte({ ...completo, caudalPico: null }));
  assert.ok(!calc.datosCompletosParaReporte({ ...completo, coeficiente: null }));
  assert.ok(!calc.datosCompletosParaReporte({ ...completo, latitud: null }));
  assert.ok(!calc.datosCompletosParaReporte(null));
});

test('Semáforo de impacto pluvial', () => {
  // Qpermitido = 0.072: verde hasta 0.072, amarillo hasta 0.108, rojo arriba de 0.108
  assert.strictEqual(calc.evaluarSemaforo(0.055, 0.072).nivel, 'verde');
  assert.strictEqual(calc.evaluarSemaforo(0.072, 0.072).nivel, 'verde');
  assert.strictEqual(calc.evaluarSemaforo(0.096, 0.072).nivel, 'amarillo');
  assert.strictEqual(calc.evaluarSemaforo(0.108, 0.072).nivel, 'amarillo');
  assert.strictEqual(calc.evaluarSemaforo(0.109, 0.072).nivel, 'rojo');
  assert.strictEqual(calc.evaluarSemaforo(0.249, 0.072).porcentaje, 346);
});

test('Capacidad necesaria para cambiar de nivel', () => {
  const limites = calc.limitesSemaforo(0.072);
  assert.strictEqual(calc.capacidadNecesaria(0.249, limites.verde), 637.2);
  assert.strictEqual(calc.capacidadNecesaria(0.249, limites.amarillo), 507.6);
  const base = { caudalPico: 0.249, cp: 0.20, intensidad: 65, superficieM2: 20000 };
  const verde = calc.simularMitigacion({ ...base, capacidad: 637.2 });
  assert.strictEqual(calc.evaluarSemaforo(verde.caudalAjustado, verde.caudalPermitido).nivel, 'verde');
});

test('Capacidad necesaria según la eficiencia de la ubicación', () => {
  const limites = calc.limitesSemaforo(0.072);
  const capacidad = calc.capacidadNecesaria(0.249, limites.verde, 0.75);
  assert.strictEqual(capacidad, 849.6);
  const base = { caudalPico: 0.249, cp: 0.20, intensidad: 65, superficieM2: 20000, eficiencia: 0.75 };
  const r = calc.simularMitigacion({ ...base, capacidad });
  assert.strictEqual(calc.evaluarSemaforo(r.caudalAjustado, r.caudalPermitido).nivel, 'verde');
  assert.strictEqual(calc.distanciaParaEficiencia(0.75, 100), 50);
  assert.strictEqual(calc.eficienciaPorUbicacion(calc.distanciaParaEficiencia(0.9, 102.1), 102.1), 0.9);
});

test('Ubicación del proyecto dentro de la CDMX', () => {
  const { alcaldiaEnPunto } = require('../public/js/limites-alcaldias');
  assert.strictEqual(alcaldiaEnPunto(19.4326, -99.1332), 'Cuauhtémoc');       // Zócalo
  assert.strictEqual(alcaldiaEnPunto(19.3324, -99.1870), 'Coyoacán');         // Ciudad Universitaria
  assert.strictEqual(alcaldiaEnPunto(19.4848, -99.1176), 'Gustavo A. Madero'); // Basílica
  assert.strictEqual(alcaldiaEnPunto(19.2826, -99.6557), null);               // Toluca
  assert.ok(calc.coordenadasValidas(19.4, -99.1));
  assert.ok(!calc.coordenadasValidas('', -99.1));
});

test('Zona afectada, huella del predio y eficiencia de la obra', () => {
  assert.strictEqual(calc.radioPredio(20000), 79.8);
  assert.strictEqual(calc.volumenExcedente(0.249, 0.072), 637.2);
  assert.strictEqual(calc.radioAfectacion(20000, 0.249, 0.072), 102.1);
  assert.strictEqual(calc.radioAfectacion(20000, 0.050, 0.072), 79.8); // sin excedente: solo el predio
  assert.strictEqual(calc.eficienciaPorUbicacion(0, 102.1), 1);
  assert.strictEqual(calc.eficienciaPorUbicacion(102.1, 102.1), 0.5);
  assert.strictEqual(calc.eficienciaPorUbicacion(110, 102.1), null);
});

test('Vigencia de una simulación guardada', () => {
  const proyecto = { caudalPico: 0.249, latitud: 19.486013, longitud: -99.118652 };
  const obra = { latitud: 19.486301, longitud: -99.118663 };
  const distancia = calc.distanciaMetros(proyecto.latitud, proyecto.longitud, obra.latitud, obra.longitud);
  const sim = { ...obra, caudalPico: 0.249, caudalPermitido: 0.072, distancia };
  assert.ok(calc.simulacionVigente(sim, proyecto, 0.072));
  assert.ok(!calc.simulacionVigente(sim, { ...proyecto, caudalPico: 0.3 }, 0.072));       // cambió el caudal
  assert.ok(!calc.simulacionVigente(sim, { ...proyecto, latitud: 19.49 }, 0.072));         // se movió el proyecto
});

test('RF-ADM-03: valores de la tabla maestra', () => {
  assert.deepStrictEqual(calc.validarValorParametro('Cp', '0.25'), { valor: 0.25 });
  assert.deepStrictEqual(calc.validarValorParametro('Ci', '0.95'), { valor: 0.95 });
  assert.strictEqual(calc.validarValorParametro('Cp', '0.96').error, calc.MENSAJES.valorFueraDeNorma);
  assert.strictEqual(calc.validarValorParametro('Cp', '-1').error, calc.MENSAJES.valorFueraDeNorma);
  assert.strictEqual(calc.validarValorParametro('Cp', '0.251').error, calc.MENSAJES.valorNoNumerico);
  assert.strictEqual(calc.validarValorParametro('Cp', '').error, calc.MENSAJES.valorNoNumerico);
  assert.strictEqual(calc.validarValorParametro('Cp', 'abc').error, calc.MENSAJES.valorNoNumerico);
  assert.deepStrictEqual(calc.validarValorParametro('intensidad', '250'), { valor: 250 });
  assert.strictEqual(calc.validarValorParametro('intensidad', '9.99').error, calc.MENSAJES.valorFueraDeNorma);
});

test('RF-ADM-04: datos de cuenta y contraseña temporal', () => {
  assert.ok(calc.datosCuentaValidos('Luis Pérez', 'luis@sehip.mx', 'Ingeniero Civil'));
  assert.ok(calc.datosCuentaValidos('Ana', 'ana@sehip.mx', 'Administrador del Sistema'));
  assert.ok(!calc.datosCuentaValidos('', 'luis@sehip.mx', 'Ingeniero Civil'));
  assert.ok(!calc.datosCuentaValidos('x'.repeat(101), 'luis@sehip.mx', 'Ingeniero Civil'));
  assert.ok(!calc.datosCuentaValidos('Luis', 'luis@', 'Ingeniero Civil'));
  assert.ok(!calc.datosCuentaValidos('Luis', 'luis@sehip.mx', 'Otro'));
  const crypto = require('crypto');
  for (let i = 0; i < 50; i += 1) {
    const c = calc.generarContrasenaTemporal((n) => Array.from(crypto.randomBytes(n)));
    assert.ok(c.length >= 8 && c.length <= 16);
    assert.ok(/[A-Z]/.test(c) && /[a-z]/.test(c) && /\d/.test(c));
  }
});

test('RF-ADM-05: búsqueda de usuarios', () => {
  const u = { nombre: 'Regina Cerón', correo: 'ingeniero@sehip.mx', rol: 'Ingeniero Civil' };
  assert.ok(calc.busquedaValida('a'));
  assert.ok(!calc.busquedaValida(''));
  assert.ok(!calc.busquedaValida('x'.repeat(51)));
  assert.ok(calc.usuarioCoincide(u, 'CERON'));        // sin mayúsculas ni acentos
  assert.ok(calc.usuarioCoincide(u, 'sehip.mx'));     // correo
  assert.ok(calc.usuarioCoincide(u, 'civil'));        // rol
  assert.ok(!calc.usuarioCoincide(u, 'administrador'));
});

test('Cuenta: reglas de la nueva contraseña', () => {
  assert.strictEqual(calc.validarNuevaContrasena('Nueva2026', 'Nueva2026', 'Anterior1'), null);
  assert.strictEqual(calc.validarNuevaContrasena('abcdefgh', 'abcdefgh'), calc.MENSAJES.contrasenaNuevaInvalida);
  assert.strictEqual(calc.validarNuevaContrasena('12345678', '12345678'), calc.MENSAJES.contrasenaNuevaInvalida);
  assert.strictEqual(calc.validarNuevaContrasena('Ab1', 'Ab1'), calc.MENSAJES.contrasenaNuevaInvalida);
  assert.strictEqual(calc.validarNuevaContrasena('Clave12345678901', 'Clave12345678901'), null);
  assert.strictEqual(calc.validarNuevaContrasena('Clave123456789012', 'Clave123456789012'), calc.MENSAJES.contrasenaNuevaInvalida);
  assert.strictEqual(calc.validarNuevaContrasena('Nueva2026', 'Nueva2027'), calc.MENSAJES.contrasenaNoCoincide);
  assert.strictEqual(calc.validarNuevaContrasena('Clave1234', 'Clave1234', 'Clave1234'), calc.MENSAJES.contrasenaRepetida);
});

test('Cuenta: código de recuperación de 6 dígitos', () => {
  const codigo = calc.generarCodigoRecuperacion((n) => Array.from({ length: n }, (_, i) => i * 37 + 5));
  assert.match(codigo, /^\d{6}$/);
  assert.ok(calc.codigoRecuperacionValido('004512'));
  assert.ok(!calc.codigoRecuperacionValido('4512'));
  assert.ok(!calc.codigoRecuperacionValido('12a456'));
  assert.strictEqual(calc.MINUTOS_VIGENCIA_CODIGO, 15);
  assert.strictEqual(calc.INTENTOS_MAXIMOS_CODIGO, 5);
});
