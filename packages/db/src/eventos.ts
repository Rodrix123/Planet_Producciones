import type { SupabaseClient } from "@supabase/supabase-js";

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

interface FilaEvento {
  id: number;
  date: string;
  hour: string;
  event_type: string | null;
  address: string | null;
  confirmed: boolean;
  initial_payment: boolean;
  total_paid: number | string;
  contrato_enviado_en: string | null;
  contrato_firmado_subido_en: string | null;
  venue_nombre_manual: string | null;
  venue_direccion_manual: string | null;
  venue: { name: string; city: string | null } | null;
  client: { name: string; email: string | null; phone: string | null } | null;
  transportation: { city: string } | null;
  quote: { total: number | string } | null;
  event_staff: { profile_id: string }[] | null;
}

const COLUMNAS = [
  "id, date, hour, event_type, address, confirmed, initial_payment, total_paid",
  "contrato_enviado_en, contrato_firmado_subido_en, venue_nombre_manual, venue_direccion_manual",
  "venue(name, city)",
  "client:users!client_id(name, email, phone)",
  "transportation(city)",
  "quote(total)",
  "event_staff(profile_id)",
].join(", ");

async function nombresPorPerfil(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("profiles").select("id, nombre");
  if (error) throw error;
  return new Map<string, string>(data.map((p) => [p.id as string, (p.nombre as string | null) ?? "Sin nombre"]));
}

function aEvento(f: FilaEvento, nombrePorPerfil: Map<string, string>): Evento {
  return {
    id: f.id,
    fecha: f.date,
    hora: f.hour,
    tipo: f.event_type,
    lugar: f.venue?.name ?? f.venue_nombre_manual,
    ciudad: f.venue?.city ?? null,
    direccion: f.address ?? f.venue_direccion_manual,
    cliente: f.client
      ? { nombre: f.client.name, email: f.client.email, telefono: f.client.phone }
      : null,
    total: f.quote ? Number(f.quote.total) : null,
    totalPagado: Number(f.total_paid),
    confirmado: f.confirmed,
    pagoInicial: f.initial_payment,
    firmado: f.contrato_firmado_subido_en !== null,
    contratoEnviadoEn: f.contrato_enviado_en,
    personal: (f.event_staff ?? []).map((s) => nombrePorPerfil.get(s.profile_id) ?? "Sin nombre"),
    transporte: f.transportation?.city ?? null,
  };
}

/**
 * Solo lectura.
 *
 * - public.events (+ venue, users, transportation, quote) -> datos del evento
 * - public.event_staff + public.profiles                  -> personal asignado
 */
export async function listarEventos(supabase: SupabaseClient): Promise<{ eventos: Evento[] }> {
  const [eventosRes, nombrePorPerfil] = await Promise.all([
    supabase.from("events").select(COLUMNAS).order("date").order("hour"),
    nombresPorPerfil(supabase),
  ]);
  if (eventosRes.error) throw eventosRes.error;

  const filas = eventosRes.data as unknown as FilaEvento[];
  return { eventos: filas.map((f) => aEvento(f, nombrePorPerfil)) };
}

