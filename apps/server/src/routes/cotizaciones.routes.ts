// Cotizaciones (/api/cotizaciones): desde que el cliente la guarda en la página pública hasta que
// el evento queda definitivo.
//
// Recorrido de una cotización y quién actúa en cada paso:
//   recibida / en_revision -> Maritza (administradora) revisa y edita servicios y datos
//   finalizada             -> Maritza la finaliza: se crea el evento
//   contrato_enviado       -> Mariana (secretaria) genera y envía el contrato (ver contratos.routes.ts)
//   programada             -> Maritza sube el contrato firmado y deja el evento definitivo
//
// El estado no se guarda en una sola columna: se deduce de quote + events (ver derivarEstado).

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { enviarCorreo } from '../mailer';
import { generarCotizacionPdfBuffer, type ItemCotizacionPdf } from '../pdf/cotizacionPdf';
import { esCorreoValido, limpiarTexto, LIMITES, normalizarCotizacion, normalizarItems } from '../cotizacionEntrada';
import { numeroReferencia } from '../referencia';

// Estados posibles de una cotización, en orden del recorrido.
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

// Consulta base de una cotización con los datos del evento, la sede y el cliente. Donde existe un evento
// sus datos mandan sobre los de la cotización (coalesce); nombre, teléfono y documento salen de la
// propia cotización y solo si faltan (cotizaciones antiguas) del cliente.
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
        coalesce(q.cliente_nombre, u.name) as cliente_nombre,
        u.email as cliente_correo,
        coalesce(q.cliente_telefono, u.phone) as cliente_telefono,
        coalesce(q.cliente_documento, u.documento) as cliente_documento,
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

// Fila que devuelve SELECT_BASE (nombres de la base en snake_case).
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

// Un servicio guardado en una cotización, ya con su precio por unidad calculado.
interface ItemGuardado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
    nota: string | null;
}

/**
 * Deduce el estado visible: sin evento es el de la cotización; con evento depende de si ya se envió el
 * contrato o ya está confirmado.
 */
function derivarEstado(fila: FilaCotizacion): EstadoCotizacion {
    if (!fila.event_id) return fila.quote_estado;
    if (fila.confirmed) return 'programada';
    if (fila.contrato_enviado_en) return 'contrato_enviado';
    return 'finalizada';
}

/**
 * Convierte la fila de la base al formato JSON que usa el frontend.
 */
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

/**
 * Una cotización por id, o null si no existe.
 */
async function obtenerFilaCotizacion(id: string): Promise<FilaCotizacion | null> {
    const { rows } = await pool.query<FilaCotizacion>(`${SELECT_BASE} where q.id = $1`, [id]);
    return rows[0] || null;
}

async function obtenerItems(quoteId: string | number): Promise<ItemGuardado[]> {
    // El precio vive en "PriceVariants": un tramo exacto para (variante, cantidad)
    // ya es el precio TOTAL de ese tramo (ej. x8 = $3.700.000); si no hay tramo exacto
    // (cantidades libres como sillas/mesas), se usa el tramo base (quantity=1) como
    // precio por unidad.
    const { rows } = await pool.query(
        `select qi.variant_id, qi.quantity, qi.nota, iv.simple_description, iv.detailed_description, i.type,
                exact.price as precio_tramo_exacto,
                base.price as precio_base
         from quote_items qi
         join inventory_variants iv on iv.id = qi.variant_id
         join inventory i on i.id = iv.inventory_id
         left join "PriceVariants" exact on exact.id_variant = qi.variant_id and exact.quantity = qi.quantity
         left join "PriceVariants" base on base.id_variant = qi.variant_id and base.quantity = 1
         where qi.quote_id = $1
         order by i.type, iv.simple_description`,
        [quoteId]
    );
    return rows.map((r) => {
        const precioUnit = r.precio_tramo_exacto !== null
            ? Number(r.precio_tramo_exacto) / r.quantity
            : Number(r.precio_base) || 0;
        return {
            variantId: Number(r.variant_id),
            cantidad: r.quantity,
            tag: r.type,
            nombre: r.simple_description,
            descripcion: r.detailed_description || '',
            precioUnit,
            nota: r.nota
        };
    });
}

/** Cotización + servicios en paralelo: dos consultas independientes no tienen por qué esperarse una a otra. */
async function cargarCotizacion(id: string | number) {
    const [fila, items] = await Promise.all([obtenerFilaCotizacion(String(id)), obtenerItems(id)]);
    return fila ? mapCotizacion(fila, items) : null;
}

