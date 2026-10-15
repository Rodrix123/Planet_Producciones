import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { authRouter } from './routes/auth.routes';
import { cotizacionesRouter } from './routes/cotizaciones.routes';
import { empleadosRouter } from './routes/empleados.routes';
import { contratosRouter } from './routes/contratos.routes';
import { logisticaRouter } from './routes/logistica.routes';
import { catalogoRouter } from './routes/catalogo.routes';
import { pqrsRouter } from './routes/pqrs.routes';
import { inventarioRouter } from './routes/inventario.routes';
import { cuentasAccesoRouter } from './routes/cuentasAcceso.routes';
import { panelRouter } from './routes/panel.routes';
import { eventosRouter } from './routes/eventos.routes';

// Red de seguridad: en Node 18+ un rechazo de promesa no manejado (fuera de una ruta
// Express, p.ej. en un .then()/.catch() que se nos escapó) termina el proceso completo
// por defecto. Para una app interna de 3 usuarios, es mejor registrar el error y seguir
// funcionando que tumbar la app entera para todos por un solo fallo puntual.
process.on('unhandledRejection', (reason) => {
    console.error('Rechazo de promesa no manejado:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Excepción no capturada:', err);
});

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'assets')));
// Sirve el frontend compilado (apps/web/dist) para abrir la app en http://localhost:PORT
app.use(express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

app.use('/api/auth', authRouter);
app.use('/api/catalogo', catalogoRouter);
app.use('/api/cotizaciones', cotizacionesRouter);
app.use('/api/empleados', empleadosRouter);
app.use('/api/contratos', contratosRouter);
app.use('/api/logistica', logisticaRouter);
app.use('/api/pqrs', pqrsRouter);
app.use('/api/inventario', inventarioRouter);
app.use('/api/cuentas-acceso', cuentasAccesoRouter);
app.use('/api/panel', panelRouter);
app.use('/api/eventos', eventosRouter);

// Manejador de errores central: toda ruta async usa asyncHandler() (ver src/asyncHandler.ts),
// que reenvía acá cualquier error en vez de dejarlo crashear el proceso.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // P0001 = RAISE EXCEPTION desde un trigger de Postgres (ej. validaciones de negocio
    // como límites de fecha en `events`): el mensaje ya está pensado para el usuario final,
    // no es un bug — se muestra tal cual en vez del 500 genérico.
    if ((err as NodeJS.ErrnoException & { code?: string }).code === 'P0001') {
        return res.status(400).json({ status: 'error', message: err.message });
    }

    console.error('Error no controlado en una ruta:', err);
    if (res.headersSent) return;
    res.status(500).json({ status: 'error', message: 'Ocurrió un error inesperado en el servidor. Intenta de nuevo.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
