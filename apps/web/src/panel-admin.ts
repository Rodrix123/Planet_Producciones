// Inicio del panel de la administradora (Maritza): exige sesión de ese rol y arma el menú lateral.

import './style.css';
import './shared/panelRail.css';
import { exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);
});
