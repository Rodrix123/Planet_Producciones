import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { DATOS, FOTOS } from './institucional/contenido';
import { pluginAuditoria } from './institucional/plugin-auditoria';
import { pluginContenido } from './institucional/plugin-contenido';

// Web institucional (Cloudflare Pages): sitio estático aparte del aplicativo, sin
// backend ni variables de entorno. Solo compila las páginas de esta lista blanca.
// Configuración de Cloudflare: docs/institucional/configuracion-cloudflare-pages.md
// Modos de `vite build` (--mode): sin modo = definitiva · preliminar = publicable con pendientes · borrador = revisión local.
const RAIZ = resolve(__dirname, 'institucional');
const PAGINAS_LEGALES = ['privacidad', 'terminos', 'eliminacion-datos'];
// 404: Cloudflare Pages la muestra en cualquier dirección inexistente (sin ella, mostraría el inicio)
const PAGINAS = ['index', ...PAGINAS_LEGALES, '404'];

/** Valores ya escritos en contenido.ts: la auditoría solo deja publicar estos correos, teléfonos y NIT. */
const valores = (...campos: (keyof typeof DATOS)[]) =>
    campos.map((campo) => DATOS[campo].valor).filter((valor): valor is string => typeof valor === 'string');

export default defineConfig({
    root: RAIZ,
    base: '/',
    appType: 'mpa',
    // Carpeta pública propia, solo con _headers (encabezados de seguridad de Cloudflare Pages).
    // El logo y las fotos no van aquí: se referencian desde las páginas y solo se copian los
    // que se usan (las fotos sin autorizar no llegan a la versión publicada).
    publicDir: resolve(RAIZ, 'publico'),
    plugins: [
        pluginContenido({ raiz: RAIZ, carpetaRecursos: resolve(__dirname, 'public') }),
        // Auditoría de seguridad del Numeral 5: revisa la carpeta compilada y detiene el build ante un problema
        pluginAuditoria({
            raiz: RAIZ,
            paginas: PAGINAS,
            paginasLegales: PAGINAS_LEGALES,
            correos: valores('correo', 'correoDatos'),
            telefonos: valores('telefonoInternacional', 'whatsappNumero').map((telefono) => telefono.replace(/\D/g, '')),
            numerosPermitidos: valores('nit'),
            dominiosEnlaces: ['www.instagram.com', 'wa.me', 'www.sic.gov.co'],
            dominiosEstilos: ['cdnjs.cloudflare.com'],
            // Ninguna versión publicable (preliminar o definitiva) puede llevar fotos que la dueña no autorizó
            fotosSinAutorizar: FOTOS.filter((foto) => !foto.autorizada).map((foto) => foto.archivo)
        })
    ],
    server: {
        port: 5174,
        strictPort: true
    },
    preview: {
        port: 4174,
        strictPort: true
    },
    build: {
        outDir: resolve(RAIZ, 'dist'),
        emptyOutDir: true,
        // El sitio tiene un solo archivo JS: sin el polyfill de modulepreload (usa fetch), el
        // JavaScript publicado no hace ninguna petición y la auditoría puede exigirlo.
        modulePreload: { polyfill: false },
        rollupOptions: {
            input: Object.fromEntries(
                PAGINAS.filter((pagina) => existsSync(resolve(RAIZ, `${pagina}.html`))).map((pagina) => [pagina, resolve(RAIZ, `${pagina}.html`)])
            )
        }
    }
});
