// Marco común de la web pública (menú cápsula + pie de página). Cada página
// pública lleva <body class="sitio-body" data-pagina="..."> con dos contenedores
// vacíos (#sitio-header y #sitio-footer) y llama a montarSitio().

import '@fontsource/tenor-sans/latin-400.css';
import '@fontsource/tenor-sans/latin-ext-400.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import '../style.css';
import '../sitio.css';

// Páginas públicas; la actual se marca en el menú.
type Pagina = 'inicio' | 'servicios' | 'nosotros' | 'galeria' | 'ayuda' | 'contacto' | 'acceso' | 'cotizador';

// Enlaces del menú, en el orden en que aparecen.
const ENLACES: { clave: Pagina; href: string; texto: string }[] = [
    { clave: 'inicio', href: 'index.html', texto: 'Inicio' },
    { clave: 'servicios', href: 'servicios.html', texto: 'Servicios' },
    { clave: 'nosotros', href: 'nosotros.html', texto: 'Por Qué Elegirnos' },
    { clave: 'galeria', href: 'galeria.html', texto: 'Galería' },
    { clave: 'ayuda', href: 'ayuda.html', texto: 'Preguntas y PQRS' },
    { clave: 'contacto', href: 'contacto.html', texto: 'Contacto' }
];

// Contacto: Instagram y WhatsApp con un mensaje inicial ya escrito.
const INSTAGRAM = 'https://www.instagram.com/planet.producciones/';
const WHATSAPP = 'https://wa.me/573127817072?text=' + encodeURIComponent('Hola, quiero cotizar un evento con Planet Producciones.');

// HTML del menú cápsula, con la página actual resaltada.
function htmlHeader(pagina: Pagina): string {
    const enlaces = ENLACES.map(e =>
        `<a href="${e.href}" class="sitio-enlace"${e.clave === pagina ? ' aria-current="page"' : ''}>${e.texto}</a>`
    ).join('');

    return `
    <header class="sitio-nav" id="sitioNav">
        <div class="sitio-capsula">
            <a href="index.html" class="sitio-marca" aria-label="Planet Producciones, inicio">
                <img src="logo.png?v=2" alt="" width="40" height="40">
                <span>Planet Producciones</span>
            </a>

            <nav class="sitio-menu" id="sitioMenu" aria-label="Principal">
                ${enlaces}
                <div class="sitio-menu-acciones">
                    <a href="login.html" class="sitio-acceso"><i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión</a>
                    <a href="cotizador.html" class="boton boton-primario"><i class="fa-solid fa-file-invoice-dollar"></i> Cotizar Ahora</a>
                </div>
            </nav>

            <button type="button" class="sitio-burger" id="sitioBurger" aria-expanded="false" aria-controls="sitioMenu" aria-label="Abrir el menú">
                <span></span><span></span>
            </button>
        </div>
    </header>`;
}

// HTML del pie de página (enlaces, contacto y acceso del equipo).
function htmlFooter(): string {
    const enlaces = ENLACES.map(e => `<a href="${e.href}">${e.texto}</a>`).join('');

    return `
    <footer class="sitio-pie">
        <div class="sitio-pie-grid">
            <div class="sitio-pie-marca">
                <div class="sitio-pie-logo">
                    <img src="logo.png?v=2" alt="" width="44" height="44">
                    <div>
                        <strong>Planet Producciones</strong>
                        <span>Eventos VIP & Producción Técnica</span>
                    </div>
                </div>
                <p>
                    Producción técnica integral para eventos VIP: sonido, iluminación, pantallas LED y
                    efectos especiales, con equipos propios y montaje profesional.
                </p>
                <p class="sitio-pie-pasion"><i class="fa-solid fa-heart"></i> Hecho con pasión para tus momentos únicos</p>
            </div>

            <nav class="sitio-pie-col" aria-label="Mapa del sitio">
                <h2>Explora</h2>
                ${enlaces}
            </nav>

            <div class="sitio-pie-col">
                <h2>Contacto</h2>
                <a href="tel:+573127817072"><i class="fa-solid fa-phone"></i> +57 312 781 70 72</a>
                <a href="${INSTAGRAM}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-instagram"></i> @planet.producciones</a>
                <span><i class="fa-solid fa-location-dot"></i> Manizales - Caldas, Colombia</span>
                <a href="cotizador.html" class="boton boton-primario boton-chico"><i class="fa-solid fa-file-invoice-dollar"></i> Cotizar Ahora</a>
            </div>
        </div>

        <div class="sitio-pie-base">
            <p>© 2026 Planet Producciones. Todos los derechos reservados.</p>
            <a href="login.html"><i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión</a>
        </div>
    </footer>`;
}

