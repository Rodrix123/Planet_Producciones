// Pruebas de la lógica del panel de consulta y del Excel compartido con el cotizador. Son
// funciones puras: no necesitan navegador ni servidor.
//
// Ejecutar:  npm run test --workspace apps/web

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    categoriasDeServicios,
    contarResultados,
    filtrarClientes,
    filtrarServicios,
    historialReciente,
    paginar,
    paginasVisibles,
    plural,
    type ServicioCotizado,
    formatearFechaCorta,
    formatearHora,
    hayFiltros,
    hayFiltrosDeRegistro,
    iniciales,
    lugarTexto,
    normalizarTexto,
    partesDeFecha,
    proximoEvento,
    revisarTotal,
    separarRegistros,
    type ClienteConsulta,
    type EstadoCotizacion,
    type FiltrosConsulta,
    type RegistroConsulta
} from '../src/shared/consultaDatos';
import { construirFilasExcel, formatearItemsParaMostrar } from '../src/shared/cotizacionExcel';

const SIN_FILTROS: FiltrosConsulta = { nombre: '', estado: '', desde: '', hasta: '' };

let siguienteId = 1;

function registro(estado: EstadoCotizacion, fecha: string | null, conEvento = true): RegistroConsulta {
    const cotizacionId = siguienteId++;
    return {
        cotizacionId,
        numeroReferencia: `PL-2026-${cotizacionId}`,
        estado,
        total: 1000000,
        creadaEn: '2026-06-01T12:00:00Z',
        tipoEvento: 'Grado',
        fecha,
        hora: '19:00:00',
        lugar: null,
        ciudad: null,
        direccion: null,
        transporte: null,
        evento: conEvento ? {
            id: cotizacionId,
            confirmado: estado === 'programada',
            pagoInicial: false,
            totalPagado: 0,
            contratoEnviadoEn: null,
            contratoFirmadoSubidoEn: null,
            tieneContratoFirmado: false
        } : null
    };
}

function cliente(nombre: string, registros: RegistroConsulta[] = []): ClienteConsulta {
    return { id: siguienteId++, nombre, correo: null, telefono: null, documento: null, registros };
}

const maria = cliente('María José Núñez', [
    registro('programada', '2026-03-10'),
    registro('contrato_enviado', '2026-04-20'),
    registro('recibida', null, false)
]);
const pedro = cliente('Pedro Gómez', [registro('programada', '2026-04-20')]);
const luisa = cliente('Luisa Rojas', [registro('en_revision', '2026-05-05', false)]);
const sinNada = cliente('Andrés Sin Cotizaciones');
const TODOS = [maria, pedro, luisa, sinNada];

const nombres = (clientes: ClienteConsulta[]) => clientes.map((c) => c.nombre);

describe('Búsqueda por nombre', () => {
    it('sin filtros devuelve a todos, también a quien no tiene registros', () => {
        assert.deepEqual(filtrarClientes(TODOS, SIN_FILTROS), TODOS);
    });

    it('encuentra por parte del nombre', () => {
        assert.deepEqual(nombres(filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'gómez' })), ['Pedro Gómez']);
    });

    it('no distingue mayúsculas, tildes ni eñes', () => {
        for (const nombre of ['MARIA', 'maría', 'nunez', 'NÚÑEZ']) {
            assert.deepEqual(nombres(filtrarClientes(TODOS, { ...SIN_FILTROS, nombre })), ['María José Núñez'], nombre);
        }
    });

    it('ignora espacios de más', () => {
        assert.deepEqual(nombres(filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: '  maria   jose ' })), ['María José Núñez']);
    });

    it('conserva todos los registros del cliente encontrado', () => {
        const [encontrado] = filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'maria' });
        assert.equal(encontrado?.registros.length, 3);
    });

    it('incluye clientes sin registros', () => {
        assert.deepEqual(nombres(filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'andres' })), ['Andrés Sin Cotizaciones']);
    });

    it('un nombre que no existe no devuelve nada', () => {
        assert.deepEqual(filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'zzz' }), []);
    });
});

