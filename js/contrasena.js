// Página para cambiar la contraseña (ambos roles).
// Si la cuenta tiene contraseña temporal, el cambio es obligatorio: no se muestra el enlace al panel y
// el servidor rechaza las demás operaciones hasta completarlo.
const $ = (id) => document.getElementById(id);
let usuarioCuenta = null;

const panelDelRol = (usuario) => (usuario.rol === ROL_ADMINISTRADOR ? 'admin-panel.html' : 'panel.html');
const accesoDelRol = (usuario) => (usuario && usuario.rol === ROL_ADMINISTRADOR ? 'admin.html' : 'index.html');

function mostrarAviso(tipo, texto) {
  const iconos = { error: 'i-triangulo', exito: 'i-check' };
  $('mensaje').innerHTML = `
    <div class="alerta alerta-${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">
      <svg class="icono"><use href="#${iconos[tipo]}"/></svg>
      <span></span>
    </div>`;
  $('mensaje').querySelector('span').textContent = texto;
}

(async () => {
  usuarioCuenta = await sesionCuenta();
  if (!usuarioCuenta) {
    window.location.href = 'index.html';
    return;
  }
  $('correo-cuenta').textContent = `${usuarioCuenta.correo} · ${usuarioCuenta.rol}`;
  $('volver').href = panelDelRol(usuarioCuenta);
  if (usuarioCuenta.debeCambiarContrasena) {
    $('aviso-obligatorio').classList.remove('oculto');
    $('etiqueta-actual').textContent = 'Contraseña temporal (recibida por correo)';
    $('bloque-volver').classList.add('oculto');
  }
})();

$('form-contrasena').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const resultado = await cambiarContrasena($('actual').value, $('nueva').value, $('confirmacion').value);
  if (!resultado.ok) {
    if (resultado.estado === 'sin-sesion') {
      window.location.href = 'index.html';
      return;
    }
    mostrarAviso('error', resultado.error);
    return;
  }
  evento.target.querySelector('button').disabled = true;
  mostrarAviso('exito', `${resultado.mensaje}. Entrando al panel...`);
  setTimeout(() => { window.location.href = panelDelRol(resultado.usuario); }, 1500);
});

$('salir').addEventListener('click', async (evento) => {
  evento.preventDefault();
  await salirCuenta();
  window.location.href = accesoDelRol(usuarioCuenta);
});
