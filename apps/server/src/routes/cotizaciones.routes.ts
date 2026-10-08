import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { transporter } from '../mailer';
import { generarCotizacionPdfBuffer, type ItemCotizacionPdf } from '../pdf/cotizacionPdf';

const ESTADOS_VALIDOS = ['recibida', 'en_revision', 'finalizada', 'contrato_enviado', 'programada', 'cancelada'] as const;
type EstadoCotizacion = (typeof ESTADOS_VALIDOS)[number];

// La secretaria solo puede ver cotizaciones que ya pasaron por "finalizada" en adelante;
// nunca las que Maritza todavía está revisando.
const ESTADOS_VISIBLES_SECRETARIA: EstadoCotizacion[] = ['finalizada', 'contrato_enviado', 'programada'];

// Traduce cada estado "virtual" (no existe como columna única) a la condición SQL que lo
// identifica a partir de quote + events, usando los alias q/e.
const CONDICION_SQL: Record<EstadoCotizacion, string> = {
    recibida: "q.estado = 'recibida' and e.id is null",
    en_revision: "q.estado = 'en_revision' and e.id is null",
    finalizada: 'e.id is not null and e.contrato_enviado_en is null',
    contrato_enviado: 'e.id is not null and e.contrato_enviado_en is not null and e.confirmed = false',
    programada: 'e.confirmed = true',
    cancelada: "q.estado = 'cancelada'"
};

const SELECT_BASE = `
    select
        q.id,
        q.total,
        q.created_at,
        q.estado as quote_estado,
        coalesce(e.event_type, q.event_type) as event_type,
        coalesce(e.date, q.date) as fecha_evento,
        coalesce(e.venue_id, q.venue_id) as venue_id,
        coalesce(e.transportation_id, q.transportation_id) as transportation_id,
        coalesce(e.venue_nombre_manual, q.venue_nombre_manual) as venue_nombre_manual,
        coalesce(e.venue_direccion_manual, q.venue_direccion_manual) as venue_direccion_manual,
        q.client_id,
        u.name as cliente_nombre,
        u.email as cliente_correo,
        u.phone as cliente_telefono,
        u.documento as cliente_documento,
        v.name as venue_nombre,
        e.id as event_id,
        e.confirmed,
        e.contrato_enviado_en,
        e.contrato_firmado_nombre
    from quote q
    left join users u on u.id = q.client_id
    left join events e on e.quote_id = q.id
    left join venue v on v.id = coalesce(e.venue_id, q.venue_id)
`;

interface FilaCotizacion {
    id: number;
    total: string;
    created_at: string;
    quote_estado: EstadoCotizacion;
    event_type: string | null;
    fecha_evento: string | null;
    venue_id: number | null;
    transportation_id: number | null;
    venue_nombre_manual: string | null;
    venue_direccion_manual: string | null;
    client_id: number | null;
    cliente_nombre: string | null;
    cliente_correo: string | null;
    cliente_telefono: string | null;
    cliente_documento: string | null;
    venue_nombre: string | null;
    event_id: number | null;
    confirmed: boolean | null;
    contrato_enviado_en: string | null;
    contrato_firmado_nombre: string | null;
}

interface ItemGuardado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
    nota: string | null;
}

function derivarEstado(fila: FilaCotizacion): EstadoCotizacion {
    if (!fila.event_id) return fila.quote_estado;
    if (fila.confirmed) return 'programada';
    if (fila.contrato_enviado_en) return 'contrato_enviado';
    return 'finalizada';
}

function numeroReferencia(id: number, creadaEn: string): string {
    const anio = new Date(creadaEn).getFullYear();
    return `PL-${anio}-${String(id).padStart(4, '0')}`;
}

function mapCotizacion(fila: FilaCotizacion, items: ItemGuardado[] = []) {
    return {
        id: fila.id,
        numeroReferencia: numeroReferencia(fila.id, fila.created_at),
        clienteNombre: fila.cliente_nombre || '',
        clienteCorreo: fila.cliente_correo || '',
        clienteTelefono: fila.cliente_telefono || '',
        clienteDocumento: fila.cliente_documento,
        tipoEvento: fila.event_type,
        lugar: fila.venue_nombre || fila.venue_nombre_manual || null,
        venueId: fila.venue_id,
        venueNombreManual: fila.venue_nombre_manual,
        venueDireccionManual: fila.venue_direccion_manual,
        transportationId: fila.transportation_id,
        fechaEvento: fila.fecha_evento,
        total: Number(fila.total),
        estado: derivarEstado(fila),
        creadaEn: fila.created_at,
        items
    };
}