describe('Filtro por estado', () => {
    it('deja solo a los clientes con ese estado y solo esos registros', () => {
        const resultado = filtrarClientes(TODOS, { ...SIN_FILTROS, estado: 'programada' });
        assert.deepEqual(nombres(resultado), ['María José Núñez', 'Pedro Gómez']);
        assert.equal(resultado[0]?.registros.length, 1);
        assert.equal(resultado[0]?.registros[0]?.estado, 'programada');
    });

    it('oculta a quien no tiene registros', () => {
        const resultado = nombres(filtrarClientes(TODOS, { ...SIN_FILTROS, estado: 'recibida' }));
        assert.ok(!resultado.includes('Andrés Sin Cotizaciones'));
    });

    it('un estado sin coincidencias no devuelve nada', () => {
        assert.deepEqual(filtrarClientes(TODOS, { ...SIN_FILTROS, estado: 'cancelada' }), []);
    });
});

describe('Filtro por fecha', () => {
    it('una fecha exacta se busca poniendo el mismo día en inicio y final', () => {
        const resultado = filtrarClientes(TODOS, { ...SIN_FILTROS, desde: '2026-04-20', hasta: '2026-04-20' });
        assert.deepEqual(nombres(resultado), ['María José Núñez', 'Pedro Gómez']);
        assert.equal(resultado[0]?.registros.length, 1);
    });

    it('solo inicio, inclusive', () => {
        assert.deepEqual(nombres(filtrarClientes(TODOS, { ...SIN_FILTROS, desde: '2026-05-05' })), ['Luisa Rojas']);
    });

    it('solo final, inclusive', () => {
        const resultado = filtrarClientes(TODOS, { ...SIN_FILTROS, hasta: '2026-03-10' });
        assert.deepEqual(nombres(resultado), ['María José Núñez']);
        assert.equal(resultado[0]?.registros.length, 1);
    });

    it('lo que no tiene fecha se oculta con un rango activo', () => {
        const [encontrado] = filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'maria', desde: '2020-01-01' });
        assert.ok(encontrado?.registros.every((r) => r.fecha !== null));
    });

    it('un rango invertido no devuelve nada', () => {
        assert.deepEqual(filtrarClientes(TODOS, { ...SIN_FILTROS, desde: '2026-12-31', hasta: '2026-01-01' }), []);
    });
});

describe('Filtros combinados', () => {
    it('nombre + estado', () => {
        const resultado = filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'pedro', estado: 'programada' });
        assert.deepEqual(nombres(resultado), ['Pedro Gómez']);
    });

    it('nombre + fecha', () => {
        const resultado = filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'maria', desde: '2026-04-01', hasta: '2026-04-30' });
        assert.deepEqual(resultado[0]?.registros.map((r) => r.fecha), ['2026-04-20']);
    });

    it('estado + fecha se exigen sobre el mismo registro', () => {
        // María tiene "programada" en marzo y otro evento en abril: no es "programada en abril".
        const resultado = filtrarClientes(TODOS, { ...SIN_FILTROS, estado: 'programada', desde: '2026-04-01', hasta: '2026-04-30' });
        assert.deepEqual(nombres(resultado), ['Pedro Gómez']);
    });

    it('nombre + estado + fecha', () => {
        const filtros = { nombre: 'nunez', estado: 'contrato_enviado', desde: '2026-04-01', hasta: '2026-04-30' };
        const resultado = filtrarClientes(TODOS, filtros);
        assert.equal(resultado.length, 1);
        assert.equal(resultado[0]?.registros.length, 1);
    });

    it('si un filtro no coincide, la combinación queda vacía', () => {
        assert.deepEqual(filtrarClientes(TODOS, { ...SIN_FILTROS, nombre: 'pedro', estado: 'recibida' }), []);
    });

    it('filtrar no altera los datos cargados', () => {
        const antes = JSON.stringify(TODOS);
        filtrarClientes(TODOS, { nombre: 'maria', estado: 'programada', desde: '2026-01-01', hasta: '2026-12-31' });
        assert.equal(JSON.stringify(TODOS), antes);
    });

    it('limpiar la búsqueda vuelve al listado completo', () => {
        assert.equal(hayFiltros(SIN_FILTROS), false);
        assert.deepEqual(filtrarClientes(TODOS, SIN_FILTROS), TODOS);
    });

    it('sabe cuándo hay filtros activos y cuáles buscan registros', () => {
        assert.equal(hayFiltros({ ...SIN_FILTROS, nombre: '   ' }), false);
        assert.equal(hayFiltros({ ...SIN_FILTROS, nombre: 'ana' }), true);
        assert.equal(hayFiltrosDeRegistro({ ...SIN_FILTROS, nombre: 'ana' }), false);
        assert.equal(hayFiltrosDeRegistro({ ...SIN_FILTROS, hasta: '2026-01-01' }), true);
    });
});

