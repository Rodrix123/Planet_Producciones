import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { pluginContenido } from './institucional/plugin-contenido';

// Web institucional (Cloudflare Pages): sitio estático aparte del aplicativo, sin
// backend ni variables de entorno. Solo compila las páginas de esta lista blanca.
const RAIZ = resolve(__dirname, 'institucional');
const PAGINAS = ['index', 'privacidad', 'terminos', 'eliminacion-datos'];

export default defineConfig({
    root: RAIZ,
    base: '/',
    appType: 'mpa',
    // Sin carpeta pública: el logo y las fotos se referencian desde las páginas y solo
    // se copian los que se usan (las fotos sin autorizar no llegan a la versión publicada).
    publicDir: false,
    plugins: [pluginContenido({ raiz: RAIZ, carpetaRecursos: resolve(__dirname, 'public') })],
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
        rollupOptions: {
            input: Object.fromEntries(
                PAGINAS.filter((pagina) => existsSync(resolve(RAIZ, `${pagina}.html`))).map((pagina) => [pagina, resolve(RAIZ, `${pagina}.html`)])
            )
        }
    }
});
