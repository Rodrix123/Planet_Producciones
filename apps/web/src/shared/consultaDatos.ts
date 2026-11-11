// Datos y reglas del panel de consulta, sin DOM: lo que devuelve GET /api/consulta/clientes,
// cómo se filtra y cómo se presenta. La página (consulta.ts) solo pinta el resultado.

export type EstadoCotizacion = 'recibida' | 'en_revision' | 'finalizada' | 'contrato_enviado' | 'programada' | 'cancelada';

export interface EventoConsulta {
    id: number;
    confirmado: boolean;
    pagoInicial: boolean;
    totalPagado: number;
    contratoEnviadoEn: string | null;
    contratoFirmadoSubidoEn: string | null;
    tieneContratoFirmado: boolean;
}

/** Una cotización y, si ya se convirtió en evento, su evento. */
export interface RegistroConsulta {
    cotizacionId: number;
    numeroReferencia: string;
    estado: EstadoCotizacion;
    total: number;
    creadaEn: string;
    tipoEvento: string | null;
    fecha: string | null; // YYYY-MM-DD
    hora: string | null; // HH:MM:SS
    lugar: string | null;
    ciudad: string | null;
    direccion: string | null;
    transporte: { ciudad: string; precio: number } | null;
    evento: EventoConsulta | null;
}

export interface ClienteConsulta {
    id: number | null;
    nombre: string;
    correo: string | null;
    telefono: string | null;
    documento: string | null;
    registros: RegistroConsulta[];
}

export interface FiltrosConsulta {
    nombre: string;
    estado: string;
    desde: string;
    hasta: string;
}

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
    recibida: 'Recibida',
    en_revision: 'En revisión',
    finalizada: 'Finalizada',
    contrato_enviado: 'Contrato enviado',
    programada: 'Programada',
    cancelada: 'Cancelada'
};

export function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

/** Sin tildes, mayúsculas ni espacios de más: "  MARÍA  josé" y "maria jose" son lo mismo. */
export function normalizarTexto(texto: string): string {
    return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Estado y fecha filtran eventos y cotizaciones; el nombre filtra clientes. */
export function hayFiltrosDeRegistro(f: FiltrosConsulta): boolean {
    return f.estado !== '' || f.desde !== '' || f.hasta !== '';
}

export function hayFiltros(f: FiltrosConsulta): boolean {
    return hayFiltrosDeRegistro(f) || normalizarTexto(f.nombre) !== '';
}

function cumpleFiltros(r: RegistroConsulta, f: FiltrosConsulta): boolean {
    if (f.estado && r.estado !== f.estado) return false;
    // Sin fecha no se puede saber si cae dentro de un rango: con un rango activo se oculta.
    if ((f.desde || f.hasta) && !r.fecha) return false;
    if (f.desde && r.fecha! < f.desde) return false;
    if (f.hasta && r.fecha! > f.hasta) return false;
    return true;
}

/**
 * Combina los filtros. Estado y fecha se exigen sobre un mismo registro: un cliente con un
 * evento programado en marzo no aparece buscando "programada" en abril por tener otro
 * evento en abril. Con esos filtros activos, cada cliente muestra solo lo que coincide y
 * desaparece si no le queda nada.
 */
export function filtrarClientes(clientes: ClienteConsulta[], f: FiltrosConsulta): ClienteConsulta[] {
    const nombre = normalizarTexto(f.nombre);
    const porRegistro = hayFiltrosDeRegistro(f);

    return clientes.flatMap((cliente) => {
        if (nombre && !normalizarTexto(cliente.nombre).includes(nombre)) return [];
        if (!porRegistro) return [cliente];
        const registros = cliente.registros.filter((r) => cumpleFiltros(r, f));
        return registros.length > 0 ? [{ ...cliente, registros }] : [];
    });
}

export function separarRegistros(cliente: ClienteConsulta): { eventos: RegistroConsulta[]; cotizaciones: RegistroConsulta[] } {
    return {
        eventos: cliente.registros.filter((r) => r.evento !== null),
        cotizaciones: cliente.registros.filter((r) => r.evento === null)
    };
}

export function contarResultados(clientes: ClienteConsulta[]): { clientes: number; eventos: number; cotizaciones: number } {
    const registros = clientes.flatMap((c) => c.registros);
    const eventos = registros.filter((r) => r.evento !== null).length;
    return { clientes: clientes.length, eventos, cotizaciones: registros.length - eventos };
}

/** Primer evento de hoy en adelante; los registros ya llegan en orden cronológico. */
export function proximoEvento(cliente: ClienteConsulta, hoy: string): RegistroConsulta | null {
    return separarRegistros(cliente).eventos.find((r) => r.fecha !== null && r.fecha >= hoy) ?? null;
}

export type CuadreTotal = 'cuadra' | 'sin_servicios' | 'no_cuadra';

/**
 * Compara el total guardado en la cotización con lo que suman sus servicios más el transporte.
 * quote_items no guarda precio: cada servicio se valora con el catálogo vigente, y hay
 * cotizaciones con total registrado que se quedaron sin servicios guardados.
 */
export function revisarTotal(items: { precioUnit: number; cantidad: number }[], precioTransporte: number, total: number): CuadreTotal {
    if (items.length === 0) return total > 0 && precioTransporte < total ? 'sin_servicios' : 'cuadra';
    const suma = items.reduce((acc, i) => acc + i.precioUnit * i.cantidad, 0) + precioTransporte;
    return Math.abs(suma - total) < 1 ? 'cuadra' : 'no_cuadra';
}

// ---------- Servicios de una cotización (tabla del detalle) ----------

export interface ServicioCotizado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
    nota?: string | null;
}