describe('Resumen por cliente', () => {
    it('separa eventos de cotizaciones sin evento', () => {
        const { eventos, cotizaciones } = separarRegistros(maria);
        assert.equal(eventos.length, 2);
        assert.equal(cotizaciones.length, 1);
    });

    it('cuenta los resultados', () => {
        assert.deepEqual(contarResultados(TODOS), { clientes: 4, eventos: 3, cotizaciones: 2 });
    });

    it('el próximo evento es el primero de hoy en adelante, sin contar cotizaciones', () => {
        assert.equal(proximoEvento(maria, '2026-04-01')?.fecha, '2026-04-20');
        assert.equal(proximoEvento(maria, '2026-04-20')?.fecha, '2026-04-20');
        assert.equal(proximoEvento(maria, '2026-04-21'), null);
        assert.equal(proximoEvento(luisa, '2026-01-01'), null);
    });
});

describe('Total registrado frente a los servicios', () => {
    const servicios = [{ precioUnit: 100000, cantidad: 2 }, { precioUnit: 50000, cantidad: 1 }];

    it('cuadra con servicios y transporte', () => {
        assert.equal(revisarTotal(servicios, 30000, 280000), 'cuadra');
    });

    it('tolera diferencias de centavos', () => {
        assert.equal(revisarTotal(servicios, 0, 250000.4), 'cuadra');
    });

    it('avisa si los precios vigentes ya no suman el total', () => {
        assert.equal(revisarTotal(servicios, 0, 300000), 'no_cuadra');
    });

    it('avisa si hay total pero no hay servicios guardados', () => {
        assert.equal(revisarTotal([], 0, 1500000), 'sin_servicios');
        assert.equal(revisarTotal([], 200000, 1500000), 'sin_servicios');
    });

    it('una cotización de solo transporte cuadra', () => {
        assert.equal(revisarTotal([], 200000, 200000), 'cuadra');
    });

    it('sin servicios ni total no hay nada que avisar', () => {
        assert.equal(revisarTotal([], 0, 0), 'cuadra');
    });
});

describe('Presentación', () => {
    it('normaliza texto', () => {
        assert.equal(normalizarTexto('  ÁNGEL   Ñuño '), 'angel nuno');
    });

    it('sin hora muestra "Hora por definir"', () => {
        assert.equal(formatearHora(null), 'Hora por definir');
    });

    it('formatea la hora en formato de 12 horas', () => {
        assert.match(formatearHora('19:30:00'), /^7:30/);
    });

    it('la fecha no se corre de día por la zona horaria', () => {
        assert.equal(partesDeFecha('2026-12-01').dia, '1');
        assert.match(formatearFechaCorta('2026-12-31'), /^31 /);
    });

    it('un registro sin fecha lo dice', () => {
        assert.deepEqual(partesDeFecha(null), { dia: '—', resto: 'sin fecha' });
    });

    it('iniciales del nombre', () => {
        assert.equal(iniciales('María José Núñez'), 'MJ');
        assert.equal(iniciales('Ana'), 'A');
        assert.equal(iniciales('   '), '?');
    });

    it('lugar con ciudad, solo lugar o sin definir', () => {
        const base = registro('recibida', null);
        assert.equal(lugarTexto({ ...base, lugar: 'Hacienda', ciudad: 'Manizales' }), 'Hacienda · Manizales');
        assert.equal(lugarTexto({ ...base, lugar: 'Finca' }), 'Finca');
        assert.equal(lugarTexto(base), 'Lugar por definir');
    });
});

