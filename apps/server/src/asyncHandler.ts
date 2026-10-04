import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 no atrapa automáticamente los rechazos de promesas lanzados por handlers
 * async: si no se capturan, terminan como una promesa no manejada y Node (desde la v15)
 * cierra todo el proceso — tumbando la app completa para los 3 perfiles por un solo
 * error en una sola petición (por ejemplo, un timeout enviando un correo). Este wrapper
 * reenvía cualquier error a next() para que lo maneje el middleware de errores.
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
