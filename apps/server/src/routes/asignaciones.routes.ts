import { pool } from '../db';
import { supabaseAdmin } from '../supabaseAdmin';
import { baseDeDatosDePool } from '../asignaciones/conexion';
import { crearAsignacionesRouter } from '../asignaciones/rutas';
import type { CuentasDePersonal } from '../asignaciones/servicio';

// Conecta la asignación de personal con la base real y con Supabase Auth. La lógica vive en
// src/asignaciones/ (recibe la base y las cuentas por parámetro para poder probarse sin tocarlas).

const cuentasDeSupabase: CuentasDePersonal = {
    // Solo celular: sin correo ni contraseña, la persona no puede entrar al panel.
    async crearUsuario({ telefono, nombre, empleadoId }) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            phone: telefono,
            phone_confirm: true,
            user_metadata: { full_name: nombre, empleado_id: empleadoId }
        });
        if (error || !data.user) {
            if (/already|registered|exists/i.test(error?.message ?? '')) return { yaExiste: true };
            throw new Error(error?.message || 'Supabase no devolvió el usuario creado');
        }
        return { id: data.user.id };
    },
    async eliminarUsuario(id) {
        await supabaseAdmin.auth.admin.deleteUser(id);
    }
};

export const asignacionesRouter = crearAsignacionesRouter(baseDeDatosDePool(pool), cuentasDeSupabase);
