// Pruebas de la lógica de la sección "Disponibilidad del personal" (Numeral 4).
//
// Cubren lo que decide la interfaz sin necesitar navegador: textos, estados, avisos honestos sobre
// el envío, validación del formulario y el HTML de las listas (incluido que se escape lo que viene
// de la base). Los nombres y teléfonos son ficticios.
//
// Ejecutar:  npm run test --workspace apps/web

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    avisoDeConvocatoria,
    escaparHtml,
    etiquetaConvocatoria,
    etiquetaEnvio,
    etiquetaRespuesta,
    formatearFecha,
    formatearTelefono,
    htmlConvocatoria,
    htmlFormulario,
    htmlIndicadores,
    htmlListaConvocatorias,
    htmlTrabajadores,
    iniciales,
    MAX_TRABAJADORES,
    plural,
    puedeEnviar,
    sePuedeMarcarEnBloque,
    sumarResumenes,
    textosConfirmacionEnvio,
    validarFormulario,
    type ConvocatoriaApi,
    type DestinatarioApi,
    type EventoApi,
    type TrabajadorApi
} from '../src/shared/disponibilidadPersonal';

// ---------------------------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------------------------

const destinatario = (nombre: string, extra: Partial<DestinatarioApi> = {}): DestinatarioApi => ({
    trabajadorId: `id-${nombre}`,
    nombre,
    telefono: '+573000000001',
    estadoRespuesta: 'PENDIENTE',
    respondidoEn: null,
    estadoEnvio: 'PENDIENTE',
    enviadoEn: null,
    error: null,
    ...extra
});

/** Una convocatoria con el resumen calculado a partir de sus destinatarios, como lo hace el servidor. */
function convocatoria(extra: Partial<ConvocatoriaApi> = {}, destinatarios: DestinatarioApi[] = [destinatario('Laura'), destinatario('Pedro')]): ConvocatoriaApi {
    const contar = (condicion: (d: DestinatarioApi) => boolean) => destinatarios.filter(condicion).length;
    return {
        id: '11111111-1111-4111-8111-111111111111',
        eventoId: 7,
        cotizacionId: 12,
        nombreEvento: 'Boda',
        fechaEvento: '2026-11-12',
        horaInicio: '18:00',
        horaFin: '23:00',
        lugar: 'Hacienda Los Robles, Chía',
        estado: 'BORRADOR',
        envioIniciadoEn: null,
        creadoEn: '2026-10-12T15:30:00.000Z',
        resumen: {
            total: destinatarios.length,
            confirmados: contar((d) => d.estadoRespuesta === 'CONFIRMADO'),
            rechazados: contar((d) => d.estadoRespuesta === 'RECHAZADO'),
            pendientes: contar((d) => d.estadoRespuesta === 'PENDIENTE'),
            enviados: contar((d) => d.estadoEnvio === 'ENVIADO'),
            conError: contar((d) => d.estadoEnvio === 'ERROR')
        },
        destinatarios,
        ...extra
    };
}

const evento = (extra: Partial<EventoApi> = {}): EventoApi => ({
    cotizacionId: 12,
    convocable: true,
    motivo: null,
    fecha: '2026-11-12',
    horaInicio: '18:00',
    nombre: 'Boda',
    lugar: 'Hacienda Los Robles, Chía',
    requiereHoraInicio: false,
    requiereNombre: false,
    requiereLugar: false,
    ...extra
});

const trabajador = (nombre: string, extra: Partial<TrabajadorApi> = {}): TrabajadorApi => ({
    id: `id-${nombre}`,
    nombre,
    telefono: '+573000000001',
    elegible: true,
    motivo: null,
    noDisponibleEseDia: false,
    ...extra
});

const XSS = '<img src=x onerror=alert(1)>';

// ---------------------------------------------------------------------------------------------

