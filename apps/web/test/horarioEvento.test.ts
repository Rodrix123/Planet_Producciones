// Pruebas de la pestaña Horarios del panel del evento: cálculo de horarios (duración, eventos que
// terminan al día siguiente, ajustes rápidos), selección múltiple de tipos de actividad, tipo de
// horario y estado de asignación del resumen, qué se guarda con "Guardar y confirmar" y el
// borrador. Son funciones puras: no necesitan navegador ni servidor.
//
// Ejecutar:  npm run test --workspace apps/web

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Etapa } from '../src/shared/etapasPersonal';
import {
    a12Horas,
    AJUSTES_HORAS,
    AJUSTES_MINUTOS,
    ajustarDuracion,
    alternarEtapa,
    alternarTodas,
    aHora,
    aMinutos,
    cambiarFin,
    cambiarInicio,
    de12Horas,
    duracion,
    DURACION_MAXIMA,
    estadoDeTodas,
    estadosDeAsignacion,
    etiquetaAjuste,
    evaluarGuardado,
    fechaDeFin,
    formatearDuracion,
    formatearFechaCorta,
    formatearHora12,
    horarioRegistrado,
    MENSAJE_OTRO_INICIO,
    MENSAJE_SOLO_ALGUNOS_TIPOS,
    nombreDelTipo,
    sumarDias,
    terminaAlDiaSiguiente,
    todasLasEtapas,
    type Horario
} from '../src/shared/horarioEvento';
import { borrarBorradorHorario, guardarBorradorHorario, leerBorradorHorario, type Almacen, type BorradorHorario } from '../src/shared/borradorHorario';

const TODAS: Etapa[] = ['carga', 'organizacion', 'desmonte'];
/** "21:00" -> minutos, para escribir los casos como se leen. */
const m = (hora: string): number => {
    const minutos = aMinutos(hora);
    assert.notEqual(minutos, null, `hora mal escrita en la prueba: ${hora}`);
    return minutos as number;
};
const h = (inicio: string | null, fin: string | null): Horario => ({ inicio: inicio === null ? null : m(inicio), fin: fin === null ? null : m(fin) });
const horas = (x: Horario | null): [string | null, string | null] | null =>
    x === null ? null : [x.inicio === null ? null : aHora(x.inicio), x.fin === null ? null : aHora(x.fin)];

describe('horas: formato del servidor y de 12 horas', () => {
    it('lee HH:MM y HH:MM:SS y rechaza lo que no es una hora', () => {
        assert.equal(aMinutos('21:00'), 1260);
        assert.equal(aMinutos('21:00:00'), 1260);
        assert.equal(aMinutos('00:00'), 0);
        assert.equal(aMinutos('23:59'), 1439);
        for (const malo of ['24:00', '9:00', '21:60', '', 'abc', null, undefined]) assert.equal(aMinutos(malo), null, String(malo));
    });

    it('escribe HH:MM dando la vuelta al día', () => {
        assert.equal(aHora(1260), '21:00');
        assert.equal(aHora(0), '00:00');
        assert.equal(aHora(1440 + 5), '00:05');
        assert.equal(aHora(-5), '23:55');
    });

    it('convierte a 12 horas: medianoche es 12 a. m. y mediodía 12 p. m.', () => {
        assert.deepEqual(a12Horas(0), { hora: 12, minuto: 0, periodo: 'am' });
        assert.deepEqual(a12Horas(65), { hora: 1, minuto: 5, periodo: 'am' });
        assert.deepEqual(a12Horas(720), { hora: 12, minuto: 0, periodo: 'pm' });
        assert.deepEqual(a12Horas(1260), { hora: 9, minuto: 0, periodo: 'pm' });
        assert.equal(formatearHora12(1260), '9:00 p. m.');
        assert.equal(formatearHora12(0), '12:00 a. m.');
        assert.equal(formatearHora12(725), '12:05 p. m.');
    });

    it('ida y vuelta entre 24 y 12 horas para todos los minutos del día', () => {
        for (let minuto = 0; minuto < 1440; minuto += 1) assert.equal(de12Horas(a12Horas(minuto)), minuto);
    });
});

