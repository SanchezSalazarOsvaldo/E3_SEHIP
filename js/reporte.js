// RF-WEB-08: generación del reporte técnico en PDF con jsPDF.
// Contenido: datos generales, memoria descriptiva, tablas de cálculo y gráfica de caudales.

const PDF_COLORES = {
  primario: [11, 57, 84],
  agua: [0, 107, 120],
  verde: [63, 107, 34],
  celeste: [217, 240, 245],
  fondo: [244, 247, 248],
  texto: [11, 57, 84],
  suave: [74, 98, 114],
  borde: [220, 229, 232],
  rojo: [179, 38, 30]
};
const PDF_SEMAFORO = { verde: [63, 107, 34], amarillo: [224, 168, 0], rojo: [198, 40, 40] };
const PDF_MARGEN = 18;
const PDF_ANCHO = 210;
const PDF_ALTO = 297;

// Formato numérico con separador de miles (es-MX).
function pdfNumero(valor, decimales) {
  return Number(valor).toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

// Agrega una página nueva si el contenido siguiente no cabe; devuelve la posición vertical.
function pdfEspacio(doc, y, alto) {
  if (y + alto > PDF_ALTO - 20) {
    doc.addPage();
    return 20;
  }
  return y;
}

// espacioMinimo evita que el título quede solo al final de una página.
function pdfTitulo(doc, y, texto, espacioMinimo = 40) {
  y = pdfEspacio(doc, y, espacioMinimo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORES.primario);
  doc.text(texto, PDF_MARGEN, y);
  doc.setDrawColor(...PDF_COLORES.agua);
  doc.setLineWidth(0.6);
  doc.line(PDF_MARGEN, y + 2, PDF_MARGEN + 24, y + 2);
  return y + 9;
}

function pdfParrafo(doc, y, texto) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORES.texto);
  const lineas = doc.splitTextToSize(texto, PDF_ANCHO - PDF_MARGEN * 2);
  y = pdfEspacio(doc, y, lineas.length * 5);
  doc.text(lineas, PDF_MARGEN, y);
  return y + lineas.length * 5 + 3;
}

// Tabla con encabezado; anchos en milímetros; columnas numéricas alineadas a la derecha.
function pdfTabla(doc, y, encabezados, filas, anchos, columnasNumericas = []) {
  const altoFila = 7.5;
  y = pdfEspacio(doc, y, altoFila * Math.min(filas.length + 1, 4));

  const dibujarFila = (celdas, esEncabezado) => {
    let x = PDF_MARGEN;
    if (esEncabezado) {
      doc.setFillColor(...PDF_COLORES.primario);
      doc.rect(PDF_MARGEN, y, anchos.reduce((a, b) => a + b, 0), altoFila, 'F');
    }
    doc.setFont('helvetica', esEncabezado ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...(esEncabezado ? [255, 255, 255] : PDF_COLORES.texto));
    celdas.forEach((celda, i) => {
      const numerica = columnasNumericas.includes(i);
      const xTexto = numerica ? x + anchos[i] - 2.5 : x + 2.5;
      doc.text(String(celda), xTexto, y + 5, { align: numerica ? 'right' : 'left' });
      x += anchos[i];
    });
    if (!esEncabezado) {
      doc.setDrawColor(...PDF_COLORES.borde);
      doc.setLineWidth(0.2);
      doc.line(PDF_MARGEN, y + altoFila, x, y + altoFila);
    }
    y += altoFila;
  };

  dibujarFila(encabezados, true);
  filas.forEach((fila) => {
    // Si la fila no cabe, continúa en una página nueva repitiendo el encabezado.
    if (y + altoFila > PDF_ALTO - 20) {
      doc.addPage();
      y = 20;
      dibujarFila(encabezados, true);
    }
    dibujarFila(fila, false);
  });
  return y + 6;
}

