// Demostración local de "Solicitar disponibilidad de personal" (Numeral 4) con datos de prueba.
//
// Levanta el backend REAL de convocatorias (mismos routers y misma autenticación por cookie que la
// aplicación) sobre un Postgres embebido (PGlite) con el esquema de Supabase y la migración 0010, y
// sirve la web compilada. No usa Supabase, ni internet para los datos, ni WhatsApp: todo es ficticio
// y desaparece al cerrar el proceso.
//
// Ejecutar (desde la raíz del repositorio):
//     npm run demo:disponibilidad --workspace apps/server
// y abrir  http://localhost:3100/demo/entrar  (entra como la administradora de la demostración).
//
// Opciones:  --puerto=3100   --sin-compilar (no recompila la web; usa apps/web/dist tal cual)
//
// IMPORTANTE: como todavía no existe la integración con WhatsApp (Numerales 5 al 9), los estados
// "Enviado", "Confirmado" o "Rechazado" de las convocatorias de ejemplo están SEMBRADOS directamente
// en la base para poder ver cómo se muestran. Lo que se haga desde la pantalla (crear, enviar) sí
// pasa por los endpoints reales, y el envío queda "iniciado" sin mensajes confirmados.

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import cookieParser from 'cookie-parser';
import express from 'express';
import { asyncHandler } from '../src/asyncHandler';
import type { Consulta } from '../src/convocatorias/consulta';

const RAIZ_REPO = path.resolve(__dirname, '..', '..', '..');
const DIST_WEB = path.join(RAIZ_REPO, 'apps', 'web', 'dist');
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

const argumento = (nombre: string): string | undefined =>
    process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const puerto = Number(argumento('puerto') ?? process.env.PORT ?? 3100);

// auth.ts exige JWT_SECRET al cargarse; en la demostración es uno aleatorio por ejecución
process.env.JWT_SECRET = randomBytes(32).toString('hex');

// ---------------------------------------------------------------------------------------------
// Base de datos con datos de prueba
// ---------------------------------------------------------------------------------------------

