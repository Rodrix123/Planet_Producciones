// Menú desplegable de una sola opción: un botón que muestra lo elegido y una lista que se abre
// encima del contenido (no lo desplaza). Se usa en el panel "Asignar personal" para elegir qué
// personas mostrar, porque un <select> nativo no admite íconos ni el aspecto del panel.
//
// - htmlDesplegable: lo pinta.
// - actualizarDesplegable: cambia los textos o la opción elegida sin volver a pintarlo.
// - conectarDesplegables: maneja clic y teclado (flechas, Inicio, Fin, Enter, Espacio, Escape) de
//   todos los desplegables que haya dentro de un contenedor, y lo cierra al salir de él.

import { esc } from './panelShell';

export interface OpcionDesplegable<V extends string = string> {
    valor: V;
    texto: string;
    /** Clases del ícono de la opción (Font Awesome). La opción elegida muestra una marca en su lugar. */
    icono: string;
}

const ICONO_ELEGIDA = 'fa-solid fa-check';

const idOpcion = (id: string, valor: string): string => `${id}-opcion-${valor}`;

function htmlOpcion(id: string, o: OpcionDesplegable, elegida: boolean): string {
    return `
        <li class="desplegable-opcion" role="option" id="${esc(idOpcion(id, o.valor))}" data-desplegable-valor="${esc(o.valor)}" aria-selected="${elegida}">
            <span class="desplegable-icono" aria-hidden="true"><i class="${esc(elegida ? ICONO_ELEGIDA : o.icono)}"></i></span>
            <span class="desplegable-texto">${esc(o.texto)}</span>
        </li>`;
}

/** `rotulo` es el nombre accesible ("Mostrar"); la primera opción se toma como la de por defecto. */
export function htmlDesplegable(id: string, rotulo: string, opciones: OpcionDesplegable[], valor: string): string {
    const actual = opciones.find((o) => o.valor === valor) ?? opciones[0];
    return `
        <div class="desplegable${actual.valor !== opciones[0].valor ? ' cambiado' : ''}" data-desplegable="${esc(id)}">
            <button type="button" class="desplegable-boton" id="${esc(id)}" aria-haspopup="listbox" aria-expanded="false"
                    aria-controls="${esc(id)}-opciones" aria-label="${esc(`${rotulo}: ${actual.texto}`)}" data-rotulo="${esc(rotulo)}">
                <span class="desplegable-valor">${esc(actual.texto)}</span>
                <i class="fa-solid fa-chevron-down desplegable-flecha" aria-hidden="true"></i>
            </button>
            <ul class="desplegable-opciones" id="${esc(id)}-opciones" role="listbox" tabindex="-1" aria-label="${esc(rotulo)}" hidden>
                ${opciones.map((o) => htmlOpcion(id, o, o.valor === actual.valor)).join('')}
            </ul>
        </div>`;
}

/** Pone los textos de las opciones y marca la elegida, aunque el menú esté abierto. */
export function actualizarDesplegable(id: string, opciones: OpcionDesplegable[], valor: string): void {
    const boton = document.getElementById(id);
    const caja = boton?.closest<HTMLElement>('[data-desplegable]');
    if (!boton || !caja) return;
    const actual = opciones.find((o) => o.valor === valor) ?? opciones[0];
    caja.querySelector('.desplegable-valor')!.textContent = actual.texto;
    boton.setAttribute('aria-label', `${boton.dataset.rotulo ?? ''}: ${actual.texto}`);
    caja.classList.toggle('cambiado', actual.valor !== opciones[0].valor);
    for (const o of opciones) {
        const li = document.getElementById(idOpcion(id, o.valor));
        if (!li) continue;
        const elegida = o.valor === actual.valor;
        li.setAttribute('aria-selected', String(elegida));
        li.querySelector('.desplegable-texto')!.textContent = o.texto;
        li.querySelector('.desplegable-icono i')!.className = elegida ? ICONO_ELEGIDA : o.icono;
    }
}

