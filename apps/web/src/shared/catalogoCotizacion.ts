// Catálogo de precios: antes vivía como HTML fijo en cotizador.html; ahora se trae en
// vivo de la base de datos (inventory/inventory_variants/venue/transportation) y este
// módulo construye el formulario dinámicamente. Se usa tanto en el cotizador público
// como en el editor de servicios del panel de Maritza.
import { apiUrl } from './api';

export interface VarianteCatalogo {
    id: number;
    simpleDescription: string;
    detailedDescription: string;
    price: number;
}

export interface InventoryCatalogo {
    id: number;
    name: string;
    type: string;
    controlType: 'select' | 'checkbox' | 'qty';
    variants: VarianteCatalogo[];
}

export interface Catalogo {
    venues: { id: number; name: string; city: string | null }[];
    transportation: { id: number; city: string; price: number }[];
    inventory: InventoryCatalogo[];
}

export interface ItemSeleccionado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
    nota?: string;
}

export interface ResultadoCatalogo {
    total: number;
    itemsSeleccionados: ItemSeleccionado[];
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

function tituloLegible(tipo: string): string {
    return tipo
        .toLowerCase()
        .split(' ')
        .map((p) => (p.length > 2 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
        .join(' ');
}

let catalogoCache: Catalogo | null = null;

export async function obtenerCatalogo(): Promise<Catalogo> {
    if (catalogoCache) return catalogoCache;
    const res = await fetch(apiUrl('/api/catalogo'));
    catalogoCache = (await res.json()) as Catalogo;
    return catalogoCache;
}

/** Dibuja los controles del catálogo (selects / checkboxes / cantidades) dentro de `contenedor`. */
export function renderCatalogoEnContenedor(contenedor: HTMLElement, catalogo: Catalogo): void {
    const selects = catalogo.inventory.filter((i) => i.controlType === 'select');
    const checkboxes = catalogo.inventory.filter((i) => i.controlType === 'checkbox');
    const qtys = catalogo.inventory.filter((i) => i.controlType === 'qty');

    const htmlSelects = selects.map((inv) => `
        <div>
            <label for="inv-${inv.id}">${inv.name || tituloLegible(inv.type)}</label>
            <select id="inv-${inv.id}" class="precio-select" data-tag="${inv.type}">
                <option value="" data-precio="0" data-variant-id="" selected>-- No incluir --</option>
                ${inv.variants.map((v) => `
                    <option value="${v.id}" data-variant-id="${v.id}" data-precio="${v.price}" data-incluye="${(v.detailedDescription || '').replace(/"/g, '&quot;')}">
                        ${v.simpleDescription} — ${formatterCOP.format(v.price)}
                    </option>
                `).join('')}
            </select>
            <small class="field-hint" id="inv-${inv.id}-hint"></small>
        </div>
    `).join('');

    const htmlCheckboxes = checkboxes.map((inv) => {
        const v = inv.variants[0];
        if (!v) return '';
        return `
            <label class="checkbox-label">
                <input type="checkbox" class="precio-check" id="inv-${inv.id}" data-tag="${inv.type}"
                    data-variant-id="${v.id}" data-nombre="${v.simpleDescription}" data-precio="${v.price}"
                    data-incluye="${(v.detailedDescription || '').replace(/"/g, '&quot;')}">
                <span>${v.simpleDescription} (+${formatterCOP.format(v.price)})</span>
            </label>
        `;
    }).join('');

    const htmlQtys = qtys.map((inv) => {
        const v = inv.variants[0];
        if (!v) return '';
        return `
            <div class="qty-row">
                <div class="qty-name">${v.simpleDescription} <span class="qty-price">(${formatterCOP.format(v.price)} c/u)</span></div>
                <input type="number" class="precio-qty" id="inv-${inv.id}" data-tag="${inv.type}"
                    data-variant-id="${v.id}" data-nombre="${v.simpleDescription}" data-precio-unit="${v.price}"
                    min="0" step="1" value="0">
            </div>
        `;
    }).join('');

    contenedor.innerHTML = `
        <div class="form-group">
            <div class="form-section-title"><i class="fa-solid fa-sliders"></i> Servicios</div>
            <div class="grid-2">${htmlSelects}</div>
        </div>
        ${htmlCheckboxes ? `
        <div class="form-group">
            <div class="form-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Efectos y extras</div>
            <div class="checkbox-box">${htmlCheckboxes}</div>
        </div>` : ''}
        ${htmlQtys ? `
        <div class="form-group">
            <div class="form-section-title"><i class="fa-solid fa-chair"></i> Mobiliario y cantidades</div>
            <div class="qty-box">${htmlQtys}</div>
        </div>` : ''}
    `;
}

function obtenerIncluye(el: Element): string {
    return el.getAttribute('data-incluye') || '';
}

/** Igual que antes: escanea los controles ya dibujados y calcula total + ítems seleccionados. */
export function calcularDesdeCatalogo(contenedor: ParentNode): ResultadoCatalogo {
    let total = 0;
    const itemsSeleccionados: ItemSeleccionado[] = [];

    contenedor.querySelectorAll<HTMLSelectElement>('select.precio-select').forEach((select) => {
        const hint = select.id ? document.getElementById(`${select.id}-hint`) : null;
        const opt = select.options[select.selectedIndex];
        const incluye = opt ? obtenerIncluye(opt) : '';
        if (hint) hint.innerHTML = (select.selectedIndex > 0 && incluye) ? `<strong>Incluye:</strong> ${incluye}` : '';

        const variantId = opt?.getAttribute('data-variant-id');
        if (!variantId || select.selectedIndex <= 0) return;
        const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
        if (precio <= 0) return;

        total += precio;
        itemsSeleccionados.push({
            variantId: Number(variantId),
            cantidad: 1,
            tag: select.dataset.tag || 'SERVICIO',
            nombre: opt.textContent?.split(' — ')[0].trim() || '',
            descripcion: incluye,
            precioUnit: precio
        });
    });

    contenedor.querySelectorAll<HTMLInputElement>('input.precio-check').forEach((chk) => {
        if (!chk.checked) return;
        const variantId = chk.getAttribute('data-variant-id');
        const precio = parseFloat(chk.getAttribute('data-precio') || '') || 0;
        if (!variantId || precio <= 0) return;

        total += precio;
        itemsSeleccionados.push({
            variantId: Number(variantId),
            cantidad: 1,
            tag: chk.dataset.tag || 'SERVICIO',
            nombre: chk.dataset.nombre || '',
            descripcion: obtenerIncluye(chk),
            precioUnit: precio
        });
    });

    contenedor.querySelectorAll<HTMLInputElement>('input.precio-qty').forEach((input) => {
        const cantidad = parseInt(input.value, 10) || 0;
        const variantId = input.getAttribute('data-variant-id');
        if (cantidad <= 0 || !variantId) return;
        const precioUnit = parseFloat(input.getAttribute('data-precio-unit') || '') || 0;
        if (precioUnit <= 0) return;

        total += cantidad * precioUnit;
        itemsSeleccionados.push({
            variantId: Number(variantId),
            cantidad,
            tag: input.dataset.tag || 'SERVICIO',
            nombre: input.dataset.nombre || '',
            descripcion: obtenerIncluye(input),
            precioUnit
        });
    });

    return { total, itemsSeleccionados };
}

/**
 * Pre-marca los controles del catálogo ya dibujado con una lista de ítems ya guardada
 * (reabrir una cotización para editarla). Hace match por variantId — mucho más simple
 * y confiable que adivinar por texto. Los ítems que no calcen con ningún control del
 * catálogo (ítems manuales) se devuelven aparte para no perderlos.
 */
export function preseleccionarCatalogo(contenedor: ParentNode, items: ItemSeleccionado[]): ItemSeleccionado[] {
    const restantes = [...items];

    function tomar(variantId: number): ItemSeleccionado | undefined {
        const idx = restantes.findIndex((i) => i.variantId === variantId);
        if (idx === -1) return undefined;
        return restantes.splice(idx, 1)[0];
    }

    contenedor.querySelectorAll<HTMLSelectElement>('select.precio-select').forEach((select) => {
        for (const opt of Array.from(select.options)) {
            const variantId = opt.getAttribute('data-variant-id');
            if (variantId && tomar(Number(variantId))) {
                select.value = opt.value;
                break;
            }
        }
    });

    contenedor.querySelectorAll<HTMLInputElement>('input.precio-check').forEach((chk) => {
        const variantId = chk.getAttribute('data-variant-id');
        if (variantId && tomar(Number(variantId))) chk.checked = true;
    });

    contenedor.querySelectorAll<HTMLInputElement>('input.precio-qty').forEach((input) => {
        const variantId = input.getAttribute('data-variant-id');
        if (!variantId) return;
        const item = tomar(Number(variantId));
        if (item) input.value = String(item.cantidad);
    });

    return restantes;
}
