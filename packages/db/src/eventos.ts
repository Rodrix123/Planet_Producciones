import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreDeUsuario } from "./empleados.js";

export interface ClienteEvento {
  nombre: string;
  email: string | null;
  telefono: string | null;
}

export interface Evento {
  id: number;
  /** YYYY-MM-DD */
  fecha: string;
  /** HH:MM:SS */
  hora: string;
  tipo: string | null;
  lugar: string | null;
  ciudad: string | null;
  direccion: string | null;
  cliente: ClienteEvento | null;
  /** Total de la cotización asociada. */
  total: number | null;
  totalPagado: number;
  confirmado: boolean;
  pagoInicial: boolean;
  /** Hay un contrato firmado subido (events.contrato_firmado_subido_en). */
  firmado: boolean;
  contratoEnviadoEn: string | null;
  personal: string[];
  transporte: string | null;
}

/** public.quote: la cotización guarda cuándo, dónde, para quién y qué se cotiza. */
interface FilaCotizacion {
  total: number | string;
  /** Es opcional en la base: una cotización puede existir sin fecha. */
  date: string | null;
  hour: string;
  event_type: string | null;
  address: string | null;
  venue_nombre_manual: string | null;
  venue: { name: string; city: string | null } | null;
  client: { name: string; email: string | null; phone: string | null } | null;
  transportation: { city: string } | null;
}

/** public.events: estado del evento (confirmación, pagos, contrato) y su cotización. */
interface FilaEvento {
  id: number;
  confirmed: boolean;
  initial_payment: boolean;
  total_paid: number | string;
  contrato_enviado_en: string | null;
  contrato_firmado_subido_en: string | null;
  venue_nombre_manual: string | null;
  venue_direccion_manual: string | null;
  quote: FilaCotizacion | null;
  event_staff: { profile_id: string }[] | null;
}

type FilaEventoConFecha = FilaEvento & { quote: FilaCotizacion & { date: string } };

const COLUMNAS = [
  "id, confirmed, initial_payment, total_paid",
  "contrato_enviado_en, contrato_firmado_subido_en, venue_nombre_manual, venue_direccion_manual",
  [
    "quote(total, date, hour, event_type, address, venue_nombre_manual",
    "venue(name, city)",
    "client:users!client_id(name, email, phone)",
    "transportation(city))",
  ].join(", "),
  "event_staff(profile_id)",
].join(", ");

const POR_PAGINA = 200;

/**
 * Nombres de los usuarios indicados, leídos de auth.users (Admin API): public.profiles
 * ya no guarda el nombre. Sin nombre en los metadatos se usa la parte local del correo.
 * Solo recorre las páginas necesarias y no llama a la API si no hay personal asignado.
 */
async function nombresPorPerfil(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const buscados = new Set(ids);
  const nombres = new Map<string, string>();
  if (buscados.size === 0) return nombres;

  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    for (const u of data.users) {
      if (buscados.has(u.id)) nombres.set(u.id, nombreDeUsuario(u) ?? u.email?.split("@")[0] ?? "Sin nombre");
    }
    if (nombres.size === buscados.size || data.users.length < POR_PAGINA) break;
  }
  return nombres;
}

const idsDelPersonal = (filas: FilaEvento[]): string[] =>
  filas.flatMap((f) => (f.event_staff ?? []).map((s) => s.profile_id));

const tieneFecha = (f: FilaEvento): f is FilaEventoConFecha => Boolean(f.quote?.date);

/**
 * Cuándo, dónde, quién y qué se cotizó sale de la cotización del evento; el
 * evento aporta confirmación, pagos y contrato. Las columnas manuales del lugar
 * que aún tiene events sirven de respaldo para los eventos anteriores al cambio.
 */
function aEvento(f: FilaEventoConFecha, nombrePorPerfil: Map<string, string>): Evento {
  const q = f.quote;
  return {
    id: f.id,
    fecha: q.date,
    hora: q.hour,
    tipo: q.event_type,
    lugar: q.venue?.name ?? q.venue_nombre_manual ?? f.venue_nombre_manual,
    ciudad: q.venue?.city ?? null,
    direccion: q.address ?? f.venue_direccion_manual,
    cliente: q.client
      ? { nombre: q.client.name, email: q.client.email, telefono: q.client.phone }
      : null,
    total: Number(q.total),
    totalPagado: Number(f.total_paid),
    confirmado: f.confirmed,
    pagoInicial: f.initial_payment,
    firmado: f.contrato_firmado_subido_en !== null,
    contratoEnviadoEn: f.contrato_enviado_en,
    personal: (f.event_staff ?? []).map((s) => nombrePorPerfil.get(s.profile_id) ?? "Sin nombre"),
    transporte: q.transportation?.city ?? null,
  };
}

