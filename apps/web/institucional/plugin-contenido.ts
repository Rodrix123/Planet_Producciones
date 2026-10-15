import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { IndexHtmlTransformContext, Logger, Plugin } from 'vite';
import { DATOS, FOTOS, PENDIENTES, type CampoDato, type FotoCandidata, type IdPendiente } from './contenido';

/**
 * Llena las páginas institucionales con los datos de contenido.ts.
 *
 * Marcadores que entiende en el HTML:
 *   {{dato:campo}}       texto visible (en la vista local se resalta si está sin confirmar)
 *   {{valor:campo}}      valor plano, para atributos y <head>
 *   {{lista:campo}}      <li> por cada elemento de una lista
 *   {{recurso:archivo}}  logo o foto de apps/web/public
 *   {{legal:pagina}}     enlace a una página legal (privacidad, terminos, eliminacion-datos)
 *   {{galeria}}, {{jsonld}}, {{anio}}, {{meta-robots}}, {{aviso-vista-local}}
 *   <!-- pendiente:ID --> … <!-- /pendiente:ID -->  bloque que depende de un pendiente
 *   <!-- si-hay-fotos --> … <!-- /si-hay-fotos -->  solo aparece si hay fotos que mostrar
 * Un |mayuscula al final de dato o valor pone en mayúscula la primera letra.
 *
 * En `vite` (y en `vite build --mode borrador`) muestra todo con lo pendiente resaltado.
 * En `vite build` normal se detiene si la página usa algo sin confirmar.
 */

/** Páginas legales que enlaza el pie de página. Se redactan en el Numeral 4. */
const PAGINAS_LEGALES = {
    privacidad: { ruta: '/privacidad', archivo: 'privacidad.html', texto: 'Política de privacidad', icono: 'fa-shield-halved' },
    terminos: { ruta: '/terminos', archivo: 'terminos.html', texto: 'Términos y condiciones', icono: 'fa-file-contract' },
    'eliminacion-datos': { ruta: '/eliminacion-datos', archivo: 'eliminacion-datos.html', texto: 'Eliminación de datos', icono: 'fa-user-xmark' }
};

const AVISO_VISTA_LOCAL =
    '<div class="aviso-vista-local" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' +
    'Vista local: lo resaltado en amarillo está pendiente de confirmar con la dueña. Esta versión no se puede publicar.</div>';

interface Opciones {
    /** Carpeta del sitio institucional (donde están los .html) */
    raiz: string;
    /** Carpeta de donde salen el logo y las fotos (apps/web/public) */
    carpetaRecursos: string;
}

const escapar = (texto: string) =>
    texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** ['a', 'b', 'c'] -> 'a, b y c' */
