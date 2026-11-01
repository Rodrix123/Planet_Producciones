// Capa visual del cotizador (cotizador.html): menú cápsula de la web, formulario
// por pasos y barra con el total en móvil. No toca el cálculo ni el guardado:
// todos los campos y botones siguen siendo los mismos de main.ts; aquí solo se
// decide qué sección se ve en cada momento.

import { montarSitio } from './shared/sitio';

// Menú y pie de página comunes de la web pública.
montarSitio();

// Formulario del cotizador y contenedor donde main.ts dibuja el catálogo.
const form = document.getElementById('quoteForm') as HTMLFormElement | null;
const catalogo = document.getElementById('catalogoDinamico') as HTMLElement | null;

// Un paso del formulario: su título y el panel que se muestra.
interface Paso {
    titulo: string;
    panel: HTMLElement;
}

// Quita la numeración ("2. ") y los espacios sobrantes del título de una sección.
function limpiarTitulo(texto: string): string {
    return texto.replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
}

// Título del paso tomado de la sección; si no tiene, se usa el de respaldo.
function tituloDe(panel: HTMLElement, respaldo: string): string {
    const t = panel.querySelector('.form-section-title');
    return t ? limpiarTitulo(t.textContent || '') || respaldo : respaldo;
}

// Divide el formulario en pasos (barra de progreso, botones Anterior/Siguiente) sin cambiar sus campos.
function construirPasos(): void {
    if (!form || !catalogo) return;

    const paneles: Paso[] = [];
    const contacto = document.getElementById('seccionDatosContacto');
    const evento = document.getElementById('seccionCoberturaEvento');
    if (contacto) paneles.push({ titulo: tituloDe(contacto, 'Datos de Contacto'), panel: contacto });
    if (evento) paneles.push({ titulo: tituloDe(evento, 'Cobertura & Evento'), panel: evento });
    catalogo.querySelectorAll<HTMLElement>(':scope > .form-group').forEach((grupo, i) => {
        paneles.push({ titulo: tituloDe(grupo, `Servicios ${i + 1}`), panel: grupo });
    });
    if (paneles.length < 2) return;

    // El aviso del evento en creación se queda siempre visible, arriba del formulario.
    const aviso = document.getElementById('avisoEvento');
    if (aviso) form.prepend(aviso);

    form.classList.add('pasos-activos');

    // Barra de pasos
    const barra = document.createElement('nav');
    barra.className = 'pasos-barra';
    barra.style.setProperty('--n', String(paneles.length));
    barra.setAttribute('aria-label', 'Pasos de la cotización');
    const lista = document.createElement('ol');
    paneles.forEach((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <button type="button" class="paso-boton" data-paso="${i}">
                <span class="paso-circulo"><b>${i + 1}</b><i class="fa-solid fa-check"></i></span>
                <span class="paso-nombre">${p.titulo}</span>
            </button>`;
        lista.appendChild(li);
    });
    barra.appendChild(lista);
    const pista = document.createElement('div');
    pista.className = 'pasos-pista';
    pista.innerHTML = '<span></span>';
    barra.appendChild(pista);
    const contador = document.createElement('p');
    contador.className = 'pasos-contador';
    contador.setAttribute('aria-live', 'polite');
    barra.appendChild(contador);
    (aviso ? aviso : form.firstElementChild)!.after(barra);

    // Paneles
    paneles.forEach((p, i) => {
        p.panel.classList.add('paso-panel');
        p.panel.dataset.paso = String(i);
        p.panel.setAttribute('tabindex', '-1');
        const h = document.createElement('h3');
        h.className = 'paso-titulo';
        h.textContent = p.titulo;
        p.panel.prepend(h);
    });

    // Anterior / Siguiente
    const acciones = document.createElement('div');
    acciones.className = 'pasos-acciones';
    acciones.innerHTML = `
        <button type="button" class="boton boton-linea" id="pasoAnterior"><i class="fa-solid fa-arrow-left"></i> Anterior</button>
        <button type="button" class="boton boton-primario" id="pasoSiguiente">Siguiente <i class="fa-solid fa-arrow-right"></i></button>`;
    const btnSubmit = document.getElementById('btnSubmit');
    form.insertBefore(acciones, btnSubmit);

    const anterior = acciones.querySelector<HTMLButtonElement>('#pasoAnterior')!;
    const siguiente = acciones.querySelector<HTMLButtonElement>('#pasoSiguiente')!;
    const botones = barra.querySelectorAll<HTMLButtonElement>('.paso-boton');
    const barraProgreso = pista.firstElementChild as HTMLElement;
    const total = paneles.length;
    let actual = 0;
    let mayorAlcanzado = 0;

    function pasoValido(indice: number): boolean {
        const campos = paneles[indice].panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[required], select[required]');
        for (const campo of Array.from(campos)) {
            if (!campo.checkValidity()) {
                campo.reportValidity();
                return false;
            }
        }
        return true;
    }

    function mostrar(indice: number, enfocar: boolean): void {
        actual = Math.max(0, Math.min(total - 1, indice));
        mayorAlcanzado = Math.max(mayorAlcanzado, actual);

        paneles.forEach((p, i) => { p.panel.hidden = i !== actual; });
        botones.forEach((b, i) => {
            b.classList.toggle('actual', i === actual);
            b.classList.toggle('hecho', i < actual);
            b.setAttribute('aria-current', i === actual ? 'step' : 'false');
        });
        barraProgreso.style.transform = `scaleX(${total > 1 ? actual / (total - 1) : 1})`;
        contador.textContent = `Paso ${actual + 1} de ${total}: ${paneles[actual].titulo}`;
        anterior.style.visibility = actual === 0 ? 'hidden' : 'visible';
        const esFinal = actual === total - 1;
        siguiente.hidden = esFinal;
        form!.dataset.final = esFinal ? 'si' : 'no';

        if (enfocar) {
            const destino = paneles[actual].panel;
            destino.focus({ preventScroll: true });
            barra.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    siguiente.addEventListener('click', () => {
        if (!pasoValido(actual)) return;
        mostrar(actual + 1, true);
    });
    anterior.addEventListener('click', () => mostrar(actual - 1, true));
    botones.forEach((b, i) => {
        b.addEventListener('click', () => {
            // Se puede volver atrás libremente; para avanzar se validan los pasos intermedios.
            if (i > actual) {
                for (let k = actual; k < i; k++) {
                    if (!pasoValido(k)) { mostrar(k, true); return; }
                }
            }
            mostrar(i, true);
        });
    });

    // Si el navegador autocompleta un campo de un paso que el usuario aún no ve (p. ej. la
    // ciudad de otro paso), se descarta ese cambio: de lo contrario el total subiría sin
    // que nadie lo haya elegido (el transporte se suma según la ciudad).
    const protegidos = ['tipoEvento', 'ciudad', 'lugar', 'fechaEvento', 'lugarOtroNombre', 'lugarOtroDireccion']
        .map((id) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)
        .filter((el): el is HTMLInputElement | HTMLSelectElement => !!el);
    const valorPrevio = new Map<HTMLElement, string>();
    protegidos.forEach((el) => valorPrevio.set(el, el.value));
    const descartarSiOculto = (e: Event) => {
        const el = e.target as HTMLInputElement | HTMLSelectElement;
        if (!protegidos.includes(el)) return;
        const panel = el.closest<HTMLElement>('.paso-panel');
        if (panel && panel.hidden) {
            e.stopImmediatePropagation();
            el.value = valorPrevio.get(el) ?? '';
            // Se recalcula el total con el valor restaurado.
            form!.dispatchEvent(new Event('change'));
            return;
        }
        valorPrevio.set(el, el.value);
    };
    form.addEventListener('input', descartarSiOculto, true);
    form.addEventListener('change', descartarSiOculto, true);

    // Antes de generar el PDF/Excel o guardar el evento, se revisa todo el formulario: si algo
    // falta en un paso que no se ve, se vuelve a ese paso en vez de fallar sin mostrarlo.
    const revisarTodo = (e: Event) => {
        for (let i = 0; i < total; i++) {
            if (!pasoValido(i)) {
                e.stopImmediatePropagation();
                mostrar(i, true);
                paneles[i].panel.querySelector<HTMLElement>(':invalid')?.focus();
                return;
            }
        }
        const lugar = document.getElementById('lugar') as HTMLSelectElement | null;
        const otroNombre = document.getElementById('lugarOtroNombre') as HTMLInputElement | null;
        if (lugar?.value === 'otro' && otroNombre && !otroNombre.value.trim()) {
            const i = paneles.findIndex((p) => p.panel.contains(otroNombre));
            if (i >= 0) {
                e.stopImmediatePropagation();
                mostrar(i, true);
                otroNombre.focus();
                otroNombre.reportValidity?.();
                otroNombre.setCustomValidity('Escribe el nombre del lugar');
                otroNombre.reportValidity();
                otroNombre.addEventListener('input', () => otroNombre.setCustomValidity(''), { once: true });
            }
        }
    };
    document.getElementById('btnSubmit')?.addEventListener('click', revisarTodo, true);
    document.getElementById('btnCrearEvento')?.addEventListener('click', revisarTodo, true);

    // Enter en un campo de texto avanza al siguiente paso (en vez de no hacer nada).
    form.addEventListener('keydown', (e) => {
        const el = e.target as HTMLElement;
        if (e.key !== 'Enter' || el.tagName !== 'INPUT' || (el as HTMLInputElement).type === 'checkbox') return;
        e.preventDefault();
        if (!siguiente.hidden) siguiente.click();
    });

    // La fecha del evento no puede ser anterior a hoy.
    const fecha = document.getElementById('fechaEvento') as HTMLInputElement | null;
    if (fecha) {
        const hoy = new Date();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');
        fecha.min = `${hoy.getFullYear()}-${mm}-${dd}`;
    }

    mostrar(0, false);
}

// El catálogo se dibuja cuando llega de la API: se arman los pasos cuando está listo
// (o cuando falló la carga, para que al menos los datos del cliente tengan sus pasos).
function esperarCatalogo(): void {
    if (!catalogo) return;
    let listo = false;
    // El catálogo "llegó" (bien o con un aviso de error) cuando su contenido deja de ser el del
    // mensaje de carga con el que nace la página; así no depende del texto de ningún mensaje.
    const contenidoInicial = catalogo.innerHTML;
    const revisar = () => {
        if (listo) return;
        const hayGrupos = catalogo.querySelector(':scope > .form-group');
        const cambio = catalogo.innerHTML !== contenidoInicial;
        if (!hayGrupos && !cambio) return;
        listo = true;
        observador.disconnect();
        construirPasos();
    };
    const observador = new MutationObserver(revisar);
    observador.observe(catalogo, { childList: true, subtree: false });
    revisar();
}

// Barra del total para pantallas pequeñas (el resumen lateral queda debajo del formulario).
function barraTotal(): void {
    const precio = document.getElementById('precioTotal');
    const resumen = document.querySelector<HTMLElement>('.summary-card');
    if (!precio || !resumen) return;

    const barra = document.createElement('div');
    barra.className = 'cot-barra-total';
    barra.innerHTML = `
        <div><span>Presupuesto estimado</span><strong id="cotBarraValor">${precio.textContent}</strong></div>
        <button type="button" class="boton boton-oscuro boton-chico">Ver desglose</button>`;
    document.body.appendChild(barra);

    const valor = barra.querySelector('#cotBarraValor') as HTMLElement;
    new MutationObserver(() => { valor.textContent = precio.textContent; })
        .observe(precio, { childList: true, characterData: true, subtree: true });
    barra.querySelector('button')!.addEventListener('click', () => {
        resumen.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// Arranque: pasos cuando el catálogo esté listo y barra del total para móvil.
esperarCatalogo();
barraTotal();
