// Página de acceso administrativo (RF-ADM-01).
const formulario = document.getElementById('form-login');
const caja = document.getElementById('mensaje-login');

// Si ya hay una sesión de administrador, se envía directamente al panel.
(async () => {
  if ((await sesionAdministrador()).estado === 'ok') window.location.href = 'admin-panel.html';
})();

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  caja.classList.add('oculto');
  const resultado = await iniciarSesionAdmin(formulario.correo.value, formulario.contrasena.value);
  if (resultado.ok) {
    window.location.href = 'admin-panel.html';
    return;
  }
  caja.querySelector('span').textContent = resultado.error;
  caja.classList.remove('oculto');
});
