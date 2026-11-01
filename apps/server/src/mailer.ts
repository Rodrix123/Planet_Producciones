import fs from 'fs';
import tls from 'tls';
import nodemailer from 'nodemailer';

/**
 * Opciones de TLS de la conexión con el servidor de correo.
 *
 * Por defecto SE VERIFICA el certificado de Gmail: sin eso, cualquiera que intercepte la conexión
 * (un proxy, un antivirus que "inspecciona HTTPS", una red pública) podría leer la contraseña de la
 * cuenta de correo. Si en la red donde corre el servidor algo intercepta el TLS, el error es
 * "self-signed certificate in certificate chain" y hay dos salidas:
 *   - EMAIL_CA_FILE=ruta/al/certificado.pem  -> confiar además en el certificado raíz de ese
 *     antivirus/proxy (lo correcto: se verifica todo y solo se añade esa autoridad).
 *   - EMAIL_TLS_INSECURE=true                -> NO verificar (solo para desarrollo en esa red).
 */
export function opcionesTls(env: NodeJS.ProcessEnv = process.env): { rejectUnauthorized?: boolean; ca?: string[] } {
    if (env.EMAIL_TLS_INSECURE === 'true') {
        console.warn('AVISO: EMAIL_TLS_INSECURE=true, el certificado del servidor de correo NO se verifica. No lo uses en producción.');
        return { rejectUnauthorized: false };
    }
    if (env.EMAIL_CA_FILE) {
        return { ca: [...tls.rootCertificates, fs.readFileSync(env.EMAIL_CA_FILE, 'utf8')] };
    }
    return {};
}

// Puerto 465 (TLS implícito, lo que usa el atajo `service: 'gmail'` de nodemailer) queda
// bloqueado/interceptado en algunas redes (se cuelga sin dar error); por eso se usa SMTP
// explícito en el puerto 587 con STARTTLS, que sí atraviesa esa interferencia y es el que
// Gmail recomienda para clientes SMTP de todas formas.
export const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: opcionesTls(),
    // Sin esto, un problema de red/credenciales puede dejar la petición colgada varios
    // minutos en vez de fallar rápido con un mensaje claro para quien está esperando.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
});

const ERRORES_TRANSITORIOS = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED'];

function esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Envoltorio de `transporter.sendMail` con reintentos: en esta red el handshake TLS con
 *  Gmail falla de forma intermitente (se corta a mitad de STARTTLS) con una tasa de fallo
 *  de hasta ~2/3 por intento, así que un solo intento fallido no es necesariamente un error
 *  real de configuración/credenciales — reintentar varias veces más resuelve la gran mayoría
 *  de esos casos sin que el usuario vea el error. Solo se relanza (sin reintentar) un fallo
 *  que no sea de red/conexión. */
export async function enviarCorreo(opciones: Parameters<typeof transporter.sendMail>[0]): ReturnType<typeof transporter.sendMail> {
    const intentos = 5;
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            return await transporter.sendMail(opciones);
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            const esTransitorio = !!code && ERRORES_TRANSITORIOS.includes(code);
            if (!esTransitorio || intento === intentos) throw err;
            await esperar(1000 * intento);
        }
    }
    throw new Error('No se pudo enviar el correo tras varios intentos');
}
