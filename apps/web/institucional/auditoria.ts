import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/**
 * Auditoría de seguridad de la web institucional (Numeral 5; el control 11, de Cloudflare
 * Pages, es del Numeral 6).
 *
 * Revisa la carpeta compilada antes de publicarla y devuelve un resultado por control.
 * plugin-auditoria.ts la ejecuta al final de cada build: cualquier problema detiene la
 * compilación. En el modo borrador (revisión local), el contenido sin confirmar solo se avisa.
 * En la versión preliminar, que sí se publica, las marcas de revisión siguen siendo un error,
 * y además debe llevar su aviso y `noindex`. Ninguna versión publicable lleva fotos sin autorizar.
 * Nunca imprime el valor de una clave o de un dato privado, solo dónde está.
 */

export interface OpcionesAuditoria {
    /** Carpeta compilada (institucional/dist) */
    carpeta: string;
    /** Carpeta del código del sitio: no debe tener archivos .env que Vite pueda leer */
    raiz: string;
    /** Páginas permitidas, sin .html (lista blanca) */
    paginas: readonly string[];
    /** Páginas que deben existir siempre (las legales) */
    paginasLegales: readonly string[];
    /** Correos que la empresa autorizó publicar */
    correos: readonly string[];
    /** Teléfonos autorizados, solo dígitos */
    telefonos: readonly string[];
    /** Números con puntos que se pueden mostrar (el NIT confirmado) */
    numerosPermitidos: readonly string[];
    /** Dominios externos a los que se puede enlazar */
    dominiosEnlaces: readonly string[];
    /** Dominios externos de los que se pueden cargar hojas de estilo (siempre con integridad SRI) */
    dominiosEstilos: readonly string[];
    /** true en la versión para publicar: el contenido de borrador también bloquea */
    estricto: boolean;
    /** true en la versión preliminar: debe llevar su aviso y `noindex`, que en la definitiva son un error */
    preliminar?: boolean;
    /** Archivos de public/galeria sin autorización de la dueña: no pueden llegar a una versión publicable */
    fotosSinAutorizar?: readonly string[];
}

export interface ResultadoControl {
    numero: number;
    nombre: string;
    problemas: string[];
    avisos: string[];
}

const EXTENSIONES_RECURSOS = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.ico', '.woff', '.woff2']);
/** Archivos de configuración de Cloudflare Pages que pueden ir en la raíz (hoy solo se usa _headers). */
const ARCHIVOS_DE_PAGES = new Set(['_headers', '_redirects', 'robots.txt', 'sitemap.xml']);

/** Encabezados que _headers debe enviar en todo el sitio (regla /*). */
const ENCABEZADOS_OBLIGATORIOS = ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'];
/** Fuentes que anulan la protección de la CSP contra código inyectado. */
const FUENTES_INSEGURAS = new Set(["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", '*', 'http:', 'https:', 'data:', 'blob:']);
const EXTENSIONES_TEXTO = new Set(['.html', '.css', '.js', '.svg', '.txt', '.xml', '.json', '.map', '']);

const CLAVES: [string, RegExp][] = [
    ['clave de Google (Gemini u otra API)', /AIza[0-9A-Za-z_-]{35}/],
    ['token de acceso de Meta', /EAA[A-Za-z0-9]{30,}/],
    ['clave secreta tipo sk-', /\bsk-[A-Za-z0-9_-]{20,}/],
    ['token JWT (por ejemplo, claves de Supabase)', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
    ['clave de Supabase', /sb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}|service_role/],
    ['URL de base de datos', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\//],
    ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['token de GitHub', /\bgh[pousr]_[A-Za-z0-9]{36}/],
    ['webhook de n8n', /n8n\.cloud|\/webhook(?:-test)?\/[A-Za-z0-9-]{8,}/]
];

const VARIABLES_DE_ENTORNO =
    /\b(?:DATABASE_URL|JWT_SECRET|EMAIL_USER|EMAIL_PASS|SUPABASE_[A-Z_]+|N8N_[A-Z_]+|WHATSAPP_[A-Z_]+|META_[A-Z_]+|GEMINI_[A-Z_]+|VITE_[A-Z_]+)\b/;

const CONTRASENAS = /(?:password|passwd|contrase(?:ñ|n)a|clave)\s*["']?\s*[:=]\s*["'][^"']{3,}["']/i;
const CORREOS = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w-])/g;
const TELEFONOS = /(?<![\w/+=])(?:\+?57[\s.-]?)?(?:3\d{2}|60\d)[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![\w/+=])/g;
const NUMEROS_CON_PUNTOS = /(?<![\w.])\d{1,3}(?:\.\d{3}){2,3}(?:-\d)?(?![\w.])/g;

