const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Un 404 sin mensaje de la API (la API siempre responde JSON con "message") significa que quien
// contesta en esa dirección no tiene la ruta: otro servidor o una versión anterior.
const MENSAJE_404 =
    'El servidor no reconoce esta acción (error 404). Lo más probable es que en esa dirección esté corriendo '
    + 'una versión anterior o el servidor de otra carpeta: reinícialo con "npm run dev" desde la raíz del proyecto.';

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
    if (!resp.ok) throw new Error(json.message || (resp.status === 404 ? MENSAJE_404 : `Error ${resp.status}`));
    return json as T;
}