/**
 * Solo lectura.
 *
 * - public.events + public.quote (+ venue, users, transportation) -> datos del evento
 * - public.event_staff + auth.users (Admin API)                   -> personal asignado y su nombre
 *
 * La fecha y la hora viven en la cotización, así que el orden cronológico se
 * aplica aquí. Un evento cuya cotización no tiene fecha no se puede ubicar en el
 * calendario: se omite y se deja constancia en el log del servidor.
 */
export async function listarEventos(supabase: SupabaseClient): Promise<{ eventos: Evento[] }> {
  const eventosRes = await supabase.from("events").select(COLUMNAS);
  if (eventosRes.error) throw eventosRes.error;

  const todas = eventosRes.data as unknown as FilaEvento[];
  const filas = todas.filter(tieneFecha);
  if (filas.length < todas.length) {
    const omitidos = todas.filter((f) => !tieneFecha(f)).map((f) => f.id);
    console.warn(`Eventos omitidos: su cotización no tiene fecha (events.id ${omitidos.join(", ")}).`);
  }
  filas.sort((a, b) => `${a.quote.date} ${a.quote.hour}`.localeCompare(`${b.quote.date} ${b.quote.hour}`));

  const nombrePorPerfil = await nombresPorPerfil(supabase, idsDelPersonal(filas));
  return { eventos: filas.map((f) => aEvento(f, nombrePorPerfil)) };
}

async function cargarEvento(supabase: SupabaseClient, id: number): Promise<Evento> {
  const eventoRes = await supabase.from("events").select(COLUMNAS).eq("id", id).single();
  if (eventoRes.error) throw eventoRes.error;

  const fila = eventoRes.data as unknown as FilaEvento;
  if (!tieneFecha(fila)) throw new ErrorEvento("La cotización del evento no tiene fecha.", 500);
  const nombrePorPerfil = await nombresPorPerfil(supabase, idsDelPersonal([fila]));
  return aEvento(fila, nombrePorPerfil);
}

// ---------------------------------------------------------------------------
// Creación de eventos
// ---------------------------------------------------------------------------

export interface SedeEvento {
  id: number;
  nombre: string;
  ciudad: string | null;
}

export interface TransporteEvento {
  id: number;
  ciudad: string;
  precio: number;
}

export interface OpcionesEvento {
  sedes: SedeEvento[];
  transportes: TransporteEvento[];
}

/**
 * Un servicio elegido del catálogo de la cotización. Se identifica por la
 * categoría (inventory.type = data-tag del cotizador) y el nombre del ítem
 * (inventory_variants.simple_description), que es lo que ve el cotizador.
 */
export interface ItemCotizacionEvento {
  tag: string;
  nombre: string;
  cantidad: number;
  /** quote_items.nota (opcional). */
  nota?: string;
}

export interface NuevoEvento {
  tipo: string;
  /** YYYY-MM-DD */
  fecha: string;
  /** HH:MM */
  hora: string;
  /** Sede registrada (public.venue). Si falta, `lugarManual` es obligatorio. */
  venueId?: number | null;
  lugarManual?: string;
  direccionLugarManual?: string;
  /** quote.address */
  direccion?: string;
  transporteId?: number | null;
  cliente: {
    nombre: string;
    email: string;
    telefono?: string;
    documento?: string;
  };
  /** Servicios de la cotización que se crea junto con el evento (mínimo uno). */
  items: ItemCotizacionEvento[];
  confirmado?: boolean;
}

/** Error con código HTTP sugerido, para que la API responda con el estado correcto. */
export class ErrorEvento extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MAX_ITEMS = 200;
const MAX_CANTIDAD = 999;
const CODIGO_EXCEPCION_TRIGGER = "P0001"; // RAISE EXCEPTION en la base de datos
const CODIGO_DUPLICADO = "23505";

function texto(valor: unknown, max: number, campo: string): string {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (limpio.length > max) throw new ErrorEvento(`${campo} no puede superar los ${max} caracteres.`);
  return limpio;
}

