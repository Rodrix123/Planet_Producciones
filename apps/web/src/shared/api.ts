const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Construye una URL absoluta hacia el API a partir de una ruta relativa como '/api/x'. */
export function apiUrl(path: string): string {
    return `${API_BASE}${path}`;
}

export type UsuarioRol = 'administradora' | 'secretaria' | 'jefe_logistica';

export interface SesionActual {
    nombre: string;
    correo: string;
    rol: UsuarioRol;
    debeCambiarPassword: boolean;
}

/**
 * fetch() con la sesión (cookie httpOnly) incluida. Si el servidor responde
 * 401, redirige a login.html — salvo cuando la propia página de login está
 * consultando /api/auth/login o /api/auth/me.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    // Si el body es FormData (subida de archivos), no fijamos Content-Type: el navegador
    // debe generar el boundary multipart automáticamente.
    const esFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
            ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
            ...(options.headers || {})
        }
    });

    const enPaginaLogin = window.location.pathname.endsWith('login.html');
    if (res.status === 401 && !enPaginaLogin) {
        window.location.href = 'login.html';
    }

    return res;
}

const RUTA_POR_ROL: Record<UsuarioRol, string> = {
    administradora: 'panel-admin.html',
    secretaria: 'panel-secretaria.html',
    jefe_logistica: 'panel-logistica.html'
};

export function rutaPanelPorRol(rol: UsuarioRol): string {
    return RUTA_POR_ROL[rol];
}

declare const Swal: any;

/**
 * Envuelve el handler de un botón/acción para que una falla de red (servidor apagado,
 * sin conexión, etc.) nunca quede en silencio — sin esto, un fetch() que rechaza dentro
 * de un listener async se pierde como una promesa no manejada y la UI parece "no reaccionar".
 */
export function conManejoDeErrores(accion: () => Promise<void>): () => Promise<void> {
    return async () => {
        try {
            await accion();
        } catch (err) {
            console.error(err);
            const mensaje = 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.';
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Sin conexión', text: mensaje, confirmButtonColor: '#f97316' });
            } else {
                alert(mensaje);
            }
        }
    };
}

/**
 * Exige una sesión activa para la página actual. Si falta la sesión, redirige
 * a login. Si falta cambiar la contraseña obligatoria, redirige a esa pantalla
 * (salvo que la página actual ya sea cambiar-password.html). Si la sesión es
 * de otro rol distinto al esperado, redirige a su panel correspondiente.
 */
export async function exigirSesion(rolEsperado?: UsuarioRol): Promise<SesionActual> {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) {
        window.location.href = 'login.html';
        return new Promise(() => {});
    }

    const sesion = (await res.json()) as SesionActual;
    const enCambiarPassword = window.location.pathname.endsWith('cambiar-password.html');

    if (sesion.debeCambiarPassword && !enCambiarPassword) {
        window.location.href = 'cambiar-password.html';
        return new Promise(() => {});
    }

    if (rolEsperado && sesion.rol !== rolEsperado) {
        window.location.href = rutaPanelPorRol(sesion.rol);
        return new Promise(() => {});
    }

    return sesion;
}
