import type { NextFunction, Request, Response } from 'express';

type ErrorConDetalle = Error & { code?: string; type?: string };

/**
 * Manejador de errores central: toda ruta async usa asyncHandler() (ver src/asyncHandler.ts),
 * que reenvía acá cualquier error en vez de dejarlo crashear el proceso.
 */
export function manejadorErrores(err: ErrorConDetalle, _req: Request, res: Response, _next: NextFunction) {
    // P0001 = RAISE EXCEPTION desde un trigger de Postgres (ej. validaciones de negocio
    // como límites de fecha en `events`): el mensaje ya está pensado para el usuario final,
    // no es un bug — se muestra tal cual en vez del 500 genérico.
    if (err.code === 'P0001') {
        return res.status(400).json({ status: 'error', message: err.message });
    }

    // Subida de archivos (multer): lo habitual es un archivo más grande que el límite.
    if (err.name === 'MulterError') {
        const demasiadoGrande = err.code === 'LIMIT_FILE_SIZE';
        return res.status(demasiadoGrande ? 413 : 400).json({
            status: 'error',
            message: demasiadoGrande ? 'El archivo es demasiado grande (máximo 10 MB).' : 'No se pudo recibir el archivo. Intenta de nuevo.'
        });
    }

    // Cuerpo de la petición mal formado o demasiado grande (body-parser).
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ status: 'error', message: 'La solicitud no tiene un formato válido.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ status: 'error', message: 'La solicitud es demasiado grande.' });
    }

    console.error('Error no controlado en una ruta:', err);
    if (res.headersSent) return;
    res.status(500).json({ status: 'error', message: 'Ocurrió un error inesperado en el servidor. Intenta de nuevo.' });
}
