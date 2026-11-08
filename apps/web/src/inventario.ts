// Inventario (solo lectura) para la administradora y el jefe de logística: árbol de dos niveles
// tipo > elemento, con buscador. Cada elemento abre su propia página (inventario-elemento.html)
// con la tabla de sus unidades físicas. El contenido de cada tipo se arma solo cuando se abre,
// para que un inventario grande no haga lenta la página.

import './style.css';
import './panel.css';
import './inventario.css';
import { api } from './api';
import {
    $, ESTADOS, arrancarInventario, esc, normalizar, plural, textoUnidades, unidadesDeElemento, vacio,
    type Elemento, type Tipo, type Unidad
} from './inventario-comun';

const arbol = $('arbol');
const estado = $('estado');
const resumen = $('resumen');
const buscador = $<HTMLInputElement>('buscador');

// Estado: árbol cargado del servidor y si ya terminó la carga.
let tipos: Tipo[] = [];
let cargado = false;
// Posición de cada tipo en la lista completa: así su clave no cambia al filtrar.
const tiposIndice = new Map<string, number>();
// Búsqueda del tipo por clave, para armar su contenido al desplegarlo.
const tiposPorClave = new Map<string, Tipo>();
// Tipos que la persona dejó abiertos (se conservan al buscar y al limpiar la búsqueda).
const abiertos = new Set<string>();

// Clave única de cada tipo; identifica qué tipo está abierto.
const claveTipo = (i: number): string => `t:${i}`;

const unidadesDeTipo = (t: Tipo): number => t.elementos.reduce((n, e) => n + unidadesDeElemento(e), 0);

// ---------- Armado de los niveles ----------
function idCuerpo(clave: string): string {
    return `inv-${clave.replace(':', '-')}`;
}

// Nivel 2: el elemento. No se despliega: abre su página con la tabla de unidades.
function nodoElemento(e: Elemento): string {
    return `
        <div class="inv-nodo inv-n2">
            <a class="inv-cab inv-enlace" href="inventario-elemento.html?id=${e.id}">
                <i class="fa-solid fa-cube inv-icono" aria-hidden="true"></i>
                <span class="inv-titulo">${esc(e.nombre)}</span>
                <span class="inv-meta">
                    <span class="inv-conteo">${textoUnidades(unidadesDeElemento(e))}</span>
                    <i class="fa-solid fa-chevron-right inv-ir" aria-hidden="true"></i>
                </span>
            </a>
        </div>`;
}

// Contenido de un tipo: sus elementos.
function cuerpoTipo(t: Tipo): string {
    return t.elementos.map(nodoElemento).join('');
}

// Nivel 1: el tipo, desplegable.
function nodoTipo(t: Tipo, forzadas: Set<string>): string {
    const clave = claveTipo(tiposIndice.get(t.nombre)!);
    const id = idCuerpo(clave);
    const abierto = abiertos.has(clave) || forzadas.has(clave);
    return `
        <div class="inv-nodo inv-n1">
            <button type="button" class="inv-cab" data-clave="${esc(clave)}" aria-expanded="${abierto}" aria-controls="${id}">
                <i class="fa-solid fa-chevron-right inv-flecha" aria-hidden="true"></i>
                <i class="fa-solid fa-layer-group inv-icono" aria-hidden="true"></i>
                <span class="inv-titulo">${esc(t.nombre)}</span>
                <span class="inv-meta"><span class="inv-conteo">${textoUnidades(unidadesDeTipo(t))}</span></span>
            </button>
            <div class="inv-cuerpo" id="${id}"${abierto ? '' : ' hidden'}>${abierto ? cuerpoTipo(t) : ''}</div>
        </div>`;
}

// Reconstruye los índices por clave cada vez que llegan datos del servidor.
function indexar(): void {
    tiposPorClave.clear();
    tiposIndice.clear();
    tipos.forEach((t, i) => {
        tiposIndice.set(t.nombre, i);
        tiposPorClave.set(claveTipo(i), t);
    });
}

// ---------- Búsqueda ----------
function textoUnidad(u: Unidad): string {
    return normalizar(`${u.codigoBarras ?? ''} ${ESTADOS[u.estado]} ${u.id}`);
}

/**
 * Deja solo los tipos y elementos que coinciden con la búsqueda. Un tipo que coincide por
 * su nombre se muestra completo. Un elemento se muestra si coincide su nombre, el de una de
 * sus variantes o una de sus unidades (código o estado); su tipo se agrega a `forzadas`
 * para que se abra y se vea el elemento.
 */
