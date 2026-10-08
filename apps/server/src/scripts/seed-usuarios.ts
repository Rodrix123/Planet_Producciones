import 'dotenv/config';
import crypto from 'crypto';
import { pool } from '../db';
import { supabaseAdmin } from '../supabaseAdmin';

interface SeedUsuario {
    nombre: string;
    correo: string;
    rol: 'administrador' | 'secretaria' | 'jefe_logistica';
}

const USUARIOS: SeedUsuario[] = [
    { nombre: 'Maritza Galeano Muñoz', correo: 'maritza@planetproducciones.com', rol: 'administrador' },
    { nombre: 'Mariana Ortiz', correo: 'mariana@planetproducciones.com', rol: 'secretaria' },
    { nombre: 'Andrés Camilo Jiménez', correo: 'andres@planetproducciones.com', rol: 'jefe_logistica' }
];

function generarPasswordTemporal(): string {
    const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += alfabeto[crypto.randomInt(alfabeto.length)];
    }
    return password;
}

async function obtenerORearRol(nombre: string): Promise<number> {
    const existente = await pool.query<{ id: number }>('select id from role where name = $1', [nombre]);
    if (existente.rows[0]) return existente.rows[0].id;

    const creado = await pool.query<{ id: number }>(
        'insert into role (name, description) values ($1, $2) returning id',
        [nombre, `Rol de ${nombre} en el panel interno de Planet Producciones`]
    );
    return creado.rows[0].id;
}

async function obtenerUsuarioAuthPorCorreo(correo: string) {
    // listUsers no filtra por correo directamente; con solo 3 cuentas totales,
    // una página de 200 alcanza de sobra para encontrarla si ya existe.
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    return data.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase()) || null;
}

async function main() {
    const credenciales: { correo: string; rol: string; password: string }[] = [];

    for (const usuario of USUARIOS) {
        const password = generarPasswordTemporal();
        const roleId = await obtenerORearRol(usuario.rol);

        let authUser = await obtenerUsuarioAuthPorCorreo(usuario.correo);

        if (!authUser) {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email: usuario.correo,
                password,
                email_confirm: true
            });
            if (error || !data.user) throw error || new Error('No se pudo crear el usuario');
            authUser = data.user;
        } else {
            const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password });
            if (error) throw error;
        }

        // nombre/correo/debe_cambiar_password son atributos de perfil reales (columnas
        // de `profiles`, montada sobre auth.users vía profiles.id), no metadata suelta.
        await pool.query(
            `insert into profiles (id, role_id, nombre, correo, debe_cambiar_password) values ($1, $2, $3, $4, true)
             on conflict (id) do update set role_id = excluded.role_id, nombre = excluded.nombre, correo = excluded.correo, debe_cambiar_password = true`,
            [authUser.id, roleId, usuario.nombre, usuario.correo]
        );

        credenciales.push({ correo: usuario.correo, rol: usuario.rol, password });
    }

    console.log('\nCuentas creadas/actualizadas en Supabase Auth. Comparte estas contraseñas temporales UNA sola vez;');
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
