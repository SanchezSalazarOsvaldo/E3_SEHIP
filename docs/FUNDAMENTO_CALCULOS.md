# SEHIP · Fundamento de los cálculos

**Módulo 1: Simulación Hidrológica**

Este documento explica cada fórmula del simulador: qué calcula, de dónde sale, cómo se ve reflejada en la
aplicación y por qué importa para planear una construcción antes de que exista.

Todas las fórmulas están en `validaciones.js` y se usan igual en la interfaz, el servidor y el PDF.

> **Importante: qué es norma y qué es criterio del equipo.** El Método Racional y el coeficiente ponderado son
> métodos de ingeniería hidrológica de uso común. La zona afectada, la eficiencia por ubicación y los umbrales
> del semáforo son **simplificaciones propuestas para la simulación visual**; no son una norma oficial y sus
> parámetros se pueden ajustar (sección 12). Los valores de Cp, Ci e intensidades incluidos son de prueba.

---

## Ejemplo que se usa en todo el documento

Predio en la CDMX con 6,000 m² de superficie permeable (jardín, tierra) y 14,000 m² de superficie impermeable
proyectada (techos, concreto), período de retorno de 10 años. Valores de prueba: Cp = 0.20, Ci = 0.90,
I = 65 mm/h.

---

## 1. Superficie total

**Fórmula:** `A = Ap + Ai` (m²)

**Fundamento:** la lluvia que recibe el predio es proporcional a su área. Se separa en permeable (Ap), donde
parte del agua se infiltra, e impermeable (Ai), donde casi toda escurre.

**En la aplicación:** pestaña Cálculo → métrica *Superficie total*; en el mapa define la **huella del predio**
(círculo gris punteado, sección 9).

**Por qué importa:** es la base de todos los cálculos. La regla de 0.01 a 1,000,000 m² evita predios vacíos o
irreales.

**Ejemplo:** A = 6,000 + 14,000 = **20,000 m² (2 ha)**.

---

## 2. Coeficiente de escurrimiento ponderado (RF-WEB-04)

**Fórmula:** `C = (Cp · Ap + Ci · Ai) / (Ap + Ai)` — resultado con 2 decimales.

**Fundamento:** el coeficiente de escurrimiento indica qué fracción de la lluvia se convierte en
escurrimiento superficial (0 = toda se infiltra, 1 = toda escurre). Cada tipo de superficie tiene su propio
coeficiente: Cp para la permeable (bajo) y Ci para la impermeable (alto). Cuando un predio combina ambas, se
usa el **promedio ponderado por área**: cada coeficiente pesa según la proporción del predio que ocupa.

**En la aplicación:** métrica *Coeficiente C*. Si el ingeniero aumenta la superficie impermeable, C sube, el
caudal pico sube y la zona afectada del mapa crece (el círculo se anima).

**Por qué importa:** es la variable que el proyectista controla con el diseño. Cambiar concreto por jardín o
pavimento permeable reduce C y, con ello, el riesgo, aun antes de considerar obras de mitigación.

**Ejemplo:** C = (0.20 × 6,000 + 0.90 × 14,000) / 20,000 = 13,800 / 20,000 = **0.69**. El 69 % de la lluvia
escurre.

---

## 3. Intensidad de lluvia y período de retorno (RF-WEB-05)

**Dato:** `I` (mm/h) se toma de la tabla maestra normativa según **la alcaldía donde está el punto** y el
**período de retorno** (2, 5, 10, 20 o 50 años).

**Fundamento:** la intensidad de diseño proviene de las curvas intensidad–duración–frecuencia de cada zona.
El período de retorno T es el tiempo promedio entre lluvias de esa magnitud: una tormenta de T años tiene una
probabilidad de 1/T de presentarse o superarse en un año cualquiera (10 años → 10 % anual). A mayor T, mayor
intensidad y diseño más conservador.

**En la aplicación:** métrica *Intensidad*. Como depende de la alcaldía, **al mover el pin a otra alcaldía la
intensidad se actualiza** y, si el proyecto ya estaba calculado, el caudal y la zona afectada se recalculan.

**Por qué importa:** la misma construcción tiene distinto riesgo según dónde se ubique y qué tormenta se
considere; por eso el punto en el mapa es parte del cálculo y no solo una referencia visual.

**Ejemplo:** Gustavo A. Madero, T = 10 años → **I = 65 mm/h** (valor de prueba).

