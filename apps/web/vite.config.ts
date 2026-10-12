import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// El servidor de esta misma rama (apps/server) lee su puerto de PORT; el proxy de
// desarrollo lo toma de ahí para que web y API no se desalineen.
const carpetaServidor = fileURLToPath(new URL('../server', import.meta.url));

export default defineConfig(({ mode }) => {
    const puertoApi = loadEnv(mode, carpetaServidor, '').PORT || '3000';

    return {
        root: '.',
        // Rutas relativas en el build para que dist/ funcione desde cualquier
        // servidor estático (Live Server, Express, Nginx).
        base: './',
        publicDir: 'public',
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            rollupOptions: {
                // Sitio multi-página: landing (index), cotizador y login.
                input: {
                    main: 'index.html',
                    cotizador: 'cotizador.html',
                    login: 'login.html',
                    empleados: 'empleados.html',
                    eventos: 'eventos.html',
                    inventario: 'inventario.html'
                }
            }
        },
        server: {
            port: 5173,
            // Si el 5173 está ocupado (p. ej. por el Vite de otra rama) falla en vez de
            // saltar al siguiente puerto: así nunca se abre la web equivocada.
            strictPort: true,
            // La web llama a /api en su mismo origen (VITE_API_URL vacío) y Vite lo
            // reenvía al servidor de esta rama: sin CORS ni URL fija entre ramas.
            // `vite preview` hereda este proxy.
            proxy: {
                '^/api/': {
                    target: `http://127.0.0.1:${puertoApi}`,
                    changeOrigin: true
                }
            }
        }
    };
});
