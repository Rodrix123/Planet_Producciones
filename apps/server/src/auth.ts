import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

export type UsuarioRol = 'administradora' | 'secretaria' | 'jefe_logistica';

export interface UsuarioSesion {
    id: string;
    rol: UsuarioRol;
}

declare global {
    namespace Express {
        interface Request {
            usuario?: UsuarioSesion;
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('Falta configurar JWT_SECRET en apps/server/.env');
}

export const COOKIE_NAME = 'pp_session';
const SESSION_DURATION = '8h';

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function signSessionToken(usuario: UsuarioSesion): string {
    return jwt.sign(usuario, JWT_SECRET as string, { expiresIn: SESSION_DURATION });
}

export function cookieOptions() {
    return {
        httpOnly: true as const,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000
    };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ status: 'error', message: 'No autenticado' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET as string) as UsuarioSesion;
        req.usuario = { id: payload.id, rol: payload.rol };
        next();
    } catch {
        return res.status(401).json({ status: 'error', message: 'Sesión inválida o expirada' });
    }
}

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
