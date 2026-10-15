import { Pool, types } from 'pg';

if (!process.env.DATABASE_URL) {
    throw new Error('Falta configurar DATABASE_URL en apps/server/.env');
}

// Por defecto 'pg' convierte las columnas `date` en objetos Date de JS (interpretando
// medianoche UTC), lo que rompe el formato 'YYYY-MM-DD' que espera el resto del código
// y puede desfasar el día según la zona horaria. Las devolvemos como texto plano.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
