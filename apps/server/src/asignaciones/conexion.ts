import type { Pool } from 'pg';

/**
 * Lo único que la asignación de personal necesita de la base de datos. Se inyecta para poder
 * probarla con un Postgres embebido (PGlite) sin tocar la base real; en producción es el Pool.
 */
export interface Conexion {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface BaseDeDatos extends Conexion {
    /** Ejecuta `trabajo` en una transacción: confirma si termina bien y la deshace si lanza un error. */
    transaccion<T>(trabajo: (conexion: Conexion) => Promise<T>): Promise<T>;
}

export function baseDeDatosDePool(pool: Pool): BaseDeDatos {
    return {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const resultado = await pool.query(sql, params);
            return { rows: resultado.rows as T[] };
        },
        async transaccion<T>(trabajo: (conexion: Conexion) => Promise<T>): Promise<T> {
            const cliente = await pool.connect();
            try {
                await cliente.query('begin');
                const resultado = await trabajo({
                    async query<F = Record<string, unknown>>(sql: string, params?: unknown[]) {
                        const r = await cliente.query(sql, params);
                        return { rows: r.rows as F[] };
                    }
                });
                await cliente.query('commit');
                return resultado;
            } catch (error) {
                await cliente.query('rollback').catch(() => undefined);
                throw error;
            } finally {
                cliente.release();
            }
        }
    };
}
