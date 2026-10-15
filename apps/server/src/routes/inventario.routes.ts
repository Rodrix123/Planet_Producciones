import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const inventarioRouter = Router();

// Solo lectura: Maritza y Andrés consultan el inventario en 4 niveles
// (tipo -> elemento -> variante -> unidad física) a partir de inventory,
// inventory_variants y stock. No se crea/edita nada acá.
inventarioRouter.get('/', requireAuth, requireRole('administrador', 'jefe_logistica'), asyncHandler(async (_req, res) => {
    const [elementos, variantes, unidades, tramosBase] = await Promise.all([
        pool.query<{ id: number; name: string; type: string }>('select id, name, type from inventory order by id'),
        pool.query<{ id: number; inventory_id: number; simple_description: string | null; detailed_description: string | null }>(
            'select id, inventory_id, simple_description, detailed_description from inventory_variants order by id'
        ),
        pool.query<{ id: number; id_inventory_variant: number; state: string; state_description: string | null; barcode: string | null; created_at: string; updated_at: string }>(
            'select id, id_inventory_variant, state, state_description, barcode, created_at, updated_at from stock order by id'
        ),
        // Precio base de cada variante (tramo quantity=1); el precio ya no vive en
        // inventory_variants sino en "PriceVariants".
        pool.query<{ id_variant: number; price: string }>('select id_variant, price from "PriceVariants" where quantity = 1')
    ]);

    const precioBasePorVariante = new Map<number, number>();
    for (const t of tramosBase.rows) precioBasePorVariante.set(t.id_variant, Number(t.price));

    const unidadesPorVariante = new Map<number, typeof unidades.rows>();
    for (const u of unidades.rows) {
        if (!unidadesPorVariante.has(u.id_inventory_variant)) unidadesPorVariante.set(u.id_inventory_variant, []);
        unidadesPorVariante.get(u.id_inventory_variant)!.push(u);
    }

    const variantesPorElemento = new Map<number, typeof variantes.rows>();
    for (const v of variantes.rows) {
        if (!variantesPorElemento.has(v.inventory_id)) variantesPorElemento.set(v.inventory_id, []);
        variantesPorElemento.get(v.inventory_id)!.push(v);
    }

    const tipos = new Map<string, { id: number; nombre: string; variantes: unknown[] }[]>();
    for (const e of elementos.rows) {
        const elemento = {
            id: e.id,
            nombre: e.name,
            variantes: (variantesPorElemento.get(e.id) || []).map((v) => ({
                id: v.id,
                nombre: v.simple_description,
                descripcionDetallada: v.detailed_description,
                precio: precioBasePorVariante.get(v.id) ?? 0,
                unidades: (unidadesPorVariante.get(v.id) || []).map((u) => ({
                    id: u.id,
                    codigoBarras: u.barcode,
                    estado: u.state,
                    descripcionEstado: u.state_description,
                    creadoEn: u.created_at,
                    actualizadoEn: u.updated_at
                }))
            }))
        };
        if (!tipos.has(e.type)) tipos.set(e.type, []);
        tipos.get(e.type)!.push(elemento);
    }

    const porNombre = (a: string, b: string) => a.localeCompare(b, 'es');
    const respuesta = {
        tipos: [...tipos.entries()]
            .map(([nombre, elementos]) => ({
                nombre,
                elementos: elementos.sort((a, b) => porNombre(a.nombre, b.nombre))
            }))
            .sort((a, b) => porNombre(a.nombre, b.nombre))
    };

    res.json(respuesta);
}));