describe('Utilidades de texto', () => {
    it('escapa los caracteres que el navegador interpretaría como HTML', () => {
        assert.equal(escaparHtml(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
        assert.equal(escaparHtml('Laura Pérez'), 'Laura Pérez');
    });

    it('formatea el celular colombiano en grupos y deja los demás como vienen', () => {
        assert.equal(formatearTelefono('+573000000001'), '+57 300 000 0001');
        assert.equal(formatearTelefono('+12025550101'), '+12025550101');
        assert.equal(formatearTelefono(null), 'Sin celular');
        assert.equal(formatearTelefono(''), 'Sin celular');
    });

    it('saca las iniciales de las dos primeras palabras', () => {
        assert.equal(iniciales('laura pérez gómez'), 'LP');
        assert.equal(iniciales('Pedro'), 'P');
        assert.equal(iniciales('   '), '?');
    });

    it('formatea la fecha como el resto de la pantalla (es-CO) y avisa si falta', () => {
        assert.equal(formatearFecha('2026-11-12'), new Date(2026, 10, 12).toLocaleDateString('es-CO'));
        assert.equal(formatearFecha(null), 'Sin fecha');
        assert.equal(formatearFecha('no-es-fecha'), 'Sin fecha');
    });

    it('concuerda el singular y el plural', () => {
        assert.equal(plural(1, 'trabajador', 'trabajadores'), '1 trabajador');
        assert.equal(plural(0, 'trabajador', 'trabajadores'), '0 trabajadores');
        assert.equal(plural(5, 'trabajador', 'trabajadores'), '5 trabajadores');
    });
});

describe('Estados y etiquetas', () => {
    it('cada estado tiene su texto y su color', () => {
        assert.deepEqual(etiquetaConvocatoria('BORRADOR'), { texto: 'Borrador', clase: 'chip-neutro' });
        assert.deepEqual(etiquetaConvocatoria('ENVIANDO'), { texto: 'Envío iniciado', clase: 'chip-proceso' });
        assert.deepEqual(etiquetaConvocatoria('ENVIADA'), { texto: 'Enviada', clase: 'chip-ok' });
        assert.deepEqual(etiquetaConvocatoria('CANCELADA'), { texto: 'Cancelada', clase: 'chip-error' });
        assert.deepEqual(etiquetaRespuesta('CONFIRMADO'), { texto: 'Confirmado', clase: 'chip-ok' });
        assert.deepEqual(etiquetaRespuesta('RECHAZADO'), { texto: 'Rechazado', clase: 'chip-error' });
        assert.deepEqual(etiquetaRespuesta('PENDIENTE'), { texto: 'Pendiente', clase: 'chip-pendiente' });
        assert.deepEqual(etiquetaEnvio('PENDIENTE'), { texto: 'Sin enviar', clase: 'chip-neutro' });
        assert.deepEqual(etiquetaEnvio('ENVIADO'), { texto: 'Enviado', clase: 'chip-ok' });
        assert.deepEqual(etiquetaEnvio('ERROR'), { texto: 'Error de envío', clase: 'chip-error' });
    });

    it('un estado desconocido se muestra tal cual en vez de romper la lista', () => {
        assert.deepEqual(etiquetaRespuesta('OTRO' as never), { texto: 'OTRO', clase: 'chip-neutro' });
        assert.deepEqual(etiquetaEnvio('OTRO' as never), { texto: 'OTRO', clase: 'chip-neutro' });
        assert.deepEqual(etiquetaConvocatoria('OTRO' as never), { texto: 'OTRO', clase: 'chip-neutro' });
    });

    it('suma las respuestas de todas las convocatorias del evento, sin contar las canceladas', () => {
        const a = convocatoria({}, [destinatario('Laura', { estadoRespuesta: 'CONFIRMADO' }), destinatario('Pedro')]);
        const b = convocatoria({ id: 'b' }, [destinatario('Diana', { estadoRespuesta: 'RECHAZADO' })]);
        const cancelada = convocatoria({ id: 'c', estado: 'CANCELADA' }, [destinatario('Eva', { estadoRespuesta: 'CONFIRMADO' })]);
        assert.deepEqual(sumarResumenes([a, b, cancelada]), { total: 3, confirmados: 1, rechazados: 1, pendientes: 1 });
        assert.deepEqual(sumarResumenes([]), { total: 0, confirmados: 0, rechazados: 0, pendientes: 0 });
    });
});

describe('Avisos sobre el envío (no se simula nada)', () => {
    const con = (estado: ConvocatoriaApi['estado'], destinatarios: DestinatarioApi[]) => convocatoria({ estado }, destinatarios);
    const enviado = (nombre: string) => destinatario(nombre, { estadoEnvio: 'ENVIADO', enviadoEn: '2026-10-12T16:00:00.000Z' });
    const conError = (nombre: string) => destinatario(nombre, { estadoEnvio: 'ERROR', error: 'Número sin WhatsApp' });

    it('un borrador dice que todavía no se ha enviado nada', () => {
        const aviso = avisoDeConvocatoria(con('BORRADOR', [destinatario('Laura')]));
        assert.equal(aviso?.tipo, 'info');
        assert.match(aviso?.texto ?? '', /Todavía no se ha enviado ningún mensaje/);
    });

    it('con el envío iniciado pero sin mensajes confirmados NO dice que se envió: avisa que falta confirmación', () => {
        const aviso = avisoDeConvocatoria(con('ENVIANDO', [destinatario('Laura'), destinatario('Pedro')]));
        assert.equal(aviso?.tipo, 'aviso');
        assert.match(aviso?.texto ?? '', /todavía no hay confirmación de que se haya enviado ningún mensaje/);
        assert.doesNotMatch(aviso?.texto ?? '', /fueron enviados/);
    });

    it('mientras envía cuenta solo los mensajes confirmados como enviados', () => {
        const aviso = avisoDeConvocatoria(con('ENVIANDO', [enviado('Laura'), enviado('Pedro'), destinatario('Diana')]));
        assert.equal(aviso?.tipo, 'info');
        assert.equal(aviso?.texto, 'Enviando: 2 de 3 mensajes confirmados como enviados.');
    });

    it('si algún mensaje falló lo advierte', () => {
        const aviso = avisoDeConvocatoria(con('ENVIANDO', [enviado('Laura'), conError('Pedro')]));
        assert.equal(aviso?.tipo, 'aviso');
        assert.match(aviso?.texto ?? '', /1 de 2 mensajes confirmados como enviados; 1 con error/);
    });

    it('solo da por enviada la convocatoria cuando todos los mensajes figuran como enviados', () => {
        assert.deepEqual(avisoDeConvocatoria(con('ENVIADA', [enviado('Laura'), enviado('Pedro')])), {
            tipo: 'ok',
            texto: 'Todos los mensajes fueron enviados.'
        });
        const conFallo = avisoDeConvocatoria(con('ENVIADA', [enviado('Laura'), conError('Pedro')]));
        assert.equal(conFallo?.tipo, 'error');
        assert.match(conFallo?.texto ?? '', /1 mensaje con error/);
        const incompleta = avisoDeConvocatoria(con('ENVIADA', [enviado('Laura'), destinatario('Pedro')]));
        assert.equal(incompleta?.tipo, 'aviso');
        assert.match(incompleta?.texto ?? '', /solo 1 de 2 mensajes/);
    });

    it('una convocatoria cancelada lo indica', () => {
        assert.equal(avisoDeConvocatoria(con('CANCELADA', [destinatario('Laura')]))?.texto, 'Esta convocatoria fue cancelada.');
    });

    it('nunca muestra un aviso de éxito si no hay mensajes confirmados como enviados', () => {
        for (const estado of ['BORRADOR', 'ENVIANDO', 'ENVIADA', 'CANCELADA'] as const) {
            const aviso = avisoDeConvocatoria(con(estado, [destinatario('Laura'), destinatario('Pedro')]));
            assert.notEqual(aviso?.tipo, 'ok', `estado ${estado}`);
        }
    });

    it('solo un borrador con trabajadores se puede enviar', () => {
        assert.equal(puedeEnviar(con('BORRADOR', [destinatario('Laura')])), true);
        assert.equal(puedeEnviar(con('BORRADOR', [])), false);
        for (const estado of ['ENVIANDO', 'ENVIADA', 'CANCELADA'] as const) {
            assert.equal(puedeEnviar(con(estado, [destinatario('Laura')])), false, estado);
        }
    });
});

describe('Confirmación previa al envío', () => {
    const datos = { cantidad: 5, nombreEvento: 'Boda', fecha: '2026-11-12', horaInicio: '18:00', horaFin: '23:00', lugar: 'Hacienda Los Robles' };

    it('muestra la cantidad de destinatarios en el título', () => {
        assert.equal(textosConfirmacionEnvio(datos).titulo, '¿Enviar la solicitud a 5 trabajadores?');
        assert.equal(textosConfirmacionEnvio({ ...datos, cantidad: 1 }).titulo, '¿Enviar la solicitud a 1 trabajador?');
    });

    it('resume el evento, el horario y el lugar, y lo que va a pasar', () => {
        const { html, confirmar } = textosConfirmacionEnvio(datos);
        assert.match(html, /Se les pedirá su disponibilidad para <strong>Boda<\/strong>/);
        assert.match(html, new RegExp(formatearFecha('2026-11-12').replace(/\//g, '\\/')));
        assert.match(html, /de <strong>18:00<\/strong> a <strong>23:00<\/strong> en Hacienda Los Robles/);
        assert.match(html, /iniciará su envío por WhatsApp/);
        assert.equal(confirmar, 'Sí, enviar');
        assert.match(textosConfirmacionEnvio({ ...datos, cantidad: 1 }).html, /Se le pedirá/);
    });

    it('funciona sin nombre ni lugar y escapa lo que viene de la base', () => {
        const sinDatos = textosConfirmacionEnvio({ ...datos, nombreEvento: null, lugar: null });
        assert.match(sinDatos.html, /disponibilidad para el evento el/);
        assert.doesNotMatch(sinDatos.html, / en /);
        const conXss = textosConfirmacionEnvio({ ...datos, nombreEvento: XSS, lugar: XSS });
        assert.doesNotMatch(conXss.html, /<img/);
        assert.match(conXss.html, /&lt;img/);
    });
});

describe('Validación del formulario', () => {
    const entrada = (extra: Partial<Parameters<typeof validarFormulario>[0]> = {}) => ({
        horaInicio: '18:00',
        horaFin: '23:00',
        nombre: '',
        lugar: '',
        seleccionados: ['id-Laura'],
        ...extra
    });
    const error = (e: Partial<Parameters<typeof validarFormulario>[0]>, ev: EventoApi = evento()) => {
        const r = validarFormulario(entrada(e), ev);
        assert.equal(r.ok, false);
        return r.ok ? '' : r.mensaje;
    };

    it('arma la solicitud con lo que el servidor espera', () => {
        const r = validarFormulario(entrada({ seleccionados: ['id-Laura', 'id-Pedro'] }), evento());
        assert.deepEqual(r, {
            ok: true,
            solicitud: { cotizacionId: 12, trabajadorIds: ['id-Laura', 'id-Pedro'], horaFin: '23:00', horaInicio: '18:00' }
        });
    });

    it('no modifica la lista de seleccionados que recibe', () => {
        const seleccionados = ['id-Laura'];
        const r = validarFormulario(entrada({ seleccionados }), evento());
        assert.ok(r.ok);
        if (r.ok) r.solicitud.trabajadorIds.push('otro');
        assert.deepEqual(seleccionados, ['id-Laura']);
    });

    it('exige al menos un trabajador y respeta el máximo del servidor', () => {
        assert.equal(error({ seleccionados: [] }), 'Selecciona al menos un trabajador.');
        const muchos = Array.from({ length: MAX_TRABAJADORES + 1 }, (_, i) => `id-${i}`);
        assert.match(error({ seleccionados: muchos }), /hasta 100 trabajadores/);
        assert.equal(validarFormulario(entrada({ seleccionados: muchos.slice(0, MAX_TRABAJADORES) }), evento()).ok, true);
    });

    it('exige la hora de fin y que las horas tengan formato HH:MM', () => {
        assert.equal(error({ horaFin: '' }), 'Indica la hora de fin del evento.');
        assert.equal(error({ horaFin: '25:00' }), 'La hora de fin no es válida.');
        assert.equal(error({ horaFin: '9:00' }), 'La hora de fin no es válida.');
        assert.equal(error({ horaInicio: '99:99' }), 'La hora de inicio no es válida.');
    });

    it('la hora de fin no puede ser igual a la de inicio (escrita o la que trae el evento)', () => {
        assert.equal(error({ horaInicio: '18:00', horaFin: '18:00' }), 'La hora de fin no puede ser igual a la de inicio.');
        assert.equal(error({ horaInicio: '', horaFin: '18:00' }), 'La hora de fin no puede ser igual a la de inicio.');
    });

    it('sin hora de inicio escrita usa la del evento y no la envía', () => {
        const r = validarFormulario(entrada({ horaInicio: '' }), evento());
        assert.ok(r.ok);
        if (r.ok) assert.equal('horaInicio' in r.solicitud, false);
    });

    it('si la cotización no trae la hora de inicio, la pide', () => {
        const sinHora = evento({ horaInicio: '00:00', requiereHoraInicio: true });
        assert.match(error({ horaInicio: '' }, sinHora), /Indica la hora de inicio/);
        const r = validarFormulario(entrada({ horaInicio: '19:30' }), sinHora);
        assert.ok(r.ok);
        if (r.ok) assert.equal(r.solicitud.horaInicio, '19:30');
    });

    it('pide el nombre y el lugar solo cuando la cotización no los trae, y los limpia de espacios', () => {
        const falta = evento({ nombre: null, lugar: null, requiereNombre: true, requiereLugar: true });
        assert.match(error({ nombre: '   ' }, falta), /nombre del evento/);
        assert.match(error({ nombre: 'Cumpleaños', lugar: '  ' }, falta), /lugar del evento/);
        const r = validarFormulario(entrada({ nombre: '  Cumpleaños de Ana ', lugar: ' Manizales ' }), falta);
        assert.ok(r.ok);
        if (r.ok) assert.deepEqual([r.solicitud.nombreEvento, r.solicitud.lugar], ['Cumpleaños de Ana', 'Manizales']);

        const completo = validarFormulario(entrada({ nombre: 'se ignora', lugar: 'se ignora' }), evento());
        assert.ok(completo.ok);
        if (completo.ok) assert.deepEqual([completo.solicitud.nombreEvento, completo.solicitud.lugar], [undefined, undefined]);
    });
});

describe('HTML de las convocatorias', () => {
    it('muestra los indicadores de confirmados, rechazados y pendientes', () => {
        const html = htmlIndicadores({ confirmados: 2, rechazados: 1, pendientes: 3 });
        assert.match(html, /indicador-confirmado"><strong>2<\/strong><span>Confirmados/);
        assert.match(html, /indicador-rechazado"><strong>1<\/strong><span>Rechazados/);
        assert.match(html, /indicador-pendiente"><strong>3<\/strong><span>Pendientes/);
    });

    it('muestra el estado de la convocatoria y el de cada trabajador (respuesta y envío)', () => {
        const html = htmlConvocatoria(
            convocatoria({ estado: 'ENVIANDO', envioIniciadoEn: '2026-10-12T15:35:00.000Z' }, [
                destinatario('Laura', { estadoRespuesta: 'CONFIRMADO', respondidoEn: '2026-10-12T16:10:00.000Z', estadoEnvio: 'ENVIADO', enviadoEn: '2026-10-12T15:36:00.000Z' }),
                destinatario('Pedro', { estadoRespuesta: 'RECHAZADO', respondidoEn: '2026-10-12T16:20:00.000Z', estadoEnvio: 'ENVIADO', enviadoEn: '2026-10-12T15:36:00.000Z' }),
                destinatario('Diana', { estadoEnvio: 'ERROR', error: 'Número sin WhatsApp' })
            ])
        );
        assert.match(html, /Solicitud de 18:00 a 23:00/);
        assert.match(html, /chip chip-proceso">Envío iniciado/);
        assert.match(html, /<strong>Laura<\/strong>/);
        assert.match(html, /chip chip-ok">Confirmado/);
        assert.match(html, /chip chip-error">Rechazado/);
        assert.match(html, /chip chip-pendiente">Pendiente/);
        assert.match(html, /chip chip-error">Error de envío/);
        assert.match(html, /Número sin WhatsApp/);
        assert.match(html, /\+57 300 000 0001/);
        assert.match(html, /3 trabajadores/);
        assert.match(html, /indicador-confirmado"><strong>1</);
        assert.match(html, /Respondió el /);
    });

    it('con el envío iniciado y nada confirmado no aparece ningún trabajador como enviado', () => {
        const html = htmlConvocatoria(convocatoria({ estado: 'ENVIANDO' }));
        assert.match(html, /todavía no hay confirmación de que se haya enviado ningún mensaje/);
        assert.doesNotMatch(html, /chip chip-ok">Enviado/);
        assert.match(html, /chip chip-neutro">Sin enviar/);
        assert.doesNotMatch(html, /data-accion="enviar"/);
    });

    it('solo el borrador ofrece el botón «Enviar solicitud»', () => {
        assert.match(htmlConvocatoria(convocatoria({ estado: 'BORRADOR' })), /data-accion="enviar"[^>]*>.*Enviar solicitud/);
        for (const estado of ['ENVIANDO', 'ENVIADA', 'CANCELADA'] as const) {
            assert.doesNotMatch(htmlConvocatoria(convocatoria({ estado })), /data-accion="enviar"/, estado);
        }
    });

    it('escapa nombres y errores que vienen de la base', () => {
        const html = htmlConvocatoria(convocatoria({ id: `a"b${XSS}` }, [destinatario(XSS, { estadoEnvio: 'ERROR', error: XSS })]));
        assert.doesNotMatch(html, /<img/);
        assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
        assert.equal(html.includes('data-convocatoria-id="a"b'), false, 'el id no puede cerrar el atributo');
    });

    it('lista las convocatorias o explica que todavía no hay', () => {
        assert.match(htmlListaConvocatorias([]), /Todavía no se ha solicitado la disponibilidad del personal/);
        const dos = htmlListaConvocatorias([convocatoria({ id: 'a' }), convocatoria({ id: 'b' })]);
        assert.equal((dos.match(/class="convocatoria"/g) ?? []).length, 2);
    });
});

describe('HTML del formulario de selección', () => {
    it('una persona que se puede convocar aparece habilitada y marcada si estaba seleccionada', () => {
        const html = htmlTrabajadores([trabajador('Laura'), trabajador('Pedro')], new Set(['id-Laura']));
        assert.match(html, /<input type="checkbox" value="id-Laura" checked>/);
        assert.match(html, /<input type="checkbox" value="id-Pedro">/);
        assert.match(html, /\+57 300 000 0001/);
    });

    it('quien no se puede convocar aparece deshabilitado, con el motivo, y nunca marcado', () => {
        const ya = trabajador('Diego', { elegible: false, motivo: { codigo: 'YA_CONVOCADO', mensaje: 'Ya fue convocado a este evento' } });
        const html = htmlTrabajadores([ya], new Set(['id-Diego']));
        assert.match(html, /trabajador-opcion no-elegible/);
        assert.match(html, /<input type="checkbox" value="id-Diego" disabled>/);
        assert.match(html, /Ya fue convocado a este evento/);
    });

    it('advierte de quien marcó no disponible ese día, pero lo deja elegible', () => {
        const html = htmlTrabajadores([trabajador('Laura', { noDisponibleEseDia: true })]);
        assert.match(html, /No disponible ese día/);
        assert.doesNotMatch(html, /disabled/);
        assert.equal(sePuedeMarcarEnBloque(trabajador('Laura', { noDisponibleEseDia: true })), false, '«Seleccionar todos» no lo marca');
        assert.equal(sePuedeMarcarEnBloque(trabajador('Pedro')), true);
        assert.equal(sePuedeMarcarEnBloque(trabajador('Diego', { elegible: false })), false);
    });

    it('si no hay trabajadores explica cómo crearlos', () => {
        assert.match(htmlTrabajadores([]), /No hay trabajadores registrados/);
    });

    it('escapa los nombres', () => {
        const html = htmlTrabajadores([trabajador(XSS)]);
        assert.doesNotMatch(html, /<img/);
        assert.match(html, /&lt;img/);
    });

    it('el formulario trae los campos que corresponden según lo que falte en la cotización', () => {
        const completo = htmlFormulario(evento(), [trabajador('Laura')]);
        assert.match(completo, /id="dispHoraInicio" value="18:00"/);
        assert.match(completo, /id="dispHoraFin"/);
        assert.doesNotMatch(completo, /id="dispNombre"/);
        assert.doesNotMatch(completo, /id="dispLugar"/);
        for (const id of ['dispTrabajadores', 'dispContador', 'dispSeleccionarTodos', 'dispError', 'dispCancelar', 'dispCerrar', 'dispContinuar']) {
            assert.match(completo, new RegExp(`id="${id}"`), id);
        }
        assert.match(completo, /id="dispContinuar"[^>]*disabled/, 'no se puede continuar sin seleccionar');
        assert.match(completo, /Boda · .* · Hacienda Los Robles, Chía/);

        const faltan = htmlFormulario(evento({ horaInicio: '00:00', requiereHoraInicio: true, nombre: null, requiereNombre: true, lugar: null, requiereLugar: true }), []);
        assert.match(faltan, /id="dispHoraInicio" value=""/);
        assert.match(faltan, /id="dispNombre"/);
        assert.match(faltan, /id="dispLugar"/);
    });

    it('el formulario escapa el resumen del evento', () => {
        assert.doesNotMatch(htmlFormulario(evento({ nombre: XSS, lugar: XSS }), []), /<img/);
    });
});
