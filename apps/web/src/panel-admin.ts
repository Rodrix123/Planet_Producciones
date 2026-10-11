import './style.css';
import './shared/panelRail.css';
import { exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);
});
