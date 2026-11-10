import { Router } from 'express';
import { listarPagos, registrarPago, ErrorPago } from '@my-app/db/pagos';
import { supabaseAdmin as clienteAdmin } from '../supabaseAdmin';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const pagosRouter = Router();

// packages/db es un módulo ESM y este servidor es CommonJS: TypeScript ve dos copias del tipo
// SupabaseClient (una por cada formato) aunque en ejecución es el mismo cliente.
const supabaseAdmin = clienteAdmin as unknown as Parameters<typeof listarPagos>[0];

// Menú "Pagos" de la administradora: registro manual de pagos de eventos confirmados
// (sin pasarela en línea). Las queries viven en packages/db/src/pagos.ts.
pagosRouter.use(requireAuth, requireRole('administrador'));

// Traduce los errores de negocio de packages/db a respuestas HTTP.
function conPagos(operacion: () => Promise<unknown>, status = 200) {
    return asyncHandler(async (_req, res) => {
        try {
            const resultado = await operacion();
            res.status(status).json({ status: 'ok', ...(resultado as object) });
        } catch (error) {
            if (error instanceof ErrorPago) {
                res.status(error.status).json({ status: 'error', message: error.message });
                return;
            }
            throw error;
        }
    });
}

pagosRouter.get('/', (req, res, next) =>
    conPagos(() => listarPagos(supabaseAdmin))(req, res, next));

pagosRouter.post('/', (req, res, next) =>
    conPagos(async () => ({ evento: await registrarPago(supabaseAdmin, req.body) }), 201)(req, res, next));
