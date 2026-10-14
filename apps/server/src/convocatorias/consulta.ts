import type { Pool } from 'pg';

/**
 * Lo único que la lógica de convocatorias necesita de la base de datos. Se inyecta para poder
 * probarla con un Postgres embebido (PGlite) sin tocar la base real; en producción es el Pool.
 */
export interface Consulta {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function consultaDePool(pool: Pool): Consulta {
    return {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const resultado = await pool.query(sql, params);
            return { rows: resultado.rows as T[] };
        }
    };
}
