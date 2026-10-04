import { Router } from 'express';
import { pool } from '../db';
import { asyncHandler } from '../asyncHandler';
import {
    COOKIE_NAME,
    cookieOptions,
    hashPassword,
    requireAuth,
    signSessionToken,
    verifyPassword
} from '../auth';

interface UsuarioRow {
    id: string;
    nombre: string;
    correo: string;
    password_hash: string;
    rol: 'administradora' | 'secretaria' | 'jefe_logistica';
    debe_cambiar_password: boolean;
    activo: boolean;
}

export const authRouter = Router();

authRouter.post('/login', asyncHandler(async (req, res) => {
    const { correo, password } = req.body as { correo?: string; password?: string };

    if (!correo || !password) {
        return res.status(400).json({ status: 'error', message: 'Correo y contraseña son obligatorios' });
    }

    const { rows } = await pool.query<UsuarioRow>(
        'select * from usuarios where correo = $1',
        [correo.trim().toLowerCase()]
    );
    const usuario = rows[0];

    if (!usuario || !usuario.activo || !(await verifyPassword(password, usuario.password_hash))) {
        return res.status(401).json({ status: 'error', message: 'Correo o contraseña incorrectos' });
    }

    const token = signSessionToken({ id: usuario.id, rol: usuario.rol });
    res.cookie(COOKIE_NAME, token, cookieOptions());

    res.json({
        status: 'ok',
        nombre: usuario.nombre,
        rol: usuario.rol,
        debeCambiarPassword: usuario.debe_cambiar_password
    });
}));

authRouter.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.json({ status: 'ok' });
});

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query<UsuarioRow>(
        'select * from usuarios where id = $1',
        [req.usuario!.id]
    );
    const usuario = rows[0];

    if (!usuario || !usuario.activo) {
        res.clearCookie(COOKIE_NAME, cookieOptions());
        return res.status(401).json({ status: 'error', message: 'No autenticado' });
    }

    res.json({
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        debeCambiarPassword: usuario.debe_cambiar_password
    });
}));

authRouter.put('/cambiar-password', requireAuth, asyncHandler(async (req, res) => {
    const { passwordActual, passwordNueva } = req.body as { passwordActual?: string; passwordNueva?: string };

    if (!passwordActual || !passwordNueva) {
        return res.status(400).json({ status: 'error', message: 'Completa la contraseña actual y la nueva' });
    }
    if (passwordNueva.length < 8) {
        return res.status(400).json({ status: 'error', message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const { rows } = await pool.query<UsuarioRow>(
        'select * from usuarios where id = $1',
        [req.usuario!.id]
    );
    const usuario = rows[0];

    if (!usuario || !(await verifyPassword(passwordActual, usuario.password_hash))) {
        return res.status(401).json({ status: 'error', message: 'La contraseña actual no es correcta' });
    }

    const nuevoHash = await hashPassword(passwordNueva);
    await pool.query(
        'update usuarios set password_hash = $1, debe_cambiar_password = false, actualizado_en = now() where id = $2',
        [nuevoHash, usuario.id]
    );

    res.json({ status: 'ok' });
}));