const PAGINAS_PRIVADAS =
    /(?:^|\/)(?:login|cotizador|cotizaciones(?:-definitivas)?|empleados|inventario|eventos(?:-proceso|-programados)?|panel-[a-z-]+|pqrs-admin|cambiar-password)(?:\.html)?(?=$|[?#])/i;
const DESTINOS_LOCALES = /localhost|127\.0\.0\.1|0\.0\.0\.0|:(?:3000|5173|5174)\b|\/@fs\/|^file:|^[A-Za-z]:[\\/]/i;
const LLAMADAS_AL_SERVIDOR = /\/api\/|\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|sendBeacon/;

/** El tercer valor marca lo que la versión preliminar lleva a propósito (se exige aparte, no cuenta como marca de revisión). */
const MARCAS_DE_BORRADOR: [string, RegExp, boolean?][] = [
    ['dato resaltado como pendiente', /dato-pendiente/g],
    ['bloque pendiente de aprobación', /bloque-pendiente/g],
    ['foto sin autorización', /foto-pendiente/g],
    ['aviso de vista local', /aviso-vista-local/g],
    ['valor faltante', /PENDIENTE-[A-Z0-9]+|Pendiente:/g],
    ['marcador sin procesar', /\{\{|<!--\s*\/?(?:pendiente|si-hay-fotos)/g],
    ['aviso de versión preliminar', /class="aviso-preliminar"/g, true],
    ['página marcada como no indexable', /name="robots" content="noindex/g, true]
];

function listarArchivos(carpeta: string): string[] {
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
        for (const nombre of readdirSync(dir)) {
            const ruta = join(dir, nombre);
            if (statSync(ruta).isDirectory()) recorrer(ruta);
            else archivos.push(relative(carpeta, ruta).replace(/\\/g, '/'));
        }
    };
    recorrer(carpeta);
    return archivos.sort();
}

function archivoPermitido(ruta: string, paginas: readonly string[]): boolean {
    if (paginas.some((pagina) => ruta === `${pagina}.html`)) return true;
    if (ARCHIVOS_DE_PAGES.has(ruta)) return true;
    return /^assets\/[^/]+$/.test(ruta) && EXTENSIONES_RECURSOS.has(extname(ruta).toLowerCase());
}

/** Bloques de metadatos de una imagen (EXIF puede traer ubicación GPS). */
function metadatosImagen(ruta: string, datos: Buffer): { exif: boolean; texto: string[] } {
    const extension = extname(ruta).toLowerCase();
    if (extension === '.png') {
        const texto = new Set<string>();
        let exif = false;
        let posicion = 8;
        while (posicion + 8 <= datos.length) {
            const largo = datos.readUInt32BE(posicion);
            const tipo = datos.toString('latin1', posicion + 4, posicion + 8);
            if (tipo === 'eXIf') exif = true;
            if (tipo === 'tEXt' || tipo === 'iTXt' || tipo === 'zTXt') texto.add(tipo);
            if (tipo === 'IEND') break;
            posicion += 12 + largo;
        }
        return { exif, texto: [...texto] };
    }
    if (extension === '.jpg' || extension === '.jpeg' || extension === '.webp') {
        const cabecera = datos.subarray(0, 131072);
        return { exif: cabecera.includes(Buffer.from('Exif\0\0', 'latin1')) || cabecera.includes(Buffer.from('EXIF', 'latin1')), texto: [] };
    }
    return { exif: false, texto: [] };
}

function atributos(html: string, nombres: string): { nombre: string; valor: string; etiqueta: string }[] {
    const encontrados: { nombre: string; valor: string; etiqueta: string }[] = [];
    for (const etiqueta of html.match(/<[a-z][^>]*>/gi) ?? []) {
        const patron = new RegExp(`\\s(${nombres})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'gi');
        for (const coincidencia of etiqueta.matchAll(patron)) {
            encontrados.push({ nombre: (coincidencia[1] ?? '').toLowerCase(), valor: coincidencia[3] ?? coincidencia[4] ?? '', etiqueta });
        }
    }
    return encontrados;
}

/** Reglas de un archivo _headers de Cloudflare Pages: patrón de URL → encabezados (nombre en minúsculas). */
function leerHeaders(texto: string): Map<string, Map<string, string>> {
    const reglas = new Map<string, Map<string, string>>();
    let actual: Map<string, string> | undefined;
    for (const linea of texto.split(/\r?\n/)) {
        if (linea.trim() === '' || linea.trim().startsWith('#')) continue;
        if (!/^\s/.test(linea)) {
            actual = reglas.get(linea.trim()) ?? new Map<string, string>();
            reglas.set(linea.trim(), actual);
            continue;
        }
        const separador = linea.indexOf(':');
        if (actual && separador > 0) actual.set(linea.slice(0, separador).trim().toLowerCase(), linea.slice(separador + 1).trim());
    }
    return reglas;
}

/** "default-src 'none'; img-src 'self'" -> { default-src: ["'none'"], img-src: ["'self'"] } */
function directivasCsp(csp: string): Map<string, string[]> {
    const directivas = new Map<string, string[]>();
    for (const parte of csp.split(';')) {
        const [nombre, ...fuentes] = parte.trim().split(/\s+/);
        if (nombre) directivas.set(nombre.toLowerCase(), fuentes);
    }
    return directivas;
}

/** /privacidad#x -> { archivo: 'privacidad.html', ancla: 'x' } */
function destinoInterno(url: string): { archivo: string; ancla: string } {
    const [conRuta = '', ancla = ''] = url.split('#');
    const ruta = (conRuta.split('?')[0] ?? '').replace(/^\.?\//, '');
    if (ruta === '' || ruta === 'index.html') return { archivo: 'index.html', ancla };
    if (ruta.startsWith('assets/') || extname(ruta) !== '') return { archivo: ruta, ancla };
    return { archivo: `${ruta}.html`, ancla };
}

export function auditarSitio(opciones: OpcionesAuditoria): ResultadoControl[] {
    const controles: ResultadoControl[] = [
        { numero: 1, nombre: 'Sin claves de Gemini, Meta, n8n u otros servicios', problemas: [], avisos: [] },
        { numero: 2, nombre: 'Sin archivos .env ni variables de entorno', problemas: [], avisos: [] },
        { numero: 3, nombre: 'Sin contraseñas ni datos privados', problemas: [], avisos: [] },
        { numero: 4, nombre: 'Sin enlaces a paneles privados ni llamadas al servidor', problemas: [], avisos: [] },
        { numero: 5, nombre: 'Sin contratos ni cotizaciones', problemas: [], avisos: [] },
        { numero: 6, nombre: 'Sin bases de datos ni respaldos', problemas: [], avisos: [] },
        { numero: 7, nombre: 'Solo archivos estáticos previstos, completos y públicos', problemas: [], avisos: [] },
        { numero: 8, nombre: 'Páginas legales presentes y enlaces internos válidos', problemas: [], avisos: [] },
        { numero: 9, nombre: 'Compilación completa (cada página carga su CSS y su JS)', problemas: [], avisos: [] },
        { numero: 10, nombre: 'Sin contenido incompleto o de borrador', problemas: [], avisos: [] },
        { numero: 11, nombre: 'Cloudflare Pages: encabezados de seguridad, página 404 y sin código en línea', problemas: [], avisos: [] }
    ];
    const control = (numero: number): ResultadoControl => {
        const encontrado = controles.find((c) => c.numero === numero);
        if (!encontrado) throw new Error(`Control ${numero} inexistente`);
        return encontrado;
    };

    if (!existsSync(opciones.carpeta)) {
        control(9).problemas.push(`No existe la carpeta compilada ${opciones.carpeta}`);
        return controles;
    }

    const archivos = listarArchivos(opciones.carpeta);
    const leer = (ruta: string) => readFileSync(join(opciones.carpeta, ruta));
    const paginasHtml = archivos.filter((ruta) => ruta.endsWith('.html'));
    const htmlPorPagina = new Map(paginasHtml.map((ruta) => [ruta, leer(ruta).toString('utf8')]));

    // .env en el código del sitio: Vite los cargaría al compilar
    for (const nombre of readdirSync(opciones.raiz)) {
        if (/^\.env/i.test(nombre)) control(2).problemas.push(`${nombre} en la carpeta del sitio (Vite lo leería al compilar)`);
    }

    for (const ruta of archivos) {
        const extension = extname(ruta).toLowerCase();
        const nombre = ruta.split('/').pop() ?? ruta;

        if (/^\.env/i.test(nombre)) control(2).problemas.push(`${ruta}: archivo de variables de entorno`);
        if (/\.(pdf|xlsx?|docx?|odt|ods)$/i.test(ruta)) control(5).problemas.push(`${ruta}: documento (posible contrato o cotización)`);
        if (/contrato|cotizaci[oó]n|factura/i.test(nombre)) control(5).problemas.push(`${ruta}: el nombre sugiere un contrato, una cotización o una factura`);
        if (/\.(sql|db|sqlite3?|dump|bak|backup|zip|rar|7z|tar|gz|csv|json)$/i.test(ruta)) {
            control(6).problemas.push(`${ruta}: base de datos, respaldo o archivo de datos`);
        }
        if (extension === '.map') control(7).problemas.push(`${ruta}: mapa de código fuente (no se publica)`);
        if (!archivoPermitido(ruta, opciones.paginas)) control(7).problemas.push(`${ruta}: no está en la lista blanca del sitio`);
        // Privacidad: una foto sin autorización (rostros, nombres o iniciales de clientes) no sale en ninguna versión publicable
        if (opciones.estricto) {
            for (const foto of opciones.fotosSinAutorizar ?? []) {
                if (nombre.startsWith(`${foto.replace(/\.[^.]+$/, '')}-`)) {
                    control(7).problemas.push(`${ruta}: foto sin autorización de la dueña (ver FOTOS en contenido.ts)`);
                }
            }
        }

        const datos = leer(ruta);
        if (EXTENSIONES_TEXTO.has(extension) || ARCHIVOS_DE_PAGES.has(ruta)) {
            const texto = datos.toString('utf8');
            for (const [tipo, patron] of CLAVES) if (patron.test(texto)) control(1).problemas.push(`${ruta}: ${tipo}`);
            const variable = texto.match(VARIABLES_DE_ENTORNO);
            if (variable) control(2).problemas.push(`${ruta}: nombra la variable de entorno ${variable[0]}`);
            if (CONTRASENAS.test(texto)) control(3).problemas.push(`${ruta}: parece contener una contraseña`);
            if (extension === '.js' && LLAMADAS_AL_SERVIDOR.test(texto)) {
                control(4).problemas.push(`${ruta}: llama a un servidor (la web institucional no tiene backend)`);
            }
            if (extension === '.css') {
                for (const coincidencia of texto.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
                    const url = coincidencia[1] ?? '';
                    if (/^(data:|https?:|#)/.test(url)) continue;
                    const destino = url.startsWith('/') ? url.slice(1) : `assets/${url.replace(/^\.\//, '')}`;
                    if (!archivos.includes(destino.split(/[?#]/)[0] ?? '')) control(7).problemas.push(`${ruta}: usa ${url}, que no existe`);
                }
            }
        } else {
            const meta = metadatosImagen(ruta, datos);
            if (meta.exif) control(7).problemas.push(`${ruta}: tiene metadatos EXIF (pueden incluir la ubicación GPS); quítelos antes de publicar`);
            if (meta.texto.length > 0) control(7).avisos.push(`${ruta}: tiene metadatos de texto (${meta.texto.join(', ')})`);
            if (datos.length > 1024 * 1024) control(7).avisos.push(`${ruta}: pesa ${(datos.length / 1048576).toFixed(1)} MB; conviene optimizarla`);
        }
    }

    const telefonosPermitidos = opciones.telefonos.map((t) => t.slice(-10));
    for (const [pagina, html] of htmlPorPagina) {
        // 3. Datos privados
        for (const correo of new Set(html.match(CORREOS) ?? [])) {
            if (!opciones.correos.includes(correo)) control(3).problemas.push(`${pagina}: correo no autorizado para publicar (${correo.replace(/^(.{2}).*@/, '$1…@')})`);
        }
        for (const telefono of new Set(html.match(TELEFONOS) ?? [])) {
            if (!telefonosPermitidos.includes(telefono.replace(/\D/g, '').slice(-10))) {
                control(3).problemas.push(`${pagina}: teléfono no autorizado para publicar (termina en ${telefono.replace(/\D/g, '').slice(-2)})`);
            }
        }
        for (const numero of new Set(html.match(NUMEROS_CON_PUNTOS) ?? [])) {
            if (!opciones.numerosPermitidos.includes(numero)) control(3).problemas.push(`${pagina}: número con formato de cédula o NIT no autorizado`);
        }

        // 4. Formularios, paneles privados y destinos locales
        if (/<form\b/i.test(html)) control(4).problemas.push(`${pagina}: tiene un formulario (la web institucional no recibe datos)`);
        for (const { nombre, valor, etiqueta } of atributos(html, 'href|src|action|formaction')) {
            if (PAGINAS_PRIVADAS.test(valor.split(/[?#]/)[0] ?? '') || /\/api\//.test(valor)) control(4).problemas.push(`${pagina}: ${nombre}="${valor}" lleva a una parte privada`);
            if (DESTINOS_LOCALES.test(valor)) control(4).problemas.push(`${pagina}: ${nombre}="${valor}" apunta al equipo local`);

            if (/^https?:\/\//i.test(valor)) {
                const dominio = new URL(valor).host;
                if (/^<script\b/i.test(etiqueta)) {
                    control(7).problemas.push(`${pagina}: carga un script externo de ${dominio}`);
                } else if (/^<link\b/i.test(etiqueta) && /rel\s*=\s*["']?stylesheet/i.test(etiqueta)) {
                    if (!opciones.dominiosEstilos.includes(dominio)) control(7).problemas.push(`${pagina}: hoja de estilos de un dominio no permitido (${dominio})`);
                    if (!/\sintegrity\s*=/i.test(etiqueta)) control(7).problemas.push(`${pagina}: la hoja de estilos de ${dominio} no tiene integridad (SRI)`);
                } else if (/^<a\b/i.test(etiqueta) && !opciones.dominiosEnlaces.includes(dominio)) {
                    control(7).avisos.push(`${pagina}: enlaza a ${dominio}, que no está en la lista de dominios previstos`);
                }
                continue;
            }
            if (/^(mailto:|tel:|data:)/i.test(valor) || valor === '') continue;

            // 7 y 8. Recursos y enlaces internos
            const { archivo, ancla } = valor.startsWith('#') ? { archivo: pagina, ancla: valor.slice(1) } : destinoInterno(valor);
            if (!archivos.includes(archivo)) {
                const numero = archivo.startsWith('assets/') ? 7 : 8;
                control(numero).problemas.push(`${pagina}: ${nombre}="${valor}" no existe en el sitio`);
            } else if (ancla && archivo.endsWith('.html') && !(htmlPorPagina.get(archivo) ?? '').includes(`id="${ancla}"`)) {
                control(8).problemas.push(`${pagina}: el enlace ${valor} apunta a una sección que no existe`);
            }
        }

        // 9. Cada página carga su CSS y su JS
        if (!/<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/.test(html)) control(9).problemas.push(`${pagina}: no carga el JavaScript del sitio`);
        if (!/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/[^"]+\.css"/.test(html)) control(9).problemas.push(`${pagina}: no carga la hoja de estilos del sitio`);

        // 8. Enlaces a las páginas legales en cada página
        for (const legal of opciones.paginasLegales) {
            if (!html.includes(`href="/${legal}"`)) control(8).problemas.push(`${pagina}: no enlaza a /${legal}`);
        }

        // 10. Contenido de borrador
        for (const [descripcion, patron, propiaDePreliminar] of MARCAS_DE_BORRADOR) {
            if (opciones.preliminar && propiaDePreliminar) continue;
            const cantidad = (html.match(patron) ?? []).length;
            if (cantidad === 0) continue;
            const mensaje = `${pagina}: ${cantidad} × ${descripcion}`;
            if (opciones.estricto) control(10).problemas.push(mensaje);
            else control(10).avisos.push(mensaje);
        }
        // La versión preliminar se publica con pendientes, pero siempre identificada y sin indexar
        if (opciones.preliminar) {
            if (!/class="aviso-preliminar"/.test(html)) control(10).problemas.push(`${pagina}: no avisa que es una versión preliminar`);
            if (!/name="robots" content="noindex/.test(html)) control(10).problemas.push(`${pagina}: la versión preliminar debe llevar noindex`);
        }

        // 11. Código en línea: en Cloudflare, la CSP de _headers lo bloquearía
        for (const etiqueta of html.match(/<script\b[^>]*>/gi) ?? []) {
            if (!/\ssrc\s*=/i.test(etiqueta) && !/\stype\s*=\s*["']application\/ld\+json["']/i.test(etiqueta)) {
                control(11).problemas.push(`${pagina}: tiene un script en línea, que la CSP bloquearía`);
            }
        }
        if (/<style\b/i.test(html)) control(11).problemas.push(`${pagina}: tiene estilos en línea (<style>), que la CSP bloquearía`);
        for (const { nombre } of atributos(html, 'style|on[a-z]+')) control(11).problemas.push(`${pagina}: usa el atributo ${nombre}, que la CSP bloquearía`);
    }

    // 11. Cloudflare Pages: página 404 y encabezados de seguridad
    const html404 = htmlPorPagina.get('404.html');
    if (html404 === undefined) {
        control(11).problemas.push('Falta 404.html: sin ella, Cloudflare Pages responde con la página de inicio (y código 200) a cualquier dirección inexistente');
    } else {
        // Cloudflare la muestra en cualquier dirección (/a/b/c): una ruta relativa ahí no encuentra el archivo
        for (const { nombre, valor } of atributos(html404, 'href|src')) {
            if (!/^(\/|#|https?:|mailto:|tel:)/i.test(valor)) control(11).problemas.push(`404.html: ${nombre}="${valor}" es una ruta relativa; debe empezar por /`);
        }
    }

    if (!archivos.includes('_headers')) {
        control(11).problemas.push('Falta _headers (institucional/publico/_headers): sin él, Cloudflare Pages no envía los encabezados de seguridad');
    } else {
        const texto = leer('_headers').toString('utf8');
        const reglas = leerHeaders(texto);
        if (reglas.size > 100) control(11).problemas.push(`_headers tiene ${reglas.size} reglas y Cloudflare admite 100`);
        if (texto.split(/\r?\n/).some((linea) => linea.length > 2000)) control(11).problemas.push('_headers tiene líneas de más de 2.000 caracteres, el límite de Cloudflare');
        const todoElSitio = reglas.get('/*');
        if (!todoElSitio) control(11).problemas.push('_headers no tiene la regla /*, que aplica a todo el sitio');
        else {
            for (const nombre of ENCABEZADOS_OBLIGATORIOS) {
                if (!todoElSitio.has(nombre.toLowerCase())) control(11).problemas.push(`_headers no envía ${nombre} en todo el sitio`);
            }
            const csp = directivasCsp(todoElSitio.get('content-security-policy') ?? '');
            if (csp.size > 0) {
                if (!csp.has('default-src')) control(11).problemas.push('La CSP no tiene default-src');
                for (const directiva of ['script-src', 'style-src']) {
                    const inseguras = (csp.get(directiva) ?? csp.get('default-src') ?? []).filter((fuente) => FUENTES_INSEGURAS.has(fuente.toLowerCase()));
                    if (inseguras.length > 0) control(11).problemas.push(`La CSP permite ${inseguras.join(' ')} en ${directiva}`);
                }
                if ((csp.get('frame-ancestors') ?? []).join(' ') !== "'none'") {
                    control(11).problemas.push("La CSP debe tener frame-ancestors 'none' (ningún sitio puede mostrar estas páginas en un marco)");
                }
                for (const dominio of opciones.dominiosEstilos) {
                    if (!(csp.get('style-src') ?? []).includes(`https://${dominio}`)) {
                        control(11).problemas.push(`La CSP no permite las hojas de estilos de ${dominio}: el navegador las bloquearía`);
                    }
                }
            }
        }
    }

    for (const legal of opciones.paginasLegales) {
        const html = htmlPorPagina.get(`${legal}.html`);
        if (html === undefined) control(8).problemas.push(`Falta la página /${legal}`);
        else if (!/<h1\b/i.test(html)) control(8).problemas.push(`/${legal} no tiene título principal (h1)`);
    }
    if (!htmlPorPagina.has('index.html')) control(9).problemas.push('Falta la página de inicio (index.html)');

    return controles;
}

export function informeAuditoria(controles: ResultadoControl[], estricto: boolean, preliminar = false): string {
    const version = preliminar ? 'versión preliminar para publicar' : estricto ? 'versión para publicar' : 'borrador local';
    const lineas = [`Auditoría de seguridad de la web institucional (${version})`];
    for (const c of controles) {
        const estado = c.problemas.length > 0 ? 'FALLA' : c.avisos.length > 0 ? 'AVISO' : 'OK   ';
        lineas.push(`  ${estado} ${String(c.numero).padStart(2)}. ${c.nombre}`);
        for (const p of c.problemas) lineas.push(`          ✗ ${p}`);
        for (const a of c.avisos.slice(0, 8)) lineas.push(`          · ${a}`);
        if (c.avisos.length > 8) lineas.push(`          · … y ${c.avisos.length - 8} avisos más`);
    }
    const problemas = controles.reduce((total, c) => total + c.problemas.length, 0);
    lineas.push(problemas > 0 ? `  ${problemas} problema(s): no publique esta carpeta.` : '  Sin problemas de seguridad.');
    return lineas.join('\n');
}
