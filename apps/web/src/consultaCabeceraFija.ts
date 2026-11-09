import './consultaCabeceraFija.css';

/**
 * Con la cabecera de la lista fija arriba, el navegador debe saber cuánto mide para que el
 * elemento que recibe el foco con el teclado no quede escondido debajo de ella
 * (scroll-padding-top). El alto cambia con el ancho de la pantalla y con el botón "Limpiar
 * filtros", y la cabecera deja de estar fija en el detalle y en pantallas pequeñas (lo decide
 * consultaCabeceraFija.css).
 */
const cabecera = document.querySelector<HTMLElement>('.consulta-cabecera');

function ajustarEspacioDeFoco(): void {
    if (!cabecera) return;
    const fija = getComputedStyle(cabecera).position === 'sticky';
    document.documentElement.style.scrollPaddingTop = fija
        ? `${Math.ceil(cabecera.getBoundingClientRect().height) + 12}px`
        : '';
}

if (cabecera) {
    new ResizeObserver(ajustarEspacioDeFoco).observe(cabecera);
    window.addEventListener('resize', ajustarEspacioDeFoco);
    // Al abrir o cerrar el detalle la cabecera deja de estar fija o vuelve a estarlo.
    const detalle = document.getElementById('detalleConsulta');
    if (detalle) new MutationObserver(ajustarEspacioDeFoco).observe(detalle, { attributes: true, attributeFilter: ['hidden'] });
}
