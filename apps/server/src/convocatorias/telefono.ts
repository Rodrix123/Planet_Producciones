// Normalización de teléfonos al formato internacional E.164 con "+" (ej. +573XXXXXXXXX): el
// formato que exige la base de datos (migración 0010) y con el que WhatsApp identifica a cada
// persona.

const E164 = /^\+[1-9][0-9]{7,14}$/;
const CELULAR_COLOMBIA = /^3[0-9]{9}$/;

/**
 * Convierte el teléfono de un trabajador (texto libre en empleados.telefono) a E.164.
 * Tolera separadores comunes (espacios, guiones, puntos, paréntesis) y acepta:
 *   - celular colombiano sin prefijo (10 dígitos que empiezan en 3):  300 000 0001
 *   - con indicativo de país, con o sin "+" o "00":  +57 300 000 0001, 573000000001, 0057...
 *   - cualquier otro número internacional escrito con "+" o "00".
 * Devuelve null si no se puede garantizar un número válido de WhatsApp (un fijo, un número
 * incompleto, texto con letras...): es preferible rechazarlo que escribirle a otra persona.
 */
export function normalizarTelefono(valor: string | null | undefined): string | null {
    if (typeof valor !== 'string') return null;
    const texto = valor.trim();
    if (!texto || /[^\d\s().+-]/.test(texto)) return null;

    // El "+" solo puede ir al inicio y una sola vez
    const signosMas = texto.split('+').length - 1;
    if (signosMas > 1 || (signosMas === 1 && !texto.startsWith('+'))) return null;

    const digitos = texto.replace(/\D/g, '');
    let candidato: string;
    if (texto.startsWith('+')) candidato = `+${digitos}`;
    else if (digitos.startsWith('00')) candidato = `+${digitos.slice(2)}`;
    else if (CELULAR_COLOMBIA.test(digitos)) candidato = `+57${digitos}`;
    else if (digitos.length === 12 && digitos.startsWith('57')) candidato = `+${digitos}`;
    else return null;

    if (!E164.test(candidato)) return null;
    // Colombia: un celular tiene exactamente 10 dígitos y empieza en 3
    if (candidato.startsWith('+57') && !CELULAR_COLOMBIA.test(candidato.slice(3))) return null;
    return candidato;
}

/** Teléfono tal como lo entrega Meta (solo dígitos con indicativo, sin "+") a E.164 con "+". */
export function telefonoDesdeWhatsApp(valor: string | null | undefined): string | null {
    if (typeof valor !== 'string') return null;
    const digitos = valor.trim().replace(/^\+/, '');
    return /^[0-9]+$/.test(digitos) && E164.test(`+${digitos}`) ? `+${digitos}` : null;
}
