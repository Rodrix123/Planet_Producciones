import nodemailer from 'nodemailer';

// Proveedor de correo configurable (EMAIL_SERVICE): nodemailer reconoce el nombre
// directamente ('gmail', 'hotmail', etc.) y arma el SMTP correcto por detrás.
// Debe coincidir con el proveedor real de EMAIL_USER/EMAIL_PASS.
export const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
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
