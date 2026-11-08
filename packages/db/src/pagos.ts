import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarEvento, listarEventosConfirmados, type Evento } from "./eventos.js";

/**
 * Menú "Pagos": registro manual de pagos (sin pasarela en línea).
 *
 * - public.events (confirmed = true) + public.quote -> eventos y lo que deben
 * - public.transactions                           -> cada pago registrado
 *
 * Al insertar en public.transactions, el trigger update_initial_payment suma el
 * monto a events.total_paid y marca events.initial_payment cuando corresponde:
 * aquí no se actualiza public.events a mano.
 */

export type MetodoPago = "efectivo" | "transferencia";

export interface EventoPago extends Evento {
  /** Lo que falta por pagar (total de la cotización - total pagado), nunca negativo. */
  saldo: number;
}

export interface NuevoPago {
  eventId: number;
  monto: number;
  metodo: MetodoPago;
  referencia?: string | null;
}

/** Error con código HTTP sugerido, para que la API responda con el estado correcto. */
export class ErrorPago extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

const METODOS: MetodoPago[] = ["efectivo", "transferencia"];
const MAX_REFERENCIA = 150;
const MAX_MONTO = 99_999_999.99; // NUMERIC(10, 2)
/** Los pagos deben ser múltiplos de este valor (salvo el que cierra el saldo exacto). */
const MULTIPLO_PAGO = 50;

/** Pesos a centavos enteros, para comparar montos sin errores de coma flotante. */
const aCentavos = (valor: number): number => Math.round(valor * 100);

const saldoDe = (e: Evento): number => Math.max(0, (aCentavos(e.total ?? 0) - aCentavos(e.totalPagado)) / 100);

const aEventoPago = (e: Evento): EventoPago => ({ ...e, saldo: saldoDe(e) });

/** Pagado = ya se cubrió el total de la cotización. */
const estaPagado = (e: Evento): boolean => e.total !== null && aCentavos(e.totalPagado) >= aCentavos(e.total);

/** Solo lectura. Eventos confirmados divididos en sin pagar y pagados. */
export async function listarPagos(
  supabase: SupabaseClient,
): Promise<{ sinPagar: EventoPago[]; pagados: EventoPago[] }> {
  const eventos = await listarEventosConfirmados(supabase);
  const sinPagar: EventoPago[] = [];
  const pagados: EventoPago[] = [];
  for (const e of eventos) (estaPagado(e) ? pagados : sinPagar).push(aEventoPago(e));
  return { sinPagar, pagados };
}

function validarPago(datos: unknown): NuevoPago {
  const d = (datos ?? {}) as Record<string, unknown>;

  const eventId = Number(d.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) throw new ErrorPago("El evento no es válido.");

  const monto = typeof d.monto === "number" ? d.monto : Number(d.monto);
  if (!Number.isFinite(monto) || aCentavos(monto) <= 0) throw new ErrorPago("El monto debe ser mayor que cero.");
  if (monto > MAX_MONTO) throw new ErrorPago("El monto es demasiado alto.");

  const metodo = d.metodo as MetodoPago;
  if (!METODOS.includes(metodo)) throw new ErrorPago("El método de pago no es válido.");

  const referencia = typeof d.referencia === "string" ? d.referencia.trim() : "";
  if (referencia.length > MAX_REFERENCIA) {
    throw new ErrorPago(`La referencia no puede superar los ${MAX_REFERENCIA} caracteres.`);
  }

  return { eventId, monto: aCentavos(monto) / 100, metodo, referencia: referencia || null };
}

/**
 * Registra un pago de un evento confirmado. El monto no puede superar el saldo
 * pendiente. Devuelve el evento con el total pagado ya actualizado por el trigger.
 */
export async function registrarPago(supabase: SupabaseClient, datos: unknown): Promise<EventoPago> {
  const pago = validarPago(datos);

  let evento: Evento;
  try {
    evento = await cargarEvento(supabase, pago.eventId);
  } catch (error) {
    if ((error as { code?: string }).code === "PGRST116") throw new ErrorPago("El evento no existe.", 404);
    throw error;
  }

  if (!evento.confirmado) throw new ErrorPago("Solo se pueden registrar pagos de eventos confirmados.");
  if (evento.total === null) throw new ErrorPago("El evento no tiene una cotización con total.");

  const saldo = saldoDe(evento);
  if (saldo <= 0) throw new ErrorPago("Este evento ya está pagado.");
  if (aCentavos(pago.monto) > aCentavos(saldo)) throw new ErrorPago("El monto supera el saldo pendiente.");
  // Múltiplo de 50, salvo el pago que cierra exactamente el saldo (si no, un total que no
  // sea múltiplo de 50 nunca podría quedar pagado).
  if (aCentavos(pago.monto) !== aCentavos(saldo) && aCentavos(pago.monto) % (MULTIPLO_PAGO * 100) !== 0) {
    throw new ErrorPago(`El monto debe ser múltiplo de ${MULTIPLO_PAGO} (o igual al saldo pendiente).`);
  }

  const insercion = await supabase.from("transactions").insert({
    event_id: pago.eventId,
    amount: pago.monto,
    payment_method: pago.metodo,
    payment_reference: pago.referencia,
  });
  if (insercion.error) throw insercion.error;

  return aEventoPago(await cargarEvento(supabase, pago.eventId));
}
