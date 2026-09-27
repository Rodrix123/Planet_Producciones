import { defineConfig } from 'vite';

export default defineConfig({
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
                login: 'login.html'
            }
        }
    },
    server: {
        port: 5173
    }
});
