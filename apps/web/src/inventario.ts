import './style.css';
import './shared/panelRail.css';
import './inventario.css';
import { apiFetch, exigirSesion, rutaPanelPorRol, type SesionActual } from './shared/api';
import { initPanelLayout } from './shared/layout';

type EstadoUnidad = 'bueno' | 'danado' | 'en_reparacion' | 'dado_de_baja' | 'perdido';

interface Unidad {
    id: number;
    codigoBarras: string | null;
    estado: EstadoUnidad;
    descripcionEstado: string | null;
    creadoEn: string;
    actualizadoEn: string;
}

interface Variante {
    id: number;
    nombre: string | null;
    descripcionDetallada: string | null;
    precio: number;
    unidades: Unidad[];
}

interface Elemento {
    id: number;
    nombre: string;
    variantes: Variante[];
}

interface Tipo {
    nombre: string;
    elementos: Elemento[];
}

const ESTADOS: Record<EstadoUnidad, string> = {
    bueno: 'Bueno',
    danado: 'Dañado',
    en_reparacion: 'En reparación',
    dado_de_baja: 'Dado de baja',
    perdido: 'Perdido'
};

const RAIL_ADMIN = `
    <a href="cotizaciones.html" class="rail-item" data-contador="cotizaciones"><i class="fa-solid fa-file-invoice-dollar"></i><span>Cotizaciones</span></a>
    <a href="eventos-proceso.html" class="rail-item" data-contador="eventosProceso"><i class="fa-solid fa-truck-ramp-box"></i><span>En proceso</span></a>
    <a href="eventos-programados.html" class="rail-item"><i class="fa-solid fa-calendar-days"></i><span>Eventos</span></a>
    <a href="empleados.html" class="rail-item"><i class="fa-solid fa-users"></i><span>Empleados</span></a>
    <a href="inventario.html" class="rail-item active"><i class="fa-solid fa-boxes-stacked"></i><span>Inventario</span></a>
`;

const RAIL_LOGISTICA = `
    <a href="panel-logistica.html" class="rail-item"><i class="fa-solid fa-truck"></i><span>Logística</span></a>
    <a href="inventario.html" class="rail-item active"><i class="fa-solid fa-boxes-stacked"></i><span>Inventario</span></a>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const arbol = $('arbol');
const estadoEl = $('estado');
const resumen = $('resumen');
const buscador = $<HTMLInputElement>('buscador');

let tipos: Tipo[] = [];
let cargado = false;
const tiposIndice = new Map<string, number>();
const tiposPorClave = new Map<string, Tipo>();
const elementosPorClave = new Map<string, Elemento>();
const variantesPorClave = new Map<string, Variante>();
const unidadesPorClave = new Map<string, Unidad>();
const abiertos = new Set<string>();

const claveTipo = (i: number): string => `t:${i}`;
const claveElemento = (e: Elemento): string => `e:${e.id}`;
const claveVariante = (v: Variante): string => `v:${v.id}`;
const claveUnidad = (u: Unidad): string => `u:${u.id}`;

function esc(texto: string): string {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML.replace(/"/g, '&quot;');
}

function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

const unidadesDeElemento = (e: Elemento): number => e.variantes.reduce((n, v) => n + v.unidades.length, 0);
const unidadesDeTipo = (t: Tipo): number => t.elementos.reduce((n, e) => n + unidadesDeElemento(e), 0);
const textoUnidades = (n: number): string => plural(n, 'unidad', 'unidades');

function formatearFecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const formatoPrecio = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function nombreVariante(v: Variante): string {
    return v.nombre?.trim() || `Variante #${v.id}`;
}

interface Nodo {
    clave: string;
    nivel: 1 | 2 | 3 | 4;
    icono: string;
    titulo: string;
    meta: string;
    abierto: boolean;
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

function vacio(texto: string): string {
    return `<p class="inv-vacio">${texto}</p>`;
}

function dato(etiqueta: string, valor: string): string {
    return `<div class="inv-dato"><dt>${etiqueta}</dt><dd>${valor}</dd></div>`;
}

function insigniaEstado(e: EstadoUnidad): string {
    return `<span class="inv-estado inv-estado-${e}">${ESTADOS[e]}</span>`;
}

function cuerpoUnidad(u: Unidad): string {
    return `<dl class="inv-datos">
        ${dato('ID', String(u.id))}
        ${dato('Estado', insigniaEstado(u.estado))}
        ${u.descripcionEstado ? dato('Detalle del estado', esc(u.descripcionEstado)) : ''}
        ${dato('Registrada', formatearFecha(u.creadoEn))}
        ${dato('Última actualización', formatearFecha(u.actualizadoEn))}
    </dl>`;
}

function nodoUnidad(u: Unidad): string {
    const clave = claveUnidad(u);
    return nodoHtml({
        clave,
        nivel: 4,
        icono: 'fa-barcode',
        titulo: u.codigoBarras ?? `Sin código de barras (ID ${u.id})`,
        meta: insigniaEstado(u.estado),
        abierto: abiertos.has(clave),
        cuerpo: () => cuerpoUnidad(u)
    });
}

function cuerpoVariante(v: Variante): string {
    const detalle = v.descripcionDetallada?.trim()
        ? `<p class="inv-detalle">${esc(v.descripcionDetallada.trim())}</p>`
        : '';
    const unidades = v.unidades.length
        ? v.unidades.map(nodoUnidad).join('')
        : vacio('Sin unidades registradas.');
    return detalle + unidades;
}

function nodoVariante(v: Variante, forzadas: Set<string>): string {
    const clave = claveVariante(v);
    const precio = v.precio > 0 ? `<span class="inv-precio">${formatoPrecio.format(v.precio)}</span>` : '';
    return nodoHtml({
        clave,
        nivel: 3,
        icono: 'fa-tags',
        titulo: nombreVariante(v),
        meta: `${precio}<span class="inv-conteo">${textoUnidades(v.unidades.length)}</span>`,
        abierto: abiertos.has(clave) || forzadas.has(clave),
        cuerpo: () => cuerpoVariante(v)
    });
}

function cuerpoElemento(e: Elemento, forzadas: Set<string>): string {
    return e.variantes.length
        ? e.variantes.map(v => nodoVariante(v, forzadas)).join('')
        : vacio('Este elemento no tiene variantes.');
}

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

function textoUnidad(u: Unidad): string {
    return normalizar(`${u.codigoBarras ?? ''} ${ESTADOS[u.estado]} ${u.id}`);
}

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

async function cargar(): Promise<void> {
    try {
        const res = await apiFetch('/api/inventario');
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = (await res.json()) as { tipos: Tipo[] };
        tipos = json.tipos;
        indexar();
        cargado = true;
        estadoEl.hidden = true;
        render();
    } catch (err) {
        estadoEl.classList.add('error');
        estadoEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudo cargar el inventario: ${esc((err as Error).message)}`;
    }
}

arbol.addEventListener('click', ev => {
    const cab = (ev.target as HTMLElement).closest<HTMLElement>('.inv-cab');
    if (cab) alternar(cab);
});

buscador.addEventListener('input', () => {
    if (cargado) render();
});

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = (await exigirSesion()) as SesionActual;
    if (sesion.rol !== 'administrador' && sesion.rol !== 'jefe_logistica') {
        window.location.href = rutaPanelPorRol(sesion.rol);
        return;
    }
    initPanelLayout(sesion);
    $('railNav').innerHTML = sesion.rol === 'administrador' ? RAIL_ADMIN : RAIL_LOGISTICA;

    await cargar();
});
