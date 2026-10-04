import nodemailer from 'nodemailer';

// Configuración SMTP para Outlook/Hotmail
export const transporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    // Sin esto, un problema de red/credenciales puede dejar la petición colgada varios
    // minutos en vez de fallar rápido con un mensaje claro para quien está esperando.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
});
