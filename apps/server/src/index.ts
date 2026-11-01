// Punto de entrada del servidor: configura Express, monta las rutas de cada módulo y arranca.
// Rutas públicas (sin sesión): /api/catalogo, POST /api/cotizaciones y POST /api/pqrs, que usa la
// página para clientes. El resto exige sesión y un rol (ver auth.ts).

import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
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
import { manejadorErrores } from './manejadorErrores';
import { CARPETA_ASSETS, CARPETA_WEB } from './rutas';

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

// Configuración general. CORS solo deja pasar al frontend (WEB_ORIGIN) y permite la cookie de sesión.
const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true }));
// Respuestas JSON y archivos estáticos comprimidos: el catálogo, por ejemplo, baja de ~18 KB a ~3 KB.
app.use(compression());
app.use(express.json());
app.use(cookieParser());
// Archivos públicos del servidor (logo).
app.use(express.static(CARPETA_ASSETS));
// Sirve el frontend compilado (apps/web/dist) para abrir la app en http://localhost:PORT
// Sirve el frontend compilado (apps/web/dist) para abrir la app completa desde el servidor.
app.use(express.static(CARPETA_WEB));

// Cada módulo de la aplicación tiene su archivo en routes/.
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

// Siempre al final: recoge los errores de todas las rutas anteriores.
app.use(manejadorErrores);

// Arranque del servidor.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
