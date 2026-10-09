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

/**
 * Solo lectura.
 *
 * - public.events (+ venue, users, transportation, quote) -> datos del evento
 * - public.event_staff + public.profiles                  -> personal asignado
 */
export async function listarEventos(supabase: SupabaseClient): Promise<{ eventos: Evento[] }> {
  const [eventosRes, perfilesRes] = await Promise.all([
    supabase.from("events").select(COLUMNAS).order("date").order("hour"),
    supabase.from("profiles").select("id, nombre"),
  ]);
  if (eventosRes.error) throw eventosRes.error;
  if (perfilesRes.error) throw perfilesRes.error;

  const nombrePorPerfil = new Map<string, string>(
    perfilesRes.data.map((p) => [p.id as string, (p.nombre as string | null) ?? "Sin nombre"]),
  );

  const filas = eventosRes.data as unknown as FilaEvento[];
  const eventos = filas.map<Evento>((f) => ({
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
  }));

  return { eventos };
}