describe('duración y eventos que terminan al día siguiente', () => {
    it('9:00 p. m. a 1:00 a. m. dura 4 horas y termina al día siguiente (el ejemplo del diseño)', () => {
        const horario = h('21:00', '01:00');
        assert.equal(duracion(horario), 240);
        assert.equal(formatearDuracion(240), '4 horas');
        assert.equal(terminaAlDiaSiguiente(horario), true);
        assert.equal(fechaDeFin('2026-11-29', horario), '2026-11-30');
        assert.equal(formatearFechaCorta('2026-11-30'), 'Lun, 30 nov. 2026');
    });

    it('un horario dentro del mismo día termina en la fecha del evento', () => {
        const horario = h('08:00', '12:30');
        assert.equal(duracion(horario), 270);
        assert.equal(terminaAlDiaSiguiente(horario), false);
        assert.equal(fechaDeFin('2026-11-29', horario), '2026-11-29');
    });

    it('terminar a medianoche (00:00) es terminar al día siguiente', () => {
        const horario = h('20:00', '00:00');
        assert.equal(duracion(horario), 240);
        assert.equal(fechaDeFin('2026-11-29', horario), '2026-11-30');
    });

    it('cambia bien de mes, de año y respeta los años bisiestos', () => {
        const noche = h('22:00', '02:00');
        assert.equal(fechaDeFin('2026-12-31', noche), '2027-01-01');
        assert.equal(fechaDeFin('2026-11-30', noche), '2026-12-01');
        assert.equal(fechaDeFin('2028-02-28', noche), '2028-02-29');
        assert.equal(fechaDeFin('2027-02-28', noche), '2027-03-01');
        assert.equal(sumarDias('2026-11-29', 1), '2026-11-30');
    });

    it('nunca hay duraciones negativas: inicio igual al fin no es un horario válido', () => {
        assert.equal(duracion(h('21:00', '21:00')), null);
        for (let inicio = 0; inicio < 1440; inicio += 7) {
            for (let fin = 0; fin < 1440; fin += 11) {
                const d = duracion({ inicio, fin });
                if (inicio === fin) assert.equal(d, null);
                else assert.ok(d !== null && d >= 1 && d <= DURACION_MAXIMA, `${inicio} -> ${fin}: ${d}`);
            }
        }
    });

    it('sin hora de inicio o de finalización no hay duración ni fecha de fin', () => {
        assert.equal(duracion(h('21:00', null)), null);
        assert.equal(duracion(h(null, '01:00')), null);
        assert.equal(fechaDeFin('2026-11-29', h('21:00', null)), null);
        assert.equal(terminaAlDiaSiguiente(h(null, '01:00')), false);
    });
});

describe('ajustes rápidos: Extender y Quitar desde el inicio', () => {
    it('extender mueve la hora de finalización y conserva el inicio', () => {
        assert.deepEqual(horas(ajustarDuracion(h('21:00', '01:00'), 30)), ['21:00', '01:30']);
        assert.deepEqual(horas(ajustarDuracion(h('21:00', '01:00'), 5 * 60)), ['21:00', '06:00']);
    });

    it('extender puede pasar la medianoche y quitar puede devolverlo al mismo día', () => {
        const extendido = ajustarDuracion(h('21:00', '23:30'), 60) as Horario;
        assert.deepEqual(horas(extendido), ['21:00', '00:30']);
        assert.equal(terminaAlDiaSiguiente(extendido), true);
        assert.equal(fechaDeFin('2026-11-29', extendido), '2026-11-30');

        const acortado = ajustarDuracion(h('21:00', '01:00'), -3 * 60) as Horario;
        assert.deepEqual(horas(acortado), ['21:00', '22:00']);
        assert.equal(terminaAlDiaSiguiente(acortado), false);
        assert.equal(fechaDeFin('2026-11-29', acortado), '2026-11-29');
    });

    it('la duración cambia exactamente lo que dice cada botón, y extender y quitar se anulan', () => {
        const base = h('21:00', '01:00');
        for (const minutos of [...AJUSTES_MINUTOS, ...AJUSTES_HORAS]) {
            const extendido = ajustarDuracion(base, minutos) as Horario;
            assert.equal(duracion(extendido), 240 + minutos, `+${minutos}`);
            assert.deepEqual(ajustarDuracion(extendido, -minutos), base, `±${minutos}`);
        }
    });

    it('quitar no deja la duración en cero ni negativa', () => {
        assert.equal(ajustarDuracion(h('21:00', '01:00'), -4 * 60), null); // quedaría en 0
        assert.equal(ajustarDuracion(h('21:00', '01:00'), -5 * 60), null); // quedaría negativa
        assert.equal(ajustarDuracion(h('21:00', '21:05'), -5), null);
        assert.equal(duracion(ajustarDuracion(h('21:00', '21:10'), -5) as Horario), 5);
    });

    it('extender no pasa de 23 h 59 min (la hora de fin no puede volver a la de inicio)', () => {
        const casiUnDia = { inicio: m('21:00'), fin: m('20:55') }; // 23 h 55 min
        assert.equal(duracion(casiUnDia), 1435);
        assert.equal(ajustarDuracion(casiUnDia, 5), null);
        assert.equal(ajustarDuracion(h('21:00', '17:00'), 5 * 60), null); // 20 h + 5 h
        assert.equal(duracion(ajustarDuracion(h('21:00', '17:00'), 3 * 60) as Horario), 23 * 60);
        assert.equal(formatearDuracion(DURACION_MAXIMA), '23 h 59 min');
    });

    it('sin hora de finalización, extender cuenta desde el inicio; sin inicio no se puede ajustar', () => {
        assert.deepEqual(horas(ajustarDuracion(h('21:00', null), 4 * 60)), ['21:00', '01:00']);
        assert.equal(ajustarDuracion(h('21:00', null), -60), null);
        assert.equal(ajustarDuracion(h(null, '01:00'), 60), null);
    });
});

