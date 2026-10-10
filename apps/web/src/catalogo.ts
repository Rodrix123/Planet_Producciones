// Catálogo de la cotización compartido por el cotizador (cotizador.html) y el
// formulario de nuevo evento (eventos.html). El marcado y los precios viven en
// catalogo.html; aquí está el cálculo, que lee cualquier <select>, checkbox o
// input de cantidad marcado con las clases .precio-select / .precio-check /
// .precio-qty y sus atributos data-precio / data-tag / data-nombre / data-incluye.
import catalogoHtml from './catalogo.html?raw';

export interface ItemSeleccionado {
    tag: string;
    /** Texto del resumen y del PDF (en los ítems por cantidad incluye "N x … c/u"). */
    nombre: string;
    descripcion: string;
    precio: number;
    /** Nombre del ítem tal cual está en el catálogo de la base (inventory_variants.simple_description). */
    catalogoNombre: string;
    cantidad: number;
}

export interface DatosCotizacion {
    total: number;
    itemsSeleccionados: ItemSeleccionado[];
}

export const HTML_CATALOGO: string = catalogoHtml;

export const formatterCOP = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
});

// Lee el atributo data-incluye (lista separada por "|") y la devuelve como texto legible
function obtenerIncluye(el: Element): string {
    const raw = el.getAttribute('data-incluye');
    if (!raw) return '';
    const partes = raw.split('|').map(p => p.trim()).filter(Boolean);
    return partes.join(' • ');
}

// Cálculo dinámico de cotización sobre los controles que haya dentro de `raiz`.
// También actualiza el "Incluye:" que se muestra bajo cada <select>.
export function calcularCotizacion(raiz: HTMLElement): DatosCotizacion {
    let total = 0;
    const itemsSeleccionados: ItemSeleccionado[] = [];

    // 1. Selects de catálogo (una sola opción por categoría)
    const selects = raiz.querySelectorAll<HTMLSelectElement>('select.precio-select');
    selects.forEach(select => {
        const hint = raiz.querySelector<HTMLElement>(`#${select.id}-hint`);
        const opt = select.options[select.selectedIndex];
        const incluye = opt ? obtenerIncluye(opt) : '';

        if (hint) {
            hint.innerHTML = (select.selectedIndex > 0 && incluye) ? `<strong>Incluye:</strong> ${incluye}` : '';
        }

        if (select.selectedIndex <= 0 || !opt) return;
        const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
        if (precio <= 0) return;

        total += precio;
        itemsSeleccionados.push({
            tag: select.dataset.tag || 'SERVICIO',
            nombre: opt.value,
            descripcion: incluye,
            precio,
            catalogoNombre: opt.value,
            cantidad: 1
        });
    });

    // 2. Checkboxes de efectos / add-ons
    const checks = raiz.querySelectorAll<HTMLInputElement>('input.precio-check');
    checks.forEach(chk => {
        if (!chk.checked) return;
        const precio = parseFloat(chk.getAttribute('data-precio') || '') || 0;
        if (precio <= 0) return;

        total += precio;
        itemsSeleccionados.push({
            tag: chk.dataset.tag || 'SERVICIO',
            nombre: chk.dataset.nombre || chk.id,
            descripcion: obtenerIncluye(chk),
            precio,
            catalogoNombre: chk.dataset.nombre || chk.id,
            cantidad: 1
        });
    });

    // 3. Ítems por cantidad (mobiliario y extras cobrados "c/u")
    const qtys = raiz.querySelectorAll<HTMLInputElement>('input.precio-qty');
    qtys.forEach(input => {
        const cantidad = parseInt(input.value, 10) || 0;
        if (cantidad <= 0) return;
        const precioUnit = parseFloat(input.getAttribute('data-precio-unit') || '') || 0;
        const precio = cantidad * precioUnit;
        if (precio <= 0) return;

        total += precio;
        itemsSeleccionados.push({
            tag: input.dataset.tag || 'SERVICIO',
            nombre: `${cantidad} x ${input.dataset.nombre || input.id} (${formatterCOP.format(precioUnit)} c/u)`,
            descripcion: obtenerIncluye(input),
            precio,
            catalogoNombre: input.dataset.nombre || input.id,
            cantidad
        });
    });

    return { total, itemsSeleccionados };
}

/** Pinta el total y el desglose de servicios en los elementos del resumen. */
export function renderResumen(totalEl: HTMLElement, listaEl: HTMLElement, datos: DatosCotizacion): void {
    totalEl.textContent = formatterCOP.format(datos.total);
    listaEl.innerHTML = '';

    if (datos.itemsSeleccionados.length === 0) {
        listaEl.innerHTML = '<li><em>Selecciona tus opciones en el formulario para calcular el costo.</em></li>';
        return;
    }
    datos.itemsSeleccionados.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${item.nombre}</strong>: ${formatterCOP.format(item.precio)}`;
        listaEl.appendChild(li);
    });
}