export interface FiltroServicios {
    texto: string;
    categoria: string;
}

export const SERVICIOS_POR_PAGINA = 10;

const ALFABETICO = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Categorías presentes en la cotización, en orden alfabético y con cuántos servicios tiene cada una. */
export function categoriasDeServicios(items: ServicioCotizado[]): { categoria: string; cantidad: number }[] {
    const cuenta = new Map<string, number>();
    for (const item of items) cuenta.set(item.tag, (cuenta.get(item.tag) ?? 0) + 1);
    return [...cuenta]
        .map(([categoria, cantidad]) => ({ categoria, cantidad }))
        .sort((a, b) => ALFABETICO.compare(a.categoria, b.categoria));
}

/**
 * Búsqueda sin tildes ni mayúsculas en nombre, descripción, categoría y nota. Con varias
 * palabras, cada una debe aparecer (en cualquier orden): "led par" encuentra "Par LED".
 */
export function filtrarServicios(items: ServicioCotizado[], f: FiltroServicios): ServicioCotizado[] {
    const palabras = normalizarTexto(f.texto).split(' ').filter(Boolean);
    return items.filter((item) => {
        if (f.categoria && item.tag !== f.categoria) return false;
        if (palabras.length === 0) return true;
        const texto = normalizarTexto(`${item.nombre} ${item.descripcion} ${item.tag} ${item.nota ?? ''}`);
        return palabras.every((p) => texto.includes(p));
    });
}

export interface Pagina<T> {
    elementos: T[];
    /** Página mostrada, ya ajustada a las que existen. */
    pagina: number;
    totalPaginas: number;
    total: number;
    /** Posición (desde 1) del primer y el último elemento mostrados; 0 si no hay ninguno. */
    desde: number;
    hasta: number;
}

/** Corta la página pedida; una página fuera de rango se ajusta a la primera o a la última. */
export function paginar<T>(items: T[], pagina: number, porPagina = SERVICIOS_POR_PAGINA): Pagina<T> {
    const total = items.length;
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
    const inicio = (actual - 1) * porPagina;
    const elementos = items.slice(inicio, inicio + porPagina);
    return { elementos, pagina: actual, totalPaginas, total, desde: total ? inicio + 1 : 0, hasta: inicio + elementos.length };
}

/**
 * Botones de página a mostrar: la primera, la última y las vecinas de la actual; `null` marca
 * un salto ("…"). Con pocas páginas se muestran todas.
 */
export function paginasVisibles(actual: number, total: number): (number | null)[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const elegidas = new Set([1, total, actual - 1, actual, actual + 1]);
    if (actual <= 3) [2, 3, 4].forEach((p) => elegidas.add(p));
    if (actual >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => elegidas.add(p));
    const orden = [...elegidas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

    const resultado: (number | null)[] = [];
    orden.forEach((p, i) => {
        const anterior = orden[i - 1];
        if (anterior !== undefined && p - anterior === 2) resultado.push(anterior + 1); // un hueco de una sola página se muestra
        else if (anterior !== undefined && p - anterior > 2) resultado.push(null);
        resultado.push(p);
    });
    return resultado;
}

/** Más recientes primero, sin cambiar el arreglo original. */
export function historialReciente<T extends { creadoEn: string }>(historial: T[]): T[] {
    return [...historial].sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
}

// ---------- Presentación ----------

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

export function formatearCOP(valor: number): string {
    return formatterCOP.format(valor);
}

export function obtenerFormatterCOP(): Intl.NumberFormat {
    return formatterCOP;
}

const deISO = (iso: string): Date => new Date(`${iso}T00:00:00`);

export function formatearHora(hora: string | null): string {
    if (!hora) return 'Hora por definir';
    const [h = '0', m = '0'] = hora.split(':');
    return new Date(2000, 0, 1, Number(h), Number(m)).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

export function formatearFechaLarga(iso: string | null): string {
    if (!iso) return 'Fecha por definir';
    const texto = deISO(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Fecha de un campo de la base (YYYY-MM-DD) en forma breve: "12 dic 2026". */
export function formatearFechaCorta(iso: string): string {
    return deISO(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/ de /g, ' ');
}

/** Marca de tiempo (created_at, contrato_enviado_en...) en forma breve. */
export function formatearMomento(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/ de /g, ' ');
}

/** Bloque de fecha de cada fila: el día grande y debajo mes y año. */
export function partesDeFecha(iso: string | null): { dia: string; resto: string } {
    if (!iso) return { dia: '—', resto: 'sin fecha' };
    const d = deISO(iso);
    return {
        dia: String(d.getDate()),
        resto: `${d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')} ${d.getFullYear()}`
    };
}

export function iniciales(nombre: string): string {
    const palabras = nombre.trim().split(/\s+/).filter(Boolean);
    return palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

export function lugarTexto(r: RegistroConsulta): string {
    return [r.lugar, r.ciudad].filter(Boolean).join(' · ') || 'Lugar por definir';
}

export function nombreEvento(r: RegistroConsulta): string {
    return r.tipoEvento?.trim() || 'Tipo de evento sin definir';
}

/** Fecha de hoy en Colombia (YYYY-MM-DD): un evento de hoy no cuenta como pasado en toda la noche. */
export function hoyEnColombia(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
