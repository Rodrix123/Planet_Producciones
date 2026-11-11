import { esc } from './shared/panelShell';
import {
    SERVICIOS_POR_PAGINA,
    categoriasDeServicios,
    filtrarServicios,
    formatearCOP,
    paginar,
    paginasVisibles,
    plural,
    type Pagina,
    type ServicioCotizado
} from './shared/consultaDatos';

function fila(item: ServicioCotizado): string {
    return `
        <tr role="row">
            <td role="cell" class="servicios-nombre" data-etiqueta="Servicio">
                <strong>${esc(item.nombre)}</strong>
                ${item.descripcion ? `<span class="servicios-incluye">Incluye: ${esc(item.descripcion)}</span>` : ''}
                ${item.nota ? `<span class="servicios-nota"><i class="fa-solid fa-note-sticky" aria-hidden="true"></i> ${esc(item.nota)}</span>` : ''}
            </td>
            <td role="cell" class="servicios-categoria" data-etiqueta="Categoría">${esc(item.tag)}</td>
            <td role="cell" class="num servicios-cantidad" data-etiqueta="Cant.">${item.cantidad}</td>
            <td role="cell" class="num servicios-unitario" data-etiqueta="Valor unitario">${esc(formatearCOP(item.precioUnit))}</td>
            <td role="cell" class="num servicios-subtotal" data-etiqueta="Subtotal">${esc(formatearCOP(item.precioUnit * item.cantidad))}</td>
        </tr>`;
}

function botonesDePagina(p: Pagina<ServicioCotizado>): string {
    const numeros = paginasVisibles(p.pagina, p.totalPaginas).map((n) => n === null
        ? '<span class="servicios-salto" aria-hidden="true">…</span>'
        : `<button type="button" class="servicios-pagina" data-pagina="${n}" aria-label="Página ${n}"${n === p.pagina ? ' aria-current="page"' : ''}>${n}</button>`
    ).join('');

    return `
        <button type="button" class="btn btn-secondary btn-sm" data-pagina="${p.pagina - 1}" data-foco="anterior"${p.pagina === 1 ? ' disabled' : ''}>
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Anterior
        </button>
        <span class="servicios-numeros">${numeros}</span>
        <span class="servicios-pagina-actual">Página ${p.pagina} de ${p.totalPaginas}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-pagina="${p.pagina + 1}" data-foco="siguiente"${p.pagina === p.totalPaginas ? ' disabled' : ''}>
            Siguiente <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>`;
}

/**
 * Tabla compacta de los servicios de una cotización, con búsqueda, filtro por categoría y
 * páginas de SERVICIOS_POR_PAGINA. Filtra en memoria y solo dibuja la página visible, así que
 * cientos de servicios no la vuelven lenta.
 */
export function montarTablaServicios(contenedor: HTMLElement, items: ServicioCotizado[]): void {
    const estado = { texto: '', categoria: '', pagina: 1 };

    contenedor.innerHTML = `
        <div class="servicios-barra">
            <label class="filtro servicios-busqueda">
                <span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Buscar servicio</span>
                <input type="search" data-rol="texto" placeholder="Nombre, descripción o nota" autocomplete="off">
            </label>
            <label class="filtro servicios-filtro-categoria">
                <span><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Categoría</span>
                <select data-rol="categoria"></select>
            </label>
        </div>
        <p class="servicios-conteo" data-rol="conteo" role="status"></p>
        <div class="servicios-marco" data-rol="marco">
            <table class="servicios-tabla" role="table">
                <caption class="consulta-oculto">Servicios cotizados</caption>
                <thead>
                    <tr role="row">
                        <th role="columnheader" scope="col">Servicio</th>
                        <th role="columnheader" scope="col">Categoría</th>
                        <th role="columnheader" scope="col" class="num">Cant.</th>
                        <th role="columnheader" scope="col" class="num">Valor unitario</th>
                        <th role="columnheader" scope="col" class="num">Subtotal</th>
                    </tr>
                </thead>
                <tbody data-rol="filas"></tbody>
            </table>
        </div>
        <div class="servicios-sin-resultados" data-rol="vacio" hidden>
            <p>Ningún servicio coincide con la búsqueda.</p>
            <button type="button" class="btn btn-secondary btn-sm" data-rol="limpiar">
                <i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i> Limpiar búsqueda
            </button>
        </div>
        <nav class="servicios-paginacion" data-rol="paginacion" aria-label="Páginas de servicios" hidden></nav>`;

    const parte = <T extends HTMLElement>(rol: string) => contenedor.querySelector(`[data-rol="${rol}"]`) as T;
    const texto = parte<HTMLInputElement>('texto');
    const categoria = parte<HTMLSelectElement>('categoria');
    const conteo = parte('conteo');
    const marco = parte('marco');
    const filas = parte('filas');
    const vacio = parte('vacio');
    const paginacion = parte('paginacion');

    // Con la API del DOM, el texto de una categoría nunca se interpreta como HTML.
    categoria.add(new Option(`Todas (${items.length})`, ''));
    for (const c of categoriasDeServicios(items)) categoria.add(new Option(`${c.categoria} (${c.cantidad})`, c.categoria));

    function pintar(): void {
        const filtrados = filtrarServicios(items, estado);
        const p = paginar(filtrados, estado.pagina, SERVICIOS_POR_PAGINA);
        estado.pagina = p.pagina;

        filas.innerHTML = p.elementos.map(fila).join('');
        marco.hidden = p.total === 0;
        vacio.hidden = p.total !== 0;

        const deTotal = p.total === items.length ? '' : ` (filtrados de ${items.length})`;
        conteo.textContent = p.total === 0
            ? `0 de ${plural(items.length, 'servicio', 'servicios')}`
            : `Mostrando ${p.desde}–${p.hasta} de ${plural(p.total, 'servicio', 'servicios')}${deTotal}`;

        paginacion.hidden = p.totalPaginas <= 1;
        paginacion.innerHTML = p.totalPaginas <= 1 ? '' : botonesDePagina(p);
    }

    /** Tras cambiar de página, el inicio de la tabla no debe quedar tapado por el encabezado fijo. */
    function mostrarInicioDeTabla(): void {
        const fijo = document.querySelector('.consulta-detalle-fijo');
        const limite = fijo ? fijo.getBoundingClientRect().bottom : 0;
        const inicio = contenedor.getBoundingClientRect().top;
        if (inicio < limite) window.scrollBy(0, inicio - limite - 12);
    }

    texto.addEventListener('input', () => {
        estado.texto = texto.value;
        estado.pagina = 1;
        pintar();
    });
    categoria.addEventListener('change', () => {
        estado.categoria = categoria.value;
        estado.pagina = 1;
        pintar();
    });
    parte('limpiar').addEventListener('click', () => {
        estado.texto = texto.value = '';
        estado.categoria = categoria.value = '';
        estado.pagina = 1;
        pintar();
        texto.focus();
    });
    paginacion.addEventListener('click', (evento) => {
        const boton = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-pagina]');
        if (!boton || boton.disabled) return;
        const foco = boton.dataset.foco;
        estado.pagina = Number(boton.dataset.pagina);
        pintar();
        mostrarInicioDeTabla();
        // Los botones se vuelven a dibujar: el foco vuelve al mismo control, o a la página actual.
        const siguiente = foco ? paginacion.querySelector<HTMLButtonElement>(`[data-foco="${foco}"]`) : null;
        (siguiente && !siguiente.disabled ? siguiente : paginacion.querySelector<HTMLElement>('[aria-current="page"]'))
            ?.focus({ preventScroll: true });
    });

    pintar();
}
