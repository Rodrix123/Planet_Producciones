import { Router } from 'express';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { derivarEstado, numeroReferencia, type EstadoCotizacion } from '../estadoCotizacion';

/** Lo único que esta ruta necesita de la base. Permite probarla sin tocar la real. */
export interface EjecutorConsultas {
    query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

interface FilaCliente {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    documento: string | null;
}

interface FilaRegistro {
    cotizacion_id: number;
    total: string;
    created_at: string;
    quote_estado: EstadoCotizacion;
    cliente_id: number | null;
    tipo_evento: string | null;
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    ciudad: string | null;
    direccion: string | null;
    transporte_ciudad: string | null;
    transporte_precio: string | null;
    event_id: number | null;
    confirmed: boolean | null;
    initial_payment: boolean | null;
    total_paid: string | null;
    contrato_enviado_en: string | null;
    contrato_firmado_subido_en: string | null;
    contrato_firmado_nombre: string | null;
}

export interface EventoConsulta {
    id: number;
    confirmado: boolean;
    pagoInicial: boolean;
    totalPagado: number;
    contratoEnviadoEn: string | null;
    contratoFirmadoSubidoEn: string | null;
    tieneContratoFirmado: boolean;
}

/** Una cotización y, si ya se convirtió en evento, su evento (events.quote_id es único). */
export interface RegistroConsulta {
    cotizacionId: number;
    numeroReferencia: string;
    estado: EstadoCotizacion;
    total: number;
    creadaEn: string;
    tipoEvento: string | null;
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    ciudad: string | null;
    direccion: string | null;
    transporte: { ciudad: string; precio: number } | null;
    evento: EventoConsulta | null;
}

export interface ClienteConsulta {
    /** Nulo solo en el grupo de cotizaciones sin cliente asociado. */
    id: number | null;
    nombre: string;
    correo: string | null;
    telefono: string | null;
    documento: string | null;
    registros: RegistroConsulta[];
}

const SQL_CLIENTES = 'select id, name, email, phone, documento from users';

// `quote` y `events` guardan las mismas columnas de logística y cualquiera puede estar vacía:
// cada dato sale del evento y, si falta ahí, de su cotización (ver AGENTS.md). Lo mismo vale
// para el cliente: la mayoría de eventos tienen events.client_id nulo y solo se pueden
// asociar a su cliente a través de la cotización.
//
// Hora: al finalizar una cotización, POST /:id/finalizar escribe '00:00:00' en events.hour
// como relleno, así que esa hora no se toma por cierta. Un evento creado de verdad a
// medianoche la conserva porque crearEvento la guarda también en quote.hour.
//
// Los ::text dejan fecha y hora como texto sin importar el driver.
const SQL_REGISTROS = `
    select
        q.id as cotizacion_id,
        q.total,
        q.created_at,
        q.estado as quote_estado,
        coalesce(e.client_id, q.client_id) as cliente_id,
        coalesce(nullif(e.event_type, ''), nullif(q.event_type, '')) as tipo_evento,
        coalesce(e.date, q.date)::text as fecha,
        coalesce(nullif(e.hour, time '00:00'), q.hour)::text as hora,
        coalesce(ve.name, nullif(e.venue_nombre_manual, ''), vq.name, nullif(q.venue_nombre_manual, '')) as lugar,
        coalesce(ve.city, vq.city) as ciudad,
        coalesce(
            nullif(e.address, ''), nullif(e.venue_direccion_manual, ''),
            nullif(q.address, ''), nullif(q.venue_direccion_manual, '')
        ) as direccion,
        t.city as transporte_ciudad,
        t.price as transporte_precio,
        e.id as event_id,
        e.confirmed,
        e.initial_payment,
        e.total_paid,
        e.contrato_enviado_en,
        e.contrato_firmado_subido_en,
        e.contrato_firmado_nombre
    from quote q
    left join events e on e.quote_id = q.id
    left join venue ve on ve.id = e.venue_id
    left join venue vq on vq.id = q.venue_id
    left join transportation t on t.id = coalesce(e.transportation_id, q.transportation_id)
`;

const ALFABETICO = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Orden cronológico; los que no tienen fecha van al final y, en un mismo día, los sin hora. */
const claveDeOrden = (r: RegistroConsulta): string => `${r.fecha ?? '9999-99-99'} ${r.hora ?? '99:99:99'}`;

function aRegistro(f: FilaRegistro): RegistroConsulta {
    const id = Number(f.cotizacion_id);
    return {
        cotizacionId: id,
        numeroReferencia: numeroReferencia(id, f.created_at),
        estado: derivarEstado(f),
        total: Number(f.total),
        creadaEn: f.created_at,
        tipoEvento: f.tipo_evento,
        fecha: f.fecha,
        hora: f.hora,
        lugar: f.lugar,
        ciudad: f.ciudad,
        direccion: f.direccion,
        transporte: f.transporte_ciudad
            ? { ciudad: f.transporte_ciudad, precio: Number(f.transporte_precio) }
            : null,
        evento: f.event_id === null ? null : {
            id: Number(f.event_id),
            confirmado: f.confirmed === true,
            pagoInicial: f.initial_payment === true,
            totalPagado: Number(f.total_paid),
            contratoEnviadoEn: f.contrato_enviado_en,
            contratoFirmadoSubidoEn: f.contrato_firmado_subido_en,
            tieneContratoFirmado: !!f.contrato_firmado_nombre
        }
    };
}

/** Todos los clientes registrados, con o sin cotizaciones, y cada cotización bajo su cliente. */
function agruparPorCliente(clientes: FilaCliente[], filas: FilaRegistro[]): ClienteConsulta[] {
    const porId = new Map<number, ClienteConsulta>();
    for (const c of clientes) {
        porId.set(Number(c.id), {
            id: Number(c.id),
            nombre: c.name,
            correo: c.email,
            telefono: c.phone,
            documento: c.documento,
            registros: []
        });
    }

    const sinCliente: RegistroConsulta[] = [];
    for (const fila of filas) {
        const cliente = fila.cliente_id === null ? undefined : porId.get(Number(fila.cliente_id));
        (cliente?.registros ?? sinCliente).push(aRegistro(fila));
    }

    const resultado = [...porId.values()].sort((a, b) => ALFABETICO.compare(a.nombre, b.nombre));
    if (sinCliente.length > 0) {
        resultado.push({
            id: null,
            nombre: 'Sin cliente asociado',
            correo: null,
            telefono: null,
            documento: null,
            registros: sinCliente
        });
    }
    for (const c of resultado) c.registros.sort((a, b) => claveDeOrden(a).localeCompare(claveDeOrden(b)));
    return resultado;
}

export async function listarClientesConsulta(db: EjecutorConsultas): Promise<ClienteConsulta[]> {
    const [clientes, registros] = await Promise.all([db.query(SQL_CLIENTES), db.query(SQL_REGISTROS)]);
    return agruparPorCliente(clientes.rows, registros.rows);
}

/** Panel de consulta de la administradora: solo lectura, no escribe en ninguna tabla. */
export function crearConsultaRouter(db: EjecutorConsultas): Router {
    const router = Router();
    router.use(requireAuth, requireRole('administrador'));

    router.get('/clientes', asyncHandler(async (_req, res) => {
        res.json({ status: 'ok', clientes: await listarClientesConsulta(db) });
    }));

    return router;
}
