// Chincheta del calendario de Eventos: lo mantiene extendido (y la lista retraída) aunque
// el cursor no esté encima. Al cargar la página está fijado. El ancho de cada estado lo
// define eventos.css según deck[data-fijado].

const deck = document.getElementById('deck') as HTMLElement;
const pin = document.getElementById('calPin') as HTMLButtonElement;

let fijado = true;

function aplicar(): void {
    const accion = fijado ? 'Soltar calendario' : 'Fijar calendario extendido';
    deck.toggleAttribute('data-fijado', fijado);
    pin.setAttribute('aria-pressed', String(fijado));
    pin.title = accion;
    pin.setAttribute('aria-label', accion);
}

pin.addEventListener('click', () => {
    fijado = !fijado;
    aplicar();
});

aplicar();