/**
 * Precio del transporte elegido (0 si no hay transporte).
 */
async function precioTransporte(transportationId: number | null): Promise<number> {
    if (!transportationId) return 0;
    const { rows } = await pool.query('select price from transportation where id = $1', [transportationId]);
    return rows[0] ? Number(rows[0].price) : 0;
}

export const cotizacionesRouter = Router();

// Público: lo usa el cotizador para guardar la cotización real.
// Cliente + cotización + servicios se guardan con UNA sola consulta: quien cotiza espera esta
// respuesta antes de bajar su PDF y cada viaje a la base cuesta ~0,25 s (antes eran 7 viajes,
// ~2 s). Al ser una sola sentencia SQL es atómica: si algo falla (p. ej. un servicio que ya no
// existe) no queda nada a medias.
cotizacionesRouter.post('/', asyncHandler(async (req, res) => {
    const entrada = normalizarCotizacion(req.body);
    if (!entrada.ok) return res.status(400).json({ status: 'error', message: entrada.message });
    const { cliente, items } = entrada.datos;

    // Sin servicios, la cotización solo es válida si el transporte elegido tiene precio.
    if (items.length === 0 && (await precioTransporte(entrada.datos.transportationId)) === 0) {
        return res.status(400).json({ status: 'error', message: 'La cotización no tiene servicios seleccionados' });
    }

    let quoteId: number;
    let creadaEn: string;
    try {
        // El cliente se identifica por su correo, pero su nombre y teléfono NO se pisan: si ese
        // correo ya existía, se conserva lo que había (solo se completan datos que faltaban).
        // Lo que escribió esta persona queda guardado en la propia cotización.
        //
        // `total` arranca en solo el transporte (lo único que esta ruta no deriva de
        // quote_items): la tabla `quote` tiene un trigger propio (update_total_quote) que
        // suma/resta automáticamente el precio de cada quote_items al insertarlo/borrarlo,
        // así que el total de los servicios NUNCA se fija a mano — eso es lo que provocaba
        // que total quedara desincronizado (y hasta negativo) frente al constraint de la BD.
        const { rows } = await pool.query<{ id: string; created_at: string }>(
            `with cliente as (
                 insert into users (email, name, phone, documento) values ($1, $2, $3, $4)
                 on conflict (email) do update set
                    phone = coalesce(nullif(users.phone, ''), excluded.phone),
                    documento = coalesce(nullif(users.documento, ''), excluded.documento)
                 returning id
             ), cotizacion as (
                 insert into quote (total, client_id, cliente_nombre, cliente_telefono, cliente_documento,
                                    event_type, venue_id, transportation_id, date, venue_nombre_manual, venue_direccion_manual)
                 select coalesce((select price from transportation where id = $9::bigint), 0), cliente.id, $2, $3, $4,
                        $5, $6::bigint, $9::bigint, $7::date, $8, $10
                 from cliente
                 returning id, created_at
             ), servicios as (
                 insert into quote_items (quote_id, variant_id, quantity, nota)
                 select cotizacion.id, s.variante, s.cantidad, s.nota
                 from cotizacion, unnest($11::bigint[], $12::int[], $13::text[]) as s(variante, cantidad, nota)
                 returning 1
             )
             select id, created_at from cotizacion`,
            [
                cliente.correo, cliente.nombre, cliente.telefono, cliente.documento,
                entrada.datos.tipoEvento, entrada.datos.venueId, entrada.datos.fechaEvento,
                entrada.datos.venueNombreManual, entrada.datos.transportationId, entrada.datos.venueDireccionManual,
                items.map((i) => i.variantId), items.map((i) => i.cantidad), items.map((i) => i.nota ?? null)
            ]
        );
        quoteId = Number(rows[0].id);
        creadaEn = rows[0].created_at;
    } catch (error) {
        // 23503: un servicio, sede o transporte que ya no existe en la base.
        if ((error as { code?: string }).code === '23503') {
            return res.status(400).json({ status: 'error', message: 'Alguno de los servicios elegidos ya no está disponible. Recarga la página e inténtalo de nuevo.' });
        }
        // 22003: el valor de un servicio (precio x cantidad) supera lo que el cálculo de totales de la base admite.
        if ((error as { code?: string }).code === '22003') {
            return res.status(400).json({ status: 'error', message: 'El valor de la cotización es demasiado alto. Reduce las cantidades e inténtalo de nuevo.' });
        }
        throw error;
    }

    res.status(201).json({ status: 'ok', id: quoteId, numeroReferencia: numeroReferencia(quoteId, creadaEn) });

    // El aviso a la jefa sale después de responder: quien cotiza no espera ni a la consulta del
    // total ni al correo.
    if (process.env.EMAIL_JEFE) {
        void avisarNuevaCotizacion(quoteId, creadaEn, cliente.nombre);
    }
}));

