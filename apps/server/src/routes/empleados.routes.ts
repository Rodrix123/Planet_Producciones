// Nómina del personal operativo (/api/empleados): nombre, documento, salario, cuenta bancaria y
// tipo de contrato. Solo la administradora la ve.
// No confundir con las cuentas de acceso al sistema (ver cuentasAcceso.routes.ts).

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

// Tipos de contrato que maneja la empresa; la base solo acepta estos tres valores.
type TipoContrato = 'con_contrato' | 'freelance_fijo' | 'freelance_no_fijo';
const TIPOS_CONTRATO_VALIDOS: readonly string[] = ['con_contrato', 'freelance_fijo', 'freelance_no_fijo'];

// Fila de la tabla empleados tal como llega de la base (nombres en snake_case, salario como texto).
interface EmpleadoRow {
    id: string;
    nombre: string;
    documento: string | null;
    telefono: string | null;
    salario: string | null;
    numero_cuenta: string | null;
    banco: string | null;
    tipo_contrato: TipoContrato;
    activo: boolean;
}

// Convierte la fila de la base al formato que usa el frontend (camelCase y salario como número).
function mapEmpleado(row: EmpleadoRow) {
    return {
        id: row.id,
        nombre: row.nombre,
        documento: row.documento,
        telefono: row.telefono,
        salario: row.salario !== null ? Number(row.salario) : null,
        numeroCuenta: row.numero_cuenta,
        banco: row.banco,
        tipoContrato: row.tipo_contrato,
        activo: row.activo
    };
}

export const empleadosRouter = Router();

// Toda la nómina es solo para la administradora.
empleadosRouter.use(requireAuth, requireRole('administrador'));

// Lista solo los empleados activos (el borrado es lógico), en orden alfabético.
empleadosRouter.get('/', asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<EmpleadoRow>(
        'select * from empleados where activo = true order by nombre asc'
    );
    res.json(rows.map(mapEmpleado));
}));

// Largos máximos de lo que se escribe en el formulario (la base guarda texto sin límite: aquí se pone)
// y tope del salario (un error de dedo como 1500000000 no debe pasar como un valor válido).
const MAX = { nombre: 100, documento: 30, telefono: 30, numeroCuenta: 40, banco: 80 } as const;
const SALARIO_MAX = 1_000_000_000;

// El id de un empleado es un uuid: cualquier otra cosa es un empleado que no existe (antes: error 500 de la base).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
empleadosRouter.param('id', (_req, res, next, valor) => {
    if (UUID.test(String(valor))) return next();
    res.status(404).json({ status: 'error', message: 'Empleado no encontrado' });
});

type Campo = 'nombre' | 'documento' | 'telefono' | 'salario' | 'numeroCuenta' | 'banco' | 'tipoContrato';
// Lo que llega ya validado: solo aparecen los campos que vinieron en la petición (null = dejarlo vacío).
type Datos = Partial<Record<Campo, string | number | null>>;

/**
 * Valida lo que manda el panel. Con `creando` el nombre y el tipo de contrato son obligatorios; al editar,
 * solo se validan (y se cambian) los campos que vienen. Un texto vacío o un salario vacío dejan el campo sin valor.
 */
