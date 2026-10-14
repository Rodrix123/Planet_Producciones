// Sección "Disponibilidad del personal" en el detalle de un evento programado (Numeral 4).
//
// Conecta la lógica de shared/disponibilidadPersonal.ts con la página: consulta las convocatorias
// del evento, abre la ventana para elegir trabajadores, confirma la cantidad de destinatarios y
// llama a los endpoints de /api/convocatorias. Usa los componentes del panel (ventana modal, aviso
// flotante, SweetAlert2 para confirmaciones). No hay actualización automática: los datos cambian
// al abrir el evento, al pulsar "Actualizar" y después de cada acción (el tiempo real es el Numeral 10).
//
// No simula nada: lo que se muestra como enviado o respondido es lo que informa el servidor.

import './shared/disponibilidad.css';
import { apiFetch } from './shared/api';
import { abrirModal, avisar, cerrarModal } from './shared/panelShell';
import {
    escaparHtml,
    htmlFormulario,
    htmlListaConvocatorias,
    htmlTrabajadores,
    plural,
    sePuedeMarcarEnBloque,
    sumarResumenes,
    textosConfirmacionEnvio,
    validarFormulario,
    type ConvocatoriaApi,
    type DatosConfirmacion,
    type EventoApi,
    type SolicitudCrear,
    type TrabajadorApi
} from './shared/disponibilidadPersonal';

declare const Swal: any;

interface CuerpoApi {
    status?: string;
    codigo?: string;
    message?: string;
    detalles?: unknown;
}

const porId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

async function leerJson<T extends CuerpoApi>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------------------------
// Diálogos (SweetAlert2 como en el resto del panel; si no cargó, los del navegador)
// ---------------------------------------------------------------------------------------------

async function confirmar(titulo: string, html: string, textoConfirmar: string): Promise<boolean> {
    if (typeof Swal === 'undefined') return window.confirm(`${titulo}\n\n${html.replace(/<[^>]+>/g, ' ')}`);
    const respuesta = await Swal.fire({
        icon: 'question',
        title: titulo,
        html,
        showCancelButton: true,
        confirmButtonText: textoConfirmar,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#f97316',
        customClass: { popup: 'swal-tema-oscuro' }
    });
    return Boolean(respuesta.isConfirmed);
}

function notificar(icono: 'info' | 'warning' | 'error', titulo: string, texto: string): void {
    if (typeof Swal === 'undefined') {
        window.alert(`${titulo}\n${texto}`);
        return;
    }
    void Swal.fire({
        icon: icono,
        title: titulo,
        html: `<p>${escaparHtml(texto)}</p>`,
        confirmButtonColor: '#f97316',
        customClass: { popup: 'swal-tema-oscuro' }
    });
}

// ---------------------------------------------------------------------------------------------
// Sección
// ---------------------------------------------------------------------------------------------

export interface SeccionDisponibilidad {
    /** Carga y muestra las convocatorias del evento (cotización) indicado. */
    mostrar(cotizacionId: number): Promise<void>;
    /** Vacía la sección al salir del detalle del evento. */
    limpiar(): void;
}

