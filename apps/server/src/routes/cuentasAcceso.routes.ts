import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { supabaseAdmin } from '../supabaseAdmin';

// Gestión de las 3 cuentas de acceso al sistema (administrador/secretaria/jefe_logistica):
// distinto de /api/empleados, que es la nómina (salario/documento/banco) del personal
// operativo. Aquí "empleado" = cuenta real de auth.users + su fila en profiles.
export const cuentasAccesoRouter = Router();
cuentasAccesoRouter.use(requireAuth, requireRole('administrador'));

const POR_PAGINA = 200;

interface FilaPerfil {
    id: string;
    role_id: number | null;
    nombre: string;
    correo: string;
    debe_cambiar_password: boolean;
}

async function listarUsuariosAuthPorId(): Promise<Map<string, { phone: string | null; createdAt: string; ultimoAcceso: string | null }>> {
    const mapa = new Map<string, { phone: string | null; createdAt: string; ultimoAcceso: string | null }>();
    for (let page = 1; ; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
        if (error) throw error;
        for (const u of data.users) {
            mapa.set(u.id, {
                phone: u.phone ? `+${u.phone}` : null,
                createdAt: u.created_at,
                ultimoAcceso: u.last_sign_in_at ?? null
            });
        }
        if (data.users.length < POR_PAGINA) break;
    }
    return mapa;
}

cuentasAccesoRouter.get('/', asyncHandler(async (_req, res) => {
    const [roles, perfiles, dias, usuariosAuth] = await Promise.all([
        pool.query<{ id: number; name: string; description: string | null }>('select id, name, description from role order by id'),
        pool.query<FilaPerfil>('select id, role_id, nombre, correo, debe_cambiar_password from profiles order by nombre'),
        pool.query<{ id_user: string; date: string }>('select id_user, date from unavailability_users order by date'),
        listarUsuariosAuthPorId()
    ]);

    const diasPorUsuario = new Map<string, string[]>();
    for (const d of dias.rows) {
        if (!diasPorUsuario.has(d.id_user)) diasPorUsuario.set(d.id_user, []);
        diasPorUsuario.get(d.id_user)!.push(d.date);
    }

    res.json({
        roles: roles.rows.map((r) => ({ id: Number(r.id), nombre: r.name, descripcion: r.description })),
        cuentas: perfiles.rows.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            correo: p.correo,
            telefono: usuariosAuth.get(p.id)?.phone ?? null,
            rolId: p.role_id,
            debeCambiarPassword: p.debe_cambiar_password,
            diasNoDisponibles: diasPorUsuario.get(p.id) || [],
            creadoEn: usuariosAuth.get(p.id)?.createdAt ?? null,
            ultimoAcceso: usuariosAuth.get(p.id)?.ultimoAcceso ?? null
        }))
    });
}));

cuentasAccesoRouter.post('/', asyncHandler(async (req, res) => {
    const body = req.body as { nombre?: string; correo?: string; password?: string; telefono?: string; rolId?: number };
    const nombre = body.nombre?.trim();
    const correo = body.correo?.trim().toLowerCase();

    if (!nombre || !correo || !body.password || !body.rolId) {
        return res.status(400).json({ status: 'error', message: 'Nombre, correo, contraseña y rol son obligatorios' });
    }
    if (body.password.length < 8) {
        return res.status(400).json({ status: 'error', message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const rol = await pool.query('select id from role where id = $1', [body.rolId]);
    if (!rol.rows[0]) return res.status(400).json({ status: 'error', message: 'El rol no existe' });

    const telefono = body.telefono?.replace(/[\s()-]/g, '').replace(/^\+/, '') || undefined;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: correo,
        password: body.password,
        email_confirm: true,
        ...(telefono ? { phone: telefono, phone_confirm: true } : {})
    });
    if (error || !data.user) {
        const duplicado = /already|registered|exists/i.test(error?.message || '');
        return res.status(duplicado ? 409 : 400).json({ status: 'error', message: duplicado ? 'Ya existe una cuenta con ese correo o teléfono' : error?.message });
    }

    await pool.query(
        `insert into profiles (id, role_id, nombre, correo, debe_cambiar_password) values ($1, $2, $3, $4, true)`,
        [data.user.id, body.rolId, nombre, correo]
    );

    res.status(201).json({ status: 'ok', id: data.user.id });
}));

cuentasAccesoRouter.put('/:id', asyncHandler(async (req, res) => {
    const body = req.body as { nombre?: string; correo?: string; telefono?: string; rolId?: number };
    const { rows } = await pool.query('select id from profiles where id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ status: 'error', message: 'Cuenta no encontrada' });

    if (body.correo || body.telefono !== undefined) {
        const attrs: Record<string, unknown> = {};
        if (body.correo) {
            attrs.email = body.correo.trim().toLowerCase();
            attrs.email_confirm = true;
        }
        if (body.telefono !== undefined && body.telefono.trim() !== '') {
            attrs.phone = body.telefono.replace(/[\s()-]/g, '').replace(/^\+/, '');
            attrs.phone_confirm = true;
        }
        if (Object.keys(attrs).length > 0) {
            const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, attrs);
            if (error) {
                const duplicado = /already|registered|exists|duplicate/i.test(error.message);
                return res.status(duplicado ? 409 : 400).json({ status: 'error', message: duplicado ? 'Ya existe una cuenta con ese correo o teléfono' : error.message });
            }
        }
    }

    await pool.query(
        `update profiles set
            nombre = coalesce($1, nombre),
            correo = coalesce($2, correo),
            role_id = coalesce($3, role_id)
         where id = $4`,
        [body.nombre?.trim() || null, body.correo?.trim().toLowerCase() || null, body.rolId || null, req.params.id]
    );

    res.json({ status: 'ok' });
}));

cuentasAccesoRouter.delete('/:id', asyncHandler(async (req, res) => {
    if (req.params.id === req.usuario!.id) {
        return res.status(400).json({ status: 'error', message: 'No puedes eliminar tu propia cuenta' });
    }

    // profiles (ON DELETE CASCADE desde auth.users) y unavailability_users (ON DELETE
    // CASCADE desde profiles) se limpian solas al borrar el usuario de Auth.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) return res.status(400).json({ status: 'error', message: error.message });

    res.json({ status: 'ok' });
}));

cuentasAccesoRouter.post('/:id/no-disponible', asyncHandler(async (req, res) => {
    const { fecha } = req.body as { fecha?: string };
    if (!fecha) return res.status(400).json({ status: 'error', message: 'Falta la fecha' });

    const existente = await pool.query(
        'select id from unavailability_users where id_user = $1 and date = $2',
        [req.params.id, fecha]
    );
    if (!existente.rows[0]) {
        await pool.query('insert into unavailability_users (id_user, date) values ($1, $2)', [req.params.id, fecha]);
    }
    res.status(201).json({ status: 'ok' });
}));

cuentasAccesoRouter.delete('/:id/no-disponible/:fecha', asyncHandler(async (req, res) => {
    await pool.query('delete from unavailability_users where id_user = $1 and date = $2', [req.params.id, req.params.fecha]);
    res.json({ status: 'ok' });
}));