// Gráfica de barras de caudales en m3/s.
function pdfGrafica(doc, y, barras) {
  const alto = 70;
  y = pdfEspacio(doc, y, alto + 22);
  const x0 = PDF_MARGEN + 14;
  const ancho = PDF_ANCHO - PDF_MARGEN * 2 - 20;
  const base = y + alto;
  const maximo = Math.max(...barras.map((b) => b.valor), 0.001) * 1.2;

  // Ejes y líneas guía
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORES.suave);
  for (let i = 0; i <= 4; i += 1) {
    const valor = (maximo / 4) * i;
    const yLinea = base - (alto / 4) * i;
    doc.setDrawColor(...PDF_COLORES.borde);
    doc.setLineWidth(0.2);
    doc.line(x0, yLinea, x0 + ancho, yLinea);
    doc.text(pdfNumero(valor, 3), x0 - 2, yLinea + 1, { align: 'right' });
  }
  doc.setDrawColor(...PDF_COLORES.suave);
  doc.setLineWidth(0.4);
  doc.line(x0, base, x0 + ancho, base);

  // Barras
  const espacio = ancho / barras.length;
  const anchoBarra = Math.min(32, espacio * 0.55);
  barras.forEach((barra, i) => {
    const altoBarra = (barra.valor / maximo) * alto;
    const xBarra = x0 + espacio * i + (espacio - anchoBarra) / 2;
    doc.setFillColor(...barra.color);
    doc.rect(xBarra, base - altoBarra, anchoBarra, altoBarra, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORES.texto);
    doc.text(`${pdfNumero(barra.valor, 3)} m3/s`, xBarra + anchoBarra / 2, base - altoBarra - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORES.suave);
    doc.text(barra.etiqueta, xBarra + anchoBarra / 2, base + 5, { align: 'center' });
  });
  return base + 14;
}