export function iniciarSeccionDisponibilidad(): SeccionDisponibilidad {
    const seccion = porId('seccionDisponibilidad');
    const lista = porId('listaConvocatorias');
    const totales = porId('totalesDisponibilidad');
    const nota = porId('notaDisponibilidad');
    const btnSolicitar = porId<HTMLButtonElement>('btnSolicitarDisponibilidad');
    const btnActualizar = porId<HTMLButtonElement>('btnActualizarDisponibilidad');
    if (!seccion || !lista || !totales || !nota || !btnSolicitar || !btnActualizar) {
        throw new Error('Falta el HTML de la sección de disponibilidad del personal en esta página.');
    }

    let cotizacionId: number | null = null;
    let evento: EventoApi | null = null;
    let convocatorias: ConvocatoriaApi[] = [];
    let generacion = 0; // cambia al abrir otro evento o al salir: las respuestas atrasadas se descartan
    let ocupado = false; // hay un envío en curso: evita el doble clic

    // ----- pintar -----

    function pintarCargando(): void {
        btnSolicitar!.classList.add('hidden');
        btnActualizar!.disabled = true;
        totales!.innerHTML = '';
        nota!.classList.add('hidden');
        lista!.innerHTML = '<p class="disp-cargando"><i class="fa-solid fa-spinner fa-spin"></i> Cargando disponibilidad…</p>';
    }

    function pintarError(mensaje: string): void {
        btnSolicitar!.classList.add('hidden');
        btnActualizar!.disabled = false;
        totales!.innerHTML = '';
        nota!.classList.add('hidden');
        lista!.innerHTML =
            `<p class="disp-error"><i class="fa-solid fa-circle-xmark"></i> ${escaparHtml(mensaje)} ` +
            '<button type="button" class="btn btn-secondary btn-sm" data-accion="reintentar">Reintentar</button></p>';
    }

    function pintar(): void {
        btnActualizar!.disabled = false;
        const datos = evento;
        if (!datos) return;

        btnSolicitar!.classList.toggle('hidden', !datos.convocable);
        if (datos.convocable || !datos.motivo) {
            nota!.classList.add('hidden');
        } else {
            nota!.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>No se puede solicitar la disponibilidad. ${escaparHtml(datos.motivo.mensaje)}.</span>`;
            nota!.classList.remove('hidden');
        }

        const suma = sumarResumenes(convocatorias);
        totales!.innerHTML =
            suma.total > 0
                ? `<span class="chip chip-ok">Confirmados ${suma.confirmados}</span>` +
                  `<span class="chip chip-error">Rechazados ${suma.rechazados}</span>` +
                  `<span class="chip chip-pendiente">Pendientes ${suma.pendientes}</span>`
                : '';
        lista!.innerHTML = htmlListaConvocatorias(convocatorias);
    }

    // ----- cargar -----

    /** Devuelve true si la sección quedó cargada con datos del servidor. */
    async function cargar(): Promise<boolean> {
        const id = cotizacionId;
        if (id === null) return false;
        const miGeneracion = ++generacion;
        pintarCargando();

        let res: Response;
        try {
            res = await apiFetch(`/api/convocatorias?cotizacionId=${id}`);
        } catch (err) {
            if (miGeneracion !== generacion) return false;
            console.error(err);
            pintarError('No se pudo conectar con el servidor para consultar la disponibilidad.');
            return false;
        }
        const cuerpo = await leerJson<CuerpoApi & { evento?: EventoApi; convocatorias?: ConvocatoriaApi[] }>(res);
        if (miGeneracion !== generacion) return false;
        if (!res.ok || !cuerpo?.evento) {
            pintarError(cuerpo?.message ?? 'No se pudo cargar la disponibilidad del personal.');
            return false;
        }
        evento = cuerpo.evento;
        convocatorias = cuerpo.convocatorias ?? [];
        pintar();
        return true;
    }

    // ----- ventana de selección -----

    async function consultarTrabajadores(
        id: number
    ): Promise<{ ok: true; trabajadores: TrabajadorApi[] } | { ok: false; estado: number; mensaje: string }> {
        const res = await apiFetch(`/api/convocatorias/trabajadores?cotizacionId=${id}`);
        const cuerpo = await leerJson<CuerpoApi & { trabajadores?: TrabajadorApi[] }>(res);
        if (!res.ok || !cuerpo?.trabajadores) {
            return { ok: false, estado: res.status, mensaje: cuerpo?.message ?? 'No se pudo cargar la lista de trabajadores.' };
        }
        return { ok: true, trabajadores: cuerpo.trabajadores };
    }

    const modalAbierto = (): boolean => Boolean(porId('modal')?.classList.contains('open'));

    async function abrirFormulario(): Promise<void> {
        const id = cotizacionId;
        const datosEvento = evento;
        if (id === null || !datosEvento || ocupado) return;
        const miGeneracion = generacion;

        abrirModal(
            '<h2>Solicitar disponibilidad de personal</h2>' +
                '<p class="disp-cargando"><i class="fa-solid fa-spinner fa-spin"></i> Cargando trabajadores…</p>' +
                '<div class="modal-acciones"><button type="button" class="btn-secundario" id="dispCancelar">Cancelar</button></div>',
            true
        );
        porId('dispCancelar')?.addEventListener('click', cerrarModal);

        const consulta = await consultarTrabajadores(id);
        // Si mientras tanto cerró la ventana o cambió de evento, no se vuelve a abrir
        if (miGeneracion !== generacion || !modalAbierto()) return;

        if (!consulta.ok) {
            if (consulta.estado === 409) {
                cerrarModal();
                notificar('error', 'No se puede solicitar la disponibilidad', consulta.mensaje);
                await cargar();
                return;
            }
            abrirModal(
                '<h2>Solicitar disponibilidad de personal</h2>' +
                    `<p class="form-error">${escaparHtml(consulta.mensaje)}</p>` +
                    '<div class="modal-acciones"><button type="button" class="btn-secundario" id="dispCancelar">Cerrar</button></div>',
                true
            );
            porId('dispCancelar')?.addEventListener('click', cerrarModal);
            return;
        }

        abrirModal(htmlFormulario(datosEvento, consulta.trabajadores), true);
        conectarFormulario(datosEvento, consulta.trabajadores);
    }

    function conectarFormulario(datosEvento: EventoApi, trabajadoresIniciales: TrabajadorApi[]): void {
        let trabajadores = trabajadoresIniciales;
        const contenedor = porId('dispTrabajadores')!;
        const contador = porId('dispContador')!;
        const continuar = porId<HTMLButtonElement>('dispContinuar')!;
        const todos = porId<HTMLButtonElement>('dispSeleccionarTodos')!;
        const error = porId('dispError')!;

        const casillas = (): HTMLInputElement[] => Array.from(contenedor.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
        const marcados = (): string[] => casillas().filter((c) => c.checked).map((c) => c.value);
        const valor = (id: string): string => porId<HTMLInputElement>(id)?.value ?? '';

        const mostrarError = (mensaje: string): void => {
            error.textContent = mensaje;
            error.hidden = false;
        };
        const ocultarError = (): void => {
            error.hidden = true;
        };
        const actualizarContador = (): void => {
            const cantidad = marcados().length;
            contador.textContent = plural(cantidad, 'seleccionado', 'seleccionados');
            continuar.disabled = ocupado || cantidad === 0;
        };
        const marcarOcupado = (activo: boolean): void => {
            ocupado = activo;
            for (const control of Array.from(porId('modalContenido')?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button') ?? [])) {
                // Las casillas de quien no se puede convocar ya estaban deshabilitadas: no se reactivan
                if (control instanceof HTMLInputElement && control.type === 'checkbox' && control.dataset.fijo === '1') continue;
                control.disabled = activo;
            }
            continuar.innerHTML = activo
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Enviando solicitud…'
                : 'Revisar y enviar';
            if (!activo) actualizarContador();
        };

        // Las casillas deshabilitadas por el servidor se marcan para no habilitarlas al terminar un envío
        const fijarNoElegibles = (): void => {
            for (const casilla of casillas()) {
                if (casilla.disabled) casilla.dataset.fijo = '1';
            }
        };
        fijarNoElegibles();

        contenedor.addEventListener('change', actualizarContador);
        porId('dispCancelar')?.addEventListener('click', cerrarModal);
        porId('dispCerrar')?.addEventListener('click', cerrarModal);
        todos.addEventListener('click', () => {
            const bloque = casillas().filter((casilla) => {
                const trabajador = trabajadores.find((t) => t.id === casilla.value);
                return trabajador !== undefined && sePuedeMarcarEnBloque(trabajador);
            });
            const todosMarcados = bloque.length > 0 && bloque.every((casilla) => casilla.checked);
            bloque.forEach((casilla) => {
                casilla.checked = !todosMarcados;
            });
            actualizarContador();
        });
        actualizarContador();
        (porId('dispHoraFin') ?? porId('dispHoraInicio'))?.focus();

        // Vuelve a pedir la lista (por si otra persona convocó mientras tanto) conservando lo marcado
        async function refrescarTrabajadores(): Promise<void> {
            if (cotizacionId === null) return;
            const previos = new Set(marcados());
            const consulta = await consultarTrabajadores(cotizacionId);
            if (!consulta.ok || !modalAbierto()) return;
            trabajadores = consulta.trabajadores;
            contenedor.innerHTML = htmlTrabajadores(trabajadores, previos);
            fijarNoElegibles();
            actualizarContador();
        }

        continuar.addEventListener('click', async () => {
            if (ocupado) return;
            const validacion = validarFormulario(
                {
                    horaInicio: valor('dispHoraInicio'),
                    horaFin: valor('dispHoraFin'),
                    nombre: valor('dispNombre'),
                    lugar: valor('dispLugar'),
                    seleccionados: marcados()
                },
                datosEvento
            );
            if (!validacion.ok) {
                mostrarError(validacion.mensaje);
                return;
            }
            ocultarError();
            const solicitud = validacion.solicitud;

            const textos = textosConfirmacionEnvio({
                cantidad: solicitud.trabajadorIds.length,
                nombreEvento: solicitud.nombreEvento ?? datosEvento.nombre,
                fecha: datosEvento.fecha,
                horaInicio: solicitud.horaInicio ?? datosEvento.horaInicio,
                horaFin: solicitud.horaFin,
                lugar: solicitud.lugar ?? datosEvento.lugar
            });
            if (!(await confirmar(textos.titulo, textos.html, textos.confirmar))) return;

            marcarOcupado(true);
            try {
                await crearYEnviar(solicitud, mostrarError, refrescarTrabajadores);
            } catch (err) {
                console.error(err);
                mostrarError('No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.');
            } finally {
                if (modalAbierto()) marcarOcupado(false);
                else ocupado = false;
            }
        });
    }

    // ----- crear y enviar -----

    /**
     * Crea la convocatoria y, si se creó, inicia su envío. Si falla la creación, el error se muestra
     * en la ventana (y la ventana sigue abierta). Si se creó pero no pudo iniciar el envío, queda en
     * borrador y se avisa: puede reintentarse desde la lista.
     */
    async function crearYEnviar(
        solicitud: SolicitudCrear,
        mostrarError: (mensaje: string) => void,
        refrescarTrabajadores: () => Promise<void>
    ): Promise<void> {
        const crear = await apiFetch('/api/convocatorias', { method: 'POST', body: JSON.stringify(solicitud) });
        const cuerpoCrear = await leerJson<CuerpoApi & { convocatoria?: ConvocatoriaApi }>(crear);
        if (!crear.ok || !cuerpoCrear?.convocatoria) {
            const mensaje = cuerpoCrear?.message ?? 'No se pudo crear la convocatoria.';
            if (crear.status === 409) {
                // El evento ya no admite convocatorias (se canceló, venció...): se cierra y se actualiza la sección
                cerrarModal();
                notificar('error', 'No se pudo crear la solicitud', mensaje);
                await cargar();
                return;
            }
            mostrarError(mensaje);
            // Algún trabajador dejó de poder convocarse: se actualiza la lista para que se vea quién
            if (crear.status === 422) await refrescarTrabajadores();
            return;
        }

        // La convocatoria ya existe: a partir de aquí se cierra la ventana pase lo que pase
        const convocatoria = cuerpoCrear.convocatoria;
        let resultado: { ok: boolean; mensaje: string };
        try {
            const enviar = await apiFetch(`/api/convocatorias/${convocatoria.id}/enviar`, { method: 'POST' });
            const cuerpoEnviar = await leerJson<CuerpoApi>(enviar);
            resultado = {
                ok: enviar.ok,
                mensaje: cuerpoEnviar?.message ?? (enviar.ok ? 'Envío iniciado.' : 'No se pudo iniciar el envío.')
            };
        } catch (err) {
            console.error(err);
            resultado = { ok: false, mensaje: 'No se pudo conectar con el servidor.' };
        }
        cerrarModal();
        await cargar();
        if (resultado.ok) {
            notificar('info', 'Solicitud registrada', resultado.mensaje);
        } else {
            notificar(
                'warning',
                'La solicitud se creó, pero no se inició el envío',
                `${resultado.mensaje} Queda como borrador: puedes reintentarlo con «Enviar solicitud» en la lista.`
            );
        }
    }

    // ----- enviar un borrador -----

    async function enviarBorrador(id: string): Promise<void> {
        const convocatoria = convocatorias.find((c) => c.id === id);
        if (!convocatoria || ocupado) return;

        const datos: DatosConfirmacion = {
            cantidad: convocatoria.resumen.total,
            nombreEvento: convocatoria.nombreEvento,
            fecha: convocatoria.fechaEvento,
            horaInicio: convocatoria.horaInicio,
            horaFin: convocatoria.horaFin,
            lugar: convocatoria.lugar
        };
        const textos = textosConfirmacionEnvio(datos);
        if (!(await confirmar(textos.titulo, textos.html, textos.confirmar))) return;

        ocupado = true;
        const boton = lista!.querySelector<HTMLButtonElement>(`[data-convocatoria-id="${CSS.escape(id)}"] [data-accion="enviar"]`);
        if (boton) {
            boton.disabled = true;
            boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';
        }
        let resultado: { ok: boolean; mensaje: string };
        try {
            const enviar = await apiFetch(`/api/convocatorias/${encodeURIComponent(id)}/enviar`, { method: 'POST' });
            const cuerpo = await leerJson<CuerpoApi>(enviar);
            resultado = { ok: enviar.ok, mensaje: cuerpo?.message ?? (enviar.ok ? 'Envío iniciado.' : 'No se pudo iniciar el envío.') };
        } catch (err) {
            console.error(err);
            resultado = { ok: false, mensaje: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.' };
        } finally {
            ocupado = false;
        }
        await cargar();
        if (resultado.ok) notificar('info', 'Envío iniciado', resultado.mensaje);
        else notificar('error', 'No se pudo iniciar el envío', resultado.mensaje);
    }

    // ----- eventos de la sección -----

    btnSolicitar.addEventListener('click', () => {
        void abrirFormulario().catch((err) => {
            console.error(err);
            cerrarModal();
            notificar('error', 'Sin conexión', 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.');
        });
    });
    btnActualizar.addEventListener('click', () => {
        void cargar().then((cargada) => {
            if (cargada) avisar('Disponibilidad actualizada');
        });
    });
    lista.addEventListener('click', (evt) => {
        const boton = (evt.target as HTMLElement).closest<HTMLElement>('[data-accion]');
        if (!boton) return;
        if (boton.dataset.accion === 'reintentar') {
            void cargar();
        } else if (boton.dataset.accion === 'enviar') {
            const id = boton.closest<HTMLElement>('[data-convocatoria-id]')?.dataset.convocatoriaId;
            if (id) void enviarBorrador(id);
        }
    });

    return {
        async mostrar(id: number): Promise<void> {
            cotizacionId = id;
            evento = null;
            convocatorias = [];
            await cargar();
        },
        limpiar(): void {
            generacion++;
            cotizacionId = null;
            evento = null;
            convocatorias = [];
            lista.innerHTML = '';
            totales.innerHTML = '';
            nota.classList.add('hidden');
            btnSolicitar.classList.add('hidden');
            cerrarModal();
        }
    };
}
