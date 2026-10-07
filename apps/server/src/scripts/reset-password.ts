import 'dotenv/config';
import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin';

function generarPasswordTemporal(): string {
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

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const usuario = data.users.find((u) => u.email?.toLowerCase() === correo);

    if (!usuario) {
        console.error(`No existe ninguna cuenta con el correo ${correo}`);
        process.exit(1);
    }

    const password = generarPasswordTemporal();
    const { error: errorUpdate } = await supabaseAdmin.auth.admin.updateUserById(usuario.id, {
        password,
        user_metadata: { ...usuario.user_metadata, debe_cambiar_password: true }
    });
    if (errorUpdate) throw errorUpdate;

    console.log(`\nContraseña temporal para ${correo}:\n\n  ${password}\n`);
    console.log('Debe cambiarla al iniciar sesión.\n');
}

main().catch((err) => {
    console.error('Error ejecutando el reset:', err);
    process.exit(1);
});
