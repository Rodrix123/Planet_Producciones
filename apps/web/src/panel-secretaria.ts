// Inicio del panel de la secretaria (Mariana): exige sesión de ese rol y arma el encabezado.

import './style.css';
import './landing.css';
import './shared/panel.css';
import { exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('secretaria');
    initPanelLayout(sesion);
});