function fechaValida(valor: unknown): string {
  const fecha = typeof valor === "string" ? valor : "";
  const d = new Date(`${fecha}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
    throw new ErrorEvento("La fecha del evento no es válida.");
  }
  return fecha;
}

function horaValida(valor: unknown): string {
  const hora = typeof valor === "string" ? valor : "";
  if (!HORA_RE.test(hora)) throw new ErrorEvento("La hora del evento no es válida.");
  return hora;
}

export interface ValidacionFecha {
  valida: boolean;
  /** Última fecha aceptada (YYYY-MM-DD); null si la base no define un límite. */
  fechaMaxima: string | null;
  /** Por qué no se acepta: fecha demasiado lejana o solape con otro evento; null si es válida. */
  motivo: "fecha" | "solape" | null;
  /** Qué hacer cuando no se acepta; null si es válida. */
  mensaje: string | null;
}

interface FilaSolape {
  quote: {
    hour: string;
    event_type: string | null;
    venue_nombre_manual: string | null;
    venue: { name: string } | null;
  };
}

const formatearHora = (hora: string): string => {
  const [h = "0", m = "0"] = hora.split(":");
  return new Date(2000, 0, 1, Number(h), Number(m)).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
};

/**
 * Mensaje de solape si ya hay un evento a esa fecha y hora, o null si está libre.
 * Los eventos no guardan duración, así que dos eventos se solapan cuando empiezan
 * a la misma hora del mismo día. La cotización no entra en esta regla: solo el evento.
 */
async function mensajeDeSolape(supabase: SupabaseClient, fecha: string, hora: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("events")
    .select("quote!inner(hour, event_type, venue_nombre_manual, venue(name))")
    .eq("quote.date", fecha);
  if (error) throw error;

  const existente = (data as unknown as FilaSolape[]).find((f) => f.quote.hour.slice(0, 5) === hora.slice(0, 5));
  if (!existente) return null;

  const detalle = [existente.quote.event_type, existente.quote.venue?.name ?? existente.quote.venue_nombre_manual]
    .filter(Boolean)
    .join(" · ");
  return (
    `Ya hay un evento a las ${formatearHora(hora)}${detalle ? ` (${detalle})` : ""}. ` +
    "Los eventos no pueden solaparse: elige otra hora u otra fecha."
  );
}

/**
 * Comprueba si se puede crear un evento en esa fecha (y hora, si se indica).
 *
 * - Fecha: regla de la base (trigger max_date_validation): un evento no puede
 *   quedar a más de config.fecha_maxima_separacion_evento días desde hoy. "Hoy" es
 *   la fecha UTC, igual que CURRENT_DATE en Supabase. La base sigue siendo la
 *   autoridad: esta comprobación solo avisa antes de tiempo.
 * - Solape: un evento no puede empezar a la misma fecha y hora que otro.
 */
export async function validarFechaEvento(
  supabase: SupabaseClient,
  fecha: unknown,
  hora?: unknown,
): Promise<ValidacionFecha> {
  const fechaEvento = fechaValida(fecha);
  const horaEvento = hora === undefined || hora === "" ? null : horaValida(hora);
  const { data, error } = await supabase
    .from("config")
    .select("value")
    .eq("key", "fecha_maxima_separacion_evento")
    .maybeSingle();
  if (error) throw error;

  let fechaMaxima: string | null = null;
  const dias = Number.parseInt(String(data?.value ?? ""), 10);
  if (Number.isFinite(dias)) {
    const hoy = new Date();
    const limite = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias));
    fechaMaxima = limite.toISOString().slice(0, 10);
    if (fechaEvento > fechaMaxima) {
      const legible = limite.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      return {
        valida: false,
        fechaMaxima,
        motivo: "fecha",
        mensaje:
          `La fecha del evento no puede ser mayor a ${dias} días a partir de hoy. ` +
          `La fecha máxima aceptada es el ${legible}. Elige una fecha igual o anterior.`,
      };
    }
  }

  if (horaEvento !== null) {
    const solape = await mensajeDeSolape(supabase, fechaEvento, horaEvento);
    if (solape) return { valida: false, fechaMaxima, motivo: "solape", mensaje: solape };
  }
  return { valida: true, fechaMaxima, motivo: null, mensaje: null };
}

function idOpcional(valor: unknown, campo: string): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorEvento(`${campo} no es válido.`);
  return n;
}

async function existeFila(supabase: SupabaseClient, tabla: "venue" | "transportation", id: number, nombre: string) {
  const { data, error } = await supabase.from(tabla).select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorEvento(`${nombre} no existe.`);
}

/** Sedes y transportes que se pueden elegir al crear un evento. */
export async function listarOpcionesEvento(supabase: SupabaseClient): Promise<OpcionesEvento> {
  const [sedesRes, transportesRes] = await Promise.all([
    supabase.from("venue").select("id, name, city").order("city").order("name"),
    supabase.from("transportation").select("id, city, price").order("city"),
  ]);
  if (sedesRes.error) throw sedesRes.error;
  if (transportesRes.error) throw transportesRes.error;
  return {
    sedes: sedesRes.data.map((s) => ({
      id: s.id as number,
      nombre: s.name as string,
      ciudad: (s.city as string | null) ?? null,
    })),
    transportes: transportesRes.data.map((t) => ({
      id: t.id as number,
      ciudad: t.city as string,
      precio: Number(t.price),
    })),
  };
}

interface ItemResuelto {
  varianteId: number;
  cantidad: number;
  /** Precio unitario vigente en inventory_variants. */
  precio: number;
  nota: string | null;
}

const MAX_NOTA = 500;

interface FilaVariante {
  id: number;
  simple_description: string;
  price: number | string;
  inventory: { type: string } | null;
}

/**
 * Convierte los servicios elegidos (categoría + nombre) en variantes del
 * catálogo de la base, con su precio actual. Los precios que importan son los
 * de la base, no los que mostró el navegador.
 */
async function resolverItems(supabase: SupabaseClient, items: unknown): Promise<ItemResuelto[]> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorEvento("Selecciona al menos un servicio para la cotización.");
  }
  if (items.length > MAX_ITEMS) throw new ErrorEvento("La cotización tiene demasiados servicios.");

  const { data, error } = await supabase
    .from("inventory_variants")
    .select("id, simple_description, price, inventory(type)");
  if (error) throw error;

  const variantes = new Map<string, { id: number; precio: number }>();
  for (const v of data as unknown as FilaVariante[]) {
    variantes.set(`${v.inventory?.type}||${v.simple_description}`, { id: v.id, precio: Number(v.price) });
  }

  // Si un mismo servicio llega dos veces, se suman las cantidades.
  const porVariante = new Map<number, ItemResuelto>();
  for (const item of items as Partial<ItemCotizacionEvento>[]) {
    const tag = typeof item?.tag === "string" ? item.tag : "";
    const nombre = typeof item?.nombre === "string" ? item.nombre : "";
    const cantidad = Number(item?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD) {
      throw new ErrorEvento(`La cantidad de "${nombre}" no es válida.`);
    }
    const variante = variantes.get(`${tag}||${nombre}`);
    if (!variante) {
      throw new ErrorEvento(`"${nombre}" ya no está en el catálogo. Recarga la página e intenta de nuevo.`);
    }
    const nota = texto(item?.nota, MAX_NOTA, `La nota de "${nombre}"`);
    const previo = porVariante.get(variante.id);
    const total = (previo?.cantidad ?? 0) + cantidad;
    if (total > MAX_CANTIDAD) throw new ErrorEvento(`La cantidad de "${nombre}" no es válida.`);
    porVariante.set(variante.id, {
      varianteId: variante.id,
      cantidad: total,
      precio: variante.precio,
      nota: previo?.nota || nota || null,
    });
  }
  return [...porVariante.values()];
}

/** Devuelve el cliente con ese correo (public.users) o lo crea si no existe. */
async function obtenerCliente(
  supabase: SupabaseClient,
  cliente: { nombre: string; email: string; telefono: string; documento: string },
): Promise<{ id: number; creado: boolean }> {
  const buscar = async () => {
    const { data, error } = await supabase.from("users").select("id").eq("email", cliente.email).maybeSingle();
    if (error) throw error;
    return data ? (data.id as number) : null;
  };

  const existente = await buscar();
  if (existente !== null) return { id: existente, creado: false };

  const { data, error } = await supabase
    .from("users")
    .insert({
      email: cliente.email,
      name: cliente.nombre,
      phone: cliente.telefono || null,
      documento: cliente.documento || null,
    })
    .select("id")
    .single();
  if (error) {
    // Otro proceso lo creó entre la búsqueda y el insert.
    if (error.code === CODIGO_DUPLICADO) {
      const id = await buscar();
      if (id !== null) return { id, creado: false };
    }
    throw error;
  }
  return { id: data.id as number, creado: true };
}

/**
 * Crea un evento nuevo. events.quote_id es obligatorio y único, así que cada
 * evento lleva su propia cotización (public.quote). La cotización guarda los
 * datos del evento (fecha, hora, tipo, lugar, dirección, cliente y transporte) y
 * sus servicios (public.quote_items); el total sale de esos servicios. El evento
 * (public.events) solo guarda lo que le es propio: confirmación, pagos y contrato.
 * Al crearlo no se asigna ningún pago: events.total_paid empieza en 0 y sube con
 * las transacciones.
 *
 * La cotización no depende de nada del inventario: ni del stock en bodega ni de la
 * disponibilidad de los elementos. La única restricción es del evento: no puede
 * solaparse con otro (misma fecha y hora).
 *
 * Supabase no ofrece transacciones desde el cliente: si un paso falla, se
 * borran la cotización (el evento y los servicios caen en cascada) y el cliente
 * creado, para no dejar filas huérfanas.
 */
export async function crearEvento(supabase: SupabaseClient, datos: NuevoEvento): Promise<Evento> {
  const tipo = texto(datos?.tipo, 100, "El tipo de evento");
  if (!tipo) throw new ErrorEvento("El tipo de evento es obligatorio.");
  const fecha = fechaValida(datos.fecha);
  const hora = horaValida(datos.hora);
  const validacion = await validarFechaEvento(supabase, fecha, hora);
  if (!validacion.valida) {
    throw new ErrorEvento(
      validacion.mensaje ?? "La fecha del evento no es aceptada.",
      validacion.motivo === "solape" ? 409 : 400,
    );
  }

  const venueId = idOpcional(datos.venueId, "La sede");
  const lugarManual = texto(datos.lugarManual, 255, "El nombre del lugar");
  const direccionLugarManual = texto(datos.direccionLugarManual, 255, "La dirección del lugar");
  if (venueId === null && !lugarManual) throw new ErrorEvento("Indica la sede o escribe el nombre del lugar.");
  const direccion = texto(datos.direccion, 255, "La dirección");
  const transporteId = idOpcional(datos.transporteId, "El transporte");

  const nombre = texto(datos.cliente?.nombre, 100, "El nombre del cliente");
  if (!nombre) throw new ErrorEvento("El nombre del cliente es obligatorio.");
  const email = texto(datos.cliente?.email, 150, "El correo del cliente").toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ErrorEvento("El correo del cliente no es válido.");
  const telefono = texto(datos.cliente?.telefono, 30, "El teléfono del cliente");
  const documento = texto(datos.cliente?.documento, 50, "El documento del cliente");

  const items = await resolverItems(supabase, datos.items);
  const totalEsperado = Math.round(items.reduce((suma, i) => suma + i.precio * i.cantidad, 0) * 100) / 100;

  if (venueId !== null) await existeFila(supabase, "venue", venueId, "La sede");
  if (transporteId !== null) await existeFila(supabase, "transportation", transporteId, "El transporte");

  const cliente = await obtenerCliente(supabase, { nombre, email, telefono, documento });
  let quoteId: number | null = null;
  const deshacer = async () => {
    // Si la cotización existe, borrarla elimina también el evento y sus servicios.
    if (quoteId !== null) await supabase.from("quote").delete().eq("id", quoteId);
    if (cliente.creado) await supabase.from("users").delete().eq("id", cliente.id);
  };

  try {
    const quote = await supabase
      .from("quote")
      .insert({
        client_id: cliente.id,
        event_type: tipo,
        transportation_id: transporteId,
        date: fecha,
        hour: hora,
        address: direccion || null,
        venue_id: venueId,
        venue_nombre_manual: venueId === null ? lugarManual : null,
      })
      .select("id")
      .single();
    if (quote.error) throw quote.error;
    quoteId = quote.data.id as number;

    const evento = await supabase
      .from("events")
      .insert({
        quote_id: quoteId,
        confirmed: datos.confirmado === true,
        venue_direccion_manual: venueId === null ? direccionLugarManual || null : null,
      })
      .select("id")
      .single();
    if (evento.error) throw evento.error;

    const servicios = await supabase
      .from("quote_items")
      .insert(
        items.map((i) => ({ quote_id: quoteId, variant_id: i.varianteId, quantity: i.cantidad, nota: i.nota })),
      );
    if (servicios.error) throw servicios.error;

    // Un trigger de la base suma cada servicio al total de la cotización. Si el
    // total no coincide con la suma de los precios vigentes, se corrige.
    const total = await supabase.from("quote").select("total").eq("id", quoteId).single();
    if (total.error) throw total.error;
    if (Number(total.data.total) !== totalEsperado) {
      const ajuste = await supabase.from("quote").update({ total: totalEsperado }).eq("id", quoteId);
      if (ajuste.error) throw ajuste.error;
    }

    return await cargarEvento(supabase, evento.data.id as number);
  } catch (error) {
    await deshacer();
    // Las reglas de la base de datos (p. ej. fecha máxima) traen un mensaje legible.
    if ((error as { code?: string }).code === CODIGO_EXCEPCION_TRIGGER) {
      throw new ErrorEvento((error as Error).message);
    }
    throw error;
  }
}
