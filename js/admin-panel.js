// Panel del Administrador del Sistema: panel de control (RF-ADM-02), tabla maestra (RF-ADM-03) y
// gestión de usuarios (RF-ADM-04 a RF-ADM-07). Las funciones de js/administracion.js se usan con await
// para que el panel funcione igual con almacenamiento local o con un servidor.

const estadoAdmin = {
  usuario: null,
  tabla: null,          // tabla maestra vigente
  filtro: null,         // texto de búsqueda aplicado en la lista de usuarios
  mapa: null,
  capasIncidencias: null
};

const $ = (id) => document.getElementById(id);

// ---------- Utilidades ----------

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function numero(valor, decimales) {
  if (valor === null || valor === undefined) return null;
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function mostrarMensaje(idContenedor, tipo, texto) {
  const iconos = { error: 'i-triangulo', exito: 'i-check', info: 'i-info' };
  $(idContenedor).innerHTML = `
    <div class="alerta alerta-${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">
      <svg class="icono"><use href="#${iconos[tipo]}"/></svg>
      <span>${escapar(texto)}</span>
    </div>`;
}

let temporizadorSnackbar;
function snackbar(texto) {
  const caja = $('snackbar');
  caja.querySelector('span').textContent = texto;
  caja.classList.remove('oculto');
  clearTimeout(temporizadorSnackbar);
  temporizadorSnackbar = setTimeout(() => caja.classList.add('oculto'), 4000);
}

// Muestra la pantalla de acceso denegado cuando una operación responde que no hay rol de administrador.
function revisarAcceso(resultado) {
  if (resultado.estado === 'sin-sesion') {
    window.location.href = 'admin.html';
    return false;
  }
  if (!resultado.ok && resultado.error === MENSAJES.accesoDenegado) {
    mostrarAccesoDenegado();
    return false;
  }
  return true;
}

function mostrarAccesoDenegado() {
  $('contenido-admin').classList.add('oculto');
  $('acceso-denegado').classList.remove('oculto');
  $('texto-denegado').textContent = MENSAJES.accesoDenegado;
}

// ---------- Pestañas ----------

function mostrarPestana(nombre) {
  document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b.dataset.pestana === nombre));
  document.querySelectorAll('.panel-pestana').forEach((p) => p.classList.toggle('oculto', p.id !== `pestana-${nombre}`));
  if (nombre === 'panel') cargarPanel();
  if (nombre === 'tabla') cargarTabla();
  if (nombre === 'usuarios') cargarUsuarios(estadoAdmin.filtro);
}

// ---------- RF-ADM-02: panel de control ----------

function iniciarMapaIncidencias() {
  const mapa = L.map('mapa-incidencias', { minZoom: 9, maxZoom: 18 });
  const capas = {};
  PROVEEDORES_MAPA.forEach((p) => { capas[p.nombre] = L.tileLayer(p.url, p.opciones); });
  capas[PROVEEDORES_MAPA[0].nombre].addTo(mapa);
  L.control.layers(capas, null, { position: 'bottomright' }).addTo(mapa);
  const limites = L.geoJSON(LIMITES_ALCALDIAS);
  mapa.fitBounds(limites.getBounds());
  estadoAdmin.mapa = mapa;
}