function unirLista(items: readonly string[]): string {
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] ?? ''}`;
}

function tieneClave<T extends object>(objeto: T, clave: string): clave is Extract<keyof T, string> {
    return Object.prototype.hasOwnProperty.call(objeto, clave);
}

function informe(pagina: string, sinConfirmar: string[], faltantes: string[], legales: string[]): string {
    const lineas = [`La web institucional (${pagina}) todavía no se puede publicar.`];
    if (sinConfirmar.length > 0) {
        lineas.push('', 'Sin confirmar por la dueña (docs/institucional/datos-pendientes.md):', ...sinConfirmar.map((l) => `  · ${l}`));
    }
    if (faltantes.length > 0) lineas.push('', 'Datos que faltan:', ...faltantes.map((l) => `  · ${l}`));
    if (legales.length > 0) lineas.push('', 'Páginas legales que aún no existen (Numeral 4):', ...legales.map((l) => `  · ${l}`));
    lineas.push('', 'Para verlos resaltados: npm run dev:institucional');
    return lineas.join('\n');
}

export function pluginContenido({ raiz, carpetaRecursos }: Opciones): Plugin {
    let esServidor = true;
    let vistaLocal = true;
    let logger: Logger | undefined;
    let avisoMostrado = false;

    /** En el servidor local, /@fs/…; en el build, ruta relativa para que Vite copie el archivo. */
    function urlRecurso(rutaRelativa: string, archivoHtml: string): string {
        const absoluta = resolve(carpetaRecursos, rutaRelativa);
        if (!existsSync(absoluta)) throw new Error(`No existe el recurso "${rutaRelativa}" en ${carpetaRecursos}.`);
        if (esServidor) {
            const posix = absoluta.replace(/\\/g, '/');
            return `/@fs${posix.startsWith('/') ? '' : '/'}${posix}`;
        }
        const relativa = relative(dirname(archivoHtml), absoluta).replace(/\\/g, '/');
        return relativa.startsWith('.') ? relativa : `./${relativa}`;
    }

    function procesar(html: string, archivoHtml: string): string {
        const ids = new Set<IdPendiente>(['TXT']);
        const faltantes = new Set<IdPendiente>();
        const legales = new Set<string>();
        const fotos = vistaLocal ? FOTOS : FOTOS.filter((foto) => foto.autorizada);

        const pendienteVisible = (id: IdPendiente) => vistaLocal && !PENDIENTES[id].confirmado;

        const campo = (clave: string | undefined): CampoDato => {
            if (clave === undefined || !tieneClave(DATOS, clave)) throw new Error(`Dato desconocido en el HTML: ${clave ?? '(vacío)'}`);
            return clave;
        };

        const usar = (clave: string | undefined) => {
            const dato = DATOS[campo(clave)];
            ids.add(dato.id);
            if (dato.valor === null) faltantes.add(dato.id);
            return dato;
        };

        const texto = (valor: string | readonly string[], modificador: string | undefined) => {
            const plano = typeof valor === 'string' ? valor : unirLista(valor);
            return modificador === 'mayuscula' ? conMayuscula(plano) : plano;
        };

        const enlaceLegal = (clave: string | undefined) => {
            if (clave === undefined || !tieneClave(PAGINAS_LEGALES, clave)) throw new Error(`Página legal desconocida: ${clave ?? '(vacía)'}`);
            const pagina = PAGINAS_LEGALES[clave];
            const existe = existsSync(resolve(raiz, pagina.archivo));
            if (!existe) legales.add(pagina.ruta);
            const marcar = !existe && vistaLocal;
            const clases = marcar ? 'footer-contact-line dato-pendiente' : 'footer-contact-line';
            const titulo = marcar ? ' title="Página pendiente: se redacta en el Numeral 4"' : '';
            return `<a href="${pagina.ruta}" class="${clases}"${titulo}><i class="fa-solid ${pagina.icono}" aria-hidden="true"></i> ${pagina.texto}</a>`;
        };

        const galeria = (lista: readonly FotoCandidata[]) =>
            lista
                .map((foto) => {
                    const marcar = vistaLocal && !foto.autorizada;
                    const atributos = marcar
                        ? ` class="galeria-item foto-pendiente" data-pendiente="${foto.id} · sin autorización"`
                        : ' class="galeria-item"';
                    const src = urlRecurso(`galeria/${foto.archivo}`, archivoHtml);
                    return `<button type="button"${atributos} aria-label="Ampliar foto: ${escapar(foto.alt)}"><img src="${src}" alt="${escapar(foto.alt)}" loading="lazy" decoding="async"></button>`;
                })
                .join('\n');

        const jsonLd = () => {
            const v = (clave: CampoDato) => usar(clave).valor;
            const nombre = v('nombreComercial');
            const actividad = v('actividad');
            const servicios = v('serviciosResumen');
            const telefono = v('telefonoInternacional');
            const correo = v('correo');
            const instagram = v('instagramEnlace');
            const ciudad = v('ciudad');
            const departamento = v('departamento');
            const cobertura = v('cobertura');

            const negocio: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'LocalBusiness' };
            if (typeof nombre === 'string') negocio.name = nombre;
            if (typeof actividad === 'string' && typeof servicios === 'string') negocio.description = `${conMayuscula(actividad)}: ${servicios}.`;
            if (typeof telefono === 'string') negocio.telephone = telefono;
            if (typeof correo === 'string') negocio.email = correo;
            if (typeof instagram === 'string') negocio.sameAs = [instagram];
            if (typeof ciudad === 'string' && typeof departamento === 'string') {
                negocio.address = { '@type': 'PostalAddress', addressLocality: ciudad, addressRegion: departamento, addressCountry: 'CO' };
            }
            if (cobertura !== null && typeof cobertura !== 'string') {
                negocio.areaServed = cobertura.map((nombreCiudad) => ({ '@type': 'City', name: nombreCiudad }));
            }
            const json = JSON.stringify(negocio, null, 4).replace(/</g, '\\u003c');
            return `<script type="application/ld+json">\n${json}\n</script>`;
        };

        // 1. Bloques que dependen de un pendiente
        html = html.replace(
            /<!--\s*pendiente:(\w+)\s*-->([\s\S]*?)<!--\s*\/pendiente:\1\s*-->/g,
            (_coincidencia: string, id: string, contenido: string) => {
                if (!tieneClave(PENDIENTES, id)) throw new Error(`Pendiente desconocido en el HTML: ${id}`);
                ids.add(id);
                if (!pendienteVisible(id)) return contenido;
                return `<div class="bloque-pendiente" data-pendiente="${id} · ${escapar(PENDIENTES[id].descripcion)}">${contenido}</div>`;
            }
        );

        // 2. Partes que solo existen si hay fotos que mostrar (sección, enlace del menú y visor)
        html = html.replace(/<!--\s*si-hay-fotos\s*-->([\s\S]*?)<!--\s*\/si-hay-fotos\s*-->/g, (_coincidencia: string, contenido: string) =>
            fotos.length > 0 ? contenido : ''
        );

        // 3. Marcadores en línea
        html = html.replace(
            /\{\{\s*([a-z-]+)(?::([^}|\s]+))?(?:\|([a-z]+))?\s*\}\}/g,
            (_coincidencia: string, tipo: string, clave: string | undefined, modificador: string | undefined) => {
                switch (tipo) {
                    case 'dato': {
                        const dato = usar(clave);
                        const descripcion = PENDIENTES[dato.id].descripcion;
                        if (dato.valor === null) {
                            return vistaLocal ? `<span class="dato-pendiente" title="${dato.id} · falta el dato">Pendiente: ${escapar(descripcion.toLowerCase())}</span>` : '';
                        }
                        const valor = escapar(texto(dato.valor, modificador));
                        if (!pendienteVisible(dato.id)) return valor;
                        return `<span class="dato-pendiente" title="${dato.id} · ${escapar(descripcion)}: sin confirmar">${valor}</span>`;
                    }
                    case 'valor': {
                        const dato = usar(clave);
                        return dato.valor === null ? `PENDIENTE-${dato.id}` : escapar(texto(dato.valor, modificador));
                    }
                    case 'lista': {
                        const dato = usar(clave);
                        if (dato.valor === null || typeof dato.valor === 'string') throw new Error(`{{lista:${clave ?? ''}}} necesita una lista en contenido.ts`);
                        return dato.valor.map((item) => `<li>${escapar(item)}</li>`).join('');
                    }
                    case 'recurso':
                        if (clave === undefined) throw new Error('{{recurso}} necesita un archivo, por ejemplo {{recurso:logo.png}}');
                        return urlRecurso(clave, archivoHtml);
                    case 'legal':
                        return enlaceLegal(clave);
                    case 'galeria':
                        return galeria(fotos);
                    case 'jsonld':
                        return jsonLd();
                    case 'anio':
                        return String(new Date().getFullYear());
                    case 'meta-robots':
                        return vistaLocal ? '<meta name="robots" content="noindex, nofollow">' : '';
                    case 'aviso-vista-local':
                        return vistaLocal ? AVISO_VISTA_LOCAL : '';
                    default:
                        throw new Error(`Marcador desconocido en el HTML: {{${tipo}}}`);
                }
            }
        );

        const sobrante = html.match(/\{\{[^}]*\}\}|<!--\s*\/?(?:pendiente|si-hay-fotos)[^>]*-->/);
        if (sobrante) throw new Error(`Marcador sin procesar o mal cerrado en el HTML: ${sobrante[0]}`);

        // En el mismo orden que docs/institucional/datos-pendientes.md
        const usados = Object.keys(PENDIENTES).filter((id): id is IdPendiente => tieneClave(PENDIENTES, id) && ids.has(id));
        const linea = (id: IdPendiente) => `${id}  ${PENDIENTES[id].descripcion}`;
        const sinConfirmar = usados.filter((id) => !PENDIENTES[id].confirmado && !faltantes.has(id)).map(linea);
        const sinValor = usados.filter((id) => faltantes.has(id)).map(linea);
        const hayPendientes = sinConfirmar.length > 0 || sinValor.length > 0 || legales.size > 0;

        if (hayPendientes) {
            const mensaje = informe(relative(raiz, archivoHtml).replace(/\\/g, '/'), sinConfirmar, sinValor, [...legales]);
            if (!vistaLocal) throw new Error(mensaje);
            if (!avisoMostrado) {
                avisoMostrado = true;
                logger?.warn(`\n${mensaje}\n`);
            }
        }
        return html;
    }

    return {
        name: 'planet:contenido-institucional',
        configResolved(config) {
            esServidor = config.command === 'serve';
            vistaLocal = esServidor || config.mode === 'borrador';
            logger = config.logger;
        },
        transformIndexHtml: {
            order: 'pre',
            handler(html: string, ctx: IndexHtmlTransformContext) {
                return procesar(html, ctx.filename);
            }
        }
    };
}