/**
 * Correo a la jefa avisando de una cotización nueva. Se llama sin esperar y no afecta al cliente si falla.
 */
async function avisarNuevaCotizacion(quoteId: number, creadaEn: string, nombreCliente: string): Promise<void> {
    try {
        const { rows } = await pool.query<{ total: string }>('select total from quote where id = $1', [quoteId]);
        const total = Number(rows[0]?.total || 0);
        await enviarCorreo({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_JEFE,
            subject: `Nueva cotización recibida: ${nombreCliente} (${numeroReferencia(quoteId, creadaEn)})`,
            text: `Se recibió una nueva cotización para revisar en el panel.\n\nCliente: ${nombreCliente}\nReferencia: ${numeroReferencia(quoteId, creadaEn)}\nTotal estimado: $ ${total.toLocaleString('es-CO')} COP\n\nIngresa a tu panel para revisarla.`
        });
    } catch (err) {
        console.error('Error enviando aviso de nueva cotización:', (err as Error).message);
    }
}

// Un id que no es un número (p. ej. /api/cotizaciones/abc) es simplemente una cotización que no existe:
// sin esto la consulta fallaba al convertirlo y el usuario veía un error 500.
cotizacionesRouter.param('id', (_req, res, next, valor) => {
    if (/^[0-9]{1,15}$/.test(String(valor))) return next();
    res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
});

cotizacionesRouter.use(requireAuth);

// Listado filtrable por estado (?estado=a,b). La secretaria solo recibe los estados que le corresponden.
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

// Detalle de una cotización con sus servicios. La secretaria no puede abrir las que aún se revisan.
cotizacionesRouter.get('/:id', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const [fila, items] = await Promise.all([obtenerFilaCotizacion(req.params.id), obtenerItems(req.params.id)]);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const estado = derivarEstado(fila);
    if (req.usuario!.rol === 'secretaria' && !ESTADOS_VISIBLES_SECRETARIA.includes(estado)) {
        return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta cotización' });
    }

    res.json(mapCotizacion(fila, items));
}));

cotizacionesRouter.put('/:id/items', requireRole('administrador'), asyncHandler(async (req, res) => {
    const items = normalizarItems((req.body as { items?: unknown }).items);
    if (items === null) {
        return res.status(400).json({ status: 'error', message: 'La lista de servicios no es válida' });
    }

    const [fila, itemsAntes] = await Promise.all([obtenerFilaCotizacion(req.params.id), obtenerItems(req.params.id)]);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const nuevoEstado = fila.quote_estado === 'recibida' ? 'en_revision' : fila.quote_estado;

    // Todo o nada: antes los servicios se borraban y se insertaban por separado, y si la
    // inserción fallaba (p. ej. un servicio que ya no existe) la cotización se quedaba SIN servicios.
    // `quote.total` lo mantiene el trigger update_total_quote() con cada insert/delete de
    // quote_items — no se recalcula ni se fija a mano aquí (ver nota en POST / más arriba).
    const db = await pool.connect();
    try {
        await db.query('begin');
        await db.query('delete from quote_items where quote_id = $1', [fila.id]);
        if (items.length > 0) {
            await db.query(
                `insert into quote_items (quote_id, variant_id, quantity, nota)
                 select $1, s.variante, s.cantidad, s.nota
                 from unnest($2::bigint[], $3::int[], $4::text[]) as s(variante, cantidad, nota)`,
                [fila.id, items.map((i) => i.variantId), items.map((i) => i.cantidad), items.map((i) => i.nota ?? null)]
            );
        }
        await db.query(
            `with estado as (update quote set estado = $1, updated_at = now() where id = $2 returning id)
             insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, items_antes, items_despues, estado_antes, estado_despues)
             values ($2, $3, $4, 'edicion', $5, $6, $7, $1)`,
            [nuevoEstado, fila.id, req.usuario!.id, req.usuario!.nombre, JSON.stringify(itemsAntes), JSON.stringify(items), fila.quote_estado]
        );
        await db.query('commit');
    } catch (error) {
        await db.query('rollback').catch(() => undefined);
        const code = (error as { code?: string }).code;
        if (code === '23503') {
            return res.status(400).json({ status: 'error', message: 'Alguno de los servicios elegidos ya no está disponible. Recarga la página e inténtalo de nuevo.' });
        }
        if (code === '22003') {
            return res.status(400).json({ status: 'error', message: 'El valor de la cotización es demasiado alto. Reduce las cantidades e inténtalo de nuevo.' });
        }
        throw error;
    } finally {
        db.release();
    }

    res.json(await cargarCotizacion(req.params.id));
}));

