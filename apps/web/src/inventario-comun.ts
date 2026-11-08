// Piezas compartidas por el menú de inventario (inventario.ts) y la página de detalle de
// un elemento (inventario-elemento.ts): tipos de datos, formato de textos y arranque.

import { exigirSesion, rutaPanelPorRol, type SesionActual } from './shared/api';
import { initPanelLayout } from './shared/layout';

// Estados posibles de una unidad física; deben coincidir con los de la base de datos.
export type EstadoUnidad = 'bueno' | 'danado' | 'en_reparacion' | 'dado_de_baja' | 'perdido';

// Una pieza física concreta (con código de barras).
export interface Unidad {
    id: number;
    codigoBarras: string | null;
    estado: EstadoUnidad;
    descripcionEstado: string | null;
    creadoEn: string;
    actualizadoEn: string;
}

// Una versión de un elemento (por ejemplo, otro modelo o tamaño).
export interface Variante {
    id: number;
    nombre: string | null;
    descripcionDetallada: string | null;
    unidades: Unidad[];
}

// Un elemento del inventario (por ejemplo, un tipo de parlante).
export interface Elemento {
    id: number;
    nombre: string;
    variantes: Variante[];
}

// Una categoría del inventario; es el nivel más alto del árbol.
export interface Tipo {
    nombre: string;
    elementos: Elemento[];
}

// Cómo se nombra cada estado en pantalla.
export const ESTADOS: Record<EstadoUnidad, string> = {
    bueno: 'Bueno',
    danado: 'Dañado',
    en_reparacion: 'En reparación',
    dado_de_baja: 'Dado de baja',
    perdido: 'Perdido'
};

// Atajo para buscar un elemento de la página por su id.
export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// Escapa un texto antes de insertarlo como HTML.
export function esc(texto: string): string {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML.replace(/"/g, '&quot;');
}

/** Minúsculas y sin tildes, para que "dañado" y "danado" coincidan al buscar. */
export function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// "1 unidad" / "3 unidades".
export function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

// Los contadores cuentan solo unidades físicas, no los niveles de abajo.
export const unidadesDeElemento = (e: Elemento): number => e.variantes.reduce((n, v) => n + v.unidades.length, 0);
export const textoUnidades = (n: number): string => plural(n, 'unidad', 'unidades');

// Fecha y hora cortas en español; si no es válida, se muestra tal cual.
export function formatearFecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Nombre de la variante, o "Variante #id" si no tiene.
export function nombreVariante(v: Variante): string {
    return v.nombre?.trim() || `Variante #${v.id}`;
}

// Etiqueta de color con el estado de la unidad.
export function insigniaEstado(e: EstadoUnidad): string {
    return `<span class="inv-estado inv-estado-${e}">${ESTADOS[e]}</span>`;
}

// Mensaje para un nivel o tabla sin contenido.
export function vacio(texto: string): string {
    return `<p class="inv-vacio">${texto}</p>`;
}

// Menú lateral del jefe de logística (solo ve logística e inventario).
const RAIL_LOGISTICA = `
    <a href="panel-logistica.html" class="rail-item"><i class="fa-solid fa-truck"></i><span>Logística</span></a>
    <a href="inventario.html" class="rail-item active"><i class="fa-solid fa-boxes-stacked"></i><span>Inventario</span></a>
`;

/**
 * Arranque común: lo ven la administradora y el jefe de logística; cualquier otro rol va a su
 * panel. Cuando la sesión es válida, arma el riel y llama a `iniciar`.
 */
export function arrancarInventario(iniciar: () => Promise<void>): void {
    document.addEventListener('DOMContentLoaded', async () => {
        const sesion = (await exigirSesion()) as SesionActual;
        if (sesion.rol !== 'administrador' && sesion.rol !== 'jefe_logistica') {
            window.location.href = rutaPanelPorRol(sesion.rol);
            return;
        }
        initPanelLayout(sesion);
        // El riel de la página es el de la administradora; el jefe de logística tiene el suyo.
        if (sesion.rol === 'jefe_logistica') $('railNav').innerHTML = RAIL_LOGISTICA;

        await iniciar();
    });
}