---

## 4. Conversión de área a hectáreas

**Fórmula:** `A(ha) = A(m²) / 10,000`

**Fundamento:** el Método Racional en la forma `Q = C·I·A/360` usa A en hectáreas (sección 5).

**Ejemplo:** 20,000 m² = **2 ha**.

---

## 5. Caudal pico por el Método Racional (RF-WEB-06)

**Fórmula:** `Q = C · I · A / 360` — Q en m³/s (3 decimales), I en mm/h, A en ha.

**Fundamento:** el Método Racional supone que, con una lluvia de intensidad constante que dura al menos el
tiempo de concentración del área (lo que tarda el agua en llegar desde el punto más lejano a la salida), el
caudal máximo es la lluvia que cae sobre el área multiplicada por la fracción que escurre:

```
Q = C × I × A
```

El 360 sale de convertir unidades:

```
I [mm/h] = I / 1,000 [m] / 3,600 [s]          A [ha] = A × 10,000 [m²]
Q = C × (I / 3,600,000) × (A × 10,000) = C × I × A / 360   [m³/s]
```

Es el método estándar para áreas urbanas pequeñas, como un predio o un desarrollo; en cuencas grandes se
prefieren otros métodos porque la lluvia deja de ser uniforme.

**En la aplicación:** métrica *Caudal pico* y aparición de la **zona afectada** en el mapa. El proyecto pasa a
estado *Calculado*. Después, cualquier cambio de superficies, intensidad o ubicación recalcula Q al momento.

**Por qué importa:** es el flujo máximo que el predio enviará a la calle o al drenaje en la tormenta de diseño.
Si supera lo que el sistema puede recibir, el agua se acumula: ahí empieza el encharcamiento.

**Ejemplo:** Q = 0.69 × 65 × 2 / 360 = 0.24917 → **0.249 m³/s** (249 litros por segundo).

---

## 6. Capacidad de descarga permitida

**Fórmula:** `Qpermitido = Cp · I · A / 360`

**Fundamento:** es el caudal que generaría el mismo predio **si toda su superficie fuera permeable**, es decir,
en su condición natural antes de construir. Se basa en el principio de “impacto hidrológico cero”, usado en
muchas normas de drenaje urbano: un desarrollo no debería descargar más agua que el terreno sin urbanizar,
porque el drenaje existente se dimensionó para esa condición.

**En la aplicación:** métrica *Descarga permitida*; es la referencia del semáforo y del panel del mapa.

**Por qué importa:** convierte el caudal en una medida de impacto: no se trata de cuánta agua sale, sino de
cuánta agua **adicional** provoca la construcción.

**Ejemplo:** Qpermitido = 0.20 × 65 × 2 / 360 = **0.072 m³/s**.

---

## 7. Semáforo de impacto pluvial

**Fórmula:** `Relación = Q / Qpermitido × 100 %`

| Nivel | Condición |
|---|---|
| 🟢 Riesgo bajo | Q ≤ 100 % de Qpermitido |
| 🟡 Riesgo medio | 100 % < Q ≤ 150 % |
| 🔴 Riesgo alto | Q > 150 % |

Los límites se redondean a 3 decimales, igual que los caudales, para que valores como 0.108 no cambien de
nivel por errores de punto flotante.

**Fundamento:** traduce el resultado técnico a una decisión rápida. Verde significa que el predio no excede
su condición natural. Los umbrales de 100 % y 150 % son **criterio del equipo** (configurables).

**En la aplicación:** color del pin, de la zona afectada, del chip en la barra del proyecto, de los semáforos
de Cálculo y Mitigación, y de la tabla de simulaciones. La barra del panel del mapa se llena según la relación.

**Ejemplo:** 0.249 / 0.072 = **346 % → 🔴 Riesgo alto**.

---

## 8. Volumen excedente

**Fórmula:** `Vexcedente = máx(0, Q − Qpermitido) × 3,600` (m³)

**Fundamento:** la diferencia entre el caudal real y el permitido es el agua que el entorno no puede desalojar.
Multiplicada por 3,600 s se obtiene el volumen acumulado si ese exceso se mantuviera durante una tormenta de
diseño de 1 hora. Es una **simplificación** (supone un exceso constante durante una hora) que da un orden de
magnitud claro.

**En la aplicación:** no se muestra solo; alimenta la zona afectada y la recomendación de capacidad.

