import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { pluginContenido } from './institucional/plugin-contenido';

const serverDir = fileURLToPath(new URL('../server', import.meta.url));
const institucionalDir = fileURLToPath(new URL('./institucional', import.meta.url));

// Páginas legales del sitio institucional que enlaza el pie de la web pública.
const PAGINAS_LEGALES = ['privacidad', 'terminos', 'eliminacion-datos'];

/**
 * Muestra en esta web las páginas legales del sitio institucional, tal cual:
 * las llena con plugin-contenido (solo los HTML de institucional/; el resto no se
 * toca), carga su propio script en vez del del cotizador y, en desarrollo, atiende
 * sus rutas cortas (/privacidad, /terminos, /eliminacion-datos), que son las que
 * usan los enlaces entre ellas.
 */
function paginasLegales(): Plugin {
    const contenido = pluginContenido({
        raiz: institucionalDir,
        carpetaRecursos: fileURLToPath(new URL('./public', import.meta.url))
    });
    const transformar = contenido.transformIndexHtml;
    const llenar =
        typeof transformar === 'function' ? transformar
        : transformar === undefined ? undefined
        : 'handler' in transformar ? transformar.handler
        : transformar.transform;
    const vigilar = contenido.configureServer;
    const esInstitucional = (archivo: string) => {
        const ruta = relative(institucionalDir, archivo);
        return ruta !== '' && !ruta.startsWith('..') && !isAbsolute(ruta);
    };

    return {
        ...contenido,
        name: 'planet:paginas-legales',
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const [ruta = '', consulta] = (req.url ?? '').split('?');
                const pagina = ruta.replace(/^\/|\/$/g, '');
                if (PAGINAS_LEGALES.includes(pagina)) {
                    req.url = `/institucional/${pagina}.html${consulta === undefined ? '' : `?${consulta}`}`;
                }
                next();
            });
            if (typeof vigilar === 'function') return vigilar.call(this, server);
        },
        transformIndexHtml: {
            order: 'pre',
            async handler(html, ctx) {
                if (!esInstitucional(ctx.filename) || !llenar) return html;
                const lleno = await llenar.call(this, html, ctx);
                // Su script es institucional/src/main.ts: en esta raíz, /src/main.ts es el del cotizador
                return typeof lleno === 'string' ? lleno.split('src="/src/').join('src="/institucional/src/') : lleno;
            }
        }
    };
}

// Dirección pública del sitio (ej. https://planetproducciones.com), usada en las
// etiquetas para compartir el enlace en WhatsApp/Instagram, que exigen una URL
// absoluta. Se define al construir: VITE_SITE_URL=https://... npm run build
const urlSitio = (process.env.VITE_SITE_URL || '').replace(/[/]$/, '');
const sitioUrl = (): Plugin => ({
    name: 'sitio-url',
    transformIndexHtml: (html) => html.split('__SITE_URL__').join(urlSitio)
});

/** true si ya hay algo escuchando en ese puerto (p. ej. la API lanzada a mano). */
function puertoOcupado(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect({ port, host: 'localhost' });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
    });
}

/**
 * En desarrollo, arranca la API (apps/server, con tsx watch) junto con Vite, para
 * que con solo levantar la web en 5173 el login y demás llamadas a /api funcionen.
 * Si la API ya está corriendo en su puerto, no lanza otra.
 */
function arrancarApi(port: number): Plugin {
    let api: ChildProcess | undefined;
    const detener = () => { api?.kill(); api = undefined; };

    return {
        name: 'planet-arrancar-api',
        apply: 'serve',
        async configureServer(server) {
            if (await puertoOcupado(port)) return;
            const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
            api = spawn(process.execPath, [tsxCli, 'watch', 'src/index.ts'], { cwd: serverDir, stdio: 'inherit' });
            server.httpServer?.once('close', detener);
            process.once('exit', detener);
        }
    };
}

export default defineConfig(({ mode }) => {
    // Puerto de la API tomado de apps/server/.env (PORT), para reenviar /api en desarrollo.
    const serverEnv = loadEnv(mode, serverDir, '');
    const apiPort = Number(serverEnv.PORT) || 3000;
    const apiTarget = `http://localhost:${apiPort}`;

    return {
        plugins: [sitioUrl(), arrancarApi(apiPort), paginasLegales()],
        root: '.',
        // Rutas relativas en el build para que dist/ funcione desde cualquier
        // servidor estático (Live Server, Express, Nginx).
        base: './',
        publicDir: 'public',
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            rollupOptions: {
                // Sitio multi-página: landing (index), cotizador, login y los
                // paneles internos por rol.
                input: {
                    main: 'index.html',
                    cotizador: 'cotizador.html',
                    login: 'login.html',
                    cambiarPassword: 'cambiar-password.html',
                    panelAdmin: 'panel-admin.html',
                    panelSecretaria: 'panel-secretaria.html',
                    panelLogistica: 'panel-logistica.html',
                    cotizaciones: 'cotizaciones.html',
                    empleados: 'empleados.html',
                    eventos: 'eventos.html',
                    pagos: 'pagos.html',
                    eventosProceso: 'eventos-proceso.html',
                    eventosProgramados: 'eventos-programados.html',
                    consulta: 'consulta.html',
                    cotizacionesDefinitivas: 'cotizaciones-definitivas.html',
                    pqrsAdmin: 'pqrs-admin.html',
                    inventario: 'inventario.html',
                    inventarioElemento: 'inventario-elemento.html',
                    galeria: 'galeria.html',
                    servicios: 'servicios.html',
                    nosotros: 'nosotros.html',
                    ayuda: 'ayuda.html',
                    contacto: 'contacto.html',
                    // Páginas legales del sitio institucional, enlazadas desde el pie
                    ...Object.fromEntries(PAGINAS_LEGALES.map((pagina) => [`legal-${pagina}`, `institucional/${pagina}.html`]))
                }
            }
        },
        server: {
            port: 5173,
            // Con VITE_API_URL vacío la web llama a /api en su mismo origen; Vite lo
            // reenvía a la API (así la cookie de sesión queda en localhost:5173).
            proxy: {
                '/api': { target: apiTarget, changeOrigin: true }
            }
        }
    };
});
