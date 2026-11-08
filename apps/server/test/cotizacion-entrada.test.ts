// Pruebas unitarias y de frontera de la validación de entrada de las cotizaciones
// (src/cotizacionEntrada.ts). Lógica pura: no necesita base de datos.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    aIdentificador,
    esCorreoValido,
    esFechaValida,
    limpiarTexto,
    LIMITES,
    normalizarCotizacion,
    normalizarItems
} from '../src/cotizacionEntrada';

const base = () => ({
    cliente: { nombre: 'Ana Pérez', correo: 'ana@correo.com', telefono: '3001234567' },
    items: [{ variantId: 1, cantidad: 1 }]
});

const error = (body: unknown): string => {
    const r = normalizarCotizacion(body);
    assert.equal(r.ok, false, 'se esperaba que fuera rechazada');
    return r.ok ? '' : r.message;
};

const ok = (body: unknown) => {
    const r = normalizarCotizacion(body);
    assert.equal(r.ok, true, r.ok ? '' : `se esperaba válida y fue rechazada: ${r.message}`);
    if (!r.ok) throw new Error('inalcanzable');
    return r.datos;
};

describe('limpiarTexto', () => {
    it('recorta y junta espacios repetidos', () => {
        assert.equal(limpiarTexto('  Ana    Pérez  '), 'Ana Pérez');
    });
    it('convierte saltos de línea y tabulaciones en un espacio', () => {
        assert.equal(limpiarTexto('Ana\n\tPérez'), 'Ana Pérez');
    });
    it('devuelve vacío para lo que no es texto', () => {
        for (const v of [undefined, null, 0, 12, {}, [], true]) assert.equal(limpiarTexto(v), '');
    });
    it('conserva tildes, eñes y emojis', () => {
        assert.equal(limpiarTexto(' María José Ñandú 🎉 '), 'María José Ñandú 🎉');
    });
});

describe('esCorreoValido', () => {
    it('acepta correos normales', () => {
        for (const c of ['a@b.co', 'ana.perez+eventos@correo.com.co', 'x_y@sub.dominio.org']) assert.equal(esCorreoValido(c), true, c);
    });
    it('rechaza lo que no tiene forma de correo', () => {
        for (const c of ['', 'ana', 'ana@', '@correo.com', 'ana@correo', 'ana @correo.com', 'ana@correo .com', 'a@@b.co']) {
            assert.equal(esCorreoValido(c), false, JSON.stringify(c));
        }
    });
    it('frontera de largo: 150 caracteres sí, 151 no', () => {
        const local = 'a'.repeat(150 - '@b.co'.length);
        assert.equal(esCorreoValido(`${local}@b.co`), true);
        assert.equal(esCorreoValido(`${local}a@b.co`), false);
    });
});

describe('esFechaValida', () => {
    it('acepta fechas reales, incluido el 29 de febrero bisiesto', () => {
        for (const f of ['2026-11-18', '2028-02-29', '2026-12-31', '2026-01-01']) assert.equal(esFechaValida(f), true, f);
    });
    it('rechaza fechas imposibles aunque tengan el formato', () => {
        for (const f of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2026-11-00', '2026-11-32']) {
            assert.equal(esFechaValida(f), false, f);
        }
    });
    it('rechaza formatos distintos de AAAA-MM-DD', () => {
        for (const f of ['18/11/2026', '2026-1-1', '26-11-18', '2026-11-18T00:00:00Z', 'mañana', '']) assert.equal(esFechaValida(f), false, f);
    });
});

