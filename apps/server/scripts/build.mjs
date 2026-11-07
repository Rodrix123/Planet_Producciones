// Compila el servidor en UN solo archivo (dist/index.js).
//
// Por qué no basta con `tsc`: el servidor importa el paquete del monorepo @my-app/db (código
// TypeScript sin compilar). Con `tsc` solo, `node dist/index.js` se caía al arrancar porque Node no
// puede cargar ese .ts. Aquí @my-app/db se incluye dentro del archivo final, y el resto de
// dependencias (express, pg, pdfkit…) se quedan como paquetes normales de node_modules.
//
// Uso:  node scripts/build.mjs [carpeta-de-salida]     (por defecto: dist)

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.resolve(process.argv[2] || path.join(raiz, 'dist'));
const paquete = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));

// Todo lo que está en "dependencies" se instala en producción y no hace falta incluirlo.
const externos = Object.keys(paquete.dependencies || {});

fs.rmSync(salida, { recursive: true, force: true }); // sin restos de compilaciones anteriores

await build({
    entryPoints: [path.join(raiz, 'src', 'index.ts')],
    outfile: path.join(salida, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: externos.flatMap((n) => [n, `${n}/*`]),
    sourcemap: true,
    logLevel: 'info'
});