describe('Excel compartido con el cotizador', () => {
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const datos = { nombre: 'Ana Pérez', correo: 'ana@ejemplo.test', telefono: '3000000000', tipoEvento: 'Grado', lugar: 'Hacienda' };

    it('multiplica por la cantidad y nombra la cantidad', () => {
        const [item] = formatearItemsParaMostrar(formatter, [
            { variantId: 1, cantidad: 3, tag: 'SONIDO', nombre: 'Cabina', descripcion: '', precioUnit: 100000 }
        ]);
        assert.equal(item?.precio, 300000);
        assert.ok(item?.nombre.startsWith('3 x Cabina ('));
    });

    it('un solo ítem conserva su nombre', () => {
        const [item] = formatearItemsParaMostrar(formatter, [
            { variantId: 1, cantidad: 1, tag: 'SONIDO', nombre: 'Cabina', descripcion: '', precioUnit: 100000 }
        ]);
        assert.equal(item?.nombre, 'Cabina');
    });

    it('arma la hoja con la misma estructura de siempre', () => {
        const filas = construirFilasExcel(datos, [
            { tag: 'SONIDO', nombre: 'Cabina', descripcion: 'Micrófono', precio: 100000 },
            { tag: 'LUCES', nombre: 'Par LED', descripcion: '', precio: 50000 }
        ], 150000, 'PL-2026-0001', '01/06/2026');

        assert.deepEqual(filas[1], ['COTIZACIÓN OFICIAL: PL-2026-0001', '', '', 'FECHA: 01/06/2026']);
        assert.deepEqual(filas[4], ['Cliente:', 'Ana Pérez', 'Tipo Evento:', 'Grado']);
        assert.deepEqual(filas[9], ['Item', 'Categoría', 'Servicio / Descripción', 'Valor COP']);
        assert.deepEqual(filas[10], [1, 'SONIDO', 'Cabina — Incluye: Micrófono', 100000]);
        assert.deepEqual(filas[11], [2, 'LUCES', 'Par LED', 50000]);
        assert.deepEqual(filas[filas.length - 1], ['', '', 'TOTAL PRESUPUESTO ESTIMADO:', 150000]);
    });

    it('sin servicios conserva el total registrado', () => {
        const filas = construirFilasExcel(datos, [], 1500000, 'PL-2026-0002', '01/06/2026');
        assert.deepEqual(filas[filas.length - 1], ['', '', 'TOTAL PRESUPUESTO ESTIMADO:', 1500000]);
    });

    it('rellena lo que falta como siempre', () => {
        const filas = construirFilasExcel({ ...datos, tipoEvento: '', lugar: '' }, [], 0, 'PL', 'hoy');
        assert.equal(filas[4]?.[3], 'N/A');
        assert.equal(filas[5]?.[3], 'Por definir');
    });
});

// ---------- Servicios del detalle (tabla con búsqueda, categorías y páginas) ----------

function servicio(nombre: string, tag: string, extra: Partial<ServicioCotizado> = {}): ServicioCotizado {
    return { variantId: siguienteId++, cantidad: 1, tag, nombre, descripcion: '', precioUnit: 100000, ...extra };
}

const SERVICIOS = [
    servicio('Par LED', 'ILUMINACIÓN', { descripcion: 'Control DMX', cantidad: 8 }),
    servicio('Cabeza móvil', 'ILUMINACIÓN'),
    servicio('Sistema line array', 'SONIDO PROFESIONAL', { descripcion: 'Consola digital y micrófonos' }),
    servicio('Cabina activa', 'SONIDO PROFESIONAL', { nota: 'El cliente pide color negro' }),
    servicio('Máquina de humo', 'EFECTOS ESPECIALES')
];

describe('Categorías de los servicios', () => {
    it('cuenta los servicios por categoría en orden alfabético', () => {
        assert.deepEqual(categoriasDeServicios(SERVICIOS), [
            { categoria: 'EFECTOS ESPECIALES', cantidad: 1 },
            { categoria: 'ILUMINACIÓN', cantidad: 2 },
            { categoria: 'SONIDO PROFESIONAL', cantidad: 2 }
        ]);
    });

    it('sin servicios no hay categorías', () => {
        assert.deepEqual(categoriasDeServicios([]), []);
    });
});

