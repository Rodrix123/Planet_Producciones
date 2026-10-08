import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const catalogoRouter = Router();

// Público: lo usa el cotizador para construir el formulario en vivo.
catalogoRouter.get('/', asyncHandler(async (_req, res) => {
    const [venues, transportation, inventory, variants] = await Promise.all([
        pool.query('select id, name, city from venue order by city asc, name asc'),
        pool.query('select id, city, price from transportation order by price asc'),
        pool.query(
            `select id, name, type, control_type from inventory where visible_publico = true order by id asc`
        ),
        pool.query(
            `select iv.id, iv.inventory_id, iv.simple_description, iv.detailed_description, iv.price
             from inventory_variants iv
             join inventory i on i.id = iv.inventory_id
             where i.visible_publico = true
             order by iv.id asc`
        )
    ]);

    const variantsPorInventory = new Map<number, typeof variants.rows>();
    for (const v of variants.rows) {
        if (!variantsPorInventory.has(v.inventory_id)) variantsPorInventory.set(v.inventory_id, []);
        variantsPorInventory.get(v.inventory_id)!.push(v);
    }

    res.json({
        venues: venues.rows.map((v) => ({ id: v.id, name: v.name, city: v.city })),
        transportation: transportation.rows.map((t) => ({ id: t.id, city: t.city, price: Number(t.price) })),
        inventory: inventory.rows.map((inv) => ({
            id: inv.id,
            name: inv.name,
            type: inv.type,
            controlType: inv.control_type,
            variants: (variantsPorInventory.get(inv.id) || []).map((v) => ({
                id: v.id,
                simpleDescription: v.simple_description,
                detailedDescription: v.detailed_description || '',
                price: Number(v.price)
            }))
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
        `insert into inventory_variants (inventory_id, simple_description, detailed_description, price)
         values ($1, $2, $3, $4) returning id`,
        [invRows[0].id, nombre, body.descripcion?.trim() || null, precio]
    );

    res.status(201).json({
        variantId: Number(varRows[0].id),
        tag,
        nombre,
        descripcion: body.descripcion?.trim() || '',
        precioUnit: precio
    });
}));
