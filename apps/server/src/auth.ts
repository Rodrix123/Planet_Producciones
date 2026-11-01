// Sesión de los usuarios internos: cookie httpOnly con un token firmado (JWT) y los filtros
// (middlewares) que exigen sesión y rol en cada ruta.

import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

// Debe coincidir con los valores reales en la tabla `role`. 'administrador' es
// obligatorio tal cual porque la función is_admin() de la base lo compara literal;
// 'secretaria'/'jefe_logistica' son libres (no hay función RLS que los distinga,
// el control de acceso por rol lo hace esta app, igual que antes).
export type UsuarioRol = 'administrador' | 'secretaria' | 'jefe_logistica';

// Lo que se guarda dentro del token de sesión.
export interface UsuarioSesion {
    id: string;
    rol: UsuarioRol;
    nombre: string;
    correo: string;
    debeCambiarPassword: boolean;
}

// Agrega `usuario` al objeto Request de Express para que las rutas lean la sesión con tipos.
declare global {
    namespace Express {
        interface Request {
            usuario?: UsuarioSesion;
        }
    }
}

// Secreto con el que se firma el token. Sin él el servidor no arranca (mejor fallar al iniciar que
// firmar sesiones con un valor vacío).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('Falta configurar JWT_SECRET en apps/server/.env');
}

// Nombre de la cookie de sesión y duración (8 horas: una jornada de trabajo).
export const COOKIE_NAME = 'pp_session';
const SESSION_DURATION = '8h';

/**
 * Crea el token firmado que se guarda en la cookie.
 */
export function signSessionToken(usuario: UsuarioSesion): string {
    return jwt.sign(usuario, JWT_SECRET as string, { expiresIn: SESSION_DURATION });
}

/**
 * Opciones de la cookie: httpOnly (el JavaScript de la página no puede leerla), sameSite lax (no
 * viaja en peticiones de otros sitios) y secure solo en producción (exige HTTPS).
 */
export function cookieOptions() {
    return {
        httpOnly: true as const,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000
    };
}

/**
 * Filtro: exige una sesión válida. Deja el usuario en req.usuario o responde 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ status: 'error', message: 'No autenticado' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET as string) as UsuarioSesion;
        req.usuario = payload;
        next();
    } catch {
        return res.status(401).json({ status: 'error', message: 'Sesión inválida o expirada' });
    }
}

/**
 * Filtro: exige que el usuario tenga uno de los roles indicados (403 si no). Va después de requireAuth.
 */
export function requireRole(...roles: UsuarioRol[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.usuario) {
            return res.status(401).json({ status: 'error', message: 'No autenticado' });
        }
        if (!roles.includes(req.usuario.rol)) {
            return res.status(403).json({ status: 'error', message: 'No tienes permiso para esta acción' });
        }
        next();
    };
}
