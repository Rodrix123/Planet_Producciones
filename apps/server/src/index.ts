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

// Manejador de errores central: toda ruta async usa asyncHandler() (ver src/asyncHandler.ts),
// que reenvía acá cualquier error en vez de dejarlo crashear el proceso.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error no controlado en una ruta:', err);
    if (res.headersSent) return;
    res.status(500).json({ status: 'error', message: 'Ocurrió un error inesperado en el servidor. Intenta de nuevo.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
