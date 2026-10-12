import type { SupabaseClient } from "@supabase/supabase-js";

/** Valores permitidos de public.stock.state. */
export type EstadoUnidad = "bueno" | "danado" | "en_reparacion" | "dado_de_baja" | "perdido";

/** Una unidad física (public.stock): lo que se escanea con su código de barras. */
export interface UnidadInventario {
  id: number;
  codigoBarras: string | null;
  estado: EstadoUnidad;
  descripcionEstado: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Una variante de un elemento (public.inventory_variants). */
export interface VarianteInventario {
  id: number;
  /** inventory_variants.simple_description: el nombre que ve el cotizador. */
  nombre: string | null;
  descripcionDetallada: string | null;
  precio: number;
  unidades: UnidadInventario[];
}

/** Un elemento del inventario (public.inventory.name). */
export interface ElementoInventario {
  id: number;
  nombre: string;
  variantes: VarianteInventario[];
}

/** Agrupación por public.inventory.type. */
export interface TipoInventario {
  nombre: string;
  elementos: ElementoInventario[];
}

export interface ListaInventario {
  tipos: TipoInventario[];
}

interface FilaElemento {
  id: number;
  name: string;
  type: string;
}

interface FilaVariante {
  id: number;
  inventory_id: number;
  simple_description: string | null;
  detailed_description: string | null;
  price_variants: number | string;
}

interface FilaUnidad {
  id: number;
  id_inventory_variant: number;
  state: EstadoUnidad;
  state_description: string | null;
  barcode: string | null;
  created_at: string;
  updated_at: string;
}

/** Igual que `max_rows` de la API (packages/db/supabase/config.toml): más filas por página se truncan. */
const POR_PAGINA = 1000;

/** Lee todas las filas de una consulta, pidiéndolas de a POR_PAGINA para no toparse con `max_rows`. */
async function leerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + POR_PAGINA - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < POR_PAGINA) return filas;
  }
}

/** Agrupa las filas por la llave que devuelve `llave`, conservando el orden de entrada. */
function agrupar<T>(filas: T[], llave: (fila: T) => number): Map<number, T[]> {
  const grupos = new Map<number, T[]>();
  for (const fila of filas) {
    const clave = llave(fila);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(fila);
    else grupos.set(clave, [fila]);
  }
  return grupos;
}

const aUnidad = (f: FilaUnidad): UnidadInventario => ({
  id: f.id,
  codigoBarras: f.barcode,
  estado: f.state,
  descripcionEstado: f.state_description,
  creadoEn: f.created_at,
  actualizadoEn: f.updated_at,
});

/**
 * Solo lectura. Inventario en cuatro niveles:
 * tipo (inventory.type) -> elemento (inventory.name)
 * -> variante (inventory_variants) -> unidad física (stock).
 */
export async function listarInventario(supabase: SupabaseClient): Promise<ListaInventario> {
  const [elementos, variantes, unidades] = await Promise.all([
    leerTodo<FilaElemento>((desde, hasta) =>
      supabase.from("inventory").select("id, name, type").order("id").range(desde, hasta),
    ),
    leerTodo<FilaVariante>((desde, hasta) =>
      supabase
        .from("inventory_variants")
        .select("id, inventory_id, simple_description, detailed_description, price_variants")
        .order("id")
        .range(desde, hasta),
    ),
    leerTodo<FilaUnidad>((desde, hasta) =>
      supabase
        .from("stock")
        .select("id, id_inventory_variant, state, state_description, barcode, created_at, updated_at")
        .order("id")
        .range(desde, hasta),
    ),
  ]);

  const unidadesPorVariante = agrupar(unidades, (u) => u.id_inventory_variant);
  const variantesPorElemento = agrupar(variantes, (v) => v.inventory_id);

  const tipos = new Map<string, ElementoInventario[]>();
  for (const e of elementos) {
    const elemento: ElementoInventario = {
      id: e.id,
      nombre: e.name,
      variantes: (variantesPorElemento.get(e.id) ?? []).map((v) => ({
        id: v.id,
        nombre: v.simple_description,
        descripcionDetallada: v.detailed_description,
        precio: Number(v.price_variants),
        unidades: (unidadesPorVariante.get(v.id) ?? []).map(aUnidad),
      })),
    };
    const grupo = tipos.get(e.type);
    if (grupo) grupo.push(elemento);
    else tipos.set(e.type, [elemento]);
  }

  const porNombre = (a: string, b: string) => a.localeCompare(b, "es");
  return {
    tipos: [...tipos.entries()]
      .map(([nombre, elementos]) => ({
        nombre,
        elementos: elementos.sort((a, b) => porNombre(a.nombre, b.nombre)),
      }))
      .sort((a, b) => porNombre(a.nombre, b.nombre)),
  };
}