async function obtenerFilaCotizacion(id: string): Promise<FilaCotizacion | null> {
    const { rows } = await pool.query<FilaCotizacion>(`${SELECT_BASE} where q.id = $1`, [id]);
    return rows[0] || null;
}

async function obtenerItems(quoteId: string | number): Promise<ItemGuardado[]> {
    const { rows } = await pool.query(
        `select qi.variant_id, qi.quantity, qi.nota, iv.simple_description, iv.detailed_description, iv.price, i.type
         from quote_items qi
         join inventory_variants iv on iv.id = qi.variant_id
         join inventory i on i.id = iv.inventory_id
         where qi.quote_id = $1
         order by i.type, iv.simple_description`,
        [quoteId]
    );
    return rows.map((r) => ({
        variantId: Number(r.variant_id),
        cantidad: r.quantity,
        tag: r.type,
        nombre: r.simple_description,
        descripcion: r.detailed_description || '',
        precioUnit: Number(r.price),
        nota: r.nota
    }));
}

async function precioTransporte(transportationId: number | null): Promise<number> {
    if (!transportationId) return 0;
    const { rows } = await pool.query('select price from transportation where id = $1', [transportationId]);
    return rows[0] ? Number(rows[0].price) : 0;
}

interface ItemEntrada {
    variantId?: number;
    cantidad?: number;
    nota?: string;
}

function validarItems(items: unknown): items is Required<Pick<ItemEntrada, 'variantId' | 'cantidad'>>[] & ItemEntrada[] {
    if (!Array.isArray(items)) return false;
    return items.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const it = item as Record<string, unknown>;
        return typeof it.variantId === 'number' && typeof it.cantidad === 'number' && it.cantidad > 0;
    });
}

async function reemplazarItems(quoteId: string | number, items: ItemEntrada[]): Promise<void> {
    await pool.query('delete from quote_items where quote_id = $1', [quoteId]);
    if (items.length === 0) return;

    const values: unknown[] = [];
    const placeholders = items.map((item, idx) => {
        values.push(quoteId, item.variantId, item.cantidad, item.nota || null);
        const base = idx * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    }).join(', ');

    await pool.query(`insert into quote_items (quote_id, variant_id, quantity, nota) values ${placeholders}`, values);
}

export const cotizacionesRouter = Router();