describe('normalizarItems', () => {
    it('sin lista equivale a lista vacía', () => {
        assert.deepEqual(normalizarItems(undefined), []);
        assert.deepEqual(normalizarItems(null), []);
        assert.deepEqual(normalizarItems([]), []);
    });
    it('rechaza lo que no es una lista', () => {
        for (const v of ['x', 5, {}, true]) assert.equal(normalizarItems(v), null);
    });
    it('frontera de cantidad: 1 y 100000 sí; 0, negativos y 100001 no', () => {
        assert.ok(normalizarItems([{ variantId: 1, cantidad: 1 }]));
        assert.ok(normalizarItems([{ variantId: 1, cantidad: LIMITES.cantidad }]));
        for (const c of [0, -1, LIMITES.cantidad + 1]) assert.equal(normalizarItems([{ variantId: 1, cantidad: c }]), null, String(c));
    });
    it('rechaza cantidades no enteras o que no son números', () => {
        for (const c of [1.5, NaN, Infinity, '3', null, undefined, {}]) {
            assert.equal(normalizarItems([{ variantId: 1, cantidad: c }]), null, String(c));
        }
    });
    it('rechaza variantes inválidas', () => {
        for (const v of [0, -4, 1.2, NaN, 'abc', '1.5', '-3', '', '7 8', null, undefined, {}]) {
            assert.equal(normalizarItems([{ variantId: v, cantidad: 1 }]), null, String(v));
        }
    });
    it('acepta la variante como número escrito como texto (así la entrega el catálogo real)', () => {
        assert.deepEqual(normalizarItems([{ variantId: '7', cantidad: 2 }]), [{ variantId: 7, cantidad: 2, nota: undefined }]);
        assert.deepEqual(normalizarItems([{ variantId: ' 12 ', cantidad: 1 }]), [{ variantId: 12, cantidad: 1, nota: undefined }]);
    });
    it('la misma variante como 7 y "7" cuenta como repetida', () => {
        assert.equal(normalizarItems([{ variantId: 7, cantidad: 1 }, { variantId: '7', cantidad: 1 }]), null);
    });
    it('rechaza el mismo servicio repetido (la tabla no lo admite)', () => {
        assert.equal(normalizarItems([{ variantId: 4, cantidad: 1 }, { variantId: 4, cantidad: 2 }]), null);
    });
    it('rechaza elementos que no son objetos', () => {
        assert.equal(normalizarItems([null]), null);
        assert.equal(normalizarItems(['a']), null);
        assert.equal(normalizarItems([5]), null);
    });
});

describe('normalizarCotizacion: datos del cliente', () => {
    it('acepta una cotización mínima válida y la devuelve normalizada', () => {
        const d = ok({ cliente: { nombre: '  Ana   Pérez ', correo: '  ANA@Correo.COM ', telefono: ' 300 123 4567 ' }, items: [{ variantId: 2, cantidad: 3 }] });
        assert.deepEqual(d.cliente, { nombre: 'Ana Pérez', correo: 'ana@correo.com', telefono: '300 123 4567', documento: null });
        assert.deepEqual(d.items, [{ variantId: 2, cantidad: 3, nota: undefined }]);
    });
    it('rechaza cuerpos que no son objeto', () => {
        for (const b of [undefined, null, 'x', 5, []]) {
            const r = normalizarCotizacion(b);
            // un arreglo es un objeto en JS, pero no trae datos de contacto
            assert.equal(r.ok, false);
        }
    });
    it('exige nombre, correo y teléfono', () => {
        for (const campo of ['nombre', 'correo', 'telefono'] as const) {
            const b = base();
            delete (b.cliente as Record<string, string>)[campo];
            assert.match(error(b), /datos de contacto/);
        }
    });
    it('un nombre de solo espacios cuenta como vacío', () => {
        const b = base();
        b.cliente.nombre = '     ';
        assert.match(error(b), /datos de contacto/);
    });
    it('frontera del nombre: 100 caracteres sí, 101 no', () => {
        const b = base();
        b.cliente.nombre = 'a'.repeat(LIMITES.nombre);
        assert.equal(ok(b).cliente.nombre.length, 100);
        b.cliente.nombre = 'a'.repeat(LIMITES.nombre + 1);
        assert.match(error(b), /nombre es demasiado largo/);
    });
    it('frontera del teléfono: 30 caracteres sí, 31 no', () => {
        const b = base();
        b.cliente.telefono = '3'.repeat(LIMITES.telefono);
        ok(b);
        b.cliente.telefono = '3'.repeat(LIMITES.telefono + 1);
        assert.match(error(b), /teléfono es demasiado largo/);
    });
    it('frontera del documento: 50 sí, 51 no; vacío se guarda como nulo', () => {
        const b = { ...base(), cliente: { ...base().cliente, documento: '1'.repeat(LIMITES.documento) } };
        assert.equal(ok(b).cliente.documento?.length, 50);
        b.cliente.documento = '1'.repeat(LIMITES.documento + 1);
        assert.match(error(b), /documento es demasiado largo/);
        b.cliente.documento = '   ';
        assert.equal(ok(b).cliente.documento, null);
    });
    it('rechaza un correo con mala forma', () => {
        const b = base();
        b.cliente.correo = 'ana@correo';
        assert.match(error(b), /correo no es válido/);
    });
    it('el nombre con comillas, punto y coma o SQL se guarda tal cual (la consulta es parametrizada)', () => {
        const b = base();
        b.cliente.nombre = "Robert'); DROP TABLE users;--";
        assert.equal(ok(b).cliente.nombre, "Robert'); DROP TABLE users;--");
    });
});