function filtrar(q: string, forzadas: Set<string>): Tipo[] {
    if (q === '') return tipos;
    const coincide = (texto: string | null): boolean => texto !== null && normalizar(texto).includes(q);
    const coincideElemento = (e: Elemento): boolean =>
        coincide(e.nombre)
        || e.variantes.some(v => coincide(v.nombre) || v.unidades.some(u => textoUnidad(u).includes(q)));

    const resultado: Tipo[] = [];
    for (const t of tipos) {
        if (coincide(t.nombre)) {
            resultado.push(t);
            continue;
        }
        const elementos = t.elementos.filter(coincideElemento);
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

// Abre o cierra un tipo; su contenido se arma la primera vez que se abre.
function alternar(cab: HTMLElement): void {
    const clave = cab.dataset.clave!;
    const cuerpo = $(cab.getAttribute('aria-controls')!);
    const abrir = cab.getAttribute('aria-expanded') !== 'true';
    if (abrir && cuerpo.childElementCount === 0) {
        const tipo = tiposPorClave.get(clave);
        if (tipo) cuerpo.innerHTML = cuerpoTipo(tipo);
    }
    cab.setAttribute('aria-expanded', String(abrir));
    cuerpo.hidden = !abrir;
    if (abrir) abiertos.add(clave);
    else abiertos.delete(clave);
}

// ---------- Recordar la página al ir a un elemento y volver ----------
// Se guarda en sessionStorage (solo esta pestaña) qué tipos estaban abiertos, la búsqueda y
// el desplazamiento, y se restaura al volver desde la página de un elemento.
const CLAVE_ESTADO = 'inventario:estado';

interface EstadoGuardado {
    abiertos: string[];
    busqueda: string;
    scroll: number;
}

function guardarEstado(): void {
    if (!cargado) return;
    const guardado: EstadoGuardado = {
        // Se guardan los nombres de los tipos: su posición puede cambiar si cambia el inventario.
        abiertos: [...abiertos].map(clave => tiposPorClave.get(clave)?.nombre).filter((n): n is string => !!n),
        busqueda: buscador.value,
        scroll: window.scrollY
    };
    try {
        sessionStorage.setItem(CLAVE_ESTADO, JSON.stringify(guardado));
    } catch { /* sin almacenamiento disponible: simplemente no se recuerda */ }
}

/** ¿Se llegó aquí volviendo de la página de un elemento (enlace "Volver" o botón atrás)? */
function vieneDeElemento(): boolean {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') return true;
    try {
        return new URL(document.referrer).pathname.endsWith('inventario-elemento.html');
    } catch {
        return false;
    }
}

/** Restaura tipos abiertos y búsqueda; devuelve el desplazamiento a recuperar, si hay. */
function restaurarEstado(): number | null {
    if (!vieneDeElemento()) return null;
    try {
        const guardado = JSON.parse(sessionStorage.getItem(CLAVE_ESTADO) ?? 'null') as EstadoGuardado | null;
        if (!guardado) return null;
        for (const nombre of guardado.abiertos) {
            const i = tiposIndice.get(nombre);
            if (i !== undefined) abiertos.add(claveTipo(i));
        }
        buscador.value = guardado.busqueda;
        return guardado.scroll;
    } catch {
        return null;
    }
}

// Al salir de la página (a un elemento o a otra) se guarda cómo quedó.
window.addEventListener('pagehide', guardarEstado);

// Trae el inventario completo del servidor y lo dibuja.
async function cargar(): Promise<void> {
    try {
        const json = await api<{ tipos: Tipo[] }>('GET', '/api/inventario');
        tipos = json.tipos;
        indexar();
        cargado = true;
        estado.hidden = true;
        const scroll = restaurarEstado();
        render();
        if (scroll) window.scrollTo(0, scroll);
    } catch (err) {
        estado.classList.add('error');
        estado.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudo cargar el inventario: ${esc((err as Error).message)}`;
    }
}

// Un solo oyente para todo el árbol: el clic en el encabezado de un tipo lo abre o cierra.
// Los elementos son enlaces y navegan solos.
arbol.addEventListener('click', ev => {
    const cab = (ev.target as HTMLElement).closest<HTMLElement>('button.inv-cab');
    if (cab) alternar(cab);
});

// Cada letra del buscador vuelve a filtrar el árbol.
buscador.addEventListener('input', () => {
    if (cargado) render();
});

arrancarInventario(cargar);
