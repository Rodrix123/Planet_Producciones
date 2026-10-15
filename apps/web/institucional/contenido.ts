/**
 * Datos de la web institucional que dependen de la dueña.
 *
 * Es la única fuente de estos valores: las páginas los toman de aquí al compilar
 * (marcadores {{dato:…}} y {{valor:…}} del HTML) y las páginas legales del Numeral 4
 * también los usarán, para que el sitio diga lo mismo en todas partes.
 *
 * Cada pendiente lleva el ID de docs/institucional/datos-pendientes.md. Cuando la
 * dueña lo confirme por escrito, cambie `confirmado` a true. Mientras quede alguno en
 * false, o un valor en null, `npm run build:institucional` se detiene con la lista y
 * `npm run dev:institucional` lo resalta en amarillo.
 */

export const PENDIENTES = {
    TXT: { descripcion: 'Textos de la página revisados y aprobados', confirmado: false },
    A1: { descripcion: 'Nombre comercial', confirmado: false },
    B1: { descripcion: 'Descripción de la actividad', confirmado: false },
    B3: { descripcion: 'Tipos de evento que atiende', confirmado: false },
    C2: { descripcion: 'Ciudad y departamento', confirmado: false },
    C3: { descripcion: 'Ciudades de cobertura', confirmado: false },
    D1: { descripcion: 'Servicios que se anuncian', confirmado: false },
    E1: { descripcion: 'Teléfono comercial', confirmado: false },
    E2: { descripcion: 'WhatsApp en el número comercial', confirmado: false },
    E3: { descripcion: 'Correo de la empresa', confirmado: false },
    E4: { descripcion: 'Instagram oficial', confirmado: false }
};

export type IdPendiente = keyof typeof PENDIENTES;

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
    correo: { id: 'E3', valor: null },
    instagramEnlace: { id: 'E4', valor: 'https://www.instagram.com/planet.producciones/' },
    instagramUsuario: { id: 'E4', valor: '@planet.producciones' }
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