// Comportamiento del menú: compactarse al bajar y abrirse/cerrarse en móvil.
function activarMenu(): void {
    const nav = document.getElementById('sitioNav');
    const burger = document.getElementById('sitioBurger');
    if (!nav || !burger) return;

    // La cápsula se compacta al bajar.
    const alScroll = () => nav.classList.toggle('compacta', window.scrollY > 24);
    alScroll();
    window.addEventListener('scroll', alScroll, { passive: true });

    // Menú móvil.
    const cerrar = () => {
        nav.classList.remove('abierto');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-label', 'Abrir el menú');
    };
    burger.addEventListener('click', () => {
        const abierto = nav.classList.toggle('abierto');
        burger.setAttribute('aria-expanded', String(abierto));
        burger.setAttribute('aria-label', abierto ? 'Cerrar el menú' : 'Abrir el menú');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    document.getElementById('sitioMenu')?.addEventListener('click', e => {
        if ((e.target as HTMLElement).closest('a')) cerrar();
    });
}

// Un solo gesto de entrada: los bloques con [data-aparece] suben y se muestran
// al entrar en pantalla. Sin JS (o con movimiento reducido) todo queda visible.
function activarApariciones(): void {
    const items = document.querySelectorAll<HTMLElement>('[data-aparece]');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.documentElement.classList.add('con-apariciones');
    const observador = new IntersectionObserver(entradas => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;
            (entrada.target as HTMLElement).classList.add('visible');
            observador.unobserve(entrada.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(el => observador.observe(el));
}

// Los números con data-cuenta (p. ej. "+500") cuentan desde 0 al entrar en pantalla.
function activarContadores(): void {
    const items = document.querySelectorAll<HTMLElement>('[data-cuenta]');
    if (!items.length) return;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido || !('IntersectionObserver' in window)) return;

    const observador = new IntersectionObserver(entradas => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;
            const el = entrada.target as HTMLElement;
            observador.unobserve(el);
            const final = Number(el.dataset.cuenta);
            const plantilla = el.textContent || '';
            const inicio = performance.now();
            const duracion = 1400;
            const paso = (ahora: number) => {
                const p = Math.min(1, (ahora - inicio) / duracion);
                const suave = 1 - Math.pow(1 - p, 3);
                el.textContent = plantilla.replace(/[0-9]+/, String(Math.round(final * suave)));
                if (p < 1) requestAnimationFrame(paso);
            };
            requestAnimationFrame(paso);
        });
    }, { threshold: 0.6 });
    items.forEach(el => observador.observe(el));
}

// Botón flotante de WhatsApp; no se muestra en el acceso ni en el cotizador para no distraer.
function montarWhatsApp(pagina: Pagina): void {
    if (pagina === 'acceso' || pagina === 'cotizador') return;
    const a = document.createElement('a');
    a.className = 'sitio-wa';
    a.href = WHATSAPP;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Escríbenos por WhatsApp');
    a.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span>';
    document.body.appendChild(a);
}

/**
 * Punto de entrada: inserta menú y pie, y activa menú, apariciones, contadores y WhatsApp.
 */
export function montarSitio(): void {
    const pagina = (document.body.dataset.pagina || 'inicio') as Pagina;
    const header = document.getElementById('sitio-header');
    const footer = document.getElementById('sitio-footer');
    document.querySelector('main')?.setAttribute('id', 'contenido');
    document.body.insertAdjacentHTML('afterbegin', '<a href="#contenido" class="sitio-salto">Saltar al contenido</a>');
    if (header) header.outerHTML = htmlHeader(pagina);
    if (footer) footer.outerHTML = htmlFooter();
    activarMenu();
    activarApariciones();
    activarContadores();
    montarWhatsApp(pagina);
}
