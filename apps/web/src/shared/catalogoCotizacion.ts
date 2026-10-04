// Lógica de lectura del catálogo de precios, compartida entre el cotizador público
// (apps/web/cotizador.html + main.ts) y el editor de servicios del panel de Maritza.
// El catálogo en sí vive únicamente como HTML en cotizador.html (selects/checkboxes/qty
// con data-precio, data-tag, data-nombre, data-incluye) — este módulo solo sabe LEER esa
// estructura genérica, sin duplicar ni un solo precio.

export interface ItemSeleccionado {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
    nota?: string;
}

export interface ResultadoCatalogo {
    total: number;
    itemsSeleccionados: ItemSeleccionado[];
}

const formatterCOP = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
});

/** Lee el atributo data-incluye ("a|b|c") y lo devuelve como texto legible "a • b • c". */
export function obtenerIncluye(el: Element): string {
    const raw = el.getAttribute('data-incluye');
    if (!raw) return '';
    return raw.split('|').map((p) => p.trim()).filter(Boolean).join(' • ');
}

/**
 * Escanea cualquier contenedor (el <form> del cotizador, o un <div> clonado con el mismo
 * catálogo embebido) y calcula el total + la lista de ítems seleccionados, actualizando
 * en vivo los textos de ayuda (`${id}-hint`) de cada <select>. No depende de ningún id de
 * campo en particular: solo de las clases .precio-select / .precio-check / .precio-qty.
 */
export function calcularDesdeCatalogo(contenedor: ParentNode): ResultadoCatalogo {
    let total = 0;
    const itemsSeleccionados: ItemSeleccionado[] = [];

    const selects = contenedor.querySelectorAll<HTMLSelectElement>('select.precio-select');
    selects.forEach((select) => {
        const hint = select.id ? document.getElementById(`${select.id}-hint`) : null;
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
            precio
        });
    });

    const checks = contenedor.querySelectorAll<HTMLInputElement>('input.precio-check');
    checks.forEach((chk) => {
        if (!chk.checked) return;
        const precio = parseFloat(chk.getAttribute('data-precio') || '') || 0;
        if (precio <= 0) return;

        total += precio;
        itemsSeleccionados.push({
            tag: chk.dataset.tag || 'SERVICIO',
            nombre: chk.dataset.nombre || chk.id,
            descripcion: obtenerIncluye(chk),
            precio
        });
    });

    const qtys = contenedor.querySelectorAll<HTMLInputElement>('input.precio-qty');
    qtys.forEach((input) => {
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
            precio
        });
    });

    return { total, itemsSeleccionados };
}

/**
 * Pre-marca los controles del catálogo (selects/checkboxes/cantidades) para que reflejen
 * una lista de ítems ya guardada (p. ej. al reabrir una cotización para editarla). Hace
 * match por tag+nombre; los ítems que no calcen con ningún control del catálogo (precios
 * manuales añadidos fuera del catálogo) se devuelven aparte para no perderlos.
 */
export function preseleccionarCatalogo(contenedor: ParentNode, items: ItemSeleccionado[]): ItemSeleccionado[] {
    const restantes = [...items];

    function tomar(tag: string, nombre: string): ItemSeleccionado | undefined {
        const idx = restantes.findIndex((i) => i.tag === tag && i.nombre === nombre);
        if (idx === -1) return undefined;
        return restantes.splice(idx, 1)[0];
    }

    contenedor.querySelectorAll<HTMLSelectElement>('select.precio-select').forEach((select) => {
        const tag = select.dataset.tag || 'SERVICIO';
        for (const opt of Array.from(select.options)) {
            if (tomar(tag, opt.value)) {
                select.value = opt.value;
                break;
            }
        }
    });

    contenedor.querySelectorAll<HTMLInputElement>('input.precio-check').forEach((chk) => {
        const tag = chk.dataset.tag || 'SERVICIO';
        const nombre = chk.dataset.nombre || chk.id;
        if (tomar(tag, nombre)) chk.checked = true;
    });

    // Cantidades: el nombre guardado tiene el formato "N x <nombre> (...)"; se intenta
    // recuperar N para ese control. Si no calza exactamente, se deja en 0 y el ítem queda
    // disponible para quien edite (no se pierde: queda en "restantes" como manual).
    contenedor.querySelectorAll<HTMLInputElement>('input.precio-qty').forEach((input) => {
        const tag = input.dataset.tag || 'SERVICIO';
        const nombreBase = input.dataset.nombre || input.id;
        const idx = restantes.findIndex((i) => i.tag === tag && i.nombre.includes(nombreBase));
        if (idx === -1) return;
        const match = restantes[idx].nombre.match(/^(\d+)\s*x\s/);
        if (match) {
            input.value = match[1];
            restantes.splice(idx, 1);
        }
    });

    return restantes;
}