// Público: lo usa el cotizador para guardar la cotización real.
cotizacionesRouter.post('/', asyncHandler(async (req, res) => {
    const body = req.body as {
        cliente?: { nombre?: string; correo?: string; telefono?: string };
        tipoEvento?: string;
        venueId?: number;
        venueNombreManual?: string;
        venueDireccionManual?: string;
        transportationId?: number;
        fechaEvento?: string;
        items?: unknown;
    };

    const cliente = body.cliente;
    if (!cliente?.nombre || !cliente?.correo || !cliente?.telefono) {
        return res.status(400).json({ status: 'error', message: 'Faltan los datos de contacto del cliente' });
    }
    if (body.items !== undefined && !validarItems(body.items)) {
        return res.status(400).json({ status: 'error', message: 'La lista de servicios no es válida' });
    }

    const items = (body.items as ItemEntrada[]) || [];
    const totalTransporte = await precioTransporte(body.transportationId || null);

    if (items.length === 0 && totalTransporte === 0) {
        return res.status(400).json({ status: 'error', message: 'La cotización no tiene servicios seleccionados' });
    }

    const { rows: userRows } = await pool.query<{ id: number }>(
        `insert into users (email, name, phone) values ($1, $2, $3)
         on conflict (email) do update set name = excluded.name, phone = excluded.phone
         returning id`,
        [cliente.correo.trim().toLowerCase(), cliente.nombre.trim(), cliente.telefono.trim()]
    );
    const clientId = userRows[0].id;

    // `total` arranca en solo el transporte (lo único que esta ruta no deriva de
    // quote_items): la tabla `quote` tiene un trigger propio (update_total_quote) que
    // suma/resta automáticamente el precio de cada quote_items al insertarlo/borrarlo,
    // así que el total de los servicios NUNCA se fija a mano — eso es lo que provocaba
    // que total quedara desincronizado (y hasta negativo) frente al constraint de la BD.
    const { rows: quoteRows } = await pool.query<{ id: number; created_at: string }>(
        `insert into quote (total, client_id, event_type, venue_id, transportation_id, date, venue_nombre_manual, venue_direccion_manual)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, created_at`,
        [
            totalTransporte, clientId, body.tipoEvento || null, body.venueId || null, body.transportationId || null, body.fechaEvento || null,
            body.venueId ? null : (body.venueNombreManual?.trim() || null),
            body.venueId ? null : (body.venueDireccionManual?.trim() || null)
        ]
    );
    const quoteId = quoteRows[0].id;

    await reemplazarItems(quoteId, items);

    if (process.env.EMAIL_JEFE) {
        const { rows: totalRows } = await pool.query<{ total: string }>('select total from quote where id = $1', [quoteId]);
        const totalFinal = Number(totalRows[0]?.total || 0);
        transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_JEFE,
            subject: `Nueva cotización recibida: ${cliente.nombre} (${numeroReferencia(quoteId, quoteRows[0].created_at)})`,
            text: `Se recibió una nueva cotización para revisar en el panel.\n\nCliente: ${cliente.nombre}\nReferencia: ${numeroReferencia(quoteId, quoteRows[0].created_at)}\nTotal estimado: $ ${totalFinal.toLocaleString('es-CO')} COP\n\nIngresa a tu panel para revisarla.`
        }).catch((err: Error) => console.error('Error enviando aviso de nueva cotización:', err.message));
    }

    res.status(201).json({ status: 'ok', id: quoteId, numeroReferencia: numeroReferencia(quoteId, quoteRows[0].created_at) });
}));

cotizacionesRouter.use(requireAuth);

cotizacionesRouter.get('/', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const estadoParam = req.query.estado as string | undefined;
    let estados = estadoParam
        ? (estadoParam.split(',').map((e) => e.trim()).filter((e): e is EstadoCotizacion => (ESTADOS_VALIDOS as readonly string[]).includes(e)))
        : [...ESTADOS_VALIDOS];

    if (req.usuario!.rol === 'secretaria') {
        estados = estados.filter((e) => ESTADOS_VISIBLES_SECRETARIA.includes(e));
    }
    if (estados.length === 0) return res.json([]);

    const condicion = estados.map((e) => CONDICION_SQL[e]).join(' or ');
    const { rows } = await pool.query<FilaCotizacion>(`${SELECT_BASE} where ${condicion} order by q.created_at desc`);

    res.json(rows.map((f) => mapCotizacion(f)));
}));

cotizacionesRouter.get('/:id', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const estado = derivarEstado(fila);
    if (req.usuario!.rol === 'secretaria' && !ESTADOS_VISIBLES_SECRETARIA.includes(estado)) {
        return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta cotización' });
    }

    const items = await obtenerItems(fila.id);
    res.json(mapCotizacion(fila, items));
}));

cotizacionesRouter.put('/:id/items', requireRole('administrador'), asyncHandler(async (req, res) => {
    const { items } = req.body as { items?: unknown };
    if (!validarItems(items)) {
        return res.status(400).json({ status: 'error', message: 'La lista de servicios no es válida' });
    }

    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const itemsAntes = await obtenerItems(fila.id);

    // `quote.total` lo mantiene el trigger update_total_quote() con cada insert/delete de
    // quote_items — no se recalcula ni se fija a mano aquí (ver nota en POST / más arriba).
    await reemplazarItems(fila.id, items);

    const nuevoEstado = fila.quote_estado === 'recibida' ? 'en_revision' : fila.quote_estado;

    await pool.query('update quote set estado = $1, updated_at = now() where id = $2', [nuevoEstado, req.params.id]);

    await pool.query(
        `insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, items_antes, items_despues, estado_antes, estado_despues)
         values ($1, $2, $3, 'edicion', $4, $5, $6, $7)`,
        [req.params.id, req.usuario!.id, req.usuario!.nombre, JSON.stringify(itemsAntes), JSON.stringify(items), fila.quote_estado, nuevoEstado]
    );

    const filaActualizada = await obtenerFilaCotizacion(req.params.id);
    const itemsFinal = await obtenerItems(req.params.id);
    res.json(mapCotizacion(filaActualizada!, itemsFinal));
}));