async function crearBaseDeDemostracion(): Promise<PGlite> {
    const bd = await PGlite.create();
    await bd.exec(fs.readFileSync(path.join(__dirname, 'fixtures', 'esquema_base.sql'), 'utf8'));
    await bd.exec(fs.readFileSync(path.join(RAIZ_REPO, 'supabase', 'migrations', '0010_disponibilidad_personal_whatsapp.sql'), 'utf8'));

    const id = async (sql: string, params: unknown[] = []): Promise<number> =>
        Number((await bd.query<{ id: number | string }>(sql, params)).rows[0]?.id);

    // Roles y la administradora de la demostración
    const roles: Record<string, number> = {};
    for (const nombre of ['administrador', 'secretaria', 'jefe_logistica', 'trabajador']) {
        roles[nombre] = await id('insert into public.role (name) values ($1) returning id', [nombre]);
    }
    await bd.query('insert into auth.users (id) values ($1)', [ADMIN_ID]);
    await bd.query(
        "insert into public.profiles (id, role_id, nombre, correo, debe_cambiar_password) values ($1, $2, 'Administradora Demo', 'admin.demo@example.com', false)",
        [ADMIN_ID, roles['administrador']]
    );

    // Trabajadores (cuentas con rol "trabajador"; el teléfono de Auth se guarda solo con dígitos)
    const trabajadores: Record<string, string> = {};
    const nuevoTrabajador = async (nombre: string, telefono: string | null): Promise<void> => {
        const cuenta = (await bd.query<{ id: string }>('insert into auth.users (id, phone) values (gen_random_uuid(), $1) returning id', [telefono])).rows[0];
        if (!cuenta) throw new Error('No se pudo crear la cuenta de demostración');
        await bd.query('insert into public.profiles (id, role_id, nombre, correo, debe_cambiar_password) values ($1, $2, $3, $4, false)', [
            cuenta.id,
            roles['trabajador'],
            nombre,
            `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.')}@example.com`
        ]);
        trabajadores[nombre] = cuenta.id;
    };
    await nuevoTrabajador('Laura Gómez', '573000000001');
    await nuevoTrabajador('Pedro Ramírez', '573000000002');
    await nuevoTrabajador('Diana Torres', '573000000003');
    await nuevoTrabajador('Carlos Mejía', '573000000004');
    await nuevoTrabajador('Sofía Vargas', '573000000005');
    await nuevoTrabajador('Andrés Castaño', '573000000006');
    await nuevoTrabajador('Camila Ruiz', '573000000011');
    await nuevoTrabajador('Tomás Herrera', '573000000012');
    await nuevoTrabajador('Valentina Cruz', '573000000009'); // marcará no disponible el día de la boda
    await nuevoTrabajador('Esteban Lara', '573000000010'); // asignado a mano a la boda
    await nuevoTrabajador('Marta Ríos', null); // sin celular
    await nuevoTrabajador('Julián Ortiz', '6012345678'); // fijo: no sirve para WhatsApp

    // Eventos: cotización + evento confirmado (como los lista "Eventos programados")
    const hoy = (await bd.query<{ d: string }>("select (now() at time zone 'America/Bogota')::date::text as d")).rows[0]?.d ?? '';
    const fechaEn = async (dias: number): Promise<string> =>
        (await bd.query<{ d: string }>("select ($1::date + $2::int)::text as d", [hoy, dias])).rows[0]?.d ?? '';

    const sede = async (nombre: string, ciudad: string): Promise<number> =>
        id('insert into public.venue (name, city) values ($1, $2) returning id', [nombre, ciudad]);
    const cliente = async (nombre: string, correo: string): Promise<number> =>
        id('insert into public.users (name, email, phone, documento) values ($1, $2, $3, $4) returning id', [nombre, correo, '3000000000', '1000000000']);

    interface Evento {
        tipo: string | null;
        dias: number | null;
        hora: string;
        sede: number | null;
        cliente: number;
        total: number;
    }
    const crearEvento = async (e: Evento): Promise<{ cotizacionId: number; eventoId: number }> => {
        const cotizacionId = await id(
            `insert into public.quote (estado, event_type, venue_id, date, hour, client_id, total)
             values ('finalizada', $1, $2, $3::date, $4::time, $5, $6) returning id`,
            [e.tipo, e.sede, e.dias === null ? null : await fechaEn(e.dias), e.hora, e.cliente, e.total]
        );
        const eventoId = await id('insert into public.events (quote_id, confirmed) values ($1, true) returning id', [cotizacionId]);
        return { cotizacionId, eventoId };
    };

    const robles = await sede('Hacienda Los Robles', 'Chía');
    const agora = await sede('Centro de Convenciones Ágora', 'Bogotá');
    const termales = await sede('Hotel Termales', 'Manizales');
    const ana = await cliente('Ana Martínez', 'ana.demo@example.com');
    const andes = await cliente('Corporación Andes', 'andes.demo@example.com');
    const camila = await cliente('Familia Ruiz', 'ruiz.demo@example.com');
    const salome = await cliente('Familia Londoño', 'londono.demo@example.com');
    const fundacion = await cliente('Fundación Horizonte', 'horizonte.demo@example.com');
    const nuevo = await cliente('Cliente Sin Datos', 'sindatos.demo@example.com');

    const boda = await crearEvento({ tipo: 'Boda', dias: 20, hora: '18:00', sede: robles, cliente: ana, total: 9800000 });
    const corporativo = await crearEvento({ tipo: 'Evento corporativo', dias: 6, hora: '09:00', sede: agora, cliente: andes, total: 14500000 });
    const pasado = await crearEvento({ tipo: 'Cumpleaños', dias: -1, hora: '20:00', sede: termales, cliente: camila, total: 3200000 });
    await crearEvento({ tipo: 'Quinceañera', dias: 0, hora: '21:00', sede: termales, cliente: salome, total: 6100000 });
    await crearEvento({ tipo: 'Gala benéfica', dias: null, hora: '19:00', sede: agora, cliente: fundacion, total: 8700000 });
    await crearEvento({ tipo: null, dias: 30, hora: '00:00', sede: null, cliente: nuevo, total: 2500000 });

    // Una asignación manual (sin convocatoria) y un día no disponible, para ver esos avisos en la boda
    await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [boda.eventoId, trabajadores['Esteban Lara']]);
    await bd.query('insert into public.unavailability_users (id_user, date) values ($1, $2::date)', [trabajadores['Valentina Cruz'], await fechaEn(20)]);

    // Convocatorias SEMBRADAS (no pasaron por WhatsApp): ver el aviso de arriba
    let secuencia = 0;
    interface Sembrado {
        nombre: string;
        respuesta?: 'CONFIRMADO' | 'RECHAZADO';
        envio?: 'ENVIADO' | 'ERROR' | 'PENDIENTE';
        error?: string;
    }
    const sembrar = async (
        evento: { eventoId: number },
        estado: 'BORRADOR' | 'ENVIANDO' | 'ENVIADA',
        horaInicio: string,
        horaFin: string,
        destinatarios: Sembrado[]
    ): Promise<void> => {
        const convocatoriaId = (
            await bd.query<{ id: string }>(
                `insert into public.convocatorias (event_id, hora_inicio, hora_fin, estado, envio_iniciado_en)
                 values ($1, $2::time, $3::time, $4, case when $4 = 'BORRADOR' then null else now() - interval '2 hours' end) returning id`,
                [evento.eventoId, horaInicio, horaFin, estado]
            )
        ).rows[0]?.id;
        for (const d of destinatarios) {
            secuencia += 1;
            const envio = d.envio ?? 'PENDIENTE';
            await bd.query(
                `insert into public.event_staff
                     (event_id, profile_id, convocatoria_id, estado_respuesta, respondido_en, estado_envio, wa_message_id, enviado_en, error_envio)
                 values ($1, $2, $3, $4, case when $4 = 'PENDIENTE' then null else now() - interval '1 hour' end,
                         $5, $6, case when $5 = 'ENVIADO' then now() - interval '100 minutes' else null end, $7)`,
                [
                    evento.eventoId,
                    trabajadores[d.nombre],
                    convocatoriaId,
                    d.respuesta ?? 'PENDIENTE',
                    envio,
                    envio === 'ENVIADO' ? `wamid.DEMO-${secuencia}` : null,
                    envio === 'ERROR' ? (d.error ?? 'Error de demostración') : null
                ]
            );
        }
    };

    await sembrar(corporativo, 'ENVIANDO', '09:00', '17:00', [
        { nombre: 'Laura Gómez', respuesta: 'CONFIRMADO', envio: 'ENVIADO' },
        { nombre: 'Pedro Ramírez', respuesta: 'RECHAZADO', envio: 'ENVIADO' },
        { nombre: 'Diana Torres', envio: 'ENVIADO' },
        { nombre: 'Sofía Vargas', respuesta: 'CONFIRMADO', envio: 'ENVIADO' },
        { nombre: 'Carlos Mejía', envio: 'ERROR', error: 'El número no tiene WhatsApp' },
        { nombre: 'Andrés Castaño', envio: 'PENDIENTE' }
    ]);
    await sembrar(corporativo, 'BORRADOR', '09:00', '13:00', [{ nombre: 'Camila Ruiz' }, { nombre: 'Tomás Herrera' }]);
    await sembrar(pasado, 'ENVIADA', '20:00', '23:30', [
        { nombre: 'Laura Gómez', respuesta: 'CONFIRMADO', envio: 'ENVIADO' },
        { nombre: 'Diana Torres', respuesta: 'CONFIRMADO', envio: 'ENVIADO' },
        { nombre: 'Tomás Herrera', respuesta: 'RECHAZADO', envio: 'ENVIADO' }
    ]);

    return bd;
}