// ---------- Comportamiento ----------
const partes = (caja: HTMLElement) => ({
    boton: caja.querySelector<HTMLButtonElement>('.desplegable-boton')!,
    lista: caja.querySelector<HTMLElement>('.desplegable-opciones')!
});
const opcionesDe = (lista: HTMLElement): HTMLElement[] => [...lista.querySelectorAll<HTMLElement>('[role="option"]')];

function resaltar(lista: HTMLElement, opcion: HTMLElement | undefined): void {
    if (!opcion) return;
    opcionesDe(lista).forEach((o) => o.classList.toggle('resaltada', o === opcion));
    lista.setAttribute('aria-activedescendant', opcion.id);
    opcion.scrollIntoView({ block: 'nearest' });
}

function abrir(caja: HTMLElement): void {
    const { boton, lista } = partes(caja);
    boton.setAttribute('aria-expanded', 'true');
    caja.classList.add('abierto');
    lista.hidden = false;
    resaltar(lista, lista.querySelector<HTMLElement>('[aria-selected="true"]') ?? opcionesDe(lista)[0]);
    lista.focus();
}

function cerrar(caja: HTMLElement, devolverFoco: boolean): void {
    const { boton, lista } = partes(caja);
    if (lista.hidden) return;
    boton.setAttribute('aria-expanded', 'false');
    caja.classList.remove('abierto');
    lista.hidden = true;
    lista.removeAttribute('aria-activedescendant');
    if (devolverFoco) boton.focus();
}

/**
 * Activa todos los desplegables de `raiz` (también los que se pinten después). `alElegir` recibe
 * el id del desplegable y el valor elegido; quien lo usa actualiza su estado y llama a
 * actualizarDesplegable.
 */
export function conectarDesplegables(raiz: HTMLElement, alElegir: (id: string, valor: string) => void): void {
    const elegir = (caja: HTMLElement, opcion: HTMLElement): void => {
        const { boton } = partes(caja);
        cerrar(caja, true);
        alElegir(boton.id, opcion.dataset.desplegableValor ?? '');
    };

    raiz.addEventListener('click', (ev) => {
        const t = ev.target as HTMLElement;
        const caja = t.closest<HTMLElement>('[data-desplegable]');
        if (!caja) return;
        const opcion = t.closest<HTMLElement>('[role="option"]');
        if (opcion) elegir(caja, opcion);
        else if (t.closest('.desplegable-boton')) {
            if (partes(caja).lista.hidden) abrir(caja);
            else cerrar(caja, true);
        }
    });

    raiz.addEventListener('keydown', (ev) => {
        const t = ev.target as HTMLElement;
        const caja = t.closest<HTMLElement>('[data-desplegable]');
        if (!caja) return;
        const { lista } = partes(caja);
        if (t.classList.contains('desplegable-boton')) {
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                ev.preventDefault();
                abrir(caja);
            }
            return;
        }
        if (t !== lista) return;
        const todas = opcionesDe(lista);
        const actual = todas.findIndex((o) => o.classList.contains('resaltada'));
        const ir = (i: number): void => resaltar(lista, todas[Math.max(0, Math.min(todas.length - 1, i))]);
        switch (ev.key) {
            case 'ArrowDown': ev.preventDefault(); ir(actual + 1); break;
            case 'ArrowUp': ev.preventDefault(); ir(actual - 1); break;
            case 'Home': ev.preventDefault(); ir(0); break;
            case 'End': ev.preventDefault(); ir(todas.length - 1); break;
            case 'Enter':
            case ' ':
                ev.preventDefault();
                if (todas[actual]) elegir(caja, todas[actual]);
                break;
            case 'Escape': ev.preventDefault(); cerrar(caja, true); break;
            case 'Tab': cerrar(caja, false); break;
        }
    });

    // Se cierra al hacer clic o pasar el foco fuera de él.
    raiz.addEventListener('focusout', (ev) => {
        const caja = (ev.target as HTMLElement).closest<HTMLElement>('[data-desplegable]');
        if (caja && !caja.contains(ev.relatedTarget as Node | null)) cerrar(caja, false);
    });
}
