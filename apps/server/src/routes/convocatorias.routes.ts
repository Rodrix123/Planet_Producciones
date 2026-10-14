import { pool } from '../db';
import { consultaDePool } from '../convocatorias/consulta';
import { crearConvocatoriasRouter, crearIntegracionesRouter } from '../convocatorias/rutas';

// Conecta las rutas de convocatorias con la base real. La lógica vive en src/convocatorias/
// (recibe la conexión por parámetro para poder probarse sin tocar la base de datos).
const db = consultaDePool(pool);

export const convocatoriasRouter = crearConvocatoriasRouter(db);
export const integracionesRouter = crearIntegracionesRouter(db, process.env.N8N_CALLBACK_TOKEN);