// Corrige datos de la cotización: cliente, tipo de evento, sede, transporte y fecha. Si la cotización
// ya es un evento, los datos del evento se actualizan en la tabla events; si no, en quote.
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
        transportationId?: number | null;
        fechaEvento?: string;
    };

    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    // El transporte se resuelve en el frontend a partir de la ciudad elegida (ya no es un
    // select aparte), así que cuando el editor de Maritza manda este campo puede venir en
    // null (ciudad sin transporte registrado o sin ciudad elegida) y eso debe LIMPIAR el
    // transporte, a diferencia de otras pantallas (eventos-proceso) que ni siquiera mandan
    // este campo y cuyo valor anterior debe quedar intacto.
    const transportationIdProvisto = Object.prototype.hasOwnProperty.call(body, 'transportationId');
    const nuevoTransportationId = body.transportationId ?? null;

    // Nombre, teléfono y documento se corrigen SOLO en esta cotización: antes se cambiaban en el
    // cliente compartido y arrastraban a todas las demás cotizaciones con el mismo correo.
    await pool.query(
        `update quote set
            cliente_nombre = coalesce($1, cliente_nombre),
            cliente_telefono = coalesce($2, cliente_telefono),
            cliente_documento = coalesce($3, cliente_documento)
         where id = $4`,
        [
            limpiarTexto(body.clienteNombre).slice(0, LIMITES.nombre) || null,
            limpiarTexto(body.clienteTelefono).slice(0, LIMITES.telefono) || null,
            limpiarTexto(body.clienteDocumento).slice(0, LIMITES.documento) || null,
            fila.id
        ]
    );

    // El correo identifica al cliente: si cambia, esta cotización pasa al cliente con ese correo
    // (se crea si no existe) sin tocar a las demás cotizaciones del correo anterior.
    const nuevoCorreo = limpiarTexto(body.clienteCorreo).toLowerCase();
    if (nuevoCorreo && nuevoCorreo !== (fila.cliente_correo || '').toLowerCase()) {
        if (!esCorreoValido(nuevoCorreo)) {
            return res.status(400).json({ status: 'error', message: 'El correo no es válido' });
        }
        const { rows: cliente } = await pool.query<{ id: number }>(
            `insert into users (email, name, phone, documento) values ($1, $2, $3, $4)
             on conflict (email) do update set email = users.email
             returning id`,
            [nuevoCorreo, fila.cliente_nombre || nuevoCorreo.split('@')[0], fila.cliente_telefono, fila.cliente_documento]
        );
        await pool.query('update quote set client_id = $1 where id = $2', [cliente[0].id, fila.id]);
        if (fila.event_id) await pool.query('update events set client_id = $1 where id = $2', [cliente[0].id, fila.event_id]);
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
            transportation_id = case when $10 then $3 else transportation_id end,
            date = coalesce($4, date),
            venue_nombre_manual = case when $7 then $8 when $6 then null else venue_nombre_manual end,
            venue_direccion_manual = case when $7 then $9 when $6 then null else venue_direccion_manual end,
            updated_at = now()
         where id = $5`,
        [
            body.tipoEvento?.trim() || null,
            body.venueId || null,
            nuevoTransportationId,
            body.fechaEvento || null,
            fila.event_id ? fila.event_id : req.params.id,
            eligiendoVenueCatalogo,
            eligiendoVenueManual,
            body.venueNombreManual?.trim() || null,
            body.venueDireccionManual?.trim() || null,
            transportationIdProvisto
        ]
    );

    // El transporte no pasa por quote_items, así que a diferencia de los servicios
    // (que el trigger update_total_quote mantiene solo) hay que ajustar `quote.total`
    // a mano por la diferencia exacta cuando cambia (incluyendo el caso de quitarlo del todo).
    if (transportationIdProvisto && nuevoTransportationId !== fila.transportation_id) {
        const [precioNuevo, precioViejo] = await Promise.all([
            precioTransporte(nuevoTransportationId),
            precioTransporte(fila.transportation_id)
        ]);
        await pool.query('update quote set total = total + $1 where id = $2', [precioNuevo - precioViejo, fila.id]);
    }

    res.json(await cargarCotizacion(req.params.id));
}));

// Agrega un comentario interno al historial de la cotización.
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

// Historial de la cotización: comentarios, ediciones y cambios de estado, del más antiguo al más nuevo.
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

// Finaliza la cotización: exige fecha del evento y crea el evento correspondiente (a las 00:00 hasta que
// se defina la hora).
cotizacionesRouter.post('/:id/finalizar', requireRole('administrador'), asyncHandler(async (req, res) => {
    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!fila.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Define la fecha del evento antes de exportar la cotización final' });
    }
    if (fila.event_id) {
        return res.status(400).json({ status: 'error', message: 'Esta cotización ya fue finalizada' });
    }

    // Evento + estado + historial en UNA sola sentencia: es atómica (no puede quedar un evento
    // sin historial) y ahorra dos viajes a la base. Un doble clic ya no da un error 500: el
    // segundo intento choca con events.quote_id (único) y se responde que ya fue finalizada.
    try {
        await pool.query(
            `with evento as (
                 insert into events (quote_id, venue_id, transportation_id, event_type, address, date, hour, confirmed, initial_payment, client_id, total_paid, venue_nombre_manual, venue_direccion_manual)
                 values ($1, $2, $3, $4, null, $5, '00:00:00', false, false, $6, 0, $7, $8)
                 returning id
             ), estado as (
                 update quote set estado = 'finalizada', updated_at = now() where id = $1 returning id
             )
             insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, estado_antes, estado_despues)
             values ($1, $9, $10, 'cambio_estado', $11, 'finalizada')`,
            [fila.id, fila.venue_id, fila.transportation_id, fila.event_type, fila.fecha_evento, fila.client_id, fila.venue_nombre_manual, fila.venue_direccion_manual, req.usuario!.id, req.usuario!.nombre, fila.quote_estado]
        );
    } catch (error) {
        if ((error as { code?: string }).code === '23505') {
            return res.status(400).json({ status: 'error', message: 'Esta cotización ya fue finalizada' });
        }
        throw error;
    }

    res.json(await cargarCotizacion(req.params.id));
}));

// PDF de la cotización para descargar desde el panel.
cotizacionesRouter.get('/:id/pdf', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const [fila, itemsGuardados] = await Promise.all([obtenerFilaCotizacion(req.params.id), obtenerItems(req.params.id)]);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const estado = derivarEstado(fila);
    if (req.usuario!.rol === 'secretaria' && !ESTADOS_VISIBLES_SECRETARIA.includes(estado)) {
        return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta cotización' });
    }

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

// Deja el evento como definitivo (programado). Exige contrato enviado y contrato firmado subido.
cotizacionesRouter.post('/:id/marcar-definitivo', requireRole('administrador'), asyncHandler(async (req, res) => {
    const fila = await obtenerFilaCotizacion(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!fila.event_id || !fila.contrato_enviado_en) {
        return res.status(400).json({ status: 'error', message: 'Esta cotización todavía no tiene un contrato enviado al cliente' });
    }
    if (!fila.contrato_firmado_nombre) {
        return res.status(400).json({ status: 'error', message: 'Sube el contrato firmado antes de marcar el evento como definitivo' });
    }

    // Estado del evento + historial en una sola sentencia (atómica, un viaje a la base en vez de dos).
    // El historial solo se escribe si ESTA llamada fue la que lo dejó definitivo: con un doble clic
    // (o dos personas a la vez) no se duplica, y la segunda llamada simplemente devuelve el estado actual.
    await pool.query(
        `with confirmado as (
             update events set confirmed = true, updated_at = now() where id = $1 and confirmed = false returning id
         )
         insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, estado_antes, estado_despues)
         select $2::bigint, $3::uuid, $4::text, 'cambio_estado', 'contrato_enviado', 'programada' from confirmado`,
        [fila.event_id, fila.id, req.usuario!.id, req.usuario!.nombre]
    );

    res.json(await cargarCotizacion(req.params.id));
}));
