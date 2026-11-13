// Alta de cuentas desde la terminal.
// Uso:
//   node scripts/crear_usuario.js admin     "Nombre completo" correo@dominio.com Contrasena123
//   node scripts/crear_usuario.js ingeniero "Nombre completo" correo@dominio.com Contrasena123
// El tipo "admin" crea al Administrador del Sistema inicial protegido (solo puede existir uno).
// Alternativa a la configuración inicial de admin.html; las cuentas creadas aquí no piden cambio de contraseña.
// Los datos de conexión se toman del archivo .env (por medio de src/db.js).
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { credencialesConFormatoValido } = require('../public/js/validaciones');

const TIPOS = {
  admin: { rol: 'Administrador del Sistema', protegido: true },
  ingeniero: { rol: 'Ingeniero Civil', protegido: false }
};

async function main() {
  const [tipo, nombre, correo, contrasena] = process.argv.slice(2);
  const config = TIPOS[tipo];

  if (!config || !nombre || !correo || !contrasena) {
    console.log('Uso: node scripts/crear_usuario.js <admin|ingeniero> "Nombre completo" correo contrasena');
    process.exitCode = 1;
    return;
  }
  if (nombre.trim().length < 1 || nombre.trim().length > 100) {
    console.log('El nombre debe tener entre 1 y 100 caracteres.');
    process.exitCode = 1;
    return;
  }
  if (!credencialesConFormatoValido(correo, contrasena)) {
    console.log('El correo debe tener formato usuario@dominio.com (5 a 50 caracteres) y la contraseña de 8 a 16 caracteres.');
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(contrasena, 10);
  await db.query(
    `INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol, protegido)
     VALUES ($1, $2, $3, (SELECT id_rol FROM rol WHERE nombre = $4), $5)`,
    [nombre.trim(), correo, hash, config.rol, config.protegido]
  );
  console.log(`Cuenta creada: ${correo} (${config.rol}${config.protegido ? ', administrador inicial protegido' : ''}).`);
}

main()
  .catch((err) => {
    // 23505: correo repetido. P0001: regla de un trigger (p. ej. segundo admin inicial).
    if (err.code === '23505') {
      console.log('Ya existe una cuenta registrada con ese correo.');
    } else if (err.code === 'P0001') {
      console.log(err.message);
    } else {
      console.error('Error al crear la cuenta:', err.message);
    }
    process.exitCode = 1;
  })
  .finally(() => db.end());
