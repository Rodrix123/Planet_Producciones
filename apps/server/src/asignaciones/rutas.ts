// Rutas HTTP de la asignación de personal (historia de usuario 2). Solo la administradora:
//
//   GET    /api/eventos/:eventoId/personal[?horaFin=HH:MM]  evento, asignados y personal con su
//                                                           disponibilidad (con la hora propuesta)
//   POST   /api/eventos/:eventoId/personal                  { horaFin, personal: ["p:<id>" | "e:<id>"] }
//                                                           asigna (todo o nada) y guarda la hora fin
//   DELETE /api/eventos/:eventoId/personal/:perfilId        quita a alguien asignado a mano
//
// Errores: { status: 'error', codigo, message, detalles? } con 400 (solicitud mal formada),
// 401/403 (sin sesión / sin rol), 404 (no existe), 409 (las reglas no lo permiten), 502 (Supabase no
// creó la cuenta) o 503 (falta aplicar la migración 0011).

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../asyncHandler';
import { requireAuth, requireRole } from '../auth';
import type { BaseDeDatos } from './conexion';
import { asignarPersonal, consultarPersonal, ErrorAsignacion, quitarAsignacion, type CuentasDePersonal } from './servicio';

function leerEventoId(req: Request): number {
    const texto = String(req.params.eventoId ?? '');
    const id = /^[0-9]{1,15}$/.test(texto) ? Number(texto) : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new ErrorAsignacion(400, 'EVENTO_INVALIDO', 'El identificador del evento no es válido.');
    }
    return id;
}

function manejarErrores(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (err instanceof ErrorAsignacion) {
        res.status(err.estadoHttp).json({
            status: 'error',
            codigo: err.codigo,
            message: err.message,
            ...(err.detalles !== undefined ? { detalles: err.detalles } : {})
        });
        return;
    }
    const codigoBd = (err as { code?: unknown } | null)?.code;
    // Carreras entre solicitudes: la base de datos es la última barrera
    if (codigoBd === '23505') {
        res.status(409).json({ status: 'error', codigo: 'DUPLICADO', message: 'Esa persona ya está asignada a este evento. Actualiza la ventana.' });
        return;
    }
    if (codigoBd === '23503') {
        res.status(409).json({ status: 'error', codigo: 'REFERENCIA_INVALIDA', message: 'El evento o la persona ya no existen. Actualiza la ventana.' });
        return;
    }
    // Columna o tabla inexistente: la base todavía no tiene la migración 0011 (o la 0010 de WhatsApp)
    if (codigoBd === '42703' || codigoBd === '42P01') {
        console.error('Asignación de personal: falta una columna o tabla en la base:', (err as Error).message);
        res.status(503).json({
            status: 'error',
            codigo: 'FALTA_MIGRACION',
            message: 'La base de datos aún no tiene lo necesario para asignar personal: aplica supabase/migrations/0011_asignacion_personal.sql.'
        });
        return;
    }
    next(err);
}

export function crearAsignacionesRouter(db: BaseDeDatos, cuentas: CuentasDePersonal): Router {
    // mergeParams: el :eventoId está en la ruta donde se monta este router
    const router = Router({ mergeParams: true });
    router.use(requireAuth, requireRole('administrador'));

    router.get('/', asyncHandler(async (req, res) => {
        res.json({ status: 'ok', ...(await consultarPersonal(db, leerEventoId(req), req.query.horaFin)) });
    }));

    router.post('/', asyncHandler(async (req, res) => {
        res.json({ status: 'ok', ...(await asignarPersonal(db, cuentas, leerEventoId(req), req.body)) });
    }));

    router.delete('/:perfilId', asyncHandler(async (req, res) => {
        res.json({ status: 'ok', ...(await quitarAsignacion(db, leerEventoId(req), String(req.params.perfilId))) });
    }));

    router.use(manejarErrores);
    return router;
}