async function cargarPanel() {
  const datos = await obtenerPanelControl();
  if (!revisarAcceso(datos)) return;
  if (!datos.ok) {
    mostrarMensaje('msg-panel', 'error', datos.error);
    return;
  }
  $('total-proyectos').textContent = numero(datos.totalProyectos, 0);
  $('total-simulaciones').textContent = numero(datos.totalSimulaciones, 0);
  $('total-incidencias').textContent = numero(datos.incidencias.length, 0);
  $('fecha-consulta').textContent = `Acumulado al ${datos.fechaConsulta}`;
  $('msg-panel').innerHTML = '';
  if (datos.incidencias.length === 0) mostrarMensaje('msg-panel', 'info', MENSAJES.sinIncidencias);

  if (!estadoAdmin.mapa) iniciarMapaIncidencias();
  if (estadoAdmin.capasIncidencias) estadoAdmin.mapa.removeLayer(estadoAdmin.capasIncidencias);

  // Alcaldías con tono según su número de incidencias y un marcador por punto crítico.
  const porAlcaldia = {};
  datos.incidencias.forEach((i) => { porAlcaldia[i.alcaldia] = (porAlcaldia[i.alcaldia] || 0) + 1; });
  const maximo = Math.max(1, ...Object.values(porAlcaldia));
  const grupo = L.layerGroup();
  L.geoJSON(LIMITES_ALCALDIAS, {
    style: (f) => {
      const n = porAlcaldia[f.properties.nombre] || 0;
      return { color: '#006B78', weight: 1.2, fillColor: '#006B78', fillOpacity: 0.04 + 0.3 * (n / maximo) };
    },
    onEachFeature: (f, capa) => {
      const n = porAlcaldia[f.properties.nombre] || 0;
      capa.bindTooltip(`${f.properties.nombre}: ${n} incidencia${n === 1 ? '' : 's'}`, { sticky: true, className: 'etiqueta-mapa' });
    }
  }).addTo(grupo);
  datos.incidencias.forEach((i) => {
    L.circleMarker([i.latitud, i.longitud], {
      radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#C62828', fillOpacity: 1
    }).bindTooltip(`<strong>${escapar(i.alcaldia)}</strong><br>${escapar(i.fechaRegistro)}`, { className: 'etiqueta-mapa' })
      .addTo(grupo);
  });
  grupo.addTo(estadoAdmin.mapa);
  estadoAdmin.capasIncidencias = grupo;
  setTimeout(() => estadoAdmin.mapa.invalidateSize(), 50);
}

// ---------- RF-ADM-03: tabla maestra ----------

function valorParametroSeleccionado() {
  const t = estadoAdmin.tabla;
  const tipo = $('tipo-parametro').value;
  if (tipo !== 'intensidad') return t.coeficientes[tipo];
  const fila = t.intensidades.find((f) => String(f.idAlcaldia) === $('parametro-alcaldia').value);
  return fila ? fila.valores[$('parametro-periodo').value] : null;
}

// Actualiza el formulario según el parámetro elegido (campos visibles, valor vigente y rango).
function pintarParametroSeleccionado() {
  const esIntensidad = $('tipo-parametro').value === 'intensidad';
  $('campos-intensidad').classList.toggle('oculto', !esIntensidad);
  const valor = valorParametroSeleccionado();
  $('valor-vigente').textContent = valor == null
    ? 'Sin capturar'
    : `${numero(valor, 2)}${esIntensidad ? ' mm/h' : ''}`;
  $('rango-parametro').textContent = esIntensidad
    ? 'Rango normativo: 10.00 a 250.00 mm/h, hasta dos decimales.'
    : 'Rango normativo: 0.05 a 0.95, hasta dos decimales.';
  document.querySelectorAll('.celda-intensidad').forEach((c) => {
    c.classList.toggle('seleccionada', esIntensidad
      && c.dataset.alcaldia === $('parametro-alcaldia').value && c.dataset.periodo === $('parametro-periodo').value);
  });
  document.querySelectorAll('.metrica-boton').forEach((b) => {
    b.classList.toggle('seleccionada', b.dataset.tipo === $('tipo-parametro').value);
  });
}

function pintarTabla(tabla) {
  estadoAdmin.tabla = tabla;
  $('valor-cp').textContent = tabla.coeficientes.Cp == null ? 'Sin capturar' : numero(tabla.coeficientes.Cp, 2);
  $('valor-ci').textContent = tabla.coeficientes.Ci == null ? 'Sin capturar' : numero(tabla.coeficientes.Ci, 2);
  const select = $('parametro-alcaldia');
  if (select.options.length === 0) {
    tabla.intensidades.forEach((f) => select.add(new Option(f.alcaldia, f.idAlcaldia)));
  }
  $('tabla-intensidades').innerHTML = tabla.intensidades.map((f) => `
    <tr>
      <td>${escapar(f.alcaldia)}</td>
      ${PERIODOS_RETORNO.map((p) => {
        const v = f.valores[p];
        return `<td class="num"><button type="button" class="celda-intensidad ${v == null ? 'sin-valor' : ''}"
          data-alcaldia="${f.idAlcaldia}" data-periodo="${p}">${v == null ? 'Sin capturar' : numero(v, 2)}</button></td>`;
      }).join('')}
    </tr>`).join('');
  pintarParametroSeleccionado();
}