describe('cambiar la hora de inicio o de finalización', () => {
    it('cambiar el inicio conserva la duración: el fin se mueve con él', () => {
        assert.deepEqual(horas(cambiarInicio(h('21:00', '01:00'), m('22:30'))), ['22:30', '02:30']);
        assert.deepEqual(horas(cambiarInicio(h('21:00', '01:00'), m('08:00'))), ['08:00', '12:00']);
    });

    it('sin duración válida, cambiar el inicio no inventa una hora de finalización', () => {
        assert.deepEqual(horas(cambiarInicio(h('21:00', null), m('20:00'))), ['20:00', null]);
        assert.deepEqual(horas(cambiarInicio(h('21:00', '21:00'), m('20:00'))), ['20:00', '21:00']);
        assert.deepEqual(horas(cambiarInicio(h(null, '01:00'), m('21:00'))), ['21:00', '01:00']);
    });

    it('elegir un fin menor que el inicio lo pasa al día siguiente', () => {
        const horario = cambiarFin(h('21:00', '23:00'), m('02:15'));
        assert.equal(duracion(horario), 315);
        assert.equal(fechaDeFin('2026-11-29', horario), '2026-11-30');
        assert.equal(formatearDuracion(315), '5 h 15 min');
    });
});

describe('selección múltiple de tipos de actividad', () => {
    it('marca y desmarca cada tipo, sin repetir y en el orden Carga, Organización, Desmonte', () => {
        let seleccion: Etapa[] = [];
        seleccion = alternarEtapa(seleccion, 'desmonte');
        seleccion = alternarEtapa(seleccion, 'carga');
        assert.deepEqual(seleccion, ['carga', 'desmonte']);
        seleccion = alternarEtapa(seleccion, 'carga');
        assert.deepEqual(seleccion, ['desmonte']);
    });

    it('no modifica la lista que recibe', () => {
        const original: Etapa[] = ['carga'];
        alternarEtapa(original, 'organizacion');
        alternarTodas(original);
        assert.deepEqual(original, ['carga']);
    });

    it('"Todos" marca los tres si falta alguno y los quita si ya están los tres', () => {
        assert.deepEqual(alternarTodas([]), TODAS);
        assert.deepEqual(alternarTodas(['organizacion']), TODAS);
        assert.deepEqual(alternarTodas(['carga', 'desmonte']), TODAS);
        assert.deepEqual(alternarTodas(TODAS), []);
    });

    it('el botón "Todos" queda presionado, suelto o a medias según la selección', () => {
        assert.equal(estadoDeTodas(TODAS), 'true');
        assert.equal(estadoDeTodas([]), 'false');
        assert.equal(estadoDeTodas(['carga']), 'mixed');
        assert.equal(estadoDeTodas(alternarEtapa(TODAS, 'organizacion')), 'mixed');
        assert.equal(estadoDeTodas(alternarEtapa(['carga', 'desmonte'], 'organizacion')), 'true');
        assert.equal(todasLasEtapas(['desmonte', 'carga', 'organizacion']), true);
    });
});

