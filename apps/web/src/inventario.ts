// Inventario (solo lectura) para la administradora y el jefe de logística: árbol de cuatro niveles
// tipo > elemento > variante > unidad física, con buscador. El contenido de cada nivel se arma
// solo cuando se abre, para que un inventario grande no haga lenta la página.

import './style.css';
import './panel.css';
import './inventario.css';
import { api } from './api';
import { exigirSesion, rutaPanelPorRol, type SesionActual } from './shared/api';
import { initPanelLayout } from './shared/layout';

// Estados posibles de una unidad física; deben coincidir con los de la base de datos.
type EstadoUnidad = 'bueno' | 'danado' | 'en_reparacion' | 'dado_de_baja' | 'perdido';

// Una pieza física concreta (con código de barras).
interface Unidad {
    id: number;
    codigoBarras: string | null;
    estado: EstadoUnidad;
    descripcionEstado: string | null;
    creadoEn: string;
    actualizadoEn: string;
}

// Una versión de un elemento (por ejemplo, otro modelo o tamaño).
interface Variante {
    id: number;
    nombre: string | null;
    descripcionDetallada: string | null;
    unidades: Unidad[];
}

// Un elemento del inventario (por ejemplo, un tipo de parlante).
interface Elemento {
    id: number;
    nombre: string;
    variantes: Variante[];
}

// Una categoría del inventario; es el nivel más alto del árbol.
interface Tipo {
    nombre: string;
    elementos: Elemento[];
}

// Cómo se nombra cada estado en pantalla.
const ESTADOS: Record<EstadoUnidad, string> = {
    bueno: 'Bueno',
    danado: 'Dañado',
    en_reparacion: 'En reparación',
    dado_de_baja: 'Dado de baja',
    perdido: 'Perdido'
};

// Atajo para buscar un elemento de la página por su id.
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const arbol = $('arbol');
const estado = $('estado');
const resumen = $('resumen');
const buscador = $<HTMLInputElement>('buscador');

// Estado: árbol cargado del servidor y si ya terminó la carga.
let tipos: Tipo[] = [];
let cargado = false;
// Posición de cada tipo en la lista completa: así su clave no cambia al filtrar.
const tiposIndice = new Map<string, number>();
// Búsqueda del árbol completo por clave, para armar el contenido de un nivel al desplegarlo.
const tiposPorClave = new Map<string, Tipo>();
const elementosPorClave = new Map<string, Elemento>();
const variantesPorClave = new Map<string, Variante>();
const unidadesPorClave = new Map<string, Unidad>();
// Niveles que la persona dejó abiertos (se conservan al buscar y al limpiar la búsqueda).
const abiertos = new Set<string>();

// Claves únicas de cada nivel ("t:", "e:", "v:", "u:"); identifican qué nivel está abierto.
const claveTipo = (i: number): string => `t:${i}`;
const claveElemento = (e: Elemento): string => `e:${e.id}`;
const claveVariante = (v: Variante): string => `v:${v.id}`;
const claveUnidad = (u: Unidad): string => `u:${u.id}`;