cotizacionesRouter.put('/:id/datos', requireRole('administrador'), asyncHandler(async (req, res) => {
    const body = req.body as {
        clienteNombre?: string;
        clienteCorreo?: string;
        clienteTelefono?: string;
        clienteDocumento?: string;
        tipoEvento?: string;
        venueId?: number;
        venueNombreManual?: string;
        venueDireccionManual?: string;
        transportationId?: number;
        fechaEvento?: string;
    };

    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    if (fila.client_id) {
        await pool.query(
            `update users set
                name = coalesce($1, name),
                email = coalesce($2, email),
                phone = coalesce($3, phone),
                documento = coalesce($4, documento)
             where id = $5`,
            [
                body.clienteNombre?.trim() || null,
                body.clienteCorreo?.trim().toLowerCase() || null,
                body.clienteTelefono?.trim() || null,
                body.clienteDocumento?.trim() || null,
                fila.client_id
            ]
        );
    }

    // venueId (sede del catálogo) y venueNombreManual (sede "Otro") son mutuamente
    // excluyentes: al fijar uno se limpia el otro para no dejar datos de una sede
    // anterior contradiciendo a la nueva.
    const eligiendoVenueCatalogo = !!body.venueId;
    const eligiendoVenueManual = !body.venueId && !!body.venueNombreManual?.trim();

    const destino = fila.event_id ? 'events' : 'quote';
    await pool.query(
        `update ${destino} set
            event_type = coalesce($1, event_type),
            venue_id = case when $6 then $2 when $7 then null else venue_id end,
            transportation_id = coalesce($3, transportation_id),
            date = coalesce($4, date),
            venue_nombre_manual = case when $7 then $8 when $6 then null else venue_nombre_manual end,
            venue_direccion_manual = case when $7 then $9 when $6 then null else venue_direccion_manual end,
            updated_at = now()
         where id = $5`,
        [
            body.tipoEvento?.trim() || null,
            body.venueId || null,
            body.transportationId || null,
            body.fechaEvento || null,
            fila.event_id ? fila.event_id : req.params.id,
            eligiendoVenueCatalogo,
            eligiendoVenueManual,
            body.venueNombreManual?.trim() || null,
            body.venueDireccionManual?.trim() || null
        ]
    );

    // El transporte no pasa por quote_items, así que a diferencia de los servicios
    // (que el trigger update_total_quote mantiene solo) hay que ajustar `quote.total`
    // a mano por la diferencia exacta cuando cambia.
    if (body.transportationId && body.transportationId !== fila.transportation_id) {
        const [precioNuevo, precioViejo] = await Promise.all([
            precioTransporte(body.transportationId),
            precioTransporte(fila.transportation_id)
        ]);
        await pool.query('update quote set total = total + $1 where id = $2', [precioNuevo - precioViejo, fila.id]);
    }

    const filaActualizada = await obtenerFilaCotizacion(req.params.id);
    const items = await obtenerItems(req.params.id);
    res.json(mapCotizacion(filaActualizada!, items));
}));

cotizacionesRouter.post('/:id/comentarios', requireRole('administrador'), asyncHandler(async (req, res) => {
    const { comentario } = req.body as { comentario?: string };
    if (!comentario?.trim()) {
        return res.status(400).json({ status: 'error', message: 'El comentario no puede estar vacío' });
    }

    await pool.query(
        `insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, comentario)
         values ($1, $2, $3, 'comentario', $4)`,
        [req.params.id, req.usuario!.id, req.usuario!.nombre, comentario.trim()]
    );

    res.status(201).json({ status: 'ok' });
}));

