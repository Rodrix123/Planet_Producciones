// Pruebas de la lista de la pestaña Personal del panel del evento: "Asignar a" con varias funciones,
// quién se puede elegir, filtros (búsqueda, contrato, solo disponibles), orden y qué se envía al
// servidor por cada función. Son funciones puras: no necesitan navegador ni servidor.
//
// Ejecutar:  npm run test --workspace apps/web

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ETAPAS, type Etapa, type PersonaDto } from '../src/shared/etapasPersonal';
import {
    alternarDestino,
    disponibleEn,
    etapasPendientes,
    filtrarPersonal,
    ordenarPorDisponibilidad,
    personasVisibles,
    planDeAsignacion,
    sonTodas,
    unirNombres,
    type CriteriosLista
} from '../src/shared/listaPersonal';

function persona(clave: string, nombre: string, extra: Partial<PersonaDto> = {}): PersonaDto {
    return {
        clave,
        nombre,
        detalle: '',
        tipoContrato: 'con_contrato',
        estado: 'DISPONIBLE',
        seleccionable: true,
        etapas: null,
        motivos: [],
        ...extra
    };
}

const ana = persona('p:a', 'ANA PÉREZ GÓMEZ');
const bruno = persona('p:b', 'BRUNO DÍAZ RUIZ', { tipoContrato: 'freelance_fijo', detalle: 'Freelance fijo' });
/** Ya está en el evento en Carga. */
const carla = persona('p:c', 'CARLA GÓMEZ LUNA', { estado: 'ASIGNADO', etapas: ['carga'] });
/** Ya está en las tres funciones. */
const dario = persona('p:d', 'DARÍO ROJAS', { estado: 'ASIGNADO', etapas: [...ETAPAS] });
/** Choca con otro evento: el servidor no la deja elegir. */
const elena = persona('e:e', 'ELENA MARÍN', { estado: 'NO_DISPONIBLE', seleccionable: false, tipoContrato: 'freelance_no_fijo' });
const TODOS = [elena, dario, ana, carla, bruno];

const criterios = (c: Partial<CriteriosLista> = {}): CriteriosLista => ({
    busqueda: '',
    contrato: '',
    soloDisponibles: false,
    destinos: [...ETAPAS],
    ...c
});

describe('"Asignar a": Todos y funciones', () => {
    it('"Todos" son las tres funciones', () => {
        assert.equal(sonTodas([...ETAPAS]), true);
        assert.equal(sonTodas(['carga', 'desmonte']), false);
        assert.equal(sonTodas([]), false);
    });

    it('con "Todos", marcar una función deja solo esa', () => {
        assert.deepEqual(alternarDestino([...ETAPAS], 'organizacion'), ['organizacion']);
    });

    it('se suman y quitan funciones, siempre en el orden Carga, Organización, Desmonte', () => {
        assert.deepEqual(alternarDestino(['desmonte'], 'carga'), ['carga', 'desmonte']);
        assert.deepEqual(alternarDestino(['carga', 'desmonte'], 'carga'), ['desmonte']);
    });

    it('marcar la tercera función equivale a "Todos"', () => {
        const destinos = alternarDestino(['carga', 'organizacion'], 'desmonte');
        assert.deepEqual(destinos, [...ETAPAS]);
        assert.equal(sonTodas(destinos), true);
    });

    it('desmarcar la última función vuelve a "Todos": nunca queda sin destino', () => {
        assert.deepEqual(alternarDestino(['organizacion'], 'organizacion'), [...ETAPAS]);
    });
});

describe('quién se puede elegir', () => {
    it('a quien no está en el evento le faltan todas las funciones de destino', () => {
        assert.deepEqual(etapasPendientes(ana, [...ETAPAS]), [...ETAPAS]);
        assert.equal(disponibleEn(ana, ['desmonte']), true);
    });

    it('a quien ya está en Carga se le pueden sumar las otras, pero no Carga otra vez', () => {
        assert.deepEqual(etapasPendientes(carla, [...ETAPAS]), ['organizacion', 'desmonte']);
        assert.equal(disponibleEn(carla, [...ETAPAS]), true);
        assert.equal(disponibleEn(carla, ['carga']), false);
        assert.equal(disponibleEn(carla, ['carga', 'desmonte']), true);
    });

    it('quien ya está en todas las funciones de destino no se puede elegir', () => {
        assert.equal(disponibleEn(dario, [...ETAPAS]), false);
        assert.equal(disponibleEn(dario, ['organizacion']), false);
    });

    it('lo que el servidor no deja elegir (choque, sin celular...) no se puede elegir para ninguna función', () => {
        assert.equal(disponibleEn(elena, [...ETAPAS]), false);
        assert.equal(disponibleEn({ ...ana, estado: 'SIN_COMPROBAR', seleccionable: false }, ['carga']), false);
    });
});

