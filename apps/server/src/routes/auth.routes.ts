// Rutas de autenticación (/api/auth): iniciar y cerrar sesión, saber quién está conectado y
// cambiar la contraseña.
// El correo y la contraseña se verifican con Supabase Auth; la sesión es una cookie httpOnly
// firmada por este servidor (ver auth.ts).

import { Router } from 'express';
import { pool } from '../db';
import { asyncHandler } from '../asyncHandler';
import { supabaseAdmin, supabaseAnon } from '../supabaseAdmin';
import {
    COOKIE_NAME,
    cookieOptions,
    requireAuth,
    signSessionToken,
    type UsuarioRol,
    type UsuarioSesion
} from '../auth';

export const authRouter = Router();

// Inicio de sesión: valida correo y contraseña en Supabase Auth, busca el rol del perfil y deja
// la sesión en una cookie. Los mensajes de error no dicen cuál de los dos datos falló.
authRouter.post('/login', asyncHandler(async (req, res) => {
    const { correo, password } = req.body as { correo?: string; password?: string };

    if (!correo || !password) {
        return res.status(400).json({ status: 'error', message: 'Correo y contraseña son obligatorios' });
    }

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email: correo.trim().toLowerCase(),
        password
    });

    if (error || !data.user) {
        return res.status(401).json({ status: 'error', message: 'Correo o contraseña incorrectos' });
    }

    const { rows } = await pool.query<{ rol: string; nombre: string; correo: string; debe_cambiar_password: boolean }>(
        `select r.name as rol, p.nombre, p.correo, p.debe_cambiar_password
         from profiles p join role r on r.id = p.role_id where p.id = $1`,
        [data.user.id]
    );
    const perfil = rows[0];

    // Una cuenta que existe en Auth pero no tiene rol asignado no puede entrar a ningún panel.
    if (!perfil?.rol) {
        return res.status(403).json({ status: 'error', message: 'Tu cuenta no tiene un rol asignado. Contacta al desarrollador.' });
    }

    // Lo que viaja dentro de la cookie de sesión (no incluye la contraseña ni datos sensibles).
    const sesion: UsuarioSesion = {
        id: data.user.id,
        rol: perfil.rol as UsuarioRol,
        nombre: perfil.nombre,
        correo: perfil.correo,
        debeCambiarPassword: perfil.debe_cambiar_password
    };

    res.cookie(COOKIE_NAME, signSessionToken(sesion), cookieOptions());
    res.json({
        status: 'ok',
        nombre: sesion.nombre,
        rol: sesion.rol,
        debeCambiarPassword: sesion.debeCambiarPassword
    });
}));

// Cierre de sesión: borra la cookie.
authRouter.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.json({ status: 'ok' });
});

// Datos de la sesión actual. El frontend lo usa para saber el rol y si debe cambiar la contraseña.
authRouter.get('/me', requireAuth, (req, res) => {
    const u = req.usuario!;
    res.json({ nombre: u.nombre, correo: u.correo, rol: u.rol, debeCambiarPassword: u.debeCambiarPassword });
});

// Cambio de contraseña de quien tiene la sesión abierta. Pide la contraseña actual y exige al
// menos 8 caracteres en la nueva.
authRouter.put('/cambiar-password', requireAuth, asyncHandler(async (req, res) => {
    const { passwordActual, passwordNueva } = req.body as { passwordActual?: string; passwordNueva?: string };

    if (!passwordActual || !passwordNueva) {
        return res.status(400).json({ status: 'error', message: 'Completa la contraseña actual y la nueva' });
    }
    if (passwordNueva.length < 8) {
        return res.status(400).json({ status: 'error', message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const u = req.usuario!;

    // Se confirma que quien pide el cambio conoce la contraseña actual: así una sesión abierta y
    // olvidada en otro computador no basta para cambiarla.
    const { error: errorVerificacion } = await supabaseAnon.auth.signInWithPassword({
        email: u.correo,
        password: passwordActual
    });
    if (errorVerificacion) {
        return res.status(401).json({ status: 'error', message: 'La contraseña actual no es correcta' });
    }

    const { error: errorUpdate } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
        password: passwordNueva
    });
    if (errorUpdate) {
        return res.status(502).json({ status: 'error', message: 'No se pudo actualizar la contraseña. Intenta de nuevo.' });
    }

    await pool.query('update profiles set debe_cambiar_password = false where id = $1', [u.id]);

    // La cookie se renueva con debeCambiarPassword en false para que el frontend deje de pedir el cambio.
    const nuevaSesion: UsuarioSesion = { ...u, debeCambiarPassword: false };
    res.cookie(COOKIE_NAME, signSessionToken(nuevaSesion), cookieOptions());
    res.json({ status: 'ok' });
}));