async function cargarTabla() {
  const tabla = await obtenerTablaMaestra();
  if (!revisarAcceso(tabla)) return;
  if (tabla.ok) pintarTabla(tabla);
}

// ---------- RF-ADM-04 a RF-ADM-07: usuarios ----------

function pintarUsuarios(usuarios) {
  $('conteo-usuarios').textContent = `${usuarios.length} cuenta${usuarios.length === 1 ? '' : 's'}`;
  if (usuarios.length === 0) {
    $('tabla-usuarios').innerHTML = '<tr><td colspan="5" class="tabla-vacia">Sin resultados</td></tr>';
    return;
  }
  $('tabla-usuarios').innerHTML = usuarios.map((u) => `
    <tr class="${u.activo ? '' : 'fila-inactiva'}">
      <td>
        <div class="usuario-celda">${escapar(u.nombre)}
          ${u.propio ? '<span class="etiqueta-mini">Tú</span>' : ''}
          ${u.protegido ? '<span class="etiqueta-mini etiqueta-inicial">Administrador inicial</span>' : ''}
        </div>
      </td>
      <td>${escapar(u.correo)}</td>
      <td>
        <div class="control-rol">
          <select class="select-rol" data-id="${u.id}" aria-label="Rol de ${escapar(u.nombre)}">
            ${ROLES.map((r) => `<option ${r === u.rol ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <button type="button" class="boton boton-contorno boton-chico" data-accion="rol" data-id="${u.id}">Guardar rol</button>
        </div>
      </td>
      <td><span class="chip ${u.activo ? 'chip-calculado' : 'chip-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button type="button" class="boton boton-peligro boton-chico" data-accion="desactivar" data-id="${u.id}">
          Desactivar cuenta
        </button>
      </td>
    </tr>`).join('');
}

// texto null muestra todas las cuentas; con texto aplica la búsqueda de RF-ADM-05.
async function cargarUsuarios(texto = null) {
  const resultado = await buscarUsuarios(texto);
  if (!revisarAcceso(resultado)) return;
  $('msg-usuarios').innerHTML = '';
  if (!resultado.ok) {
    mostrarMensaje('msg-usuarios', 'error', resultado.error);
    if (resultado.usuarios) pintarUsuarios(resultado.usuarios);
    return;
  }
  estadoAdmin.filtro = texto;
  pintarUsuarios(resultado.usuarios);
}

// Después de una operación se conserva el filtro aplicado (si sigue habiendo coincidencias).
async function refrescarUsuarios() {
  if (estadoAdmin.filtro) {
    const filtrados = await buscarUsuarios(estadoAdmin.filtro);
    if (filtrados.ok) {
      pintarUsuarios(filtrados.usuarios);
      return;
    }
  }
  estadoAdmin.filtro = null;
  $('texto-buscar').value = '';
  pintarUsuarios((await buscarUsuarios()).usuarios);
}

// ---------- Eventos ----------

document.querySelectorAll('.pestana').forEach((b) => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));

$('tipo-parametro').addEventListener('change', pintarParametroSeleccionado);
$('parametro-alcaldia').addEventListener('change', pintarParametroSeleccionado);
$('parametro-periodo').addEventListener('change', pintarParametroSeleccionado);

// Clic en un valor de la tabla: lo selecciona para editarlo.
$('tabla-intensidades').addEventListener('click', (evento) => {
  const celda = evento.target.closest('.celda-intensidad');
  if (!celda) return;
  $('tipo-parametro').value = 'intensidad';
  $('parametro-alcaldia').value = celda.dataset.alcaldia;
  $('parametro-periodo').value = celda.dataset.periodo;
  $('msg-parametro').innerHTML = '';
  pintarParametroSeleccionado();
  $('valor-parametro').focus();
});
document.querySelectorAll('.metrica-boton').forEach((b) => b.addEventListener('click', () => {
  $('tipo-parametro').value = b.dataset.tipo;
  $('msg-parametro').innerHTML = '';
  pintarParametroSeleccionado();
  $('valor-parametro').focus();
}));

// RF-ADM-03: actualizar parámetro.
$('form-parametro').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const resultado = await actualizarParametro({
    tipo: $('tipo-parametro').value,
    idAlcaldia: $('parametro-alcaldia').value,
    periodo: $('parametro-periodo').value,
    valor: $('valor-parametro').value
  });
  if (!revisarAcceso(resultado)) return;
  if (!resultado.ok) {
    mostrarMensaje('msg-parametro', 'error', resultado.error);
    return;
  }
  $('valor-parametro').value = '';
  pintarTabla(resultado);
  mostrarMensaje('msg-parametro', 'exito', resultado.mensaje);
});

// RF-ADM-04: crear cuenta.
$('form-cuenta').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = evento.target.querySelector('button');
  boton.disabled = true;
  const resultado = await crearCuenta($('cuenta-nombre').value, $('cuenta-correo').value, $('cuenta-rol').value);
  boton.disabled = false;
  if (!revisarAcceso(resultado)) return;
  if (!resultado.ok) {
    mostrarMensaje('msg-cuenta', 'error', resultado.error);
    return;
  }
  evento.target.reset();
  mostrarMensaje('msg-cuenta', 'exito', resultado.mensaje);
  await refrescarUsuarios();
});

// RF-ADM-05: filtrar usuarios.
$('form-buscar').addEventListener('submit', (evento) => {
  evento.preventDefault();
  cargarUsuarios($('texto-buscar').value.trim());
});
$('boton-todos').addEventListener('click', () => {
  $('texto-buscar').value = '';
  cargarUsuarios(null);
});

// RF-ADM-06 y RF-ADM-07: acciones de cada fila.
let temporizadorConfirmacion;
$('tabla-usuarios').addEventListener('click', async (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;
  const id = Number(boton.dataset.id);

  if (boton.dataset.accion === 'rol') {
    const rol = document.querySelector(`.select-rol[data-id="${id}"]`).value;
    const resultado = await modificarRol(id, rol);
    if (!revisarAcceso(resultado)) return;
    if (!resultado.ok) {
      mostrarMensaje('msg-usuarios', 'error', resultado.error);
      await refrescarUsuarios();
      return;
    }
    mostrarMensaje('msg-usuarios', 'exito', resultado.mensaje);
    await refrescarUsuarios();
    return;
  }

  // Desactivar pide una segunda pulsación para confirmar, porque la reactivación no forma parte del módulo.
  if (!boton.classList.contains('confirmando')) {
    document.querySelectorAll('.confirmando').forEach((b) => {
      b.classList.remove('confirmando');
      b.textContent = 'Desactivar cuenta';
    });
    boton.classList.add('confirmando');
    boton.textContent = 'Confirmar desactivación';
    clearTimeout(temporizadorConfirmacion);
    temporizadorConfirmacion = setTimeout(() => {
      boton.classList.remove('confirmando');
      boton.textContent = 'Desactivar cuenta';
    }, 4000);
    return;
  }
  const resultado = await desactivarCuenta(id);
  if (!revisarAcceso(resultado)) return;
  if (!resultado.ok) {
    mostrarMensaje('msg-usuarios', 'error', resultado.error);
    await refrescarUsuarios();
    return;
  }
  mostrarMensaje('msg-usuarios', 'exito', resultado.mensaje);
  snackbar(resultado.mensaje);
  await refrescarUsuarios();
});

$('boton-salir').addEventListener('click', async () => {
  await cerrarSesionAdmin();
  window.location.href = 'admin.html';
});

// ---------- Inicio ----------

async function iniciarAdmin() {
  const sesion = await sesionAdministrador();
  if (sesion.estado === 'sin-sesion') {
    window.location.href = 'admin.html';
    return;
  }
  if (sesion.estado === 'denegado') {
    $('nombre-usuario').textContent = sesion.usuario.nombre;
    mostrarAccesoDenegado();
    return;
  }
  estadoAdmin.usuario = sesion.usuario;
  $('nombre-usuario').textContent = sesion.usuario.nombre;
  $('contenido-admin').classList.remove('oculto');
  mostrarPestana('panel');
}

iniciarAdmin();
