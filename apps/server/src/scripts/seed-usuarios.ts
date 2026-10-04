import 'dotenv/config';
import crypto from 'crypto';
import { pool } from '../db';
import { hashPassword } from '../auth';

interface SeedUsuario {
    nombre: string;
    correo: string;
    rol: 'administradora' | 'secretaria' | 'jefe_logistica';
}

const USUARIOS: SeedUsuario[] = [
    { nombre: 'Maritza Galeano Muñoz', correo: 'maritza@planetproducciones.com', rol: 'administradora' },
    { nombre: 'Mariana Ortiz', correo: 'mariana@planetproducciones.com', rol: 'secretaria' },
    { nombre: 'Andrés Camilo Jiménez', correo: 'andres@planetproducciones.com', rol: 'jefe_logistica' }
];

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
    const credenciales: { correo: string; rol: string; password: string }[] = [];

    for (const usuario of USUARIOS) {
        const password = generarPasswordTemporal();
        const passwordHash = await hashPassword(password);

        await pool.query(
            `insert into usuarios (nombre, correo, password_hash, rol, debe_cambiar_password)
             values ($1, $2, $3, $4, true)
             on conflict (correo) do update
                set password_hash = excluded.password_hash,
                    debe_cambiar_password = true,
                    actualizado_en = now()`,
            [usuario.nombre, usuario.correo, passwordHash, usuario.rol]
        );

        credenciales.push({ correo: usuario.correo, rol: usuario.rol, password });
    }

    console.log('\nCuentas creadas/actualizadas. Comparte estas contraseñas temporales UNA sola vez;');
    console.log('cada persona deberá cambiarla al iniciar sesión por primera vez:\n');
    for (const c of credenciales) {
        console.log(`  [${c.rol}] ${c.correo}  →  ${c.password}`);
    }
    console.log('');

    await pool.end();
}

main().catch((err) => {
    console.error('Error ejecutando el seed:', err);
    process.exit(1);
});
