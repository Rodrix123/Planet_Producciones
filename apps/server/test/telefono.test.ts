// Pruebas de la normalización de teléfonos a E.164 (Numeral 3). Los números son ficticios.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizarTelefono, telefonoDesdeWhatsApp } from '../src/convocatorias/telefono';

describe('normalizarTelefono', () => {
    const validos: [string, string][] = [
        ['300 000 0001', '+573000000001'],
        ['3000000001', '+573000000001'],
        ['(300) 000-0001', '+573000000001'],
        ['300.000.0001', '+573000000001'],
        ['  300 000 0001  ', '+573000000001'],
        ['+57 300 000 0001', '+573000000001'],
        ['+573000000001', '+573000000001'],
        ['573000000001', '+573000000001'],
        ['57 300 000 0001', '+573000000001'],
        ['00573000000001', '+573000000001'],
        ['+1 202 555 0101', '+12025550101'],
        ['0012025550101', '+12025550101'],
        ['+34 612 345 678', '+34612345678']
    ];
    for (const [entrada, esperado] of validos) {
        it(`"${entrada}" → ${esperado}`, () => {
            assert.equal(normalizarTelefono(entrada), esperado);
        });
    }

    const invalidos: [string | null | undefined, string][] = [
        [null, 'nulo'],
        [undefined, 'sin valor'],
        ['', 'vacío'],
        ['   ', 'solo espacios'],
        ['300 000 0001 ext 3', 'con letras'],
        ['llamar a Laura', 'texto'],
        ['300 000 000', 'celular incompleto (9 dígitos)'],
        ['30000000012', '11 dígitos sin indicativo'],
        ['2025550101', 'sin indicativo y no es celular colombiano'],
        ['6012345678', 'fijo de Bogotá'],
        ['+57 601 234 5678', 'fijo con indicativo'],
        ['+57 300 000 000', 'celular colombiano incompleto'],
        ['+5730000000012', 'celular colombiano con un dígito de más'],
        ['3+00 000 0001', '"+" en medio'],
        ['++573000000001', 'doble "+"'],
        ['+0573000000001', 'el indicativo no puede empezar en 0'],
        ['+12', 'demasiado corto'],
        ['+1234567890123456', 'más de 15 dígitos'],
        ['573000000001x', 'letra al final']
    ];
    for (const [entrada, motivo] of invalidos) {
        it(`rechaza ${JSON.stringify(entrada)} (${motivo})`, () => {
            assert.equal(normalizarTelefono(entrada), null);
        });
    }
});

describe('telefonoDesdeWhatsApp', () => {
    it('agrega el "+" al número que entrega Meta (solo dígitos)', () => {
        assert.equal(telefonoDesdeWhatsApp('573000000001'), '+573000000001');
        assert.equal(telefonoDesdeWhatsApp('12025550101'), '+12025550101');
    });

    it('acepta el número que ya trae "+"', () => {
        assert.equal(telefonoDesdeWhatsApp('+573000000001'), '+573000000001');
    });

    it('rechaza lo que no es un número internacional de solo dígitos', () => {
        for (const entrada of [null, undefined, '', 'abc', '57 300 000 0001', '0573000000001', '123', '1234567890123456']) {
            assert.equal(telefonoDesdeWhatsApp(entrada), null, `debería rechazar ${JSON.stringify(entrada)}`);
        }
    });
});