**Ejemplo:** (0.249 − 0.072) × 3,600 = **637.2 m³**.

---

## 9. Huella del predio y zona afectada

**Fórmulas:**

```
Radio del predio      = √(A / π)
Área de zona afectada = A + Vexcedente / lámina        (lámina = 0.05 m)
Radio de zona         = √(Área de zona afectada / π)
```

**Fundamento:** para dibujar el impacto se representa el predio como un círculo de su misma área. El volumen
excedente se reparte alrededor como una lámina de agua de 5 cm, profundidad a partir de la cual un
encharcamiento ya afecta banquetas y circulación. Dividir el volumen entre la profundidad da el área inundada,
que se suma a la del predio. Es un **indicador visual de la magnitud del problema, no un modelo hidráulico**: no
considera pendientes, calles ni coladeras.

**En la aplicación:**

- Círculo gris punteado: huella del predio.
- Círculo de color: zona afectada. Si no hay exceso, coincide con el predio (el agua no sale del terreno).
- Al cambiar cualquier dato, el círculo se anima a su nuevo tamaño.

**Por qué importa:** permite **ver** el riesgo. Dos proyectos con el mismo color pueden tener zonas muy
distintas, y el ingeniero ve hasta dónde llegaría el agua alrededor de su obra.

**Ejemplo:**

- Radio del predio = √(20,000 / π) = **79.8 m**.
- Área de zona = 20,000 + 637.2 / 0.05 = 32,744 m² → radio = **102.1 m**.

---

## 10. Obra de mitigación (RF-WEB-07)

### 10.1 Eficiencia según la ubicación

**Fórmula:** `eficiencia = 1 − 0.5 × (d / Rzona)`, con `d` = distancia de la obra al proyecto (m) y `Rzona` =
radio de la zona afectada sin obra. Fuera de la zona no se permite colocarla.

**Fundamento:** una obra capta mejor el agua cuanto más cerca está de donde se genera el escurrimiento. Junto al
proyecto recibe prácticamente todo (100 %); en el borde de la zona solo una parte (50 %). La variación lineal es
**criterio del equipo** para que la ubicación tenga efecto y el ingeniero compare posiciones.

**Distancia:** se calcula con la fórmula de Haversine, que mide la distancia sobre la superficie de la Tierra
entre dos coordenadas:

```
a = sen²(Δlat/2) + cos(lat1) · cos(lat2) · sen²(Δlng/2)
d = 2 · 6,371,000 · atan2(√a, √(1 − a))
```

**En la aplicación:** al hacer clic dentro de la zona aparece la obra (icono morado según su tipo) unida al
proyecto por una línea con “distancia · eficiencia”. Fuera de la zona se muestra el mensaje de error.

### 10.2 Retención

**Fórmula:** `R = (capacidad / 3,600) × eficiencia` (m³/s, 6 decimales)

**Fundamento:** una obra con capacidad V (m³) que se llena durante la tormenta de 1 hora retira en promedio
V / 3,600 m³ por segundo del escurrimiento. La eficiencia reduce ese efecto según la ubicación.

### 10.3 Caudal ajustado

**Fórmula:** `Qmitigado = máx(0, Qpico − R)` (m³/s, 3 decimales)

**Fundamento:** el agua que la obra retiene ya no sale del predio. Nunca es negativo.

**En la aplicación:**

- Mientras se escribe la capacidad se muestra una **vista previa** (zona punteada, semáforo y panel) sin guardar.
- Al simular se guarda. El mapa muestra la zona sin obra (contorno punteado) y la zona con obra (relleno), con la
  reducción del área afectada en el panel.
- El resultado se compara con Qpermitido: “dentro de” o “excede la capacidad de descarga permitida”.

**Por qué importa:** es la parte de “cómo reaccionar”. El ingeniero prueba tipos, capacidades y ubicaciones hasta
llevar el semáforo a verde antes de construir.

**Ejemplo (Tanque de Tormenta de 700 m³ a 51 m del proyecto):**

| Paso | Cálculo | Resultado |
|---|---|---|
| Eficiencia | 1 − 0.5 × 51 / 102.1 | 0.75 (75 %) |
| Retención | 700 / 3,600 × 0.75 | 0.145833 m³/s |
| Caudal ajustado | 0.249 − 0.145833 | 0.103 m³/s |
| Relación | 0.103 / 0.072 | 143 % → 🟡 Riesgo medio |
| Zona con obra | 20,000 + (0.103 − 0.072) × 3,600 / 0.05 = 22,232 m² | radio 84.1 m |
| Reducción del área afectada | 1 − 22,232 / 32,744 | −32 % |

