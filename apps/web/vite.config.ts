import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const serverDir = fileURLToPath(new URL('../server', import.meta.url));

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
        plugins: [sitioUrl(), arrancarApi(apiPort)],
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
                    contacto: 'contacto.html'
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