describe('Búsqueda de servicios', () => {
    const buscar = (texto: string, categoria = '') => filtrarServicios(SERVICIOS, { texto, categoria }).map((s) => s.nombre);

    it('sin filtros devuelve todos', () => {
        assert.equal(buscar('').length, SERVICIOS.length);
    });

    it('busca sin importar tildes ni mayúsculas', () => {
        assert.deepEqual(buscar('MAQUINA'), ['Máquina de humo']);
        assert.deepEqual(buscar('móvil'), ['Cabeza móvil']);
    });

    it('busca en la descripción, la categoría y la nota', () => {
        assert.deepEqual(buscar('dmx'), ['Par LED']);
        assert.deepEqual(buscar('efectos'), ['Máquina de humo']);
        assert.deepEqual(buscar('negro'), ['Cabina activa']);
    });

    it('con varias palabras, todas deben aparecer en cualquier orden', () => {
        assert.deepEqual(buscar('led par'), ['Par LED']);
        assert.deepEqual(buscar('cabina azul'), []);
    });

    it('filtra por categoría', () => {
        assert.deepEqual(buscar('', 'ILUMINACIÓN'), ['Par LED', 'Cabeza móvil']);
    });

    it('combina búsqueda y categoría', () => {
        assert.deepEqual(buscar('cab', 'SONIDO PROFESIONAL'), ['Cabina activa']);
        assert.deepEqual(buscar('cab', 'ILUMINACIÓN'), ['Cabeza móvil']);
    });

    it('no altera la lista original', () => {
        const antes = JSON.stringify(SERVICIOS);
        filtrarServicios(SERVICIOS, { texto: 'led', categoria: 'ILUMINACIÓN' });
        assert.equal(JSON.stringify(SERVICIOS), antes);
    });
});

describe('Paginación de 10 en 10', () => {
    const cientos = Array.from({ length: 253 }, (_, i) => servicio(`Servicio ${i + 1}`, `CAT ${i % 6}`));

    it('cientos de servicios: la primera página trae 10', () => {
        const p = paginar(cientos, 1);
        assert.equal(p.elementos.length, 10);
        assert.equal(p.totalPaginas, 26);
        assert.deepEqual([p.desde, p.hasta, p.total], [1, 10, 253]);
    });

    it('la última página trae lo que sobra', () => {
        const p = paginar(cientos, 26);
        assert.equal(p.elementos.length, 3);
        assert.deepEqual([p.desde, p.hasta], [251, 253]);
        assert.equal(p.elementos[0]?.nombre, 'Servicio 251');
    });

    it('una página fuera de rango se ajusta', () => {
        assert.equal(paginar(cientos, 99).pagina, 26);
        assert.equal(paginar(cientos, 0).pagina, 1);
        assert.equal(paginar(cientos, Number.NaN).pagina, 1);
    });

    it('sin elementos hay una sola página vacía', () => {
        const p = paginar([], 3);
        assert.deepEqual([p.pagina, p.totalPaginas, p.total, p.desde, p.hasta], [1, 1, 0, 0, 0]);
    });

    it('filtrar y paginar juntos', () => {
        const filtrados = filtrarServicios(cientos, { texto: '', categoria: 'CAT 0' });
        const p = paginar(filtrados, 5);
        assert.equal(filtrados.length, 43);
        assert.equal(p.totalPaginas, 5);
        assert.equal(p.elementos.length, 3);
    });
});

describe('Botones de página', () => {
    it('con pocas páginas se muestran todas', () => {
        assert.deepEqual(paginasVisibles(1, 1), [1]);
        assert.deepEqual(paginasVisibles(3, 7), [1, 2, 3, 4, 5, 6, 7]);
    });

    it('al inicio: primeras páginas, salto y la última', () => {
        assert.deepEqual(paginasVisibles(1, 26), [1, 2, 3, 4, null, 26]);
    });

    it('en medio: la primera, las vecinas y la última', () => {
        assert.deepEqual(paginasVisibles(12, 26), [1, null, 11, 12, 13, null, 26]);
    });

    it('al final: la primera, salto y las últimas', () => {
        assert.deepEqual(paginasVisibles(26, 26), [1, null, 23, 24, 25, 26]);
    });

    it('un hueco de una sola página muestra el número en vez del salto', () => {
        assert.deepEqual(paginasVisibles(4, 26), [1, 2, 3, 4, 5, null, 26]);
    });
});

describe('Historial', () => {
    it('ordena de lo más reciente a lo más antiguo sin cambiar el original', () => {
        const historial = [
            { creadoEn: '2026-10-02T15:00:00Z', id: 'a' },
            { creadoEn: '2026-10-05T15:00:00Z', id: 'b' },
            { creadoEn: '2026-10-03T15:00:00Z', id: 'c' }
        ];
        assert.deepEqual(historialReciente(historial).map((h) => h.id), ['b', 'c', 'a']);
        assert.deepEqual(historial.map((h) => h.id), ['a', 'b', 'c']);
    });

    it('plural', () => {
        assert.equal(plural(1, 'servicio', 'servicios'), '1 servicio');
        assert.equal(plural(0, 'servicio', 'servicios'), '0 servicios');
    });
});