function normalizarEmpleado(cuerpo: unknown, creando: boolean): { ok: true; datos: Datos } | { ok: false; message: string } {
    const b = (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {}) as Record<string, unknown>;
    const datos: Datos = {};
    const error = (message: string) => ({ ok: false as const, message });

    if (b.nombre !== undefined || creando) {
        if (typeof b.nombre !== 'string' || !b.nombre.trim()) return error('El nombre es obligatorio');
        if (b.nombre.trim().length > MAX.nombre) return error(`El nombre es demasiado largo (máximo ${MAX.nombre} caracteres)`);
        datos.nombre = b.nombre.trim();
    }

    if (b.tipoContrato !== undefined || creando) {
        if (typeof b.tipoContrato !== 'string' || !TIPOS_CONTRATO_VALIDOS.includes(b.tipoContrato)) {
            return error(creando ? 'Indica el tipo de contrato del empleado' : 'Tipo de contrato inválido');
        }
        datos.tipoContrato = b.tipoContrato;
    }

    const textos: [Exclude<Campo, 'nombre' | 'salario' | 'tipoContrato'>, string, number][] = [
        ['documento', 'El documento', MAX.documento], ['telefono', 'El teléfono', MAX.telefono],
        ['numeroCuenta', 'El número de cuenta', MAX.numeroCuenta], ['banco', 'El banco', MAX.banco]
    ];
    for (const [campo, etiqueta, max] of textos) {
        const valor = b[campo];
        if (valor === undefined) continue;
        if (valor !== null && typeof valor !== 'string') return error(`${etiqueta} no es válido`);
        const limpio = (valor ?? '').trim();
        if (limpio.length > max) return error(`${etiqueta} es demasiado largo (máximo ${max} caracteres)`);
        datos[campo] = limpio || null;
    }

    if (b.salario !== undefined) {
        if (b.salario === null || b.salario === '') {
            datos.salario = null;
        } else {
            const n = typeof b.salario === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(b.salario.trim()) ? Number(b.salario.trim()) : b.salario;
            if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > SALARIO_MAX) return error('El salario no es válido');
            datos.salario = n;
        }
    }

    return { ok: true, datos };
}

// Crea un empleado. El nombre y el tipo de contrato son obligatorios.
empleadosRouter.post('/', asyncHandler(async (req, res) => {
    const r = normalizarEmpleado(req.body, true);
    if (!r.ok) return res.status(400).json({ status: 'error', message: r.message });
    const d = r.datos;

    const { rows } = await pool.query<EmpleadoRow>(
        `insert into empleados (nombre, documento, telefono, salario, numero_cuenta, banco, tipo_contrato)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [d.nombre, d.documento ?? null, d.telefono ?? null, d.salario ?? null, d.numeroCuenta ?? null, d.banco ?? null, d.tipoContrato]
    );

    res.status(201).json(mapEmpleado(rows[0]));
}));

// Edita campos sueltos: lo que no se envía queda como estaba; lo que se envía vacío se deja sin valor.
empleadosRouter.put('/:id', asyncHandler(async (req, res) => {
    const r = normalizarEmpleado(req.body, false);
    if (!r.ok) return res.status(400).json({ status: 'error', message: r.message });
    const d = r.datos;
    const viene = (c: Campo) => d[c] !== undefined;

    const { rows } = await pool.query<EmpleadoRow>(
        `update empleados set
            nombre = case when $1 then $2 else nombre end,
            documento = case when $3 then $4 else documento end,
            telefono = case when $5 then $6 else telefono end,
            salario = case when $7 then $8::numeric else salario end,
            numero_cuenta = case when $9 then $10 else numero_cuenta end,
            banco = case when $11 then $12 else banco end,
            tipo_contrato = case when $13 then $14 else tipo_contrato end,
            actualizado_en = now()
         where id = $15
         returning *`,
        [
            viene('nombre'), d.nombre ?? null, viene('documento'), d.documento ?? null, viene('telefono'), d.telefono ?? null,
            viene('salario'), d.salario ?? null, viene('numeroCuenta'), d.numeroCuenta ?? null, viene('banco'), d.banco ?? null,
            viene('tipoContrato'), d.tipoContrato ?? null, req.params.id
        ]
    );

    if (!rows[0]) return res.status(404).json({ status: 'error', message: 'Empleado no encontrado' });
    res.json(mapEmpleado(rows[0]));
}));

// Borrado lógico: el empleado queda inactivo y deja de aparecer en la lista, pero no se pierde
// su información.
empleadosRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'update empleados set activo = false, actualizado_en = now() where id = $1 and activo = true returning id',
        [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ status: 'error', message: 'Empleado no encontrado' });
    res.json({ status: 'ok' });
}));
