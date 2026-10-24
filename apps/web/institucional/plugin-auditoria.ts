import type { Logger, Plugin } from 'vite';
import { auditarSitio, informeAuditoria, type OpcionesAuditoria } from './auditoria';

/**
 * Ejecuta la auditoría de seguridad (auditoria.ts) cuando el build termina de escribir
 * la carpeta del sitio. Si encuentra un problema, el build falla y la carpeta no debe
 * publicarse. En `--mode borrador` (revisión local) el contenido sin confirmar solo se avisa;
 * en `--mode preliminar` (la que se publica con pendientes) las marcas de revisión siguen
 * siendo un error y se exige el aviso de versión preliminar.
 */
export function pluginAuditoria(opciones: Omit<OpcionesAuditoria, 'carpeta' | 'estricto' | 'preliminar'>): Plugin {
    let estricto = true;
    let preliminar = false;
    let logger: Logger | undefined;

    return {
        name: 'planet:auditoria-institucional',
        apply: 'build',
        configResolved(config) {
            estricto = config.mode !== 'borrador';
            preliminar = config.mode === 'preliminar';
            logger = config.logger;
        },
        writeBundle(salida) {
            if (!salida.dir) throw new Error('La auditoría necesita la carpeta de salida del build.');
            const controles = auditarSitio({ ...opciones, carpeta: salida.dir, estricto, preliminar });
            const informe = informeAuditoria(controles, estricto, preliminar);
            if (controles.some((c) => c.problemas.length > 0)) throw new Error(`\n${informe}`);
            logger?.info(`\n${informe}\n`);
        }
    };
}