describe('normalizarCotizacion: evento, lugar y fecha', () => {
    it('sede del catálogo y lugar manual son excluyentes: con sede se ignora el manual', () => {
        const d = ok({ ...base(), venueId: 3, venueNombreManual: 'Salón X', venueDireccionManual: 'Calle 1' });
        assert.equal(d.venueId, 3);
        assert.equal(d.venueNombreManual, null);
        assert.equal(d.venueDireccionManual, null);
    });
    it('sin sede se conserva el lugar manual', () => {
        const d = ok({ ...base(), venueNombreManual: ' Salón   Los Cedros ', venueDireccionManual: 'Cra 23 # 45-12' });
        assert.equal(d.venueId, null);
        assert.equal(d.venueNombreManual, 'Salón Los Cedros');
    });
    it('identificadores cero o nulos significan "sin elegir"', () => {
        const d = ok({ ...base(), venueId: 0, transportationId: null });
        assert.equal(d.venueId, null);
        assert.equal(d.transportationId, null);
    });
    it('acepta identificadores como texto numérico (el catálogo real los entrega así)', () => {
        const d = ok({ ...base(), venueId: '3', transportationId: '1' });
        assert.equal(d.venueId, 3);
        assert.equal(d.transportationId, 1);
    });
    it('un identificador vacío o "0" significa "sin elegir"', () => {
        const d = ok({ ...base(), venueId: '', transportationId: 0 });
        assert.equal(d.venueId, null);
        assert.equal(d.transportationId, null);
    });
    it('rechaza identificadores inválidos', () => {
        for (const v of [-1, 1.5, '3.5', 'abc', '-2', NaN, {}]) {
            assert.match(error({ ...base(), venueId: v }), /sede/);
            assert.match(error({ ...base(), transportationId: v }), /transporte/);
        }
    });
    it('frontera del lugar manual: 255 sí, 256 no', () => {
        ok({ ...base(), venueNombreManual: 'a'.repeat(LIMITES.lugar) });
        assert.match(error({ ...base(), venueNombreManual: 'a'.repeat(LIMITES.lugar + 1) }), /lugar/);
    });
    it('frontera del tipo de evento: 100 sí, 101 no', () => {
        ok({ ...base(), tipoEvento: 'a'.repeat(LIMITES.tipoEvento) });
        assert.match(error({ ...base(), tipoEvento: 'a'.repeat(LIMITES.tipoEvento + 1) }), /tipo de evento/);
    });
    it('fecha opcional: vacía queda nula; real se conserva; imposible se rechaza', () => {
        assert.equal(ok({ ...base(), fechaEvento: '' }).fechaEvento, null);
        assert.equal(ok({ ...base() }).fechaEvento, null);
        assert.equal(ok({ ...base(), fechaEvento: '2026-11-18' }).fechaEvento, '2026-11-18');
        assert.match(error({ ...base(), fechaEvento: '2026-02-30' }), /fecha/);
    });
    it('una lista de servicios inválida invalida toda la cotización', () => {
        assert.match(error({ ...base(), items: [{ variantId: 1, cantidad: 0 }] }), /servicios no es válida/);
    });
});

describe('aIdentificador', () => {
    it('convierte números y texto numérico; descarta el resto', () => {
        assert.equal(aIdentificador(5), 5);
        assert.equal(aIdentificador('5'), 5);
        assert.equal(aIdentificador('007'), 7);
        for (const v of [0, '0', -1, 1.5, '1e3', '9999999999999999', null, undefined, true, []]) assert.equal(aIdentificador(v), undefined, String(v));
    });
});