describe('resumen: tipo de horario y estado de asignación', () => {
    it('con los tres tipos el horario es "General"; si no, se nombran los elegidos en su orden', () => {
        assert.equal(nombreDelTipo(TODAS), 'General');
        assert.equal(nombreDelTipo(['desmonte', 'organizacion', 'carga']), 'General');
        assert.equal(nombreDelTipo(['organizacion']), 'Organización');
        assert.equal(nombreDelTipo(['desmonte', 'carga']), 'Carga y Desmonte');
        assert.equal(nombreDelTipo([]), null);
    });

    it('un horario está registrado con inicio y finalización distintos, aunque pase la medianoche', () => {
        assert.equal(horarioRegistrado(h('21:00', '01:00')), true);
        assert.equal(horarioRegistrado(h('08:08', '18:05')), true);
        for (const incompleto of [h('21:00', null), h(null, '01:00'), h(null, null), h('21:00', '21:00')]) {
            assert.equal(horarioRegistrado(incompleto), false, JSON.stringify(incompleto));
        }
    });

    it('los tres tipos quedan asignados solo si el evento tiene su horario guardado (es uno solo para los tres)', () => {
        const estados = (guardado: Horario): string[] => estadosDeAsignacion(guardado).map((x) => `${x.etapa}:${x.estado}`);
        assert.deepEqual(estados(h('21:00', '01:00')), ['carga:asignado', 'organizacion:asignado', 'desmonte:asignado']);
        assert.deepEqual(estados(h('21:00', null)), ['carga:sin-asignar', 'organizacion:sin-asignar', 'desmonte:sin-asignar']);
        assert.deepEqual(estados(h(null, null)), ['carga:sin-asignar', 'organizacion:sin-asignar', 'desmonte:sin-asignar']);
    });
});

describe('"Guardar y confirmar": qué se puede guardar', () => {
    const guardado = h('21:00', '01:00');

    it('con los tres tipos y la hora de inicio del evento, guarda la nueva hora de finalización', () => {
        assert.deepEqual(evaluarGuardado(h('21:00', '02:00'), TODAS, guardado), { estado: 'listo', horaFin: '02:00' });
        assert.deepEqual(evaluarGuardado(h('21:00', '01:00'), TODAS, guardado), { estado: 'sin-cambios' });
    });

    it('un evento sin hora de finalización guardada recibe la primera', () => {
        assert.deepEqual(evaluarGuardado(h('21:00', '01:00'), TODAS, h('21:00', null)), { estado: 'listo', horaFin: '01:00' });
    });

    it('un horario solo para algunos tipos, u otra hora de inicio, todavía no tiene dónde guardarse', () => {
        assert.deepEqual(evaluarGuardado(h('21:00', '02:00'), ['carga'], guardado), { estado: 'pendiente', mensaje: MENSAJE_SOLO_ALGUNOS_TIPOS });
        assert.deepEqual(evaluarGuardado(h('20:00', '00:00'), TODAS, guardado), { estado: 'pendiente', mensaje: MENSAJE_OTRO_INICIO });
        assert.equal(evaluarGuardado(h('21:00', '02:00'), TODAS, h(null, null)).estado, 'pendiente'); // el evento no tiene inicio
    });

    it('rechaza lo incompleto o inválido antes que cualquier otra cosa', () => {
        assert.equal(evaluarGuardado(h('21:00', '02:00'), [], guardado).estado, 'invalido');
        assert.equal(evaluarGuardado(h(null, '02:00'), TODAS, guardado).estado, 'invalido');
        assert.equal(evaluarGuardado(h('21:00', null), TODAS, guardado).estado, 'invalido');
        const iguales = evaluarGuardado(h('21:00', '21:00'), ['carga'], guardado);
        assert.deepEqual(iguales, { estado: 'invalido', mensaje: 'La hora de finalización no puede ser igual a la hora de inicio.' });
    });
});

