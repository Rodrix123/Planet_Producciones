import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { transporter } from '../mailer';
import { generarCotizacionPdfBuffer, type ItemCotizacionPdf } from '../pdf/cotizacionPdf';

interface ItemSeleccionado {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
    nota?: string;
}

interface CotizacionRow {
    id: string;
    numero_referencia: string;
    cliente_nombre: string;
    cliente_correo: string;
    cliente_telefono: string;
    cliente_documento: string | null;
    tipo_evento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fecha_evento: string | null;
    items: ItemSeleccionado[];
    total: string;
    estado: string;
    creada_en: string;
    actualizada_en: string;
    finalizada_en: string | null;
    programada_en: string | null;
}

function mapCotizacion(row: CotizacionRow) {
    return {
        id: row.id,
        numeroReferencia: row.numero_referencia,
        clienteNombre: row.cliente_nombre,
        clienteCorreo: row.cliente_correo,
        clienteTelefono: row.cliente_telefono,
        clienteDocumento: row.cliente_documento,
        tipoEvento: row.tipo_evento,
        ciudad: row.ciudad,
        lugar: row.lugar,
        fechaEvento: row.fecha_evento,
        items: row.items,
        total: Number(row.total),
        estado: row.estado,
        creadaEn: row.creada_en,
        actualizadaEn: row.actualizada_en,
        finalizadaEn: row.finalizada_en,
        programadaEn: row.programada_en
    };
}

function validarItems(items: unknown): items is ItemSeleccionado[] {
    if (!Array.isArray(items)) return false;
    return items.every((item): item is ItemSeleccionado => {
        if (!item || typeof item !== 'object') return false;
        const it = item as Record<string, unknown>;
        return typeof it.tag === 'string' && typeof it.nombre === 'string' && typeof it.precio === 'number';
    });
}

function sumarTotal(items: ItemSeleccionado[]): number {
    return items.reduce((acc, item) => acc + (Number(item.precio) || 0), 0);
}

// La secretaria solo puede ver cotizaciones que ya pasaron por "finalizada" en adelante;
// nunca las que Maritza todavía está revisando.
const ESTADOS_VISIBLES_SECRETARIA = ['finalizada', 'contrato_enviado', 'programada'];

export const cotizacionesRouter = Router();

