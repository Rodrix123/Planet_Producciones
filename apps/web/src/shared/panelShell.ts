// Helpers del chrome "panel nuevo estilo" (menú lateral + drawer + modal + toast),
// usado por las páginas que importan shared/panelRail.css. Los elementos con estos
// ids deben existir en el HTML de la página (overlay, drawer, modal, toast).

let toastTimer: number | undefined;

/** Muestra un aviso flotante abajo; se oculta solo a los 3s. */
export function avisar(mensaje: string, esError = false): void {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = mensaje;
    toast.classList.toggle('toast-error', esError);
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

/** Abre el panel deslizante lateral (drawer) con el contenido dado. */
export function abrirDrawer(html: string): void {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');
    const contenido = document.getElementById('drawerContenido');
    if (!drawer || !overlay || !contenido) return;
    contenido.innerHTML = html;
    drawer.classList.add('open');
    overlay.classList.add('open');
}

export function cerrarDrawer(): void {
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawerOverlay')?.classList.remove('open');
}

/** Abre una ventana emergente centrada (confirmaciones, formularios cortos). */
export function abrirModal(html: string, ancho = false): void {
    const modal = document.getElementById('modal');
    const contenido = document.getElementById('modalContenido');
    if (!modal || !contenido) return;
    contenido.innerHTML = html;
    contenido.classList.toggle('modal-amplio', ancho);
    modal.classList.add('open');
}

export function cerrarModal(): void {
    document.getElementById('modal')?.classList.remove('open');
}

/** Conecta el cierre por overlay/Escape para drawer y modal; llamar una vez al cargar la página. */
export function initPanelShellGlobal(): void {
    document.getElementById('drawerOverlay')?.addEventListener('click', cerrarDrawer);
    document.getElementById('drawer')?.querySelector('.drawer-close')?.addEventListener('click', cerrarDrawer);
    document.getElementById('modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal')) cerrarModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        cerrarModal();
        cerrarDrawer();
    });
}

export function esc(texto: string): string {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML;
}