describe('formatos de la pantalla', () => {
    it('duración en palabras', () => {
        assert.equal(formatearDuracion(60), '1 hora');
        assert.equal(formatearDuracion(45), '45 minutos');
        assert.equal(formatearDuracion(1), '1 minuto');
        assert.equal(formatearDuracion(270), '4 h 30 min');
    });

    it('fecha corta y texto de los botones de ajuste', () => {
        assert.equal(formatearFechaCorta('2026-11-29'), 'Dom, 29 nov. 2026');
        assert.equal(formatearFechaCorta('2027-01-01'), 'Vie, 1 ene. 2027');
        assert.deepEqual([...AJUSTES_MINUTOS].map(etiquetaAjuste), ['5 min', '10 min', '15 min', '30 min', '45 min']);
        assert.deepEqual(AJUSTES_HORAS.map(etiquetaAjuste), ['1 h', '2 h', '3 h', '4 h', '5 h']);
    });
});

describe('borrador del horario (almacenamiento del navegador)', () => {
    function almacenEnMemoria(): Almacen & { datos: Map<string, string> } {
        const datos = new Map<string, string>();
        return {
            datos,
            getItem: (k) => datos.get(k) ?? null,
            setItem: (k, v) => void datos.set(k, v),
            removeItem: (k) => void datos.delete(k)
        };
    }
    const borrador: BorradorHorario = { fecha: '2026-11-29', inicio: m('21:00'), fin: m('01:30'), etapas: ['carga', 'desmonte'], guardadoEn: '2026-11-16T15:30:00.000Z' };

    it('guarda y recupera el borrador de cada evento por separado', () => {
        const almacen = almacenEnMemoria();
        assert.equal(guardarBorradorHorario(7, borrador, almacen), true);
        assert.deepEqual(leerBorradorHorario(7, '2026-11-29', almacen), borrador);
        assert.equal(leerBorradorHorario(8, '2026-11-29', almacen), null);
        borrarBorradorHorario(7, almacen);
        assert.equal(leerBorradorHorario(7, '2026-11-29', almacen), null);
    });

    it('un borrador incompleto también se puede guardar', () => {
        const almacen = almacenEnMemoria();
        const incompleto: BorradorHorario = { ...borrador, fin: null, etapas: [] };
        guardarBorradorHorario(7, incompleto, almacen);
        assert.deepEqual(leerBorradorHorario(7, '2026-11-29', almacen), incompleto);
    });

    it('descarta el borrador si el evento cambió de fecha', () => {
        const almacen = almacenEnMemoria();
        guardarBorradorHorario(7, borrador, almacen);
        assert.equal(leerBorradorHorario(7, '2026-11-30', almacen), null);
    });

    it('ignora borradores dañados o con datos que no son de un horario', () => {
        const almacen = almacenEnMemoria();
        const clave = 'planet.horarioBorrador.7';
        const casos: unknown[] = [
            '{no es json',
            JSON.stringify(null),
            JSON.stringify({ ...borrador, inicio: 1440 }),
            JSON.stringify({ ...borrador, fin: -1 }),
            JSON.stringify({ ...borrador, inicio: 12.5 }),
            JSON.stringify({ ...borrador, etapas: ['montaje'] }),
            JSON.stringify({ ...borrador, etapas: ['carga', 'carga'] }),
            JSON.stringify({ ...borrador, etapas: 'carga' }),
            JSON.stringify({ ...borrador, guardadoEn: undefined })
        ];
        for (const crudo of casos) {
            almacen.datos.set(clave, crudo as string);
            assert.equal(leerBorradorHorario(7, '2026-11-29', almacen), null, String(crudo));
        }
    });

    it('sin almacenamiento disponible (bloqueado o lleno) avisa que no se guardó', () => {
        const lleno: Almacen = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
            removeItem: () => undefined
        };
        assert.equal(guardarBorradorHorario(7, borrador, lleno), false);
        assert.equal(guardarBorradorHorario(7, borrador, null), false);
        assert.equal(leerBorradorHorario(7, '2026-11-29', null), null);
        assert.doesNotThrow(() => borrarBorradorHorario(7, null));
    });
});
