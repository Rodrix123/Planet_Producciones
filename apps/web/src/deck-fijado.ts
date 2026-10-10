// Chincheta de los paneles de eventos (lista y calendario): fija uno en su estado
// extendido. Solo uno a la vez; al cargar la página queda fijado el calendario.
// El ancho de cada estado lo define eventos.css según deck[data-fijado].

type Panel = 'lista' | 'cal';

const deck = document.getElementById('deck') as HTMLElement;
const pines = document.querySelectorAll<HTMLButtonElement>('[data-fijar]');

let fijado: Panel | null = 'cal';

function aplicar(): void {
    if (fijado) deck.dataset.fijado = fijado;
    else delete deck.dataset.fijado;

    pines.forEach(pin => {
        const activo = pin.dataset.fijar === fijado;
        const accion = activo ? 'Soltar panel' : 'Fijar panel extendido';
        pin.setAttribute('aria-pressed', String(activo));
        pin.title = accion;
        pin.setAttribute('aria-label', accion);
    });
}

pines.forEach(pin =>
    pin.addEventListener('click', () => {
        const panel = pin.dataset.fijar as Panel;
        // Volver a pulsar el fijado lo suelta: ambos paneles vuelven a crecer solo con el cursor.
        fijado = fijado === panel ? null : panel;
        aplicar();
    })
);

aplicar();