La misma obra **junto al proyecto** (eficiencia ≈ 100 %) baja el caudal a 0.055 m³/s → 🟢 Riesgo bajo.

---

## 11. Capacidad recomendada

**Fórmula:** `capacidad = ⌈(Qpico − Qobjetivo) × 3,600 / eficiencia⌉` (redondeada hacia arriba a 2 decimales),
con Qobjetivo = límite verde (100 %) o amarillo (150 %) de Qpermitido.

**Fundamento:** es la fórmula de retención despejada: qué capacidad haría que Qmitigado llegue al objetivo.
Como la retención es `capacidad / 3,600 × eficiencia`, una obra lejos del proyecto necesita más capacidad
(hasta el doble en el borde, donde la eficiencia es 50 %). Se redondea hacia arriba para garantizar el nivel.

**En la aplicación:** cuadro “¿Cómo reaccionar ante el encharcamiento?” en Mitigación. Mientras no hay obra en el
mapa se usa eficiencia 100 %; al colocarla, la capacidad se recalcula con la eficiencia de ese punto. El botón
**Usar** copia la capacidad al formulario y muestra la vista previa.

**Ejemplo:** junto al proyecto, para riesgo bajo (0.249 − 0.072) × 3,600 = **637.20 m³**; para riesgo medio
(0.249 − 0.108) × 3,600 = **507.60 m³**. Con la obra a la mitad del radio (eficiencia 75 %), para riesgo bajo
637.20 / 0.75 = **849.60 m³**.

**Anillos de eficiencia:** la distancia en la que la obra tiene una eficiencia dada es la fórmula 10.1 despejada,
`d = Rzona × (1 − eficiencia) / 0.5`. El mapa dibuja los anillos de 90 % (0.2 · Rzona) y 75 % (0.5 · Rzona);
el borde de la zona es el 50 %.

---

## 12. Vigencia de una simulación

**Regla:** una simulación guardada es vigente si el caudal pico, la descarga permitida y la distancia de la obra
al proyecto son los mismos que cuando se hizo (tolerancia de 1 m).

**Por qué importa:** si el ingeniero cambia el diseño o mueve el proyecto, una simulación anterior ya no describe
la realidad. Se conserva en el historial como “Desactualizada”, pero no se dibuja ni entra al reporte, para no
mostrar beneficios que ya no aplican.

---

## 13. Geografía: alcaldía de un punto

- **Punto en polígono (algoritmo de rayos):** se traza una línea imaginaria desde el punto; si cruza el borde de
  la alcaldía un número impar de veces, el punto está dentro. Así se detecta la alcaldía al hacer clic y se
  rechazan puntos fuera de la CDMX.
- **Centroide del polígono:** punto de equilibrio del área de la alcaldía; se usa para colocar el pin al
  elegirla en la lista.

Límites oficiales: INEGI, Marco Geoestadístico 2022 (simplificados a unos 25 m de precisión).

---

## 14. Redondeo

| Valor | Decimales | Motivo |
|---|---|---|
| Superficies, capacidad | 2 | Precisión de captura (RF-WEB-04, RF-WEB-07) |
| Coeficiente C | 2 | Precisión de las tablas de coeficientes |
| Caudales | 3 | Litros por segundo (0.001 m³/s = 1 L/s) |
| Retención | 6 | Evita que el redondeo borre el efecto de obras pequeñas |
| Radios | 1 | Precisión visual en el mapa |

`redondear()` suma `Number.EPSILON` antes de redondear para evitar errores de punto flotante (por ejemplo,
1.005 → 1.01).

---

## 15. Parámetros configurables

| Parámetro | Valor | Archivo / constante |
|---|---|---|
| Umbrales del semáforo | 100 % y 150 % | `UMBRALES_SEMAFORO` |
| Lámina de encharcamiento | 0.05 m | `LAMINA_ENCHARCAMIENTO` |
| Eficiencia en el borde de la zona | 50 % | `EFICIENCIA_EN_BORDE` |
| Duración de la tormenta de diseño (retención y volumen) | 3,600 s | Fórmulas de retención y volumen |
| Cp, Ci, intensidades | Valores de prueba | `datos.js` / tablas de la base de datos |
