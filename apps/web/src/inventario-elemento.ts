// Detalle de un elemento del inventario (solo lectura): título con el nombre del elemento,
// subtítulo con la categoría de donde proviene y una tabla con todas sus unidades físicas
// (de todas sus variantes). Arriba hay un buscador por código de barras y una barra de filtros
// (como la de eventos) con listas desplegables de variante y estado, en las que se pueden
// marcar varias opciones a la vez.
// Se abre desde el menú de inventario: inventario-elemento.html?id=<id>.

import './style.css';
import './panel.css';
import './inventario.css';
import { api } from './api';
import {
    $, ESTADOS, arrancarInventario, esc, formatearFecha, insigniaEstado, nombreVariante, normalizar,
    plural, textoUnidades, vacio,
    type Elemento, type EstadoUnidad, type Tipo, type Unidad, type Variante
} from './inventario-comun';

const titulo = $('titulo');
const subtitulo = $('subtitulo');
const resumen = $('resumen');
const estado = $('estado');
const tabla = $('tabla');
const filtros = $('filtros');
const buscador = $<HTMLInputElement>('buscador');
const menuVariante = $('menuVariante');
const menuEstado = $('menuEstado');
const textoVariante = $('textoVariante');
const textoEstado = $('textoEstado');
const limpiarFiltros = $('limpiarFiltros');

// Una fila de la tabla: la unidad junto con la variante a la que pertenece.
interface Fila {
    variante: Variante;
    unidad: Unidad;
}

// Estado de la pantalla. Una lista sin opciones marcadas no filtra (muestra todo).
let filas: Fila[] = [];
const variantesElegidas = new Set<string>();
const estadosElegidos = new Set<EstadoUnidad>();

