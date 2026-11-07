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

// Tamaño de página al recorrer los usuarios de Supabase Auth.
const POR_PAGINA = 200;

// Fila de la tabla profiles (datos del perfil de cada cuenta).
interface FilaPerfil {
    id: string;
    role_id: number | null;
    nombre: string;
    correo: string;
    debe_cambiar_password: boolean;
}

/**
 * Todos los usuarios de Supabase Auth indexados por id (teléfono, fecha de creación y último
 * acceso), recorriendo las páginas de la API de administración.
 */
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

// Lista las cuentas con su rol, sus días no disponibles y sus datos de acceso. Las consultas son
// independientes, por eso van en paralelo.
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

// Lo que se escribe en el formulario: largos máximos y formatos. Lo que no sea texto cuenta como vacío.
const MAX = { nombre: 100, correo: 150, telefono: 30 } as const;
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El teléfono se guarda sin espacios, paréntesis, guiones ni el signo + (formato de Supabase).
const limpiarTelefono = (valor: string): string => valor.replace(/[\s()-]/g, '').replace(/^\+/, '');

/** Fecha real en formato AAAA-MM-DD (rechaza 2026-02-31, "mañana", etc.). */
function esFechaValida(valor: unknown): valor is string {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const [a, m, d] = valor.split('-').map(Number);
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// Un id que no es un uuid es una cuenta que no existe (antes: error 500 de la base).
cuentasAccesoRouter.param('id', (_req, res, next, valor) => {
    if (UUID.test(String(valor))) return next();
    res.status(404).json({ status: 'error', message: 'Cuenta no encontrada' });
});

// Un rol válido: número entero que existe en la tabla de roles.
async function rolExiste(rolId: unknown): Promise<boolean> {
    if (!Number.isSafeInteger(rolId) || (rolId as number) <= 0) return false;
    const { rows } = await pool.query('select id from role where id = $1', [rolId]);
    return rows.length > 0;
}

// Crea la cuenta en Supabase Auth y su perfil. Queda con debe_cambiar_password = true: la persona
// define su propia contraseña en el primer ingreso.
cuentasAccesoRouter.post('/', asyncHandler(async (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const nombre = texto(body.nombre);
    const correo = texto(body.correo).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const telefono = typeof body.telefono === 'string' ? limpiarTelefono(body.telefono.trim()) : '';

    if (!nombre || !correo || !password || !body.rolId) {
        return res.status(400).json({ status: 'error', message: 'Nombre, correo, contraseña y rol son obligatorios' });
    }
    if (nombre.length > MAX.nombre) return res.status(400).json({ status: 'error', message: `El nombre es demasiado largo (máximo ${MAX.nombre} caracteres)` });
    if (!FORMATO_CORREO.test(correo) || correo.length > MAX.correo) return res.status(400).json({ status: 'error', message: 'El correo no es válido' });
    if (telefono.length > MAX.telefono) return res.status(400).json({ status: 'error', message: 'El teléfono no es válido' });
    if (password.length < 8) {
        return res.status(400).json({ status: 'error', message: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!(await rolExiste(body.rolId))) return res.status(400).json({ status: 'error', message: 'El rol no existe' });

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: correo,
        password,
        email_confirm: true,
        ...(telefono ? { phone: telefono, phone_confirm: true } : {})
    });
    if (error || !data.user) {
        const duplicado = /already|registered|exists/i.test(error?.message || '');
        return res.status(duplicado ? 409 : 400).json({ status: 'error', message: duplicado ? 'Ya existe una cuenta con ese correo o teléfono' : error?.message });
    }

    try {
        await pool.query(
            `insert into profiles (id, role_id, nombre, correo, debe_cambiar_password) values ($1, $2, $3, $4, true)`,
            [data.user.id, body.rolId, nombre, correo]
        );
    } catch (errorPerfil) {
        // Sin perfil la persona no podría entrar y su correo quedaría ocupado: se deshace la cuenta de Auth.
        await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch((e: Error) => console.error('No se pudo deshacer la cuenta creada:', e.message));
        throw errorPerfil;
    }

    res.status(201).json({ status: 'ok', id: data.user.id });
}));

// Edita nombre, correo, teléfono y rol. Correo y teléfono viven en Supabase Auth; nombre y rol, en
// profiles. Nadie puede cambiarse su propio rol (podría dejar el sistema sin administradora).
cuentasAccesoRouter.put('/:id', asyncHandler(async (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const nombre = texto(body.nombre);
    const correo = texto(body.correo).toLowerCase();
    const telefono = typeof body.telefono === 'string' ? limpiarTelefono(body.telefono.trim()) : '';

    const { rows } = await pool.query<{ role_id: number | null }>('select role_id from profiles where id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ status: 'error', message: 'Cuenta no encontrada' });

    if (body.nombre !== undefined && !nombre) return res.status(400).json({ status: 'error', message: 'El nombre no puede quedar vacío' });
    if (nombre.length > MAX.nombre) return res.status(400).json({ status: 'error', message: `El nombre es demasiado largo (máximo ${MAX.nombre} caracteres)` });
    if (correo && (!FORMATO_CORREO.test(correo) || correo.length > MAX.correo)) return res.status(400).json({ status: 'error', message: 'El correo no es válido' });
    if (telefono.length > MAX.telefono) return res.status(400).json({ status: 'error', message: 'El teléfono no es válido' });
    if (body.rolId !== undefined && body.rolId !== null) {
        if (!(await rolExiste(body.rolId))) return res.status(400).json({ status: 'error', message: 'El rol no existe' });
        if (req.params.id === req.usuario!.id && body.rolId !== rows[0].role_id) {
            return res.status(400).json({ status: 'error', message: 'No puedes cambiar tu propio rol' });
        }
    }

    if (correo || telefono) {
        const attrs: Record<string, unknown> = {};
        if (correo) {
            attrs.email = correo;
            attrs.email_confirm = true;
        }
        if (telefono) {
            attrs.phone = telefono;
            attrs.phone_confirm = true;
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, attrs);
        if (error) {
            const duplicado = /already|registered|exists|duplicate/i.test(error.message);
            return res.status(duplicado ? 409 : 400).json({ status: 'error', message: duplicado ? 'Ya existe una cuenta con ese correo o teléfono' : error.message });
        }
    }

    await pool.query(
        `update profiles set
            nombre = coalesce($1, nombre),
            correo = coalesce($2, correo),
            role_id = coalesce($3, role_id)
         where id = $4`,
        [nombre || null, correo || null, body.rolId ?? null, req.params.id]
    );

    res.json({ status: 'ok' });
}));

// Elimina la cuenta. No se permite borrar la propia para no quedarse sin acceso al sistema.
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

// Marca un día como no disponible para esta persona (sin duplicar el registro si ya estaba).
cuentasAccesoRouter.post('/:id/no-disponible', asyncHandler(async (req, res) => {
    const fecha = (req.body as { fecha?: unknown } | undefined)?.fecha;
    if (!fecha) return res.status(400).json({ status: 'error', message: 'Falta la fecha' });
    if (!esFechaValida(fecha)) return res.status(400).json({ status: 'error', message: 'La fecha no es válida (usa el formato AAAA-MM-DD)' });

    const cuenta = await pool.query('select id from profiles where id = $1', [req.params.id]);
    if (!cuenta.rows[0]) return res.status(404).json({ status: 'error', message: 'Cuenta no encontrada' });

    const existente = await pool.query(
        'select id from unavailability_users where id_user = $1 and date = $2',
        [req.params.id, fecha]
    );
    if (!existente.rows[0]) {
        await pool.query('insert into unavailability_users (id_user, date) values ($1, $2)', [req.params.id, fecha]);
    }
    res.status(201).json({ status: 'ok' });
}));

// Quita un día no disponible.
cuentasAccesoRouter.delete('/:id/no-disponible/:fecha', asyncHandler(async (req, res) => {
    if (!esFechaValida(req.params.fecha)) return res.status(400).json({ status: 'error', message: 'La fecha no es válida (usa el formato AAAA-MM-DD)' });
    await pool.query('delete from unavailability_users where id_user = $1 and date = $2', [req.params.id, req.params.fecha]);
    res.json({ status: 'ok' });
}));
