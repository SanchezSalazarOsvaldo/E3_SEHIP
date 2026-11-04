// Página de inicio de sesión (RF-WEB-01).
const formulario = document.getElementById('form-login');
const caja = document.getElementById('mensaje-login');

// Si ya existe una sesión activa, se envía directamente al panel.
(async () => {
  if (await usuarioActivo()) window.location.href = 'panel.html';
})();

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  caja.classList.add('oculto');

  const resultado = await iniciarSesion(formulario.correo.value, formulario.contrasena.value);

  if (resultado.ok) {
    window.location.href = 'panel.html';
    return;
  }
  caja.querySelector('span').textContent = resultado.error;
  caja.classList.remove('oculto');
});