// Tabla del semáforo: escenario, caudal, relación con lo permitido y nivel con su color.
function pdfSemaforo(doc, y, filas, caudalPermitido) {
  const anchos = [70, 30, 30, 44];
  const yInicio = pdfTabla(doc, y, ['Escenario', 'Caudal (m3/s)', 'Relación', 'Nivel de riesgo'],
    filas.map(([escenario, caudal, evaluacion]) => [
      escenario, pdfNumero(caudal, 3), `${evaluacion.porcentaje ?? '-'} %`, `      ${evaluacion.etiqueta}`
    ]), anchos, [1, 2]);
  // Círculo de color en la columna de nivel de cada fila (filas de 7.5 mm después del encabezado).
  const xCirculo = PDF_MARGEN + anchos[0] + anchos[1] + anchos[2] + 4.5;
  filas.forEach(([, , evaluacion], i) => {
    const yFila = yInicio - 6 - 7.5 * (filas.length - i) + 3.75;
    doc.setFillColor(...PDF_SEMAFORO[evaluacion.nivel]);
    doc.circle(xCirculo, yFila, 2, 'F');
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORES.suave);
  doc.text(`Descarga permitida: ${pdfNumero(caudalPermitido, 3)} m3/s. Verde <= 100 %, amarillo <= 150 %, rojo > 150 %.`,
    PDF_MARGEN, yInicio - 2);
  return yInicio + 4;
}

// Barra de 0 % a 250 % de la descarga permitida con los tramos del semáforo y una marca por escenario.
function pdfMedidor(doc, y, marcas) {
  y = pdfEspacio(doc, y, 26);
  const escala = 250;
  const ancho = PDF_ANCHO - 2 * PDF_MARGEN;
  const x = (porcentaje) => PDF_MARGEN + ancho * Math.min(1, Math.max(0, (porcentaje ?? escala) / escala));
  const tramos = [['verde', 0, 100], ['amarillo', 100, 150], ['rojo', 150, escala]];
  tramos.forEach(([nivel, desde, hasta]) => {
    doc.setFillColor(...PDF_SEMAFORO[nivel]);
    doc.rect(x(desde), y, x(hasta) - x(desde), 4, 'F');
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORES.suave);
  [[0, '0 %', 'left'], [100, '100 %', 'center'], [150, '150 %', 'center'], [escala, `${escala} %+`, 'right']]
    .forEach(([valor, texto, align]) => doc.text(texto, x(valor), y + 8, { align }));
  marcas.forEach((m) => {
    doc.setFillColor(...m.color);
    doc.setDrawColor(255, 255, 255);
    doc.rect(x(m.porcentaje) - 1, y - 2, 2, 8, 'FD');
  });
  let xLeyenda = PDF_MARGEN;
  doc.setFontSize(8.5);
  marcas.forEach((m) => {
    doc.setFillColor(...m.color);
    doc.rect(xLeyenda, y + 11.2, 2, 3.6, 'F');
    doc.setTextColor(...PDF_COLORES.texto);
    const texto = `${m.etiqueta}: ${m.porcentaje ?? '-'} % de la descarga permitida`;
    doc.text(texto, xLeyenda + 4, y + 14);
    xLeyenda += doc.getTextWidth(texto) + 12;
  });
  return y + 26;
}

// Genera el reporte. datos = { proyecto, simulacion, coeficientes: { Cp, Ci }, usuario }.
// Devuelve { nombreArchivo, dataUri, base64, tamanoBytes, documento }.
function generarReportePDF(datos) {
  const { proyecto: p, simulacion: s, coeficientes, usuario } = datos;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fechaEmision = fechaLocalTexto();
  const hectareas = p.superficieTotal / 10000;
  const caudalPermitido = calcularCaudalPico(coeficientes.Cp, p.intensidad, p.superficieTotal);
  const semaforoAntes = evaluarSemaforo(p.caudalPico, caudalPermitido);
  const semaforoDespues = s ? evaluarSemaforo(s.caudalAjustado, s.caudalPermitido) : null;
  const radioAntes = radioAfectacion(p.superficieTotal, p.caudalPico, caudalPermitido);
  const radioDespues = s ? radioAfectacion(p.superficieTotal, s.caudalAjustado, s.caudalPermitido) : null;

  // Encabezado
  doc.setFillColor(...PDF_COLORES.primario);
  doc.rect(0, 0, PDF_ANCHO, 34, 'F');
  doc.setFillColor(...PDF_COLORES.agua);
  doc.rect(0, 34, PDF_ANCHO, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('SEHIP', PDF_MARGEN, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Sistema de Evaluación Hidrológica e Impacto Pluvial', PDF_MARGEN, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Reporte técnico de evaluación hidrológica', PDF_ANCHO - PDF_MARGEN, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${fechaEmision}`, PDF_ANCHO - PDF_MARGEN, 22, { align: 'right' });

  let y = 48;

  // Datos generales
  y = pdfTitulo(doc, y, 'Datos generales del proyecto');
  y = pdfTabla(doc, y, ['Concepto', 'Valor'], [
    ['Nombre del proyecto', p.nombre],
    ['Identificador', p.id],
    ['Alcaldía', p.alcaldia],
    ['Ubicación (latitud, longitud)', `${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)}`],
    ['Fecha de creación', p.fechaCreacion],
    ['Fecha de emisión', fechaEmision],
    ['Estado', p.estado],
    ['Autor', `${usuario.nombre} (${usuario.correo})`]
  ], [60, 114]);

  // Memoria descriptiva
  y = pdfTitulo(doc, y, '1. Memoria descriptiva');
  y = pdfParrafo(doc, y,
    `El proyecto "${p.nombre}" se ubica en la alcaldía ${p.alcaldia}, Ciudad de México. El predio tiene una ` +
    `superficie permeable de ${pdfNumero(p.superficiePermeable, 2)} m2 y una superficie impermeable proyectada de ` +
    `${pdfNumero(p.superficieImpermeable, 2)} m2, con una superficie total de ${pdfNumero(p.superficieTotal, 2)} m2 ` +
    `(${pdfNumero(hectareas, 4)} ha).`);
  y = pdfParrafo(doc, y,
    `El coeficiente de escurrimiento ponderado se obtuvo con C = (Cp x Ap + Ci x Ai) / (Ap + Ai), usando los ` +
    `coeficientes de la tabla maestra normativa Cp = ${pdfNumero(coeficientes.Cp, 2)} y Ci = ${pdfNumero(coeficientes.Ci, 2)}, ` +
    `de lo que resulta C = ${pdfNumero(p.coeficiente, 2)}. La intensidad de lluvia normativa para un período de retorno de ` +
    `${p.periodoRetorno} años en la alcaldía es I = ${pdfNumero(p.intensidad, 2)} mm/h.`);
  y = pdfParrafo(doc, y,
    `El caudal pico se calculó con el Método Racional, Q = C x I x A / 360, con A en hectáreas, obteniendo ` +
    `Q = ${pdfNumero(p.caudalPico, 3)} m3/s. La capacidad de descarga permitida, calculada como el caudal del predio con ` +
    `toda su superficie permeable (Qpermitido = Cp x I x A / 360), es de ${pdfNumero(caudalPermitido, 3)} m3/s.`);
  if (s) {
    y = pdfParrafo(doc, y,
      `Se simuló un(a) ${s.tipoObra} con capacidad de almacenamiento de ${pdfNumero(s.capacidad, 2)} m3, ubicada a ` +
      `${pdfNumero(s.distancia, 1)} m del proyecto dentro de la zona afectada (eficiencia ${Math.round(s.eficiencia * 100)} %). ` +
      `La retención es R = capacidad / 3,600 x eficiencia = ${pdfNumero(s.retencion, 6)} m3/s y el caudal ajustado Qmitigado = Qpico - R = ` +
      `${pdfNumero(s.caudalAjustado, 3)} m3/s, que ${s.dentroDeCapacidad ? 'está dentro de' : 'excede'} la capacidad de ` +
      'descarga permitida.');
  } else {
    y = pdfParrafo(doc, y, 'El proyecto no cuenta con simulaciones de obras de mitigación pluvial guardadas.');
  }
  y = pdfParrafo(doc, y,
    `Semáforo de impacto pluvial: sin obra de mitigación el proyecto presenta ${semaforoAntes.etiqueta.toLowerCase()} ` +
    `(${semaforoAntes.porcentaje ?? '-'} % de la descarga permitida)` +
    (semaforoDespues
      ? `; con la obra simulada presenta ${semaforoDespues.etiqueta.toLowerCase()} (${semaforoDespues.porcentaje ?? '-'} %).`
      : '.') +
    ' Criterio: verde hasta 100 %, amarillo hasta 150 % y rojo por encima de 150 % de la descarga permitida.' +
    ` La zona afectada (predio más el volumen excedente de 1 hora repartido en una lámina de 5 cm) tiene un radio de ` +
    `${pdfNumero(radioAntes, 1)} m sin obra` + (s ? ` y de ${pdfNumero(radioDespues, 1)} m con la obra.` : '.'));

  // Tablas de cálculo
  y = pdfTitulo(doc, y, '2. Tablas de cálculo');
  y = pdfTabla(doc, y, ['Dato de entrada', 'Símbolo', 'Valor', 'Unidad'], [
    ['Superficie permeable', 'Ap', pdfNumero(p.superficiePermeable, 2), 'm2'],
    ['Superficie impermeable proyectada', 'Ai', pdfNumero(p.superficieImpermeable, 2), 'm2'],
    ['Superficie total', 'A', pdfNumero(p.superficieTotal, 2), 'm2'],
    ['Superficie total en hectáreas', 'A', pdfNumero(hectareas, 4), 'ha'],
    ['Coeficiente de superficie permeable', 'Cp', pdfNumero(coeficientes.Cp, 2), '-'],
    ['Coeficiente de superficie impermeable', 'Ci', pdfNumero(coeficientes.Ci, 2), '-'],
    ['Período de retorno', 'Tr', p.periodoRetorno, 'años'],
    ['Intensidad de lluvia', 'I', pdfNumero(p.intensidad, 2), 'mm/h']
  ], [78, 22, 44, 30], [2]);

  y = pdfTabla(doc, y, ['Resultado', 'Fórmula', 'Valor', 'Unidad'], [
    ['Coeficiente de escurrimiento', '(Cp x Ap + Ci x Ai) / (Ap + Ai)', pdfNumero(p.coeficiente, 2), '-'],
    ['Caudal pico', 'C x I x A / 360', pdfNumero(p.caudalPico, 3), 'm3/s'],
    ['Capacidad de descarga permitida', 'Cp x I x A / 360', pdfNumero(caudalPermitido, 3), 'm3/s']
  ], [56, 58, 32, 28], [2]);

  if (s) {
    y = pdfTabla(doc, y, ['Obra de mitigación', 'Valor'], [
      ['Tipo de obra', s.tipoObra],
      ['Capacidad de almacenamiento', `${pdfNumero(s.capacidad, 2)} m3`],
      ['Ubicación de la obra (latitud, longitud)', `${s.latitud.toFixed(6)}, ${s.longitud.toFixed(6)}`],
      ['Distancia al proyecto', `${pdfNumero(s.distancia, 1)} m`],
      ['Eficiencia por ubicación', `${Math.round(s.eficiencia * 100)} %`],
      ['Retención (R = capacidad / 3,600 x eficiencia)', `${pdfNumero(s.retencion, 6)} m3/s`],
      ['Caudal ajustado (Qpico - R)', `${pdfNumero(s.caudalAjustado, 3)} m3/s`],
      ['Resultado', s.dentroDeCapacidad ? 'Dentro de la capacidad permitida' : 'Excede la capacidad permitida'],
      ['Fecha y hora de la simulación', s.fechaHora]
    ], [90, 84]);
  }

  // Semáforo de impacto pluvial
  y = pdfTitulo(doc, y, '3. Semáforo de impacto pluvial', 75);
  const filasSemaforo = [['Sin obra de mitigación', p.caudalPico, semaforoAntes]];
  if (s) filasSemaforo.push([`Con ${s.tipoObra} (${pdfNumero(s.capacidad, 2)} m3)`, s.caudalAjustado, semaforoDespues]);
  y = pdfSemaforo(doc, y, filasSemaforo, caudalPermitido);
  const marcas = [{ etiqueta: 'Sin obra', porcentaje: semaforoAntes.porcentaje, color: PDF_COLORES.primario }];
  if (s) marcas.push({ etiqueta: 'Con la obra', porcentaje: semaforoDespues.porcentaje, color: [106, 27, 154] });
  y = pdfMedidor(doc, y + 2, marcas);

  // Gráfica
  y = pdfTitulo(doc, y, '4. Gráfica de caudales', 110);
  const barras = [{ etiqueta: 'Caudal pico', valor: p.caudalPico, color: PDF_COLORES.primario }];
  if (s) barras.push({ etiqueta: 'Caudal ajustado', valor: s.caudalAjustado, color: PDF_COLORES.agua });
  barras.push({ etiqueta: 'Descarga permitida', valor: caudalPermitido, color: PDF_COLORES.verde });
  pdfGrafica(doc, y, barras);

  // Pie de página en todas las hojas
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORES.suave);
    doc.text(`SEHIP - Reporte técnico - Proyecto ${p.id}`, PDF_MARGEN, PDF_ALTO - 10);
    doc.text(`Página ${i} de ${totalPaginas}`, PDF_ANCHO - PDF_MARGEN, PDF_ALTO - 10, { align: 'right' });
  }

  const dataUri = doc.output('datauristring');
  return {
    nombreArchivo: `SEHIP_Reporte_Proyecto_${p.id}_${fechaEmision}.pdf`,
    dataUri,
    base64: dataUri.split(',')[1],
    tamanoBytes: doc.output('arraybuffer').byteLength,
    documento: doc
  };
}

// Fecha local en formato YYYY-MM-DD.
function fechaLocalTexto() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
