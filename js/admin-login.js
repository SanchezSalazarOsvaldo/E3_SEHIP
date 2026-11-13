// Página de acceso administrativo (RF-ADM-01) y configuración del administrador inicial.
const $ = (id) => document.getElementById(id);
const formulario = $('form-login');
const caja = $('mensaje-login');

function mostrarMensajeConfiguracion(tipo, texto) {
  const iconos = { error: 'i-triangulo', exito: 'i-check' };
  $('mensaje-configuracion').innerHTML = `
    <div class="alerta alerta-${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">
      <svg class="icono"><use href="#${iconos[tipo]}"/></svg>
      <span></span>
    </div>`;
  $('mensaje-configuracion').querySelector('span').textContent = texto;
}

// Si aún no existe el administrador inicial se muestra el formulario para crearlo; si ya hay una sesión
// de administrador, se envía directamente al panel.
(async () => {
  if ((await estadoConfiguracionInicial()).pendiente) {
    $('bloque-login').classList.add('oculto');
    $('bloque-configuracion').classList.remove('oculto');
    return;
  }
  if ((await sesionAdministrador()).estado === 'ok') window.location.href = 'admin-panel.html';
})();

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  caja.classList.add('oculto');
  const resultado = await iniciarSesionAdmin(formulario.correo.value, formulario.contrasena.value);
  if (resultado.ok) {
    // Con contraseña temporal, primero se pide cambiarla.
    window.location.href = resultado.usuario.debeCambiarContrasena ? 'contrasena.html' : 'admin-panel.html';
    return;
  }
  caja.querySelector('span').textContent = resultado.error;
  caja.classList.remove('oculto');
});

$('form-configuracion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = evento.target.querySelector('button');
  boton.disabled = true;
  const resultado = await configurarAdministradorInicial(
    $('config-nombre').value, $('config-correo').value, $('config-contrasena').value, $('config-confirmacion').value
  );
  boton.disabled = false;
  if (!resultado.ok) {
    mostrarMensajeConfiguracion('error', resultado.error);
    return;
  }
  boton.disabled = true;
  mostrarMensajeConfiguracion('exito', resultado.mensaje);
  setTimeout(() => { window.location.href = 'admin-panel.html'; }, 1200);
});