// ---------------------------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
    if (!process.argv.includes('--sin-compilar')) {
        console.log('Compilando la web (apps/web)...');
        execSync('npm run build --workspace apps/web', { cwd: RAIZ_REPO, stdio: 'inherit' });
    }
    if (!fs.existsSync(path.join(DIST_WEB, 'eventos-programados.html'))) {
        throw new Error('Falta apps/web/dist. Compila la web: npm run build --workspace apps/web');
    }

    const bd = await crearBaseDeDemostracion();
    const consulta: Consulta = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const resultado = await bd.query(sql, params);
            return { rows: resultado.rows as T[] };
        }
    };

    // Importados después de definir JWT_SECRET (auth.ts lo exige al cargarse)
    const auth = await import('../src/auth.js');
    const { crearConvocatoriasRouter } = await import('../src/convocatorias/rutas.js');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Sesión de la demostración: una cookie firmada con el mismo mecanismo que usa la aplicación
    app.get('/demo/entrar', (_req, res) => {
        const token = auth.signSessionToken({
            id: ADMIN_ID,
            rol: 'administrador',
            nombre: 'Administradora Demo',
            correo: 'admin.demo@example.com',
            debeCambiarPassword: false
        });
        res.cookie(auth.COOKIE_NAME, token, auth.cookieOptions());
        res.redirect('/eventos-programados.html');
    });
    app.get('/login.html', (_req, res) => res.redirect('/demo/entrar'));
    app.get('/api/auth/me', auth.requireAuth, (req, res) => {
        const u = req.usuario!;
        res.json({ nombre: u.nombre, correo: u.correo, rol: u.rol, debeCambiarPassword: u.debeCambiarPassword });
    });
    app.post('/api/auth/logout', (_req, res) => {
        res.clearCookie(auth.COOKIE_NAME, auth.cookieOptions());
        res.json({ status: 'ok' });
    });
    app.get('/api/panel/contadores', auth.requireAuth, (_req, res) => res.json({}));

    // Lo mínimo de "Eventos programados" para que la pantalla liste los eventos de ejemplo
    app.get('/api/cotizaciones', auth.requireAuth, asyncHandler(async (_req, res) => {
        const { rows } = await consulta.query<Record<string, string | number | null>>(
            `select q.id, q.total, q.created_at, q.event_type, q.date::text as fecha_evento,
                    coalesce(v.name, q.venue_nombre_manual) as lugar,
                    u.name as cliente_nombre, u.email as cliente_correo, u.phone as cliente_telefono
               from public.quote q
               join public.events e on e.quote_id = q.id
               left join public.users u on u.id = q.client_id
               left join public.venue v on v.id = q.venue_id
              where e.confirmed
              order by q.date nulls last, q.id`
        );
        res.json(
            rows.map((f) => ({
                id: Number(f.id),
                numeroReferencia: `PL-${new Date(String(f.created_at)).getFullYear()}-${String(f.id).padStart(4, '0')}`,
                clienteNombre: f.cliente_nombre,
                clienteCorreo: f.cliente_correo,
                clienteTelefono: f.cliente_telefono,
                tipoEvento: f.event_type,
                lugar: f.lugar,
                fechaEvento: f.fecha_evento,
                total: Number(f.total),
                estado: 'programada',
                items: [
                    { variantId: 1, cantidad: 1, tag: 'Sonido', nombre: 'Sonido profesional', descripcion: 'Consola, parlantes y micrófonos (demostración)', precioUnit: Number(f.total) * 0.6, nota: null },
                    { variantId: 2, cantidad: 2, tag: 'Iluminación', nombre: 'Kit de iluminación', descripcion: 'Luces de ambiente (demostración)', precioUnit: Number(f.total) * 0.2, nota: null }
                ]
            }))
        );
    }));
    for (const ruta of ['/api/cotizaciones/:id/pdf', '/api/contratos/:id/firmado']) {
        app.get(ruta, (_req, res) => res.status(404).json({ status: 'error', message: 'No disponible en la demostración' }));
    }

    // Los endpoints reales de la funcionalidad
    app.use('/api/convocatorias', crearConvocatoriasRouter(consulta));

    app.use(express.static(DIST_WEB));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Error inesperado en la demostración' });
    });

    app.listen(puerto, '127.0.0.1', () => {
        console.log(`\nDemostración lista:  http://localhost:${puerto}/demo/entrar`);
        console.log('Datos ficticios en memoria; se pierden al cerrar (Ctrl+C). No usa Supabase ni envía WhatsApp.');
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
