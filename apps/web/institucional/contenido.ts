/**
 * Datos de la web institucional que dependen de la dueña.
 *
 * Es la única fuente de estos valores: las páginas los toman de aquí al compilar
 * (marcadores {{dato:…}} y {{valor:…}} del HTML) y las páginas legales del Numeral 4
 * también los usarán, para que el sitio diga lo mismo en todas partes.
 *
 * Cada pendiente lleva el ID de docs/institucional/datos-pendientes.md. Cuando la
 * dueña lo confirme por escrito, o un documento oficial lo compruebe (en ese caso se
 * anota cuál en un comentario), cambie `confirmado` a true. Mientras quede alguno en
 * false, o un valor en null, `npm run build:institucional` se detiene con la lista y
 * `npm run dev:institucional` lo resalta en amarillo.
 *
 * La versión preliminar (`npm run build:institucional:preliminar`) es la única que se
 * publica con pendientes: muestra lo que ya tiene valor, escribe «(por confirmar)» donde
 * falta un dato y deja fuera lo de SOLO_SI_CONFIRMADO y las fotos sin autorizar.
 */

export const PENDIENTES = {
    TXT: { descripcion: 'Textos de la página revisados y aprobados', confirmado: false },
    A1: { descripcion: 'Nombre comercial', confirmado: false },
    A2: { descripcion: 'Razón social o nombre legal', confirmado: true }, // Certificado de la Cámara de Comercio, 12/08/2026
    A4: { descripcion: 'NIT con dígito de verificación', confirmado: true }, // Certificado de la Cámara de Comercio, 12/08/2026
    B1: { descripcion: 'Descripción de la actividad', confirmado: false },
    B3: { descripcion: 'Tipos de evento que atiende', confirmado: false },
    C1: { descripcion: 'Domicilio y dirección del responsable', confirmado: false },
    C2: { descripcion: 'Ciudad y departamento', confirmado: true }, // Domicilio del certificado de la Cámara de Comercio
    C3: { descripcion: 'Ciudades de cobertura', confirmado: false },
    D1: { descripcion: 'Servicios que se anuncian', confirmado: false },
    E1: { descripcion: 'Teléfono comercial', confirmado: true }, // Teléfono comercial 1 del certificado de la Cámara de Comercio
    E2: { descripcion: 'WhatsApp en el número comercial', confirmado: false },
    E3: { descripcion: 'Correo de la empresa', confirmado: false },
    E4: { descripcion: 'Instagram oficial', confirmado: false },
    G2: { descripcion: 'Cargo o área que atiende consultas y reclamos', confirmado: false },
    G3: { descripcion: 'Correo para solicitudes sobre datos personales', confirmado: false },
    G4: { descripcion: 'Fecha de entrada en vigencia de los documentos legales', confirmado: false },
    G5: { descripcion: 'Proveedores tecnológicos que intervienen (lo confirma el equipo)', confirmado: false },
    PRIV: { descripcion: 'Política de privacidad revisada y aprobada por la dueña', confirmado: false },
    TERM: { descripcion: 'Términos y condiciones revisados y aprobados por la dueña', confirmado: false },
    COND: { descripcion: 'Condiciones generales de contratación de los términos (pago, cancelación y responsabilidades) aprobadas por la dueña', confirmado: false },
    ELIM: { descripcion: 'Procedimiento de eliminación de datos revisado y aprobado por la dueña', confirmado: false }
};

export type IdPendiente = keyof typeof PENDIENTES;

/**
 * Bloques que ni siquiera la versión preliminar publica mientras no estén confirmados: son
 * compromisos o afirmaciones legales que la dueña todavía no aprobó (hoy, las condiciones
 * generales de contratación). Al confirmarlos aparecen en todas las versiones.
 */
export const SOLO_SI_CONFIRMADO: readonly IdPendiente[] = ['COND'];

interface Dato {
    id: IdPendiente;
    /** null = todavía no se tiene el dato */
    valor: string | readonly string[] | null;
}

