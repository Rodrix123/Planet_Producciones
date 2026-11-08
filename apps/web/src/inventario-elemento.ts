// Detalle de un elemento del inventario (solo lectura): título con el nombre del elemento,
// subtítulo con la categoría de donde proviene y una tabla con todas sus unidades físicas
// (de todas sus variantes). Arriba hay un buscador por código de barras y filtros por variante
// y por estado, en los que se pueden elegir varias opciones a la vez.
// Se abre desde el menú de inventario: inventario-elemento.html?id=<id>.

import './style.css';
import './panel.css';
import './inventario.css';
import { api } from './api';
import {
    $, ESTADOS, arrancarInventario, esc, formatearFecha, insigniaEstado, nombreVariante, normalizar,
    plural, textoUnidades, unidadesDeElemento, vacio,
    type Elemento, type EstadoUnidad, type Tipo, type Unidad, type Variante
} from './inventario-comun';

const titulo = $('titulo');
const subtitulo = $('subtitulo');
const resumen = $('resumen');
const estado = $('estado');
const tabla = $('tabla');
const filtros = $('filtros');
const buscador = $<HTMLInputElement>('buscador');

// Una fila de la tabla: la unidad junto con la variante a la que pertenece.
interface Fila {
    variante: Variante;
    unidad: Unidad;
}

// Estado de la pantalla. Un filtro sin opciones elegidas no filtra (muestra todo).
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
// Botón de opción de un filtro; aria-pressed indica si está elegido.
function opcion(filtro: 'variante' | 'estado', valor: string, texto: string, cantidad: number): string {
    return `<button type="button" class="inv-chip" data-filtro="${filtro}" data-valor="${esc(valor)}" aria-pressed="false">
        ${texto} <span class="inv-chip-conteo">${cantidad}</span>
    </button>`;
}

// Arma los filtros con las variantes del elemento y los estados que tienen sus unidades.
function armarFiltros(e: Elemento): void {
    const variantes = e.variantes
        .map(v => opcion('variante', String(v.id), esc(nombreVariante(v)), v.unidades.length))
        .join('');
    const estados = (Object.keys(ESTADOS) as EstadoUnidad[])
        .map(es => ({ es, n: filas.filter(f => f.unidad.estado === es).length }))
        .filter(({ n }) => n > 0)
        .map(({ es, n }) => opcion('estado', es, ESTADOS[es], n))
        .join('');
    filtros.innerHTML = `
        <div class="inv-filtro">
            <span class="inv-filtro-titulo" id="filtroVariante">Variante</span>
            <div class="inv-chips" role="group" aria-labelledby="filtroVariante">${variantes}</div>
        </div>
        <div class="inv-filtro">
            <span class="inv-filtro-titulo" id="filtroEstado">Estado</span>
            <div class="inv-chips" role="group" aria-labelledby="filtroEstado">${estados}</div>
        </div>
        <button type="button" class="inv-limpiar" id="limpiarFiltros" hidden>
            <i class="fa-solid fa-xmark" aria-hidden="true"></i> Limpiar filtros
        </button>`;
    filtros.hidden = filas.length === 0;
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

// Vuelve a dibujar la tabla y el resumen según el buscador y los filtros.
function render(elemento: Elemento): void {
    const q = normalizar(buscador.value.trim());
    const hayFiltros = q !== '' || variantesElegidas.size > 0 || estadosElegidos.size > 0;
    const visibles = filas.filter(f => pasaFiltros(f, q));

    const limpiar = document.getElementById('limpiarFiltros');
    if (limpiar) limpiar.hidden = !hayFiltros;

    resumen.textContent = hayFiltros
        ? `${visibles.length} de ${textoUnidades(filas.length)} · ${plural(elemento.variantes.length, 'variante', 'variantes')}`
        : `${textoUnidades(unidadesDeElemento(elemento))} · ${plural(elemento.variantes.length, 'variante', 'variantes')}`;
    resumen.hidden = false;

    if (filas.length === 0) tabla.innerHTML = vacio('Sin unidades registradas.');
    else if (visibles.length === 0) tabla.innerHTML = vacio('Ninguna unidad coincide con la búsqueda y los filtros.');
    else tabla.innerHTML = tablaUnidades(visibles);
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
        render(el);

        // Clic en una opción: la elige o la quita. "Limpiar filtros" quita todo, búsqueda incluida.
        filtros.addEventListener('click', ev => {
            const objetivo = ev.target as HTMLElement;
            if (objetivo.closest('#limpiarFiltros')) {
                variantesElegidas.clear();
                estadosElegidos.clear();
                buscador.value = '';
                filtros.querySelectorAll('.inv-chip').forEach(b => b.setAttribute('aria-pressed', 'false'));
                render(el);
                return;
            }
            const chip = objetivo.closest<HTMLElement>('.inv-chip');
            if (!chip) return;
            const valor = chip.dataset.valor!;
            const elegido = chip.getAttribute('aria-pressed') !== 'true';
            chip.setAttribute('aria-pressed', String(elegido));
            if (chip.dataset.filtro === 'variante') {
                if (elegido) variantesElegidas.add(valor);
                else variantesElegidas.delete(valor);
            } else {
                if (elegido) estadosElegidos.add(valor as EstadoUnidad);
                else estadosElegidos.delete(valor as EstadoUnidad);
            }
            render(el);
        });
        buscador.addEventListener('input', () => render(el));
    } catch (err) {
        mostrarError(`No se pudo cargar el inventario: ${esc((err as Error).message)}`);
    }
}

arrancarInventario(cargar);
