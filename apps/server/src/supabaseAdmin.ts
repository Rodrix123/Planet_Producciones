// Clientes de Supabase Auth: uno administrador (crear y editar cuentas) y uno anónimo (verificar la clave).

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en apps/server/.env');
}

// Supabase crea un cliente de tiempo real (WebSocket) aunque aquí solo se use Auth. Node 22 trae WebSocket
// propio, pero en Node 20 (el del CI y de las imágenes Docker) la librería falla al crear el cliente con
// "native WebSocket not found"; por eso se le da la implementación del paquete 'ws'.
const realtime = { transport: WebSocket as unknown as NonNullable<NonNullable<Parameters<typeof createClient>[2]>['realtime']>['transport'] };

// Cliente con permisos de administrador: crear/editar cuentas de Supabase Auth
// (usuarios.admin.*). Nunca se expone al frontend.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime
});

// Cliente "anónimo": solo se usa para verificar correo+contraseña (signInWithPassword)
// durante el login. No se reutiliza su sesión — nuestra propia cookie (pp_session)
// es la que gobierna el acceso a la app, igual que antes.
export const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime
});
