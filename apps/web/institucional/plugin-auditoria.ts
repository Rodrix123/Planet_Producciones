import type { Logger, Plugin } from 'vite';
import { auditarSitio, informeAuditoria, type OpcionesAuditoria } from './auditoria';

/**
 * Ejecuta la auditoría de seguridad (auditoria.ts) cuando el build termina de escribir
 * la carpeta del sitio. Si encuentra un problema, el build falla y la carpeta no debe
 * publicarse. En `--mode borrador` el contenido sin confirmar solo se avisa.
 */
export function pluginAuditoria(opciones: Omit<OpcionesAuditoria, 'carpeta' | 'estricto'>): Plugin {
    let estricto = true;
    let logger: Logger | undefined;

    return {
        name: 'planet:auditoria-institucional',
        apply: 'build',
        configResolved(config) {
            estricto = config.mode !== 'borrador';
            logger = config.logger;
        },
        writeBundle(salida) {
            if (!salida.dir) throw new Error('La auditoría necesita la carpeta de salida del build.');
            const controles = auditarSitio({ ...opciones, carpeta: salida.dir, estricto });
            const informe = informeAuditoria(controles, estricto);
            if (controles.some((c) => c.problemas.length > 0)) throw new Error(`\n${informe}`);
            logger?.info(`\n${informe}\n`);
        }
    };
}
