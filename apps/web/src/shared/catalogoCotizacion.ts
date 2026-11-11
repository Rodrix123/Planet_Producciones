// Catálogo de precios: antes vivía como HTML fijo en cotizador.html; ahora se trae en
// vivo de la base de datos (inventory/inventory_variants/venue/transportation) y este
// módulo construye el formulario dinámicamente. Se usa tanto en el cotizador público
// como en el editor de servicios del panel de Maritza.
import { apiUrl } from './api';

// Un precio según la cantidad pedida.
export interface TramoPrecio {
    cantidad: number;
    precio: number;
}

// Una opción concreta de un servicio, con su precio y su descripción.
export interface VarianteCatalogo {
    id: number;
    simpleDescription: string;
    detailedDescription: string;
    price: number;
    /** Tramos de cantidad/precio (ej. "x8" a un precio, "x12" a otro). Casi todas las
     *  variantes solo tienen un tramo (cantidad=1, precio=price). */
    tramos: TramoPrecio[];
}

// Un servicio del catálogo y cómo se elige en el formulario (lista, casilla o cantidad).
export interface InventoryCatalogo {
    id: number;
    name: string;
    type: string;
    controlType: 'select' | 'checkbox' | 'qty';
    variants: VarianteCatalogo[];
}

// Lo que devuelve /api/catalogo: sedes, transporte por ciudad y servicios.
export interface Catalogo {
    venues: { id: number; name: string; city: string | null }[];
    transportation: { id: number; city: string; price: number }[];
    inventory: InventoryCatalogo[];
}

// Un servicio elegido por el cliente, con el precio unitario que se le aplicó.
export interface ItemSeleccionado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
    nota?: string;
}

// Resultado del cálculo: total y servicios elegidos.
export interface ResultadoCatalogo {
    total: number;
    itemsSeleccionados: ItemSeleccionado[];
}

// Pesos colombianos sin decimales.
const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// "EQUIPOS DE SONIDO" -> "Equipos de Sonido" (las palabras cortas como "de" quedan en minúscula).
function tituloLegible(tipo: string): string {
    return tipo
        .toLowerCase()
        .split(' ')
        .map((p) => (p.length > 2 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
        .join(' ');
}

// El catálogo se descarga una sola vez por carga de página.
let catalogoCache: Catalogo | null = null;

/**
 * Devuelve el catálogo, usando la copia en memoria si ya se descargó.
 */
export async function obtenerCatalogo(): Promise<Catalogo> {
    if (catalogoCache) return catalogoCache;
    const res = await fetch(apiUrl('/api/catalogo'));
    catalogoCache = (await res.json()) as Catalogo;
    return catalogoCache;
}

/** Dibuja los controles del catálogo (selects / checkboxes / cantidades) dentro de `contenedor`. */
export function renderCatalogoEnContenedor(contenedor: HTMLElement, catalogo: Catalogo): void {
    const selects = catalogo.inventory.filter((i) => i.controlType === 'select');
    // Dentro de cada lista, lo más económico primero (a igual precio, por nombre).
    const precioDe = (i: InventoryCatalogo) => i.variants[0]?.price ?? 0;
    const porPrecio = (a: InventoryCatalogo, b: InventoryCatalogo) => precioDe(a) - precioDe(b)
        || (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });
    const checkboxes = catalogo.inventory.filter((i) => i.controlType === 'checkbox').sort(porPrecio);
    const qtys = catalogo.inventory.filter((i) => i.controlType === 'qty').sort(porPrecio);

    const htmlSelects = selects.map((inv) => `
        <div>
            <label for="inv-${inv.id}">${inv.name || tituloLegible(inv.type)}</label>
            <select id="inv-${inv.id}" class="precio-select" data-tag="${inv.type}">
                <option value="" data-precio="0" data-variant-id="" selected>No incluir</option>
                ${inv.variants.flatMap((v) => {
                    const tramos = v.tramos.length > 0 ? v.tramos : [{ cantidad: 1, precio: v.price }];
                    const variasOpciones = tramos.length > 1;
                    return tramos.map((t) => ({ v, t, variasOpciones }));
                }).sort((a, b) => a.t.precio - b.t.precio
                    || a.v.simpleDescription.localeCompare(b.v.simpleDescription, 'es', { numeric: true })
                ).map(({ v, t, variasOpciones }) => `
                        <option value="${v.id}_${t.cantidad}" data-variant-id="${v.id}" data-cantidad="${t.cantidad}" data-precio="${t.precio}" data-incluye="${(v.detailedDescription || '').replace(/"/g, '&quot;')}">
                            ${v.simpleDescription}${variasOpciones ? ` (x${t.cantidad})` : ''} — ${formatterCOP.format(t.precio)}
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

// Lo que incluye un paquete, guardado en el atributo data-incluye del control.
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
        // El precio del tramo elegido es el TOTAL de ese tramo (ej. "x8" = $600.000),
        // no un precio por unidad; se reparte entre la cantidad para que el resto de
        // la app (que multiplica precioUnit * cantidad) reconstruya el mismo total.
        const cantidad = parseInt(opt.getAttribute('data-cantidad') || '1', 10) || 1;

        total += precio;
        itemsSeleccionados.push({
            variantId: Number(variantId),
            cantidad,
            tag: select.dataset.tag || 'SERVICIO',
            nombre: opt.textContent?.split(' — ')[0].trim() || '',
            descripcion: incluye,
            precioUnit: precio / cantidad
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

    // Una variante puede tener varias opciones (una por tramo de cantidad): hay que
    // calzar variantId Y cantidad para marcar el tramo exacto que se había guardado.
    function tomarConCantidad(variantId: number, cantidad: number): ItemSeleccionado | undefined {
        const idx = restantes.findIndex((i) => i.variantId === variantId && i.cantidad === cantidad);
        if (idx === -1) return undefined;
        return restantes.splice(idx, 1)[0];
    }

    contenedor.querySelectorAll<HTMLSelectElement>('select.precio-select').forEach((select) => {
        for (const opt of Array.from(select.options)) {
            const variantId = opt.getAttribute('data-variant-id');
            if (!variantId) continue;
            const cantidad = parseInt(opt.getAttribute('data-cantidad') || '1', 10) || 1;
            if (tomarConCantidad(Number(variantId), cantidad)) {
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
