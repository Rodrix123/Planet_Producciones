// Detalle de un elemento del inventario (solo lectura): título con el nombre del elemento,
// subtítulo con la categoría de donde proviene y una tabla con todas sus unidades físicas
// (de todas sus variantes). Se abre desde el menú de inventario: inventario-elemento.html?id=<id>.

import './style.css';
import './panel.css';
import './inventario.css';
import { api } from './api';
import {
    $, arrancarInventario, esc, formatearFecha, insigniaEstado, nombreVariante, plural,
    textoUnidades, unidadesDeElemento, vacio, type Elemento, type Tipo
} from './inventario-comun';

const titulo = $('titulo');
const subtitulo = $('subtitulo');
const resumen = $('resumen');
const estado = $('estado');
const tabla = $('tabla');

// Muestra un error en lugar de la tabla.
function mostrarError(mensaje: string): void {
    estado.hidden = false;
    estado.classList.add('error');
    estado.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${mensaje}`;
}

// Tabla con una fila por unidad física; las características son las del menú, sin el ID.
function tablaUnidades(e: Elemento): string {
    const filas = e.variantes.flatMap(v => v.unidades.map(u => `
        <tr>
            <td>${esc(nombreVariante(v))}</td>
            <td class="inv-codigo">${u.codigoBarras ? esc(u.codigoBarras) : '<span class="inv-sin-dato">Sin código de barras</span>'}</td>
            <td>${insigniaEstado(u.estado)}</td>
            <td class="inv-detalle-estado">${u.descripcionEstado?.trim() ? esc(u.descripcionEstado.trim()) : '<span class="inv-sin-dato">—</span>'}</td>
            <td class="inv-fecha">${formatearFecha(u.creadoEn)}</td>
            <td class="inv-fecha">${formatearFecha(u.actualizadoEn)}</td>
        </tr>`));
    if (filas.length === 0) return vacio('Sin unidades registradas.');
    return `
        <div class="inv-tabla-wrap">
            <table class="inv-tabla">
                <thead>
                    <tr>
                        <th scope="col">Variante</th>
                        <th scope="col">Código de barras</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Detalle del estado</th>
                        <th scope="col">Registrada</th>
                        <th scope="col">Última actualización</th>
                    </tr>
                </thead>
                <tbody>${filas.join('')}</tbody>
            </table>
        </div>`;
}

// Trae el inventario, ubica el elemento pedido en la URL y dibuja su página.
async function cargar(): Promise<void> {
    const id = Number(new URLSearchParams(window.location.search).get('id'));
    if (!Number.isInteger(id) || id <= 0) {
        mostrarError('No se indicó qué elemento mostrar.');
        return;
    }
    try {
        const json = await api<{ tipos: Tipo[] }>('GET', '/api/inventario');
        let tipo: Tipo | undefined;
        let elemento: Elemento | undefined;
        for (const t of json.tipos) {
            elemento = t.elementos.find(e => e.id === id);
            if (elemento) {
                tipo = t;
                break;
            }
        }
        if (!elemento || !tipo) {
            mostrarError('No se encontró el elemento en el inventario.');
            return;
        }

        document.title = `${elemento.nombre} | Inventario | Planet Producciones`;
        titulo.textContent = elemento.nombre;
        subtitulo.innerHTML = `<i class="fa-solid fa-layer-group" aria-hidden="true"></i> Inventario › ${esc(tipo.nombre)}`;
        subtitulo.hidden = false;
        resumen.textContent = `${textoUnidades(unidadesDeElemento(elemento))} · `
            + plural(elemento.variantes.length, 'variante', 'variantes');
        resumen.hidden = false;
        estado.hidden = true;
        tabla.innerHTML = tablaUnidades(elemento);
    } catch (err) {
        mostrarError(`No se pudo cargar el inventario: ${esc((err as Error).message)}`);
    }
}

arrancarInventario(cargar);
