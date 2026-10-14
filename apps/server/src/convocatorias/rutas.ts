// Rutas HTTP de las convocatorias de disponibilidad de personal (Numeral 3).
//
// Administradora (sesión + rol administrador, igual que el resto de paneles):
//   POST /api/convocatorias                     crea una convocatoria para un evento
//   GET  /api/convocatorias?cotizacionId=N      convocatorias y respuestas de un evento, más los
//                                               datos del evento y si admite nuevas convocatorias
//   GET  /api/convocatorias/trabajadores?cotizacionId=N
//                                               trabajadores y si se pueden convocar a ese evento
//   POST /api/convocatorias/:id/enviar          inicia el envío (solo una vez, aunque se repita)
// n8n (token compartido en el encabezado Authorization, sin sesión):
//   POST /api/integraciones/whatsapp/respuestas registra un mensaje entrante de WhatsApp
//
// Errores: { status: 'error', codigo, message, detalles? } con 400 (solicitud mal formada),
// 401/403 (sin sesión / sin rol), 404 (no existe), 409 (el estado actual no lo permite) o
// 422 (algún trabajador no se puede convocar).

import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../asyncHandler';
import { requireAuth, requireRole } from '../auth';
import type { Consulta } from './consulta';
import {
    aEnteroPositivo,
    crearConvocatoria,
    describirEvento,
    ErrorConvocatoria,
    esUuid,
    iniciarEnvio,
    listarConvocatorias,
    listarTrabajadoresConvocables,
    registrarMensajeEntrante,
    validarMensajeEntrante,
    validarSolicitudCrear
} from './servicio';

function manejarErrores(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (err instanceof ErrorConvocatoria) {
        res.status(err.estadoHttp).json({
            status: 'error',
            codigo: err.codigo,
            message: err.message,
            ...(err.detalles !== undefined ? { detalles: err.detalles } : {})
        });
        return;
    }
    // Carreras entre solicitudes: la base de datos es la última barrera
    const codigoBd = (err as { code?: unknown } | null)?.code;
    if (codigoBd === '23503') {
        res.status(409).json({
            status: 'error',
            codigo: 'REFERENCIA_INVALIDA',
            message: 'Algún dato relacionado (evento, trabajador o usuario) ya no existe. Actualiza la página e intenta de nuevo.'
        });
        return;
    }
    if (codigoBd === '23505') {
        res.status(409).json({
            status: 'error',
            codigo: 'DUPLICADO',
            message: 'Ya existe un registro igual. Actualiza la página e intenta de nuevo.'
        });
        return;
    }
    next(err);
}

export function crearConvocatoriasRouter(db: Consulta): Router {
    const router = Router();
    router.use(requireAuth, requireRole('administrador'));

    const leerCotizacionId = (req: Request): number => {
        const cotizacionId = aEnteroPositivo(req.query.cotizacionId);
        if (cotizacionId === null) {
            throw new ErrorConvocatoria(400, 'COTIZACION_INVALIDA', 'Indica el evento con ?cotizacionId=');
        }
        return cotizacionId;
    };

    router.get('/', asyncHandler(async (req, res) => {
        const cotizacionId = leerCotizacionId(req);
        const evento = await describirEvento(db, cotizacionId);
        const convocatorias = await listarConvocatorias(db, cotizacionId);
        res.json({ status: 'ok', evento, convocatorias });
    }));

    router.get('/trabajadores', asyncHandler(async (req, res) => {
        const trabajadores = await listarTrabajadoresConvocables(db, leerCotizacionId(req));
        res.json({ status: 'ok', trabajadores });
    }));

    router.post('/', asyncHandler(async (req, res) => {
        const solicitud = validarSolicitudCrear(req.body);
        const convocatoria = await crearConvocatoria(db, solicitud);
        res.status(201).json({ status: 'ok', convocatoria });
    }));

    router.post('/:id/enviar', asyncHandler(async (req, res) => {
        const id = String(req.params.id);
        if (!esUuid(id)) {
            throw new ErrorConvocatoria(400, 'CONVOCATORIA_INVALIDA', 'El identificador de la convocatoria no es válido');
        }
        const convocatoria = await iniciarEnvio(db, id.toLowerCase());
        res.status(202).json({
            status: 'ok',
            message: 'Envío iniciado. Aún no hay integración con WhatsApp: todavía no se ha enviado ningún mensaje.',
            convocatoria
        });
    }));

    router.use(manejarErrores);
    return router;
}

const LARGO_MINIMO_TOKEN = 32;
const sha256 = (texto: string): Buffer => createHash('sha256').update(texto).digest();

/**
 * Autentica las llamadas de n8n con un token compartido (Authorization: Bearer ...). Si el
 * servidor no tiene token configurado (o es demasiado corto) rechaza todo con 503 en vez de
 * dejar el endpoint abierto. Se compara el hash en tiempo constante.
 */
export function autenticarIntegracion(tokenEsperado: string | undefined): RequestHandler {
    const hashEsperado = tokenEsperado && tokenEsperado.length >= LARGO_MINIMO_TOKEN ? sha256(tokenEsperado) : null;
    return (req, res, next) => {
        if (!hashEsperado) {
            res.status(503).json({
                status: 'error',
                codigo: 'INTEGRACION_NO_CONFIGURADA',
                message: `La integración con n8n no está configurada en el servidor (N8N_CALLBACK_TOKEN, mínimo ${LARGO_MINIMO_TOKEN} caracteres).`
            });
            return;
        }
        const recibido = /^Bearer (\S+)$/i.exec(req.header('authorization') ?? '')?.[1] ?? '';
        if (!timingSafeEqual(sha256(recibido), hashEsperado)) {
            res.setHeader('WWW-Authenticate', 'Bearer');
            res.status(401).json({ status: 'error', codigo: 'NO_AUTORIZADO', message: 'Token de integración inválido' });
            return;
        }
        next();
    };
}

export function crearIntegracionesRouter(db: Consulta, tokenEsperado: string | undefined): Router {
    const router = Router();
    router.use(autenticarIntegracion(tokenEsperado));

    // Numeral 3: autentica, valida y registra el mensaje (sin duplicarlo). Numeral 9: aquí se
    // asociará al trabajador y se actualizará su respuesta.
    router.post('/whatsapp/respuestas', asyncHandler(async (req, res) => {
        const mensaje = validarMensajeEntrante(req.body);
        const { duplicado } = await registrarMensajeEntrante(db, mensaje);
        if (duplicado) {
            res.status(200).json({
                status: 'ok',
                duplicado: true,
                message: 'El mensaje ya estaba registrado; no se procesó de nuevo.'
            });
            return;
        }
        res.status(201).json({ status: 'ok', duplicado: false, message: 'Mensaje registrado.' });
    }));

    router.use(manejarErrores);
    return router;
}