// Público: lo usa el cotizador para guardar la cotización real.
cotizacionesRouter.post('/', asyncHandler(async (req, res) => {
    const body = req.body as {
        cliente?: {
            nombre?: string;
            correo?: string;
            telefono?: string;
            tipoEvento?: string;
            ciudad?: string;
            lugar?: string;
            fechaEvento?: string;
        };
        items?: unknown;
        total?: number;
    };

    const cliente = body.cliente;
    if (!cliente?.nombre || !cliente?.correo || !cliente?.telefono) {
        return res.status(400).json({ status: 'error', message: 'Faltan los datos de contacto del cliente' });
    }
    if (!validarItems(body.items) || body.items.length === 0) {
        return res.status(400).json({ status: 'error', message: 'La cotización no tiene servicios seleccionados' });
    }

    const items = body.items;
    const total = sumarTotal(items);

    const { rows: seqRows } = await pool.query<{ n: string }>("select nextval('cotizaciones_numero_seq') as n");
    const numeroReferencia = `PL-${new Date().getFullYear()}-${String(seqRows[0].n).padStart(4, '0')}`;

    const { rows } = await pool.query<CotizacionRow>(
        `insert into cotizaciones
            (numero_referencia, cliente_nombre, cliente_correo, cliente_telefono,
             tipo_evento, ciudad, lugar, fecha_evento, items, total)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
            numeroReferencia,
            cliente.nombre,
            cliente.correo,
            cliente.telefono,
            cliente.tipoEvento || null,
            cliente.ciudad || null,
            cliente.lugar || null,
            cliente.fechaEvento || null,
            JSON.stringify(items),
            total
        ]
    );

    // Aviso a Maritza (best-effort, no bloquea la respuesta al cliente)
    if (process.env.EMAIL_JEFE) {
        transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_JEFE,
            subject: `Nueva cotización recibida: ${cliente.nombre} (${numeroReferencia})`,
            text: `Se recibió una nueva cotización para revisar en el panel.\n\nCliente: ${cliente.nombre}\nReferencia: ${numeroReferencia}\nTotal estimado: $ ${total.toLocaleString('es-CO')} COP\n\nIngresa a tu panel para revisarla.`
        }).catch((err: Error) => console.error('Error enviando aviso de nueva cotización:', err.message));
    }

    res.status(201).json({ status: 'ok', numeroReferencia, id: rows[0].id });
}));

cotizacionesRouter.use(requireAuth);

cotizacionesRouter.get('/', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const estadoParam = req.query.estado as string | undefined;
    let estados = estadoParam ? estadoParam.split(',').map((e) => e.trim()) : null;

    if (req.usuario!.rol === 'secretaria') {
        estados = estados ? estados.filter((e) => ESTADOS_VISIBLES_SECRETARIA.includes(e)) : ESTADOS_VISIBLES_SECRETARIA;
    }

    const { rows } = estados
        ? await pool.query<CotizacionRow>(
              'select * from cotizaciones where estado = any($1) order by creada_en desc',
              [estados]
          )
        : await pool.query<CotizacionRow>('select * from cotizaciones order by creada_en desc');

    res.json(rows.map(mapCotizacion));
}));

cotizacionesRouter.get('/:id', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query<CotizacionRow>('select * from cotizaciones where id = $1', [req.params.id]);
    const cotizacion = rows[0];
    if (!cotizacion) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (req.usuario!.rol === 'secretaria' && !ESTADOS_VISIBLES_SECRETARIA.includes(cotizacion.estado)) {
        return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta cotización' });
    }
    res.json(mapCotizacion(cotizacion));
}));

cotizacionesRouter.put('/:id/items', requireRole('administradora'), asyncHandler(async (req, res) => {
    const { items } = req.body as { items?: unknown };
    if (!validarItems(items)) {
        return res.status(400).json({ status: 'error', message: 'La lista de servicios no es válida' });
    }

    const { rows } = await pool.query<CotizacionRow>('select * from cotizaciones where id = $1', [req.params.id]);
    const actual = rows[0];
    if (!actual) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    const total = sumarTotal(items);
    const nuevoEstado = actual.estado === 'recibida' ? 'en_revision' : actual.estado;

    const { rows: actualizadas } = await pool.query<CotizacionRow>(
        `update cotizaciones
            set items = $1, total = $2, estado = $3, actualizada_en = now()
            where id = $4
            returning *`,
        [JSON.stringify(items), total, nuevoEstado, req.params.id]
    );

    await pool.query(
        `insert into cotizacion_historial (cotizacion_id, usuario_id, tipo, items_antes, items_despues, estado_antes, estado_despues)
         values ($1, $2, 'edicion', $3, $4, $5, $6)`,
        [req.params.id, req.usuario!.id, JSON.stringify(actual.items), JSON.stringify(items), actual.estado, nuevoEstado]
    );

    res.json(mapCotizacion(actualizadas[0]));
}));

cotizacionesRouter.put('/:id/datos', requireRole('administradora'), asyncHandler(async (req, res) => {
    const body = req.body as {
        clienteNombre?: string;
        clienteCorreo?: string;
        clienteTelefono?: string;
        clienteDocumento?: string;
        tipoEvento?: string;
        ciudad?: string;
        lugar?: string;
        fechaEvento?: string;
    };

    const { rows } = await pool.query<CotizacionRow>(
        `update cotizaciones set
            cliente_nombre = coalesce($1, cliente_nombre),
            cliente_correo = coalesce($2, cliente_correo),
            cliente_telefono = coalesce($3, cliente_telefono),
            cliente_documento = coalesce($4, cliente_documento),
            tipo_evento = coalesce($5, tipo_evento),
            ciudad = coalesce($6, ciudad),
            lugar = coalesce($7, lugar),
            fecha_evento = coalesce($8, fecha_evento),
            actualizada_en = now()
         where id = $9
         returning *`,
        [
            body.clienteNombre || null,
            body.clienteCorreo || null,
            body.clienteTelefono || null,
            body.clienteDocumento || null,
            body.tipoEvento || null,
            body.ciudad || null,
            body.lugar || null,
            body.fechaEvento || null,
            req.params.id
        ]
    );

    if (!rows[0]) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    res.json(mapCotizacion(rows[0]));
}));

cotizacionesRouter.post('/:id/comentarios', requireRole('administradora'), asyncHandler(async (req, res) => {
    const { comentario } = req.body as { comentario?: string };
    if (!comentario?.trim()) {
        return res.status(400).json({ status: 'error', message: 'El comentario no puede estar vacío' });
    }

    await pool.query(
        `insert into cotizacion_historial (cotizacion_id, usuario_id, tipo, comentario)
         values ($1, $2, 'comentario', $3)`,
        [req.params.id, req.usuario!.id, comentario.trim()]
    );

    res.status(201).json({ status: 'ok' });
}));

cotizacionesRouter.get('/:id/historial', requireRole('administradora'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `select h.*, u.nombre as usuario_nombre
         from cotizacion_historial h
         left join usuarios u on u.id = h.usuario_id
         where h.cotizacion_id = $1
         order by h.creado_en asc`,
        [req.params.id]
    );

    res.json(rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        comentario: r.comentario,
        estadoAntes: r.estado_antes,
        estadoDespues: r.estado_despues,
        usuarioNombre: r.usuario_nombre,
        creadoEn: r.creado_en
    })));
}));

cotizacionesRouter.post('/:id/finalizar', requireRole('administradora'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query<CotizacionRow>('select * from cotizaciones where id = $1', [req.params.id]);
    const actual = rows[0];
    if (!actual) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!actual.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Define la fecha del evento antes de exportar la cotización final' });
    }
    if (actual.estado === 'finalizada' || actual.estado === 'contrato_enviado' || actual.estado === 'programada') {
        return res.status(400).json({ status: 'error', message: 'Esta cotización ya fue finalizada' });
    }

    const { rows: actualizadas } = await pool.query<CotizacionRow>(
        `update cotizaciones
            set estado = 'finalizada', finalizada_en = now(), finalizada_por = $1, actualizada_en = now()
            where id = $2
            returning *`,
        [req.usuario!.id, req.params.id]
    );

    await pool.query(
        `insert into cotizacion_historial (cotizacion_id, usuario_id, tipo, estado_antes, estado_despues)
         values ($1, $2, 'cambio_estado', $3, 'finalizada')`,
        [req.params.id, req.usuario!.id, actual.estado]
    );

    res.json(mapCotizacion(actualizadas[0]));
}));

cotizacionesRouter.get('/:id/pdf', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query<CotizacionRow>('select * from cotizaciones where id = $1', [req.params.id]);
    const cotizacion = rows[0];
    if (!cotizacion) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (req.usuario!.rol === 'secretaria' && !ESTADOS_VISIBLES_SECRETARIA.includes(cotizacion.estado)) {
        return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta cotización' });
    }

    const items: ItemCotizacionPdf[] = cotizacion.items;
    const buffer = await generarCotizacionPdfBuffer({
        numeroReferencia: cotizacion.numero_referencia,
        clienteNombre: cotizacion.cliente_nombre,
        clienteCorreo: cotizacion.cliente_correo,
        clienteTelefono: cotizacion.cliente_telefono,
        tipoEvento: cotizacion.tipo_evento,
        ciudad: cotizacion.ciudad,
        lugar: cotizacion.lugar,
        fechaEvento: cotizacion.fecha_evento,
        items,
        total: Number(cotizacion.total)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Cotizacion_${cotizacion.numero_referencia}.pdf`);
    res.send(buffer);
}));