async function cargarEvento(supabase: SupabaseClient, id: number): Promise<Evento> {
  const [eventoRes, nombrePorPerfil] = await Promise.all([
    supabase.from("events").select(COLUMNAS).eq("id", id).single(),
    nombresPorPerfil(supabase),
  ]);
  if (eventoRes.error) throw eventoRes.error;
  return aEvento(eventoRes.data as unknown as FilaEvento, nombrePorPerfil);
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
  /** events.address */
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

export interface ValidacionFecha {
  valida: boolean;
  /** Última fecha aceptada (YYYY-MM-DD); null si la base no define un límite. */
  fechaMaxima: string | null;
  /** Qué hacer cuando la fecha no se acepta; null si es válida. */
  mensaje: string | null;
}

/**
 * Comprueba la regla de la base (trigger max_date_validation): un evento no
 * puede quedar a más de config.fecha_maxima_separacion_evento días desde hoy.
 * "Hoy" es la fecha UTC, igual que CURRENT_DATE en Supabase. La base sigue
 * siendo la autoridad: esta comprobación solo avisa antes de tiempo.
 */
export async function validarFechaEvento(supabase: SupabaseClient, fecha: unknown): Promise<ValidacionFecha> {
  const fechaEvento = fechaValida(fecha);
  const { data, error } = await supabase
    .from("config")
    .select("value")
    .eq("key", "fecha_maxima_separacion_evento")
    .maybeSingle();
  if (error) throw error;

  const dias = Number.parseInt(String(data?.value ?? ""), 10);
  if (!Number.isFinite(dias)) return { valida: true, fechaMaxima: null, mensaje: null };

  const hoy = new Date();
  const limite = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias));
  const fechaMaxima = limite.toISOString().slice(0, 10);
  if (fechaEvento <= fechaMaxima) return { valida: true, fechaMaxima, mensaje: null };

  const legible = limite.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return {
    valida: false,
    fechaMaxima,
    mensaje:
      `La fecha del evento no puede ser mayor a ${dias} días a partir de hoy. ` +
      `La fecha máxima aceptada es el ${legible}. Elige una fecha igual o anterior.`,
  };
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
}

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
    const previo = porVariante.get(variante.id);
    const total = (previo?.cantidad ?? 0) + cantidad;
    if (total > MAX_CANTIDAD) throw new ErrorEvento(`La cantidad de "${nombre}" no es válida.`);
    porVariante.set(variante.id, { varianteId: variante.id, cantidad: total, precio: variante.precio });
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
 * evento lleva su propia cotización (public.quote) con los servicios elegidos
 * (public.quote_items); el total sale de esos servicios. Al crear el evento no
 * se asigna ningún pago: events.total_paid empieza en 0 y sube con las
 * transacciones.
 *
 * Supabase no ofrece transacciones desde el cliente: si un paso falla, se
 * borran la cotización (el evento y los servicios caen en cascada) y el cliente
 * creado, para no dejar filas huérfanas.
 */
export async function crearEvento(supabase: SupabaseClient, datos: NuevoEvento): Promise<Evento> {
  const tipo = texto(datos?.tipo, 100, "El tipo de evento");
  if (!tipo) throw new ErrorEvento("El tipo de evento es obligatorio.");
  const fecha = fechaValida(datos.fecha);
  const validacion = await validarFechaEvento(supabase, fecha);
  if (!validacion.valida) throw new ErrorEvento(validacion.mensaje ?? "La fecha del evento no es aceptada.");
  const hora = typeof datos.hora === "string" ? datos.hora : "";
  if (!HORA_RE.test(hora)) throw new ErrorEvento("La hora del evento no es válida.");

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
    const lugar = {
      venue_id: venueId,
      venue_nombre_manual: venueId === null ? lugarManual : null,
      venue_direccion_manual: venueId === null ? direccionLugarManual || null : null,
    };

    const quote = await supabase
      .from("quote")
      .insert({
        client_id: cliente.id,
        event_type: tipo,
        transportation_id: transporteId,
        date: fecha,
        ...lugar,
      })
      .select("id")
      .single();
    if (quote.error) throw quote.error;
    quoteId = quote.data.id as number;

    const evento = await supabase
      .from("events")
      .insert({
        quote_id: quoteId,
        client_id: cliente.id,
        event_type: tipo,
        date: fecha,
        hour: hora,
        address: direccion || null,
        transportation_id: transporteId,
        confirmed: datos.confirmado === true,
        ...lugar,
      })
      .select("id")
      .single();
    if (evento.error) throw evento.error;

    const servicios = await supabase
      .from("quote_items")
      .insert(items.map((i) => ({ quote_id: quoteId, variant_id: i.varianteId, quantity: i.cantidad })));
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