/** Valores que muestra la página. Los que vienen del equipo siguen sin confirmar. */
export const DATOS = {
    nombreComercial: { id: 'A1', valor: 'Planet Producciones' },
    actividad: { id: 'B1', valor: 'producción técnica para eventos' },
    serviciosResumen: { id: 'D1', valor: 'sonido, iluminación, pantallas LED y efectos especiales' },
    tiposEvento: { id: 'B3', valor: ['bodas', 'fiestas de 15 años', 'grados', 'eventos corporativos'] },
    ciudad: { id: 'C2', valor: 'Manizales' },
    departamento: { id: 'C2', valor: 'Caldas' },
    cobertura: { id: 'C3', valor: ['Manizales', 'Chinchiná - Santágueda', 'Pereira', 'Armenia'] },
    telefono: { id: 'E1', valor: '+57 312 781 70 72' },
    telefonoInternacional: { id: 'E1', valor: '+573127817072' },
    whatsappNumero: { id: 'E2', valor: '573127817072' },
    // Correo comercial que figura en el certificado de la Cámara de Comercio. La dueña debe confirmar que es el que se publica.
    correo: { id: 'E3', valor: 'planet.producciones@outlook.com' },
    instagramEnlace: { id: 'E4', valor: 'https://www.instagram.com/planet.producciones/' },
    instagramUsuario: { id: 'E4', valor: '@planet.producciones' },
    // Documentos legales (Numeral 4). Nunca se completan con suposiciones: solo con lo que
    // confirme la dueña o compruebe el certificado de la Cámara de Comercio (12/08/2026).
    razonSocial: { id: 'A2', valor: 'PLANETT PRODUCCIONES S.A.S.' }, // con doble T, como está registrada
    nit: { id: 'A4', valor: '901.668.571-1' }, // con puntos, como figura en el contrato; la auditoría solo deja publicar este texto exacto
    // Domicilio: sigue en null a propósito. La dirección del certificado parece una vivienda y el repositorio es
    // público; la dueña decide si se publica completa o solo la ciudad (pregunta 5 de la solicitud).
    domicilio: { id: 'C1', valor: null },
    areaResponsable: { id: 'G2', valor: null },
    // Propuesta: el mismo correo de E3. La dueña debe aprobarlo y comprometerse a revisarlo (los reclamos tienen plazos legales).
    correoDatos: { id: 'G3', valor: 'planet.producciones@outlook.com' },
    fechaVigencia: { id: 'G4', valor: null }
} satisfies Record<string, Dato>;

export type CampoDato = keyof typeof DATOS;

export interface FotoCandidata {
    /** ID en docs/institucional/inventario-textos.md (sección 3) */
    id: string;
    /** Archivo dentro de apps/web/public/galeria/ */
    archivo: string;
    alt: string;
    /** true solo cuando la dueña autorizó publicarla (datos F1 a F3) */
    autorizada: boolean;
}

/**
 * Fotos candidatas para la galería. La versión publicada solo incluye las
 * autorizadas y, si no hay ninguna, la sección de galería no aparece. Las copias
 * repetidas de «sin pantalla» (-3 y -4) no se listan.
 */
export const FOTOS: readonly FotoCandidata[] = [
    { id: 'F-01', archivo: 'evento-con-pantalla-1.png', alt: 'Montaje nocturno con paneles LED, luces robóticas y cabina de DJ bajo un techo de telas', autorizada: false },
    { id: 'F-02', archivo: 'evento-con-pantalla-2.png', alt: 'Cabina de DJ con marcos LED y pista iluminada bajo un techo de follaje con esferas de espejo', autorizada: false },
    { id: 'F-03', archivo: 'evento-con-pantalla-3.png', alt: 'Salón con escenario de pantalla LED, pista de vidrio iluminada y mesa servida', autorizada: false },
    { id: 'F-04', archivo: 'evento-con-pantalla-4.png', alt: 'Pantalla LED con el monograma de los novios sobre una pista personalizada', autorizada: false },
    { id: 'F-05', archivo: 'evento-sin-pantalla-1.png', alt: 'Carpa con follaje colgante, lámparas de flecos y mesas de postres frente a la cabina', autorizada: false },
    { id: 'F-06', archivo: 'evento-sin-pantalla-2.png', alt: 'Pista LED de efecto espejo bajo lámparas de araña y luces colgantes', autorizada: false }
];
