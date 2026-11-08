// Límite de peticiones por persona (por IP) para las rutas que no exigen sesión, o que la crean:
// el inicio de sesión y los formularios públicos (cotizar y PQRS). Sin esto, cualquiera podía probar
// contraseñas sin parar o llenar la base de cotizaciones y la bandeja de PQRS con basura.
//
// Es un contador en memoria con ventana fija: simple y sin dependencias. Sirve para un solo servidor
// (el caso de esta app); con varios habría que moverlo a un almacén compartido.
// Detrás de nginx o un balanceador, definir TRUST_PROXY=true para que req.ip sea la del visitante y no la del proxy.

import type { NextFunction, Request, RequestHandler, Response } from 'express';

interface Opciones {
    /** Cuántas peticiones (o fallos, si `soloFallos`) se permiten en cada ventana. */
    maximo: number;
    /** Duración de la ventana, en milisegundos. */
    ventanaMs: number;
    /** Texto que se le muestra a quien excede el límite. */
    mensaje: string;
    /** Cuenta solo las respuestas de error 401 (inicio de sesión): entrar bien no gasta intentos. */
    soloFallos?: boolean;
    /** Qué más identifica a quien llama, además de la IP (p. ej. el correo que intenta entrar). */
    clave?: (req: Request) => string;
    /** Reloj, para poder probarlo sin esperar. */
    ahora?: () => number;
}

interface Contador {
    cuenta: number;
    reinicio: number;
}

export function limitar(opciones: Opciones): RequestHandler {
    const ahora = opciones.ahora ?? Date.now;
    const contadores = new Map<string, Contador>();

    // Limpieza de entradas vencidas para que el mapa no crezca sin fin.
    const limpieza = setInterval(() => {
        const t = ahora();
        for (const [k, c] of contadores) if (c.reinicio <= t) contadores.delete(k);
    }, Math.min(opciones.ventanaMs, 60_000));
    limpieza.unref();

    const vigente = (k: string): Contador | undefined => {
        const c = contadores.get(k);
        if (c && c.reinicio <= ahora()) { contadores.delete(k); return undefined; }
        return c;
    };
    const sumar = (k: string) => {
        const c = vigente(k);
        if (c) c.cuenta += 1;
        else contadores.set(k, { cuenta: 1, reinicio: ahora() + opciones.ventanaMs });
    };

    return (req: Request, res: Response, next: NextFunction) => {
        const k = `${req.ip}|${opciones.clave ? opciones.clave(req) : ''}`;
        const c = vigente(k);

        if (c && c.cuenta >= opciones.maximo) {
            const segundos = Math.max(1, Math.ceil((c.reinicio - ahora()) / 1000));
            res.setHeader('Retry-After', String(segundos));
            return res.status(429).json({ status: 'error', message: opciones.mensaje });
        }

        if (opciones.soloFallos) {
            res.on('finish', () => { if (res.statusCode === 401) sumar(k); });
        } else {
            sumar(k);
        }
        next();
    };
}

/** Correo que se intenta usar, normalizado: el límite del login se cuenta por IP y por correo. */
export const correoDelCuerpo = (req: Request): string => {
    const correo = (req.body as { correo?: unknown } | undefined)?.correo;
    return typeof correo === 'string' ? correo.trim().toLowerCase().slice(0, 150) : '';
};

// Las pruebas automáticas hacen decenas de peticiones seguidas desde la misma IP: ahí se desactivan los límites.
const crear = (opciones: Opciones): RequestHandler =>
    process.env.LIMITES_DESACTIVADOS === 'true' ? (_req, _res, next) => next() : limitar(opciones);

// Límites de la aplicación (se crean una sola vez, al cargar el módulo).
export const limiteLogin = crear({
    maximo: 8,
    ventanaMs: 15 * 60_000,
    soloFallos: true,
    clave: correoDelCuerpo,
    mensaje: 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.'
});

export const limiteCotizar = crear({
    maximo: 40,
    ventanaMs: 60 * 60_000,
    mensaje: 'Has enviado muchas cotizaciones seguidas. Intenta de nuevo en un rato o escríbenos por WhatsApp.'
});

export const limitePqrs = crear({
    maximo: 10,
    ventanaMs: 60 * 60_000,
    mensaje: 'Has enviado muchos mensajes seguidos. Intenta de nuevo en un rato o escríbenos por WhatsApp.'
});
