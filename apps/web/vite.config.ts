import { defineConfig, type Plugin } from 'vite';

// Dirección pública del sitio (ej. https://planetproducciones.com), usada en las
// etiquetas para compartir el enlace en WhatsApp/Instagram, que exigen una URL
// absoluta. Se define al construir: VITE_SITE_URL=https://... npm run build
const urlSitio = (process.env.VITE_SITE_URL || '').replace(/[/]$/, '');
const sitioUrl = (): Plugin => ({
    name: 'sitio-url',
    transformIndexHtml: (html) => html.split('__SITE_URL__').join(urlSitio)
});

export default defineConfig({
    plugins: [sitioUrl()],
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
                eventosProceso: 'eventos-proceso.html',
                eventosProgramados: 'eventos-programados.html',
                cotizacionesDefinitivas: 'cotizaciones-definitivas.html',
                pqrsAdmin: 'pqrs-admin.html',
                inventario: 'inventario.html',
                galeria: 'galeria.html',
                servicios: 'servicios.html',
                nosotros: 'nosotros.html',
                ayuda: 'ayuda.html',
                contacto: 'contacto.html'
            }
        }
    },
    server: {
        port: 5173
    }
});
