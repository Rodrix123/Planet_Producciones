// Catálogo de servicios y precios (/api/catalogo). Lo consume el cotizador para armar el
// formulario en vivo desde la base, así los precios nunca quedan desactualizados en la página.

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const catalogoRouter = Router();

// Público: lo usa el cotizador para construir el formulario en vivo.
catalogoRouter.get('/', asyncHandler(async (_req, res) => {
    const [venues, transportation, inventory, variants, tramos] = await Promise.all([
        pool.query('select id, name, city from venue order by city asc, name asc'),
        pool.query('select id, city, price from transportation order by price asc'),
        pool.query(
            `select id, name, type, control_type from inventory where visible_publico = true order by id asc`
        ),
        pool.query(
            `select iv.id, iv.inventory_id, iv.simple_description, iv.detailed_description
             from inventory_variants iv
             join inventory i on i.id = iv.inventory_id
             where i.visible_publico = true
             order by iv.id asc`
        ),
        // Cada variante puede tener más de un tramo de cantidad/precio (ej. "Par led x8"
        // a un precio y "x12" a otro) en vez de un solo precio fijo por variante.
        pool.query(
            `select pv.id_variant, pv.quantity, pv.price
             from "PriceVariants" pv
             join inventory_variants iv on iv.id = pv.id_variant
             join inventory i on i.id = iv.inventory_id
             where i.visible_publico = true
             order by pv.id_variant asc, pv.quantity asc`
        )
    ]);

    // Se agrupan los datos por id para armar la respuesta sin consultar de nuevo.
    const variantsPorInventory = new Map<number, typeof variants.rows>();
    for (const v of variants.rows) {
        if (!variantsPorInventory.has(v.inventory_id)) variantsPorInventory.set(v.inventory_id, []);
        variantsPorInventory.get(v.inventory_id)!.push(v);
    }

    // Tramos de precio de cada variante: [{ cantidad, precio }]. El precio de un tramo es el TOTAL de esa
    // cantidad (ej. 8 unidades = $600.000), no un precio por unidad.
    const tramosPorVariante = new Map<number, { cantidad: number; precio: number }[]>();
    for (const t of tramos.rows) {
        if (!tramosPorVariante.has(t.id_variant)) tramosPorVariante.set(t.id_variant, []);
        tramosPorVariante.get(t.id_variant)!.push({ cantidad: Number(t.quantity), precio: Number(t.price) });
    }

    res.json({
        venues: venues.rows.map((v) => ({ id: v.id, name: v.name, city: v.city })),
        transportation: transportation.rows.map((t) => ({ id: t.id, city: t.city, price: Number(t.price) })),
        inventory: inventory.rows.map((inv) => ({
            id: inv.id,
            name: inv.name,
            type: inv.type,
            controlType: inv.control_type,
            variants: (variantsPorInventory.get(inv.id) || []).map((v) => {
                const tramosVariante = tramosPorVariante.get(v.id) || [];
                // Precio de referencia de la variante: el tramo de 1 unidad (o el primero si no existe).
                const base = tramosVariante.find((t) => t.cantidad === 1) || tramosVariante[0];
                return {
                    id: v.id,
                    simpleDescription: v.simple_description,
                    detailedDescription: v.detailed_description || '',
                    price: base?.precio ?? 0,
                    tramos: tramosVariante
                };
            })
        }))
    });
}));

// Administradora: crea un ítem "manual" (no viene del catálogo público) para agregarlo
// a una cotización puntual. Queda como inventory/inventory_variant real, pero oculto
// del cotizador público (visible_publico = false) para no contaminarlo.
catalogoRouter.post('/manual', requireAuth, requireRole('administrador'), asyncHandler(async (req, res) => {
    const body = req.body as { tag?: string; nombre?: string; descripcion?: string; precio?: number };
    const tag = body.tag?.trim() || 'SERVICIO MANUAL';
    const nombre = body.nombre?.trim();
    const precio = Number(body.precio) || 0;

    if (!nombre || precio <= 0) {
        return res.status(400).json({ status: 'error', message: 'Indica un nombre y un precio mayor a 0' });
    }

    const { rows: invRows } = await pool.query<{ id: number }>(
        `insert into inventory (name, type, control_type, visible_publico) values ($1, $2, 'select', false) returning id`,
        [tag, tag]
    );
    const { rows: varRows } = await pool.query(
        `insert into inventory_variants (inventory_id, simple_description, detailed_description)
         values ($1, $2, $3) returning id`,
        [invRows[0].id, nombre, body.descripcion?.trim() || null]
    );
    // El precio vive en "PriceVariants" (tramo quantity=1), no en inventory_variants
    // (esa columna ya no existe): sin esta fila, el ítem manual costaría $0.
    await pool.query(
        `insert into "PriceVariants" (id_variant, quantity, price) values ($1, 1, $2)`,
        [varRows[0].id, precio]
    );

    res.status(201).json({
        variantId: Number(varRows[0].id),
        tag,
        nombre,
        descripcion: body.descripcion?.trim() || '',
        precioUnit: precio
    });
}));
