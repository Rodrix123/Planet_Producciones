import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    // Rutas relativas en el build para que dist/ funcione desde cualquier
    // servidor estático (Live Server, Express, Nginx).
    base: './',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    server: {
        port: 5173
    }
});
