import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

interface EmpleadoRow {
    id: string;
    nombre: string;
    documento: string | null;
    telefono: string | null;
    salario: string | null;
    numero_cuenta: string | null;
    banco: string | null;
    tipo_contrato: 'con_contrato' | 'sin_contrato';
    activo: boolean;
}

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

empleadosRouter.use(requireAuth, requireRole('administrador'));

empleadosRouter.get('/', asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<EmpleadoRow>(
        'select * from empleados where activo = true order by nombre asc'
    );
    res.json(rows.map(mapEmpleado));
}));

empleadosRouter.post('/', asyncHandler(async (req, res) => {
    const body = req.body as {
        nombre?: string;
        documento?: string;
        telefono?: string;
        salario?: number;
        numeroCuenta?: string;
        banco?: string;
        tipoContrato?: string;
    };

    if (!body.nombre?.trim()) {
        return res.status(400).json({ status: 'error', message: 'El nombre es obligatorio' });
    }
    if (body.tipoContrato !== 'con_contrato' && body.tipoContrato !== 'sin_contrato') {
        return res.status(400).json({ status: 'error', message: 'Indica si el empleado tiene contrato o no' });
    }

    const { rows } = await pool.query<EmpleadoRow>(
        `insert into empleados (nombre, documento, telefono, salario, numero_cuenta, banco, tipo_contrato)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
            body.nombre.trim(),
            body.documento || null,
            body.telefono || null,
            body.salario ?? null,
            body.numeroCuenta || null,
            body.banco || null,
            body.tipoContrato
        ]
    );

    res.status(201).json(mapEmpleado(rows[0]));
}));

empleadosRouter.put('/:id', asyncHandler(async (req, res) => {
    const body = req.body as {
        nombre?: string;
        documento?: string;
        telefono?: string;
        salario?: number;
        numeroCuenta?: string;
        banco?: string;
        tipoContrato?: string;
    };

    if (body.tipoContrato && body.tipoContrato !== 'con_contrato' && body.tipoContrato !== 'sin_contrato') {
        return res.status(400).json({ status: 'error', message: 'Tipo de contrato inválido' });
    }

    const { rows } = await pool.query<EmpleadoRow>(
        `update empleados set
            nombre = coalesce($1, nombre),
            documento = coalesce($2, documento),
            telefono = coalesce($3, telefono),
            salario = coalesce($4, salario),
            numero_cuenta = coalesce($5, numero_cuenta),
            banco = coalesce($6, banco),
            tipo_contrato = coalesce($7, tipo_contrato),
            actualizado_en = now()
         where id = $8
         returning *`,
        [
            body.nombre?.trim() || null,
            body.documento ?? null,
            body.telefono ?? null,
            body.salario ?? null,
            body.numeroCuenta ?? null,
            body.banco ?? null,
            body.tipoContrato || null,
            req.params.id
        ]
    );

    if (!rows[0]) return res.status(404).json({ status: 'error', message: 'Empleado no encontrado' });
    res.json(mapEmpleado(rows[0]));
}));

empleadosRouter.delete('/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('update empleados set activo = false, actualizado_en = now() where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'Empleado no encontrado' });
    res.json({ status: 'ok' });
}));