describe('filtros y orden', () => {
    it('busca por nombre o contrato sin importar tildes ni mayúsculas', () => {
        assert.deepEqual(filtrarPersonal(TODOS, criterios({ busqueda: 'gomez' })).map((p) => p.clave), ['p:a', 'p:c']);
        assert.deepEqual(filtrarPersonal(TODOS, criterios({ busqueda: 'FREELANCE' })).map((p) => p.clave), ['p:b']);
        assert.deepEqual(filtrarPersonal(TODOS, criterios({ busqueda: 'darío' })).map((p) => p.clave), ['p:d']);
    });

    it('filtra por tipo de contrato', () => {
        assert.deepEqual(filtrarPersonal(TODOS, criterios({ contrato: 'freelance_no_fijo' })).map((p) => p.clave), ['e:e']);
    });

    it('"solo disponibles" depende de las funciones de destino', () => {
        assert.deepEqual(filtrarPersonal(TODOS, criterios({ soloDisponibles: true })).map((p) => p.clave), ['p:a', 'p:c', 'p:b']);
        assert.deepEqual(filtrarPersonal(TODOS, criterios({ soloDisponibles: true, destinos: ['carga'] })).map((p) => p.clave), ['p:a', 'p:b']);
    });

    it('los filtros se combinan', () => {
        const c = criterios({ busqueda: 'gómez', soloDisponibles: true, destinos: ['carga'] });
        assert.deepEqual(filtrarPersonal(TODOS, c).map((p) => p.clave), ['p:a']);
    });

    it('primero los disponibles para las funciones de destino, cada grupo en el orden del servidor', () => {
        assert.deepEqual(ordenarPorDisponibilidad(TODOS, [...ETAPAS]).map((p) => p.clave), ['p:a', 'p:c', 'p:b', 'e:e', 'p:d']);
        assert.deepEqual(ordenarPorDisponibilidad(TODOS, ['carga']).map((p) => p.clave), ['p:a', 'p:b', 'e:e', 'p:d', 'p:c']);
    });

    it('la lista visible no quita ni repite a nadie sin filtros', () => {
        const visibles = personasVisibles(TODOS, criterios());
        assert.equal(visibles.length, TODOS.length);
        assert.equal(new Set(visibles.map((p) => p.clave)).size, TODOS.length);
    });
});

describe('qué se envía al asignar', () => {
    it('una solicitud por función, en orden, cada una solo con quienes aún no están en ella', () => {
        assert.deepEqual(planDeAsignacion([ana, carla], [...ETAPAS]), [
            { etapa: 'carga', claves: ['p:a'] },
            { etapa: 'organizacion', claves: ['p:a', 'p:c'] },
            { etapa: 'desmonte', claves: ['p:a', 'p:c'] }
        ]);
    });

    it('omite las funciones sin nadie nuevo (no hay asignaciones duplicadas)', () => {
        const destinos: Etapa[] = ['carga', 'desmonte'];
        assert.deepEqual(planDeAsignacion([carla], destinos), [{ etapa: 'desmonte', claves: ['p:c'] }]);
        assert.deepEqual(planDeAsignacion([dario], destinos), []);
    });

    it('con una sola función es una sola solicitud', () => {
        assert.deepEqual(planDeAsignacion([ana, bruno], ['organizacion']), [{ etapa: 'organizacion', claves: ['p:a', 'p:b'] }]);
    });

    it('une los nombres de las funciones para los mensajes', () => {
        assert.equal(unirNombres(['Carga']), 'Carga');
        assert.equal(unirNombres(['Carga', 'Desmonte']), 'Carga y Desmonte');
        assert.equal(unirNombres(['Carga', 'Organización', 'Desmonte']), 'Carga, Organización y Desmonte');
        assert.equal(unirNombres([]), '');
    });
});
