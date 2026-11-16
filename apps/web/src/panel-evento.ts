// Panel del evento que abre "Asignar personal" en el menú Eventos (eventos.ts). Ocupa el lugar de la
// vista de eventos y se organiza en tres pestañas:
//   Horarios  horario del evento por tipo de actividad (horarios-evento.ts)
//   Personal  la asignación de personal por función (asignacion-personal.ts)
//   Resumen   por ahora solo su estructura, para desarrollarla después
// Cambiar de pestaña solo muestra u oculta cada una: lo que se está editando en las demás se conserva
// hasta volver al evento. Personal se carga la primera vez que se abre su pestaña.

import { abrirAsignacionPersonal, actualizarAsignacionPersonal, cerrarAsignacionPersonal } from './asignacion-personal';
import { abrirHorarios, actualizarEventoHorarios, cerrarHorarios } from './horarios-evento';
import { htmlEncabezadoEvento } from './shared/encabezadoEvento';
import type { EventoDto } from './shared/etapasPersonal';

export type Pestana = 'horarios' | 'personal' | 'resumen';
const PESTANAS: readonly Pestana[] = ['horarios', 'personal', 'resumen'];

export interface OpcionesPanelEvento {
    /** Aviso flotante de la página. */
    avisar: (mensaje: string) => void;
    /** Al volver al evento; `huboCambios` indica si hay que refrescar la lista de eventos. */
    alCerrar: (huboCambios: boolean) => void | Promise<void>;
}

const panel = document.getElementById('panelAsignacion') as HTMLElement;
const botones = [...panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const vistas: Record<Pestana, HTMLElement> = {
    horarios: document.getElementById('vistaHorarios') as HTMLElement,
    personal: document.getElementById('vistaPersonal') as HTMLElement,
    resumen: document.getElementById('vistaResumen') as HTMLElement
};
/** Título de cada pestaña: recibe el foco al entrar en ella desde un botón del panel. */
const TITULO: Record<Pestana, string> = { horarios: 'horTitulo', personal: 'asigTitulo', resumen: 'resTitulo' };

let eventoId = 0;
let opciones: OpcionesPanelEvento = { avisar: () => undefined, alCerrar: () => undefined };
let personalAbierto = false;
let huboCambios = false;
let evento: EventoDto | null = null;

// ---------- Resumen (estructura) ----------
function pintarResumen(): void {
    vistas.resumen.innerHTML = `
        ${htmlEncabezadoEvento({ idTitulo: 'resTitulo', idSub: 'resSub', titulo: 'Resumen del evento', icono: 'fa-solid fa-list-check', evento })}
        <div class="res-cuerpo">
            <section class="res-seccion" id="resHorario" aria-labelledby="resTituloHorario">
                <h3 id="resTituloHorario"><i class="fa-regular fa-clock" aria-hidden="true"></i> Horario</h3>
                <p class="res-vacio">Disponible próximamente.</p>
            </section>
            <section class="res-seccion" id="resPersonal" aria-labelledby="resTituloPersonal">
                <h3 id="resTituloPersonal"><i class="fa-solid fa-users" aria-hidden="true"></i> Personal</h3>
                <p class="res-vacio">Disponible próximamente.</p>
            </section>
        </div>`;
}

/** Datos nuevos del evento desde cualquier pestaña. */
function alCambiarEvento(e: EventoDto): void {
    evento = e;
    pintarResumen();
}

// ---------- Pestañas ----------
function activar(pestana: Pestana, foco: 'pestana' | 'titulo'): void {
    for (const boton of botones) {
        const elegida = boton.dataset.pestana === pestana;
        boton.setAttribute('aria-selected', String(elegida));
        boton.tabIndex = elegida ? 0 : -1;
    }
    for (const p of PESTANAS) vistas[p].hidden = p !== pestana;

    if (pestana === 'personal' && !personalAbierto) {
        personalAbierto = true;
        abrirAsignacionPersonal(eventoId, {
            avisar: opciones.avisar,
            alCerrar: (cambios) => {
                huboCambios ||= cambios;
                cerrar();
            },
            alActualizar: (respuesta) => {
                huboCambios = true;
                actualizarEventoHorarios(respuesta.evento);
                alCambiarEvento(respuesta.evento);
            },
            irAHorarios: () => activar('horarios', 'titulo')
        });
    }

    if (foco === 'pestana') botones.find((b) => b.dataset.pestana === pestana)?.focus();
    else document.getElementById(TITULO[pestana])?.focus();
}

function cerrar(): void {
    if (panel.hidden) return;
    cerrarHorarios();
    if (personalAbierto) cerrarAsignacionPersonal();
    personalAbierto = false;
    vistas.resumen.innerHTML = '';
    panel.hidden = true;
    void opciones.alCerrar(huboCambios);
}

panel.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const pestana = t.closest<HTMLElement>('[role="tab"]')?.dataset.pestana as Pestana | undefined;
    if (pestana) {
        activar(pestana, 'pestana');
        return;
    }
    if (t.closest('[data-panel-volver]')) cerrar();
});

// Teclado de las pestañas (patrón de pestañas de WAI-ARIA): flechas, Inicio y Fin.
panel.querySelector('[role="tablist"]')?.addEventListener('keydown', (ev) => {
    const tecla = (ev as KeyboardEvent).key;
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement);
    if (actual < 0) return;
    const destino =
        tecla === 'ArrowRight' ? (actual + 1) % botones.length
            : tecla === 'ArrowLeft' ? (actual - 1 + botones.length) % botones.length
                : tecla === 'Home' ? 0
                    : tecla === 'End' ? botones.length - 1
                        : -1;
    if (destino < 0) return;
    ev.preventDefault();
    activar(botones[destino].dataset.pestana as Pestana, 'pestana');
});

/** Abre el panel de un evento en la pestaña Horarios. Quien llama oculta la vista de eventos. */
export function abrirPanelEvento(id: number, opts: OpcionesPanelEvento): void {
    eventoId = id;
    opciones = opts;
    personalAbierto = false;
    huboCambios = false;
    evento = null;
    panel.hidden = false;
    abrirHorarios(id, {
        avisar: opts.avisar,
        alCancelar: cerrar,
        alCargarEvento: alCambiarEvento,
        alGuardar: (respuesta) => {
            huboCambios = true;
            if (personalAbierto) actualizarAsignacionPersonal(respuesta);
        },
        alContinuar: () => activar('personal', 'titulo')
    });
    pintarResumen();
    activar('horarios', 'titulo');
}