cotizacionesRouter.get('/:id/historial', requireRole('administrador'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `select * from quote_historial where quote_id = $1 order by creado_en asc`,
        [req.params.id]
    );

    res.json(rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        comentario: r.comentario,
        estadoAntes: r.estado_antes,
        estadoDespues: r.estado_despues,
        usuarioNombre: r.profile_nombre,
        creadoEn: r.creado_en
    })));
}));

cotizacionesRouter.post('/:id/finalizar', requireRole('administrador'), asyncHandler(async (req, res) => {
    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!fila.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Define la fecha del evento antes de exportar la cotización final' });
    }
    if (fila.event_id) {
        return res.status(400).json({ status: 'error', message: 'Esta cotización ya fue finalizada' });
    }

    await pool.query(
        `insert into events (quote_id, venue_id, transportation_id, event_type, address, date, hour, confirmed, initial_payment, client_id, total_paid, venue_nombre_manual, venue_direccion_manual)
         values ($1, $2, $3, $4, null, $5, '00:00:00', false, false, $6, 0, $7, $8)`,
        [fila.id, fila.venue_id, fila.transportation_id, fila.event_type, fila.fecha_evento, fila.client_id, fila.venue_nombre_manual, fila.venue_direccion_manual]
    );

    await pool.query(`update quote set estado = 'finalizada', updated_at = now() where id = $1`, [fila.id]);

    await pool.query(
        `insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, estado_antes, estado_despues)
         values ($1, $2, $3, 'cambio_estado', $4, 'finalizada')`,
        [fila.id, req.usuario!.id, req.usuario!.nombre, fila.quote_estado]
    );

    const filaActualizada = await obtenerFilaCotizacion(req.params.id);
    const items = await obtenerItems(req.params.id);
    res.json(mapCotizacion(filaActualizada!, items));
}));

cotizacionesRouter.get('/:id/pdf', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const estado = derivarEstado(fila);
    if (req.usuario!.rol === 'secretaria' && !ESTADOS_VISIBLES_SECRETARIA.includes(estado)) {
        return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta cotización' });
    }

    const itemsGuardados = await obtenerItems(fila.id);
    const items: ItemCotizacionPdf[] = itemsGuardados.map((i) => ({
        tag: i.tag,
        nombre: i.cantidad > 1 ? `${i.cantidad} x ${i.nombre}` : i.nombre,
        descripcion: i.descripcion,
        precio: i.precioUnit * i.cantidad
    }));

    const buffer = await generarCotizacionPdfBuffer({
        numeroReferencia: numeroReferencia(fila.id, fila.created_at),
        clienteNombre: fila.cliente_nombre || '',
        clienteCorreo: fila.cliente_correo || '',
        clienteTelefono: fila.cliente_telefono || '',
        tipoEvento: fila.event_type,
        ciudad: null,
        lugar: fila.venue_nombre,
        fechaEvento: fila.fecha_evento,
        items,
        total: Number(fila.total)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Cotizacion_${numeroReferencia(fila.id, fila.created_at)}.pdf`);
    res.send(buffer);
}));

cotizacionesRouter.post('/:id/marcar-definitivo', requireRole('administrador'), asyncHandler(async (req, res) => {
    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!fila.event_id || !fila.contrato_enviado_en) {
        return res.status(400).json({ status: 'error', message: 'Esta cotización todavía no tiene un contrato enviado al cliente' });
    }
    if (!fila.contrato_firmado_nombre) {
        return res.status(400).json({ status: 'error', message: 'Sube el contrato firmado antes de marcar el evento como definitivo' });
    }

    await pool.query('update events set confirmed = true, updated_at = now() where id = $1', [fila.event_id]);

    await pool.query(
        `insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, estado_antes, estado_despues)
         values ($1, $2, $3, 'cambio_estado', 'contrato_enviado', 'programada')`,
        [fila.id, req.usuario!.id, req.usuario!.nombre]
    );

    const filaActualizada = await obtenerFilaCotizacion(req.params.id);
    const items = await obtenerItems(req.params.id);
    res.json(mapCotizacion(filaActualizada!, items));
}));
