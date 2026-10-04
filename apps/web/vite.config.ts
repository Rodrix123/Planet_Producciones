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
                eventosProceso: 'eventos-proceso.html',
                eventosProgramados: 'eventos-programados.html',
                cotizacionesDefinitivas: 'cotizaciones-definitivas.html'
            }
        }
    },
    server: {
        port: 5173
    }
});
