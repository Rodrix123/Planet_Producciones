// Conexión a la base de datos (Postgres de Supabase). Un solo pool compartido por todas las rutas.

import { Pool, types } from 'pg';

if (!process.env.DATABASE_URL) {
    throw new Error('Falta configurar DATABASE_URL en apps/server/.env');
}

// Por defecto 'pg' convierte las columnas `date` en objetos Date de JS (interpretando
// medianoche UTC), lo que rompe el formato 'YYYY-MM-DD' que espera el resto del código
// y puede desfasar el día según la zona horaria. Las devolvemos como texto plano.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// El pool reutiliza conexiones abiertas. `rejectUnauthorized: false` es lo habitual con el pooler de
// Supabase (su certificado no está en la lista pública de autoridades).
//  - idleTimeoutMillis: por defecto una conexión ociosa se cierra a los 10 s, y la siguiente petición paga
//    otra vez el handshake TLS con la base remota (más de 1 s). Con 60 s, el uso normal casi nunca lo paga.
//  - keepAlive: evita que un router o firewall corte una conexión ociosa sin avisar.
//  - connectionTimeoutMillis / statement_timeout: si la base no responde, la petición falla con un
//    error claro en vez de quedarse colgada para siempre.
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
    keepAlive: true
});

// Una conexión ociosa puede ser cortada por el servidor. Sin este oyente ese error llegaba a
// "Excepción no capturada"; el pool simplemente abre otra conexión en la siguiente petición.
pool.on('error', (error) => {
    console.error('Conexión ociosa de la base de datos cerrada:', error.message);
});