// Muestra un error en lugar de la tabla.
function mostrarError(mensaje: string): void {
    estado.hidden = false;
    estado.classList.add('error');
    estado.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${mensaje}`;
}

// ---------- Filtros ----------
// Una casilla de una lista desplegable, con cuántas unidades tiene esa opción.
function opcion(filtro: 'variante' | 'estado', valor: string, texto: string, cantidad: number): string {
    return `<label class="multi-opcion">
        <input type="checkbox" data-filtro="${filtro}" value="${esc(valor)}">
        <span>${texto}</span>
        <span class="inv-opcion-conteo">${cantidad}</span>
    </label>`;
}

// Llena las listas con las variantes del elemento y los estados que tienen sus unidades.
function armarFiltros(e: Elemento): void {
    menuVariante.innerHTML = e.variantes
        .map(v => opcion('variante', String(v.id), esc(nombreVariante(v)), v.unidades.length))
        .join('');
    menuEstado.innerHTML = (Object.keys(ESTADOS) as EstadoUnidad[])
        .map(es => ({ es, n: filas.filter(f => f.unidad.estado === es).length }))
        .filter(({ n }) => n > 0)
        .map(({ es, n }) => opcion('estado', es, ESTADOS[es], n))
        .join('');
    filtros.hidden = false;
}

// Texto del botón de una lista: "Todas", el nombre de la única opción o "N seleccionadas".
function textoBoton(menu: HTMLElement, todos: string, seleccionados: string): string {
    const marcadas = [...menu.querySelectorAll<HTMLInputElement>('input:checked')];
    if (marcadas.length === 0) return todos;
    if (marcadas.length === 1) return marcadas[0].closest('label')!.querySelector('span')!.textContent ?? '';
    return `${marcadas.length} ${seleccionados}`;
}

// Abre o cierra una lista desplegable (solo una abierta a la vez).
function cerrarMenus(excepto?: HTMLElement): void {
    filtros.querySelectorAll<HTMLElement>('.multi-btn').forEach(btn => {
        const menu = $(btn.dataset.menu!);
        if (menu === excepto) return;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    });
}

// ¿La fila pasa el buscador por código y los filtros elegidos?
function pasaFiltros(f: Fila, q: string): boolean {
    if (variantesElegidas.size && !variantesElegidas.has(String(f.variante.id))) return false;
    if (estadosElegidos.size && !estadosElegidos.has(f.unidad.estado)) return false;
    if (q && !(f.unidad.codigoBarras && normalizar(f.unidad.codigoBarras).includes(q))) return false;
    return true;
}

// ---------- Tabla ----------
// Tabla con una fila por unidad física; las características son las del menú, sin el ID.
function tablaUnidades(visibles: Fila[]): string {
    const cuerpo = visibles.map(({ variante: v, unidad: u }) => `
        <tr>
            <td>${esc(nombreVariante(v))}</td>
            <td class="inv-codigo">${u.codigoBarras ? esc(u.codigoBarras) : '<span class="inv-sin-dato">Sin código de barras</span>'}</td>
            <td>${insigniaEstado(u.estado)}</td>
            <td class="inv-detalle-estado">${u.descripcionEstado?.trim() ? esc(u.descripcionEstado.trim()) : '<span class="inv-sin-dato">—</span>'}</td>
            <td class="inv-fecha">${formatearFecha(u.creadoEn)}</td>
            <td class="inv-fecha">${formatearFecha(u.actualizadoEn)}</td>
        </tr>`).join('');
    return `
        <div class="inv-tabla-wrap">
            <table class="inv-tabla">
                <thead>
                    <tr>
                        <th scope="col">Variante</th>
                        <th scope="col">Código de barras</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Detalle del estado</th>
                        <th scope="col">Registrada</th>
                        <th scope="col">Última actualización</th>
                    </tr>
                </thead>
                <tbody>${cuerpo}</tbody>
            </table>
        </div>`;
}

// Vuelve a dibujar la tabla, el resumen y los botones según el buscador y los filtros.
function render(elemento: Elemento): void {
    const q = normalizar(buscador.value.trim());
    const hayFiltros = q !== '' || variantesElegidas.size > 0 || estadosElegidos.size > 0;
    const visibles = filas.filter(f => pasaFiltros(f, q));

    textoVariante.textContent = textoBoton(menuVariante, 'Todas', 'seleccionadas');
    textoEstado.textContent = textoBoton(menuEstado, 'Todos', 'seleccionados');
    limpiarFiltros.hidden = !hayFiltros;

    const variantes = plural(elemento.variantes.length, 'variante', 'variantes');
    resumen.textContent = hayFiltros
        ? `${visibles.length} de ${textoUnidades(filas.length)} · ${variantes}`
        : `${textoUnidades(filas.length)} · ${variantes}`;

    if (filas.length === 0) tabla.innerHTML = vacio('Sin unidades registradas.');
    else if (visibles.length === 0) tabla.innerHTML = vacio('Ninguna unidad coincide con la búsqueda y los filtros.');
    else tabla.innerHTML = tablaUnidades(visibles);
}

// Conecta las listas, el botón de limpiar y el buscador.
function conectarFiltros(el: Elemento): void {
    // Abrir o cerrar una lista desde su botón.
    filtros.addEventListener('click', ev => {
        const btn = (ev.target as HTMLElement).closest<HTMLElement>('.multi-btn');
        if (!btn) return;
        const menu = $(btn.dataset.menu!);
        const abrir = menu.hidden;
        cerrarMenus(menu);
        menu.hidden = !abrir;
        btn.setAttribute('aria-expanded', String(abrir));
    });

    // Marcar o desmarcar una opción.
    filtros.addEventListener('change', ev => {
        const casilla = ev.target as HTMLInputElement;
        if (casilla.type !== 'checkbox') return;
        const elegidos = casilla.dataset.filtro === 'variante' ? variantesElegidas : estadosElegidos;
        if (casilla.checked) (elegidos as Set<string>).add(casilla.value);
        else (elegidos as Set<string>).delete(casilla.value);
        render(el);
    });

    // "Limpiar filtros" quita todo, búsqueda incluida.
    limpiarFiltros.addEventListener('click', () => {
        variantesElegidas.clear();
        estadosElegidos.clear();
        buscador.value = '';
        filtros.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(c => { c.checked = false; });
        cerrarMenus();
        render(el);
    });

    // Las listas se cierran al hacer clic fuera o con Escape.
    document.addEventListener('click', ev => {
        if (!(ev.target as HTMLElement).closest('.filtro-multi')) cerrarMenus();
    });
    document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') cerrarMenus();
    });

    buscador.addEventListener('input', () => render(el));
}

// ---------- Carga ----------
// Trae el inventario, ubica el elemento pedido en la URL y dibuja su página.
async function cargar(): Promise<void> {
    const id = Number(new URLSearchParams(window.location.search).get('id'));
    if (!Number.isInteger(id) || id <= 0) {
        mostrarError('No se indicó qué elemento mostrar.');
        return;
    }
    try {
        const json = await api<{ tipos: Tipo[] }>('GET', '/api/inventario');
        let tipo: Tipo | undefined;
        let elemento: Elemento | undefined;
        for (const t of json.tipos) {
            // La base devuelve los ids bigint como texto ("110"); se comparan como número.
            elemento = t.elementos.find(e => Number(e.id) === id);
            if (elemento) {
                tipo = t;
                break;
            }
        }
        if (!elemento || !tipo) {
            mostrarError('No se encontró el elemento en el inventario.');
            return;
        }
        const el = elemento;

        document.title = `${el.nombre} | Inventario | Planet Producciones`;
        titulo.textContent = el.nombre;
        subtitulo.innerHTML = `<i class="fa-solid fa-layer-group" aria-hidden="true"></i> Inventario › ${esc(tipo.nombre)}`;
        subtitulo.hidden = false;
        estado.hidden = true;

        filas = el.variantes.flatMap(variante => variante.unidades.map(unidad => ({ variante, unidad })));
        armarFiltros(el);
        conectarFiltros(el);
        render(el);
    } catch (err) {
        mostrarError(`No se pudo cargar el inventario: ${esc((err as Error).message)}`);
    }
}

arrancarInventario(cargar);
