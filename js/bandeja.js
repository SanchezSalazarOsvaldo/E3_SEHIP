// Bandeja de correo simulada (versión sin base de datos): muestra los correos guardados en localStorage.
const lista = document.getElementById('lista-correos');
const correos = leerLista(CLAVE_CORREOS).reverse();

if (correos.length === 0) {
  lista.innerHTML = '<li class="texto-vacio">No hay correos enviados.</li>';
} else {
  correos.forEach((c) => {
    const item = document.createElement('li');
    const encabezado = document.createElement('div');
    encabezado.className = 'correo-encabezado';
    encabezado.textContent = `Para: ${c.destinatario} · ${c.fechaHora}`;
    const asunto = document.createElement('strong');
    asunto.textContent = c.asunto;
    const cuerpo = document.createElement('pre');
    cuerpo.className = 'correo-cuerpo';
    cuerpo.textContent = c.cuerpo;
    item.append(encabezado, asunto, cuerpo);
    lista.appendChild(item);
  });
}