// Escapa un texto antes de insertarlo como HTML.
function esc(texto: string): string {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML.replace(/"/g, '&quot;');
}

/** Minúsculas y sin tildes, para que "dañado" y "danado" coincidan al buscar. */
function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// "1 unidad" / "3 unidades".
function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

// Los contadores de cada nivel cuentan solo unidades físicas, no los niveles de abajo.
const unidadesDeElemento = (e: Elemento): number => e.variantes.reduce((n, v) => n + v.unidades.length, 0);
const unidadesDeTipo = (t: Tipo): number => t.elementos.reduce((n, e) => n + unidadesDeElemento(e), 0);
const textoUnidades = (n: number): string => plural(n, 'unidad', 'unidades');

// Fecha y hora cortas en español; si no es válida, se muestra tal cual.
function formatearFecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Nombre de la variante, o "Variante #id" si no tiene.
function nombreVariante(v: Variante): string {
    return v.nombre?.trim() || `Variante #${v.id}`;
}

// ---------- Armado de los niveles ----------
interface Nodo {
    clave: string;
    nivel: 1 | 2 | 3 | 4;
    icono: string;
    titulo: string;
    /** HTML de la derecha del encabezado (conteo o estado). */
    meta: string;
    abierto: boolean;
    /** Contenido del nivel; solo se arma cuando está abierto. */
    cuerpo: () => string;
}

function idCuerpo(clave: string): string {
    return `inv-${clave.replace(':', '-')}`;
}

function nodoHtml(n: Nodo): string {
    const id = idCuerpo(n.clave);
    return `
        <div class="inv-nodo inv-n${n.nivel}">
            <button type="button" class="inv-cab" data-clave="${esc(n.clave)}" aria-expanded="${n.abierto}" aria-controls="${id}">
                <i class="fa-solid fa-chevron-right inv-flecha" aria-hidden="true"></i>
                <i class="fa-solid ${n.icono} inv-icono" aria-hidden="true"></i>
                <span class="inv-titulo">${esc(n.titulo)}</span>
                <span class="inv-meta">${n.meta}</span>
            </button>
            <div class="inv-cuerpo" id="${id}"${n.abierto ? '' : ' hidden'}>${n.abierto ? n.cuerpo() : ''}</div>
        </div>`;
}

// Mensaje para un nivel sin contenido.
function vacio(texto: string): string {
    return `<p class="inv-vacio">${texto}</p>`;
}

// Una pareja etiqueta/valor del detalle de una unidad.
function dato(etiqueta: string, valor: string): string {
    return `<div class="inv-dato"><dt>${etiqueta}</dt><dd>${valor}</dd></div>`;
}

// Etiqueta de color con el estado de la unidad.
function insigniaEstado(e: EstadoUnidad): string {
    return `<span class="inv-estado inv-estado-${e}">${ESTADOS[e]}</span>`;
}

// Detalle de una unidad: ID, estado y fechas.
function cuerpoUnidad(u: Unidad): string {
    return `<dl class="inv-datos">
        ${dato('ID', String(u.id))}
        ${dato('Estado', insigniaEstado(u.estado))}
        ${u.descripcionEstado ? dato('Detalle del estado', esc(u.descripcionEstado)) : ''}
        ${dato('Registrada', formatearFecha(u.creadoEn))}
        ${dato('Última actualización', formatearFecha(u.actualizadoEn))}
    </dl>`;
}

// Nivel 4: la unidad física.
function nodoUnidad(u: Unidad): string {
    const clave = claveUnidad(u);
    return nodoHtml({
        clave,
        nivel: 4,
        icono: 'fa-barcode',
        // La unidad se identifica por su código de barras; sin código, por su ID.
        titulo: u.codigoBarras ?? `Sin código de barras (ID ${u.id})`,
        meta: insigniaEstado(u.estado),
        abierto: abiertos.has(clave),
        cuerpo: () => cuerpoUnidad(u)
    });
}

// Contenido de una variante: su descripción y sus unidades.
function cuerpoVariante(v: Variante): string {
    const detalle = v.descripcionDetallada?.trim()
        ? `<p class="inv-detalle">${esc(v.descripcionDetallada.trim())}</p>`
        : '';
    const unidades = v.unidades.length
        ? v.unidades.map(nodoUnidad).join('')
        : vacio('Sin unidades registradas.');
    return detalle + unidades;
}

// Nivel 3: la variante.
function nodoVariante(v: Variante, forzadas: Set<string>): string {
    const clave = claveVariante(v);
    return nodoHtml({
        clave,
        nivel: 3,
        icono: 'fa-tags',
        titulo: nombreVariante(v),
        meta: `<span class="inv-conteo">${textoUnidades(v.unidades.length)}</span>`,
        abierto: abiertos.has(clave) || forzadas.has(clave),
        cuerpo: () => cuerpoVariante(v)
    });
}

// Contenido de un elemento: sus variantes.
function cuerpoElemento(e: Elemento, forzadas: Set<string>): string {
    return e.variantes.length
        ? e.variantes.map(v => nodoVariante(v, forzadas)).join('')
        : vacio('Este elemento no tiene variantes.');
}

// Nivel 2: el elemento.
function nodoElemento(e: Elemento, forzadas: Set<string>): string {
    const clave = claveElemento(e);
    return nodoHtml({
        clave,
        nivel: 2,
        icono: 'fa-cube',
        titulo: e.nombre,
        meta: `<span class="inv-conteo">${textoUnidades(unidadesDeElemento(e))}</span>`,
        abierto: abiertos.has(clave) || forzadas.has(clave),
        cuerpo: () => cuerpoElemento(e, forzadas)
    });
}

// Nivel 1: el tipo.
function nodoTipo(t: Tipo, forzadas: Set<string>): string {
    const clave = claveTipo(tiposIndice.get(t.nombre)!);
    return nodoHtml({
        clave,
        nivel: 1,
        icono: 'fa-layer-group',
        titulo: t.nombre,
        meta: `<span class="inv-conteo">${textoUnidades(unidadesDeTipo(t))}</span>`,
        abierto: abiertos.has(clave) || forzadas.has(clave),
        cuerpo: () => t.elementos.map(e => nodoElemento(e, forzadas)).join('')
    });
}

// Reconstruye los índices por clave cada vez que llegan datos del servidor.
function indexar(): void {
    tiposPorClave.clear();
    elementosPorClave.clear();
    variantesPorClave.clear();
    unidadesPorClave.clear();
    tiposIndice.clear();
    tipos.forEach((t, i) => {
        tiposIndice.set(t.nombre, i);
        tiposPorClave.set(claveTipo(i), t);
        for (const e of t.elementos) {
            elementosPorClave.set(claveElemento(e), e);
            for (const v of e.variantes) {
                variantesPorClave.set(claveVariante(v), v);
                for (const u of v.unidades) unidadesPorClave.set(claveUnidad(u), u);
            }
        }
    });
}

// ---------- Búsqueda ----------
function textoUnidad(u: Unidad): string {
    return normalizar(`${u.codigoBarras ?? ''} ${ESTADOS[u.estado]} ${u.id}`);
}

/**
 * Deja solo las ramas que coinciden con la búsqueda. Un nivel que coincide por su
 * nombre se muestra completo; los que solo contienen coincidencias más abajo se
 * agregan a `forzadas` para que se abran hasta llegar a ellas.
 */
function filtrar(q: string, forzadas: Set<string>): Tipo[] {
    if (q === '') return tipos;
    const coincide = (texto: string | null): boolean => texto !== null && normalizar(texto).includes(q);

    const resultado: Tipo[] = [];
    for (const t of tipos) {
        if (coincide(t.nombre)) {
            resultado.push(t);
            continue;
        }
        const elementos: Elemento[] = [];
        for (const e of t.elementos) {
            if (coincide(e.nombre)) {
                elementos.push(e);
                continue;
            }
            const variantes: Variante[] = [];
            for (const v of e.variantes) {
                if (coincide(v.nombre)) {
                    variantes.push(v);
                    continue;
                }
                const unidades = v.unidades.filter(u => textoUnidad(u).includes(q));
                if (unidades.length) {
                    variantes.push({ ...v, unidades });
                    forzadas.add(claveVariante(v));
                }
            }
            if (variantes.length) {
                elementos.push({ ...e, variantes });
                forzadas.add(claveElemento(e));
            }
        }
        if (elementos.length) {
            resultado.push({ ...t, elementos });
            forzadas.add(claveTipo(tiposIndice.get(t.nombre)!));
        }
    }
    return resultado;
}

// ---------- Pantalla ----------
function render(): void {
    const q = normalizar(buscador.value.trim());
    const forzadas = new Set<string>();
    const visibles = filtrar(q, forzadas);

    const elementos = visibles.reduce((n, t) => n + t.elementos.length, 0);
    const variantes = visibles.reduce((n, t) => n + t.elementos.reduce((m, e) => m + e.variantes.length, 0), 0);
    const unidades = visibles.reduce((n, t) => n + unidadesDeTipo(t), 0);

    resumen.hidden = false;
    resumen.textContent = `${q === '' ? '' : 'Coincidencias: '}${plural(visibles.length, 'tipo', 'tipos')} · `
        + `${plural(elementos, 'elemento', 'elementos')} · ${plural(variantes, 'variante', 'variantes')} · `
        + `${plural(unidades, 'unidad', 'unidades')}`;

    if (visibles.length === 0) {
        arbol.innerHTML = vacio(q === ''
            ? 'Todavía no hay elementos en el inventario.'
            : `Nada coincide con «${esc(buscador.value.trim())}».`);
        return;
    }
    arbol.innerHTML = visibles.map(t => nodoTipo(t, forzadas)).join('');
}

/** Contenido de un nivel que se despliega por primera vez, sacado del árbol completo. */
function cuerpoDe(clave: string): string {
    const tipo = tiposPorClave.get(clave);
    if (tipo) return tipo.elementos.map(e => nodoElemento(e, new Set())).join('');
    const elemento = elementosPorClave.get(clave);
    if (elemento) return cuerpoElemento(elemento, new Set());
    const variante = variantesPorClave.get(clave);
    if (variante) return cuerpoVariante(variante);
    const unidad = unidadesPorClave.get(clave);
    return unidad ? cuerpoUnidad(unidad) : '';
}

// Abre o cierra un nivel; el contenido se arma la primera vez que se abre.
function alternar(cab: HTMLElement): void {
    const clave = cab.dataset.clave!;
    const cuerpo = $(cab.getAttribute('aria-controls')!);
    const abrir = cab.getAttribute('aria-expanded') !== 'true';
    if (abrir && cuerpo.childElementCount === 0) cuerpo.innerHTML = cuerpoDe(clave);
    cab.setAttribute('aria-expanded', String(abrir));
    cuerpo.hidden = !abrir;
    if (abrir) abiertos.add(clave);
    else abiertos.delete(clave);
}

// Trae el inventario completo del servidor y lo dibuja.
async function cargar(): Promise<void> {
    try {
        const json = await api<{ tipos: Tipo[] }>('GET', '/api/inventario');
        tipos = json.tipos;
        indexar();
        cargado = true;
        estado.hidden = true;
        render();
    } catch (err) {
        estado.classList.add('error');
        estado.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudo cargar el inventario: ${esc((err as Error).message)}`;
    }
}

// Un solo oyente para todo el árbol: el clic en cualquier encabezado abre o cierra su nivel.
arbol.addEventListener('click', ev => {
    const cab = (ev.target as HTMLElement).closest<HTMLElement>('.inv-cab');
    if (cab) alternar(cab);
});

// Cada letra del buscador vuelve a filtrar el árbol.
buscador.addEventListener('input', () => {
    if (cargado) render();
});

// Menú lateral del jefe de logística (solo ve logística e inventario).
const RAIL_LOGISTICA = `
    <a href="panel-logistica.html" class="rail-item"><i class="fa-solid fa-truck"></i><span>Logística</span></a>
    <a href="inventario.html" class="rail-item active"><i class="fa-solid fa-boxes-stacked"></i><span>Inventario</span></a>
`;

// Arranque: lo ven la administradora y el jefe de logística; cualquier otro rol va a su panel.
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = (await exigirSesion()) as SesionActual;
    if (sesion.rol !== 'administrador' && sesion.rol !== 'jefe_logistica') {
        window.location.href = rutaPanelPorRol(sesion.rol);
        return;
    }
    initPanelLayout(sesion);
    // El riel de la página es el de la administradora; el jefe de logística tiene el suyo.
    if (sesion.rol === 'jefe_logistica') $('railNav').innerHTML = RAIL_LOGISTICA;

    await cargar();
});
