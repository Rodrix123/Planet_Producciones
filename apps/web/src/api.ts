const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Llama a la API del servidor y devuelve el JSON; lanza un Error con un mensaje legible si falla. */
export async function api<T = Record<string, unknown>>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    let resp: Response;
    try {
        resp = await fetch(`${API_URL}${ruta}`, {
            method: metodo,
            headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
            body: cuerpo ? JSON.stringify(cuerpo) : undefined
        });
    } catch {
        throw new Error('No se pudo conectar con el servidor.');
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.message || `Error ${resp.status}`);
    return json as T;
}
