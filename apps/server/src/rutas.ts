import path from 'path';

// Carpetas del servidor. Este archivo vive en src/ (en desarrollo) y el servidor empaquetado vive
// en dist/ (en producción): en los dos casos la carpeta del servidor es la de arriba. Así las rutas
// no dependen de en qué subcarpeta quedó cada archivo al compilar.
export const RAIZ_SERVIDOR = path.resolve(__dirname, '..');

/** Imágenes que usan los PDF (logo, firma). */
export const CARPETA_ASSETS = path.join(RAIZ_SERVIDOR, 'assets');

/** Frontend compilado, para abrir la app completa desde el servidor. */
export const CARPETA_WEB = path.resolve(RAIZ_SERVIDOR, '..', 'web', 'dist');

/**
 * Archivos que suben los usuarios (contratos firmados). En producción debe apuntar a un disco
 * persistente con UPLOADS_DIR; si no, se pierden al volver a desplegar el contenedor.
 */
export const CARPETA_SUBIDAS = process.env.UPLOADS_DIR || path.join(RAIZ_SERVIDOR, 'uploads');