cotizacionesRouter.post('/:id/marcar-definitivo', requireRole('administradora'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query<CotizacionRow>('select * from cotizaciones where id = $1', [req.params.id]);
    const actual = rows[0];
    if (!actual) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (actual.estado !== 'contrato_enviado') {
        return res.status(400).json({ status: 'error', message: 'Esta cotización todavía no tiene un contrato enviado al cliente' });
    }

    const { rows: contratoRows } = await pool.query(
        'select pdf_firmado_nombre from contratos where cotizacion_id = $1',
        [req.params.id]
    );
    if (!contratoRows[0]?.pdf_firmado_nombre) {
        return res.status(400).json({ status: 'error', message: 'Sube el contrato firmado antes de marcar el evento como definitivo' });
    }

    const { rows: actualizadas } = await pool.query<CotizacionRow>(
        `update cotizaciones
            set estado = 'programada', programada_en = now(), actualizada_en = now()
            where id = $1
            returning *`,
        [req.params.id]
    );

    await pool.query(
        `insert into cotizacion_historial (cotizacion_id, usuario_id, tipo, estado_antes, estado_despues)
         values ($1, $2, 'cambio_estado', 'contrato_enviado', 'programada')`,
        [req.params.id, req.usuario!.id]
    );

    res.json(mapCotizacion(actualizadas[0]));
}));
