import 'dotenv/config';
import crypto from 'crypto';
import { pool } from '../db';
import { hashPassword } from '../auth';

function generarPasswordTemporal(): string {
    // 12 caracteres legibles (sin 0/O/1/l) en base32 + un número final.
    const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += alfabeto[crypto.randomInt(alfabeto.length)];
    }
    return password;
}

async function main() {
    const correo = process.argv[2]?.trim().toLowerCase();
    if (!correo) {
        console.error('Uso: npm run reset:password -- <correo>');
        process.exit(1);
    }

    const password = generarPasswordTemporal();
    const passwordHash = await hashPassword(password);

    const { rowCount } = await pool.query(
        `update usuarios
            set password_hash = $1,
                debe_cambiar_password = true,
                actualizado_en = now()
          where correo = $2`,
        [passwordHash, correo]
    );

    if (rowCount === 0) {
        console.error(`No existe ningún usuario con el correo ${correo}`);
    } else {
        console.log(`\nContraseña temporal para ${correo}:\n\n  ${password}\n`);
        console.log('Debe cambiarla al iniciar sesión.\n');
    }

    await pool.end();
}

main().catch((err) => {
    console.error('Error ejecutando el reset:', err);
    process.exit(1);
});
