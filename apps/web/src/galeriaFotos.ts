// Lista de fotos de la galería pública (el orden de esta lista es el orden en "Todos").
// Para agregar una foto nueva:
// 1. Pon el archivo en apps/web/public/galeria/web/ (mejor en .webp, de unos 1200 px
//    de ancho, para que la página cargue rápido).
// 2. Agrega una línea aquí con su nombre, su categoría (con o sin pantalla LED),
//    su ancho y alto en píxeles, y una descripción corta de lo que se ve.
// No hace falta tocar ningún otro archivo.

export type CategoriaGaleria = 'con_pantalla' | 'sin_pantalla';

export interface FotoGaleria {
    archivo: string;
    categoria: CategoriaGaleria;
    ancho: number;
    alto: number;
    alt: string;
}

export const FOTOS_GALERIA: FotoGaleria[] = [
    { archivo: 'evento-con-pantalla-6.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1592, alt: 'Primer baile de novios con chispas frías y niebla baja frente a una pantalla LED' },
    { archivo: 'evento-sin-pantalla-5.webp', categoria: 'sin_pantalla', ancho: 1290, alto: 1441, alt: 'Candelabros de cristal sobre techo de bambú con follaje, mesas y pista de piso LED' },
    { archivo: 'evento-con-pantalla-8.webp', categoria: 'con_pantalla', ancho: 1290, alto: 997, alt: 'Pista de baile llena de invitados frente a pantallas LED y luces violeta' },
    { archivo: 'evento-sin-pantalla-7.webp', categoria: 'sin_pantalla', ancho: 1290, alto: 1451, alt: 'Carpa blanca con telas, mesa de novios y cabina de DJ con luces hexagonales' },
    { archivo: 'evento-con-pantalla-5.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1461, alt: 'Pista de baile con luz perimetral y pantalla LED con mensaje personalizado' },
    { archivo: 'evento-sin-pantalla-8.webp', categoria: 'sin_pantalla', ancho: 1290, alto: 1142, alt: 'Carpa transparente con bolas de espejos, flores de luz y pista negra con borde LED' },
    { archivo: 'evento-con-pantalla-12.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1143, alt: 'Cabina de DJ rodeada de pantallas LED flotantes y luces cálidas' },
    { archivo: 'evento-sin-pantalla-9.webp', categoria: 'sin_pantalla', ancho: 1290, alto: 1455, alt: 'Flores de tela y telas marfil sobre la cabina de DJ con cabezas móviles' },
    { archivo: 'evento-con-pantalla-9.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1142, alt: 'Escenario con pantalla LED, cabezas móviles y pista con diseño de hojas' },
    { archivo: 'evento-sin-pantalla-6.webp', categoria: 'sin_pantalla', ancho: 1290, alto: 1410, alt: 'Carpa con lámparas de ratán, pista geométrica y cabina de DJ' },
    { archivo: 'evento-con-pantalla-7.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1034, alt: 'DJ frente a pantallas LED con gráficos blancos y luz azul' },
    { archivo: 'evento-sin-pantalla-10.webp', categoria: 'sin_pantalla', ancho: 1290, alto: 779, alt: 'Equipo de Planet Producciones en pleno evento, con luces y banda en vivo' },
    { archivo: 'evento-con-pantalla-13.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1152, alt: 'Piso de cristal iluminado frente a pantallas LED en un salón elegante' },
    { archivo: 'evento-con-pantalla-10.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1148, alt: 'Pista con diseño de hojas, pantallas LED y haces de luz azul' },
    { archivo: 'evento-con-pantalla-14.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1149, alt: 'Pista con patrón en blanco y negro, pantalla LED y follaje colgante' },
    { archivo: 'evento-con-pantalla-11.webp', categoria: 'con_pantalla', ancho: 1290, alto: 1165, alt: 'Mesa de cena con centro de flores y haces de luz azul sobre el escenario' },
    { archivo: 'evento-con-pantalla-2.webp', categoria: 'con_pantalla', ancho: 961, alto: 1280, alt: 'Cabina de DJ con pantallas LED y pista de baile, techo decorado con flores y bombillas' },
    { archivo: 'evento-con-pantalla-4.webp', categoria: 'con_pantalla', ancho: 959, alto: 1280, alt: 'Pantalla LED con monograma de novios y pista de baile personalizada' },
    { archivo: 'evento-con-pantalla-3.webp', categoria: 'con_pantalla', ancho: 960, alto: 1280, alt: 'Escenario con pantalla LED dorada y montaje de mesas para evento elegante' },
    { archivo: 'evento-con-pantalla-1.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Montaje con pantallas LED, pista de baile e iluminación ambiental en jardín' },
    { archivo: 'evento-sin-pantalla-1.webp', categoria: 'sin_pantalla', ancho: 960, alto: 1280, alt: 'Decoración tropical con mesa de postres y estructura iluminada' },
    { archivo: 'evento-sin-pantalla-2.webp', categoria: 'sin_pantalla', ancho: 961, alto: 1280, alt: 'Pista de baile reflectante con esferas de espejo y candelabros' },
    { archivo: 'evento-con-pantalla-15.webp', categoria: 'con_pantalla', ancho: 1600, alto: 1200, alt: 'Cabina de DJ dentro de una estructura triangular de pantallas LED con visuales en espiral' },
    { archivo: 'evento-con-pantalla-16.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Pantalla LED con castillo de hielo, cabezas móviles y pista con reloj bajo telas blancas' },
    { archivo: 'evento-sin-pantalla-11.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1600, alt: 'Cabina de DJ con guirnaldas de follaje, luces hexagonales y pista de ajedrez bajo telas marfil' },
    { archivo: 'evento-con-pantalla-17.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Pantalla LED con un árbol al atardecer, frente de cabina LED y piso de puntos luminosos' },
    { archivo: 'evento-con-pantalla-18.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Pantalla LED de luces cálidas tras la cabina de DJ, con pista de ajedrez rojo y blanco' },
    { archivo: 'evento-sin-pantalla-12.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1600, alt: 'Telas verdes con aros de luz sobre la cabina de DJ, jardín de girasoles y pista en abanico' },
    { archivo: 'evento-con-pantalla-19.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Mesa de novios en azul y blanco con el escenario de pantalla LED al fondo' },
    { archivo: 'evento-con-pantalla-20.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Escenario con marcos LED naranja bajo un techo de buganvilias y lámparas de ratán' },
    { archivo: 'evento-sin-pantalla-13.webp', categoria: 'sin_pantalla', ancho: 960, alto: 1280, alt: 'Torres de luz hexagonal junto a un ventanal con vista a la montaña y pista de baldosa' },
    { archivo: 'evento-con-pantalla-21.webp', categoria: 'con_pantalla', ancho: 1202, alto: 1600, alt: 'Paneles LED espejados en ángulo junto a luminarias de pétalos y follaje' },
    { archivo: 'evento-con-pantalla-22.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Mesas de gala con flores y, al fondo, cabina de DJ con marcos LED y haces azules' },
    { archivo: 'evento-sin-pantalla-14.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1600, alt: 'Bolas de espejos y follaje bajo techo de bambú, con luces de estrella tras la cabina de DJ' },
    { archivo: 'evento-con-pantalla-23.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Escenario con pantallas LED de follaje tropical y haces de luz sobre pista estampada' },
    { archivo: 'evento-con-pantalla-24.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Techo colgante de follaje y flores sobre cabina de DJ con paneles LED en cápsula' },
    { archivo: 'evento-sin-pantalla-15.webp', categoria: 'sin_pantalla', ancho: 720, alto: 1280, alt: 'Pista de baile con borde de luz entre palmas y techo de telas ondulantes' },
    { archivo: 'evento-con-pantalla-25.webp', categoria: 'con_pantalla', ancho: 1202, alto: 1600, alt: 'Primer baile de novios bajo un candelabro de cristal, con pantalla LED y luces azules' },
    { archivo: 'evento-con-pantalla-26.webp', categoria: 'con_pantalla', ancho: 1202, alto: 1600, alt: 'Estructura LED en forma de pórtico junto a una cabina de DJ rodeada de plantas' },
    { archivo: 'evento-sin-pantalla-16.webp', categoria: 'sin_pantalla', ancho: 1600, alto: 1072, alt: 'Telón blanco drapeado con lámparas circulares y haces de luz sobre la cabina de DJ' },
    { archivo: 'evento-con-pantalla-27.webp', categoria: 'con_pantalla', ancho: 1202, alto: 1600, alt: 'Carpa transparente con telas blancas y ramas colgantes, mesas elegantes y pantallas LED al fondo' },
    { archivo: 'evento-con-pantalla-28.webp', categoria: 'con_pantalla', ancho: 1210, alto: 1600, alt: 'Cabina de DJ con pantalla LED estrellada, candelabros y telas blancas en carpa transparente' },
    { archivo: 'evento-sin-pantalla-17.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1600, alt: 'Carpa con telas oscuras, ramas colgantes y cabina de DJ entre sillas transparentes' },
    { archivo: 'evento-con-pantalla-29.webp', categoria: 'con_pantalla', ancho: 1170, alto: 1174, alt: 'Escenario con marcos LED de borde rosado y pantalla central entre mesas con flores amarillas' },
    { archivo: 'evento-con-pantalla-30.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Novios abrazados sobre una pista con monograma, frente a un escenario con marcos LED' },
    { archivo: 'evento-sin-pantalla-18.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1600, alt: 'Escenario en forma de V con luces triangulares y cabina de DJ bajo una carpa blanca' },
    { archivo: 'evento-con-pantalla-31.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Carpa con lámparas de fibra y follaje, pantallas LED multicolor y mesa de novios' },
    { archivo: 'evento-con-pantalla-32.webp', categoria: 'con_pantalla', ancho: 960, alto: 1280, alt: 'Piso de luces cálidas y pantalla LED con hoja verde junto a palmas, bajo un techo de luces' },
    { archivo: 'evento-sin-pantalla-19.webp', categoria: 'sin_pantalla', ancho: 1600, alto: 1202, alt: 'Mesa de novios con flores y velas bajo una cortina de luces, con la cabina de DJ al fondo' },
    { archivo: 'evento-con-pantalla-33.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1600, alt: 'Pantallas LED doradas sobre la cabina de DJ, canastos de plantas y pista con hojas tropicales' },
    { archivo: 'evento-con-pantalla-34.webp', categoria: 'con_pantalla', ancho: 1280, alto: 960, alt: 'Escenario con repisas verdes, pantalla LED de patrón floral y lámparas de ratán' },
    { archivo: 'evento-sin-pantalla-20.webp', categoria: 'sin_pantalla', ancho: 1202, alto: 1600, alt: 'Carpa transparente con bolas de espejo y escenario de luces ámbar sobre una pista reflectante' },
    { archivo: 'evento-con-pantalla-35.webp', categoria: 'con_pantalla', ancho: 960, alto: 1280, alt: 'Pista de piso luminoso y pantalla LED con hoja verde bajo un techo de luces' },
    { archivo: 'evento-con-pantalla-36.webp', categoria: 'con_pantalla', ancho: 960, alto: 1280, alt: 'Vista lateral del escenario con pantalla LED floral, repisas verdes y cabezas móviles' },
    { archivo: 'evento-sin-pantalla-21.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1600, alt: 'Primer baile de novios bajo flores blancas y bolas de espejo, con haces de luz azul' },
    { archivo: 'evento-sin-pantalla-22.webp', categoria: 'sin_pantalla', ancho: 1440, alto: 1016, alt: 'Primer baile con niebla baja y luces cálidas bajo cortinas de cristal y candelabros' },
    { archivo: 'evento-sin-pantalla-23.webp', categoria: 'sin_pantalla', ancho: 1600, alto: 1200, alt: 'Novios sentados frente al escenario, con luces ámbar y lámparas de ratán entre telas' }
];
