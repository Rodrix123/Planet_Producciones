import { Router } from 'express';
import { crearEvento, listarEventos, listarOpcionesEvento, validarFechaEvento, ErrorEvento } from '@my-app/db/eventos';
import { supabaseAdmin as clienteAdmin } from '../supabaseAdmin';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const eventosRouter = Router();

// packages/db es un módulo ESM y este servidor es CommonJS: TypeScript ve dos copias del tipo
// SupabaseClient (una por cada formato) aunque en ejecución es el mismo cliente.
const supabaseAdmin = clienteAdmin as unknown as Parameters<typeof listarEventos>[0];

// Menú "Eventos" de la administradora: listado, opciones del formulario, validación
// de fecha y creación de un evento junto con su cotización (queries en packages/db).
eventosRouter.use(requireAuth, requireRole('administrador'));

// Traduce los errores de negocio de packages/db a respuestas HTTP.
function conEventos(operacion: () => Promise<unknown>, status = 200) {
    return asyncHandler(async (_req, res) => {
        try {
            const resultado = await operacion();
            res.status(status).json({ status: 'ok', ...(resultado as object) });
        } catch (error) {
            if (error instanceof ErrorEvento) {
                res.status(error.status).json({ status: 'error', message: error.message });
                return;
            }
            throw error;
        }
    });
}

eventosRouter.get('/', (req, res, next) =>
    conEventos(() => listarEventos(supabaseAdmin))(req, res, next));

eventosRouter.get('/opciones', (req, res, next) =>
    conEventos(() => listarOpcionesEvento(supabaseAdmin))(req, res, next));

// Comprueba si se puede crear un evento en esa fecha (?fecha=YYYY-MM-DD) y hora (?hora=HH:MM, opcional)
// antes de pasar a cotizar: la base debe aceptar la fecha y no puede haber otro evento a la misma hora.
eventosRouter.get('/fecha', (req, res, next) =>
    conEventos(() => validarFechaEvento(supabaseAdmin, req.query.fecha, req.query.hora))(req, res, next));

eventosRouter.post('/', (req, res, next) =>
    conEventos(async () => ({ evento: await crearEvento(supabaseAdmin, req.body) }), 201)(req, res, next));
