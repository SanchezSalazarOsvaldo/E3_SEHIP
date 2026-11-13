// Página de recuperación de contraseña (ambos roles), en dos pasos:
// 1) el usuario escribe su correo y recibe un código de 6 dígitos; 2) escribe el código y su nueva contraseña.
// recuperar.html?origen=admin regresa al acceso administrativo en lugar del inicio de sesión del ingeniero.
const $ = (id) => document.getElementById(id);
const paginaAcceso = new URLSearchParams(window.location.search).get('origen') === 'admin' ? 'admin.html' : 'index.html';
let correoSolicitado = '';

$('volver').href = paginaAcceso;

function mostrarAviso(tipo, texto) {
  const iconos = { error: 'i-triangulo', exito: 'i-check' };
  $('mensaje').innerHTML = `
    <div class="alerta alerta-${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">
      <svg class="icono"><use href="#${iconos[tipo]}"/></svg>
      <span></span>
    </div>`;
  $('mensaje').querySelector('span').textContent = texto;
}

function mostrarPaso(paso) {
  $('form-solicitar').classList.toggle('oculto', paso !== 1);
  $('form-restablecer').classList.toggle('oculto', paso !== 2);
  $('mensaje').innerHTML = '';
}

$('form-solicitar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = evento.target.querySelector('button');
  boton.disabled = true;
  const resultado = await solicitarCodigoRecuperacion($('correo').value);
  boton.disabled = false;
  if (!resultado.ok) {
    mostrarAviso('error', resultado.error);
    return;
  }
  correoSolicitado = $('correo').value.trim();
  mostrarPaso(2);
  $('aviso-codigo').querySelector('span').textContent = `${resultado.mensaje} (${correoSolicitado}).`;
  $('codigo').focus();
});

$('form-restablecer').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const resultado = await restablecerContrasena(correoSolicitado, $('codigo').value, $('nueva').value, $('confirmacion').value);
  if (!resultado.ok) {
    mostrarAviso('error', resultado.error);
    return;
  }
  $('form-restablecer').classList.add('oculto');
  mostrarAviso('exito', resultado.mensaje);
  $('mensaje').insertAdjacentHTML('beforeend',
    `<a class="boton boton-ancho boton-separado" href="${paginaAcceso}">Ir a iniciar sesión</a>`);
});

$('otro-correo').addEventListener('click', (evento) => {
  evento.preventDefault();
  $('form-restablecer').reset();
  mostrarPaso(1);
  $('correo').focus();
});
