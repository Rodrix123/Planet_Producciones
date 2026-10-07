import 'dotenv/config';
import { pool } from '../db';

// Transcripción exacta del catálogo que vivía en apps/web/cotizador.html (precios e
// "incluye" tal cual, sin inventar nada nuevo). Es seguro correr este script más de una
// vez: hace upsert por (type, simple_description) dentro de cada categoría.

interface VarianteSeed {
    simple: string;
    precio: number;
    detalle?: string;
}

interface InventorySeed {
    type: string;
    controlType: 'select' | 'checkbox' | 'qty';
    variantes: VarianteSeed[];
    /** Etiqueta visible en el <select> del cotizador. Por defecto se usa `type`, pero
     *  cuando varios inventories comparten el mismo type (los 3 selects de "Efectos")
     *  hace falta una etiqueta propia para distinguirlos en el formulario. */
    label?: string;
}

const VENUES = ['Hacienda La Soledad', 'Centro de Eventos VIP', 'Recinto Privado'];

const TRANSPORTATION: { city: string; precio: number }[] = [
    { city: 'Manizales', precio: 450000 },
    { city: 'Chinchiná - Santágueda', precio: 550000 },
    { city: 'Pereira', precio: 900000 },
    { city: 'Armenia', precio: 1000000 }
];

const INVENTORIOS: InventorySeed[] = [
    {
        type: 'MONTAJE & CARPAS',
        controlType: 'select',
        variantes: [
            { simple: 'Carpa de 3 x 3 Blanca', precio: 200000 },
            { simple: 'Carpa de 4 x 3 Blanca', precio: 300000 },
            { simple: 'Carpa de 4 x 4 Blanca', precio: 400000 },
            { simple: 'Carpa de 6 x 4 Blanca', precio: 450000 }
        ]
    },
    {
        type: 'SONIDO PARA CEREMONIA',
        controlType: 'select',
        variantes: [
            {
                simple: 'Set de Sonido para Ceremonia',
                precio: 700000,
                detalle: '2 Sistemas lineales de rango completo|1 Consola con efectos|1 Micrófono Inalámbrico Shure Beta 58|Nota: este valor puede variar según exigencias del grupo'
            },
            {
                simple: 'Set de Sonido para Ceremonia con Amplificación (1 voz + 1-2 instrumentos)',
                precio: 800000,
                detalle: '2 Sistemas lineales de rango completo|1 QSC K12 para retorno|1 Micrófono Inalámbrico Shure Beta 58|1 Consola de 12 canales|Micrófonos y líneas|Stand para micrófonos'
            }
        ]
    },
    {
        type: 'SONIDO PARA CÓCTEL DE BIENVENIDA',
        controlType: 'select',
        variantes: [
            {
                simple: 'Set de Sonido para Cóctel de Bienvenida',
                precio: 750000,
                detalle: '2 Sistemas lineales de rango completo|1 Micrófono Inalámbrico Shure Beta 58|1 Mesa Profesional para DJ|Nota: este valor puede variar según exigencias del grupo'
            },
            {
                simple: 'Set de Sonido para Cóctel con Amplificación (1 voz + 1-2 instrumentos)',
                precio: 800000,
                detalle: '2 Sistemas lineales de rango completo|1 QSC K12 para retorno|1 Micrófono Inalámbrico Shure Beta 58 (únicamente si hay brindis)|1 Consola de 12 canales|1 Mesa Profesional para DJ|Micrófonos y líneas|Stand para micrófonos'
            }
        ]
    },
    {
        type: 'SONIDO PRINCIPAL',
        controlType: 'select',
        variantes: [
            {
                simple: 'Sonido Principal Ambiental',
                precio: 1050000,
                detalle: '2 Sistemas Lineales EV|2 QSC K12 para retorno|1 Mesa Profesional para DJ|1 Micrófono Inalámbrico Shure Beta 58'
            },
            {
                simple: 'Sonido Principal Convencional',
                precio: 2200000,
                detalle: '2 QSC KW|2 Bajos QSC KW 181|2 QSC K12 para retorno|1 Consola Digital|1 Procesador Digital Fane|1 Computador|1 Mesa Profesional para DJ|1 Micrófono Inalámbrico Shure Beta 58'
            },
            {
                simple: 'Sonido Principal Line Array (4 Cajas RCF HDL20-A)',
                precio: 2700000,
                detalle: '4 Cajas RCF HDL20-A|2 Subwoofer Dobles JBL SRX828 SP|2 QSC K12 para retorno|1 Consola Digital|1 Procesador Digital Fane|1 Computador|1 Mesa Profesional para DJ|1 Micrófono Inalámbrico Shure Beta 58'
            },
            {
                simple: 'Sonido Principal Line Array (6 Cajas RCF HDL20-A)',
                precio: 3200000,
                detalle: '6 Cajas RCF HDL20-A|3 Subwoofer Dobles JBL SRX828 SP|2 QSC K12 para retorno|1 Consola Digital|1 Procesador Digital Fane|1 Computador|1 Mesa Profesional para DJ|1 Micrófono Inalámbrico Shure Beta 58'
            },
            {
                simple: 'Sonido Principal Line Array (8 Cajas RCF HDL20-A)',
                precio: 3700000,
                detalle: '8 Cajas RCF HDL20-A|4 Subwoofer Dobles JBL SRX828 SP|2 QSC K12 para retorno|1 Consola Digital|1 Computador|1 Procesador Digital Fane|1 Mesa Profesional para DJ|1 Micrófono Inalámbrico Shure Beta 58'
            }
        ]
    },
    {
        type: 'CONTROLADORES Y UNIDADES DJ',
        controlType: 'select',
        variantes: [
            { simple: '2 Unidades Pioneer CDJ 2000 Nexus 2 - Mixer Pioneer DJM 900 Nexus 2', precio: 800000 },
            { simple: '2 Unidades Pioneer CDJ 3000 - Mixer DJM A9', precio: 1200000 },
            { simple: '3 Unidades Pioneer CDJ 3000 - Mixer DJM A9', precio: 1700000 },
            { simple: '1 Controlador Pioneer RX2', precio: 500000 },
            { simple: '1 Controlador Pioneer RX3', precio: 700000 }
        ]
    },
    {
        type: 'ESTRUCTURA TRUSS',
        controlType: 'select',
        variantes: [
            { simple: 'Estructura Truss para Iluminación', precio: 550000 },
            { simple: 'Estructura Truss + Pantalla Led de 6 metros', precio: 700000 },
            { simple: 'Estructura Truss + Pantalla Led de 8 metros', precio: 800000 },
            { simple: 'Estructura Truss + Pantalla Led de 10 metros', precio: 950000 },
            { simple: 'Estructura Truss + Pantalla Led de 12 metros', precio: 1100000 },
            { simple: 'Estructura Truss + Pantalla Led de 16 metros', precio: 1500000 },
            { simple: 'Estructura Truss + Pantalla Led de 18 metros', precio: 1700000 }
        ]
    },
    {
        type: 'ILUMINACIÓN PROFESIONAL',
        controlType: 'select',
        variantes: [
            {
                simple: 'Iluminación Profesional Básica',
                precio: 700000,
                detalle: '2 Truss de 2 Mtrs Forrados de Negro|2 Cabezas Móviles'
            },
            {
                simple: 'Iluminación Profesional Completa',
                precio: 2200000,
                detalle: '6 Cabezas Móviles Beam Chauvet|6 Cabezas Móviles Color Wash|2 Blinder|2 Matrices de Led|6 Par Led LP 006|2 Atomic|2 Barras Led|1 Consola NX Touch Martin|1 Computador|1 Ingeniero de Iluminación|1 Máquina de Humo'
            },
            {
                simple: 'Iluminación Profesional Vintage',
                precio: 2800000,
                detalle: '6 Cabezas Móviles Beam Chauvet|6 Cabezas Móviles Color Wash|2 Patt Retro|2 P1 Retro Lamp Liro|2 Blinder|6 Par Led LP006|2 Atomic|2 Barras Led|1 Consola NX Touch Martin|1 Computador|1 Ingeniero de Iluminación|1 Máquina de Humo'
            },
            {
                simple: 'Iluminación Profesional Artista y Grupos',
                precio: 3500000,
                detalle: '8 Cabezas Móviles Beam Chauvet|6 Cabezas Móviles Color Wash|2 Blinder|12 Par Led LP 006|4 Matrices de Led|2 Atomic|2 Barras Led|1 Computador|1 Ingeniero de Iluminación|1 Máquina de Humo|Nota: puede variar según show especial o exigencias del artista'
            }
        ]
    },
    {
        type: 'LUCES DE AMBIENTACIÓN',
        controlType: 'select',
        variantes: [
            { simple: '8 Par Led Ambientación del Sitio', precio: 520000 },
            { simple: '12 Par Led Ambientación del Sitio', precio: 780000 },
            { simple: '16 Par Led Ambientación del Sitio', precio: 1040000 },
            { simple: '20 Par Led Ambientación del Sitio', precio: 1300000 },
            { simple: '8 Par Led Inalámbricos Ambientación del Sitio', precio: 600000 },
            { simple: '12 Par Led Inalámbricos Ambientación del Sitio', precio: 900000 },
            { simple: '20 Spot Inalámbrico para Mesas Principales y Postres', precio: 1300000 }
        ]
    },
    {
        type: 'PANTALLA LED',
        controlType: 'select',
        variantes: [
            { simple: '3 Metros de Pantalla Led Pitch 3', precio: 900000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '4 Metros de Pantalla Led Pitch 3', precio: 1200000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '6 Metros de Pantalla Led Pitch 3', precio: 1800000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '8 Metros de Pantalla Led Pitch 3', precio: 2400000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '10 Metros de Pantalla Led Pitch 3', precio: 3000000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '12 Metros de Pantalla Led Pitch 3', precio: 3600000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '16 Metros de Pantalla Led Pitch 3', precio: 4800000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' },
            { simple: '18 Metros de Pantalla Led Pitch 3', precio: 5400000, detalle: '1 Video Procesador|1 Computador|1 Ingeniero de Video' }
        ]
    },
    {
        type: 'PISO PISTA DE BAILE',
        controlType: 'select',
        variantes: [
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 3 x 3', precio: 1400000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 4 x 3', precio: 1800000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 4 x 4', precio: 2400000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 5 x 4', precio: 3000000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 5 x 5', precio: 3800000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 6 x 4', precio: 3600000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 6 x 5', precio: 4500000 },
            { simple: 'Pista de Vidrio Negro Led 3D Infinito 6 x 6', precio: 5400000 }
        ]
    },
    {
        type: 'TARIMA',
        controlType: 'select',
        variantes: [
            { simple: 'Tarima para DJ de 2 x 2 mtrs', precio: 320000 },
            { simple: 'Tarima para Equipos y DJ de 3 x 2 mtrs', precio: 480000 },
            { simple: 'Tarima para Equipos, DJ y Grupo Musical de 4 x 2 mtrs', precio: 640000 },
            { simple: 'Tarima para Equipos, DJ y Grupo Musical de 4 x 3 mtrs', precio: 960000 },
            { simple: 'Tarima para Equipos, DJ y Grupo Musical de 4 x 4 mtrs', precio: 1280000 },
            { simple: 'Tarima para Equipos, DJ y Grupo Musical de 5 x 4 mtrs', precio: 1600000 },
            { simple: 'Tarima para Equipos, DJ y Orquesta de 6 x 4 mtrs', precio: 1920000 },
            { simple: 'Tarima para Equipos, DJ y Orquesta de 6 x 5 mtrs', precio: 2400000 },
            { simple: 'Tarima para Equipos, DJ y Orquesta de 7 x 5 mtrs', precio: 2800000 },
            { simple: 'Tarima para Equipos, DJ y Orquesta de 8 x 5 mtrs', precio: 3200000 }
        ]
    }
];

// Los 3 selects de "Efectos de alto impacto" van cada uno en su propio inventory
// (mismo type para que el PDF los siga agrupando juntos).
const EFECTOS_SELECT: InventorySeed[] = [
    {
        type: 'EFECTO ESPECIAL FX',
        label: 'Sparkulas (Chispas Frías)',
        controlType: 'select',
        variantes: [
            { simple: '2 Sparkulas', precio: 950000 },
            { simple: '4 Sparkulas', precio: 1900000 }
        ]
    },
    {
        type: 'EFECTO ESPECIAL FX',
        label: 'Ventury con Papel Metalizado',
        controlType: 'select',
        variantes: [
            { simple: 'Ventury con Papel Metalizado (Todo el Evento)', precio: 600000 },
            { simple: 'Ventury con Papel Metalizado (3 Tiros)', precio: 450000 },
            { simple: 'Ventury con Papel Metalizado (Salida de Ceremonia)', precio: 450000 }
        ]
    },
    {
        type: 'EFECTO ESPECIAL FX',
        label: 'Bola de Espejos (Sin Instalación)',
        controlType: 'select',
        variantes: [
            { simple: 'Bola de Espejos 10 cm (Pequeña)', precio: 20000 },
            { simple: 'Bola de Espejos 20 cm (Mediana)', precio: 30000 },
            { simple: 'Bola de Espejos 30 cm (Mediana)', precio: 40000 },
            { simple: 'Bola de Espejos 40" (Grande)', precio: 50000 },
            { simple: 'Bola de Espejos 50" (Grande)', precio: 70000 },
            { simple: 'Bola de Espejos 75" (Gigante)', precio: 250000 },
            { simple: 'Bola de Espejos 100" (Gigante)', precio: 500000 }
        ]
    }
];

// Cada checkbox es su propio inventory de una sola variante.
const EFECTOS_CHECKBOX: { nombre: string; precio: number; detalle?: string }[] = [
    { nombre: 'Fuentes de Pirotecnia Indoor (30 seg x 3 mtrs)', precio: 130000, detalle: 'Con disparadores inalámbricos' },
    { nombre: 'Fuentes con Humo de Colores (1 minuto)', precio: 100000 },
    { nombre: 'Pirotecnia al Aire (Show de 1 Minuto)', precio: 1700000, detalle: 'Operado con disparadores inalámbricos' },
    { nombre: 'Máquina de Burbujas (Salida de Ceremonia)', precio: 450000 },
    { nombre: 'Máquina de Burbujas con Humo', precio: 500000 },
    { nombre: 'Vela Craker', precio: 40000 },
    { nombre: '2 Lanza Llamas', precio: 700000 },
    { nombre: 'Kabuqui de Serpentinas (1 Tiro)', precio: 700000 },
    { nombre: 'Pistola de CO2 (Hora Loca)', precio: 650000 },
    { nombre: '2 Criojets de CO2', precio: 1000000 },
    { nombre: 'Máquina de Niebla Baja - Hielo Seco (Baile de Novios)', precio: 800000 },
    { nombre: 'Seguidor', precio: 350000 },
    { nombre: 'Motor para Bola de Espejos', precio: 100000 }
];

const GENERADORES_CHECKBOX: { nombre: string; precio: number; detalle?: string }[] = [
    { nombre: 'Generadores Eléctricos - Todo el Evento', precio: 2200000 },
    { nombre: '2 Plantas Eléctricas - Backup', precio: 800000, detalle: 'Costo adicional de $100.000 por hora tras agotarse el combustible inicial' }
];

const MOBILIARIO_QTY: { nombre: string; precioUnit: number; tag: string }[] = [
    { nombre: 'Mesas tipo Bar', precioUnit: 35000, tag: 'MOBILIARIO CÓCTEL DE BIENVENIDA' },
    { nombre: 'Sillas tipo Bar', precioUnit: 35000, tag: 'MOBILIARIO CÓCTEL DE BIENVENIDA' },
    { nombre: 'Sala Lounge 6 Puestos (1 Sofá doble con espaldar, 1 sofá doble sin espaldar, 2 Puff y 1 mesa)', precioUnit: 160000, tag: 'MOBILIARIO CÓCTEL DE BIENVENIDA' },
    { nombre: 'Puff Adicional', precioUnit: 30000, tag: 'MOBILIARIO CÓCTEL DE BIENVENIDA' },
    { nombre: 'Chispón 70 cm - Salida de Ceremonia', precioUnit: 14000, tag: 'EFECTO ESPECIAL FX' },
    { nombre: 'Metro de Bombillo Ping Pong (sin instalación)', precioUnit: 6000, tag: 'EFECTO ESPECIAL FX' }
];

async function insertarInventory(seed: InventorySeed): Promise<void> {
    const { rows } = await pool.query<{ id: number }>(
        `insert into inventory (name, type, control_type) values ($1, $2, $3) returning id`,
        [seed.label || seed.type, seed.type, seed.controlType]
    );
    const inventoryId = rows[0].id;

    for (const v of seed.variantes) {
        await pool.query(
            `insert into inventory_variants (inventory_id, simple_description, detailed_description, price)
             values ($1, $2, $3, $4)`,
            [inventoryId, v.simple, v.detalle || null, v.precio]
        );
    }
}

async function main() {
    const yaHayDatos = await pool.query('select count(*)::int as n from inventory');
    if (yaHayDatos.rows[0].n > 0) {
        console.log('`inventory` ya tiene datos — no se vuelve a sembrar (trunca inventory_variants/inventory/venue/transportation si quieres regenerar el catálogo completo).');
        await pool.end();
        return;
    }

    const yaHayVenues = await pool.query('select count(*)::int as n from venue');
    if (yaHayVenues.rows[0].n === 0) {
        for (const nombre of VENUES) {
            await pool.query('insert into venue (name) values ($1)', [nombre]);
        }
        console.log(`venue: ${VENUES.length} filas`);
    } else {
        console.log('`venue` ya tiene datos — no se duplica.');
    }

    const yaHayTransportation = await pool.query('select count(*)::int as n from transportation');
    if (yaHayTransportation.rows[0].n === 0) {
        for (const t of TRANSPORTATION) {
            await pool.query('insert into transportation (city, price) values ($1, $2)', [t.city, t.precio]);
        }
        console.log(`transportation: ${TRANSPORTATION.length} filas`);
    } else {
        console.log('`transportation` ya tiene datos — no se duplica.');
    }

    let totalInventory = 0;
    let totalVariantes = 0;

    for (const seed of INVENTORIOS) {
        await insertarInventory(seed);
        totalInventory++;
        totalVariantes += seed.variantes.length;
    }

    for (const seed of EFECTOS_SELECT) {
        await insertarInventory(seed);
        totalInventory++;
        totalVariantes += seed.variantes.length;
    }

    for (const efecto of EFECTOS_CHECKBOX) {
        await insertarInventory({
            type: 'EFECTO ESPECIAL FX',
            controlType: 'checkbox',
            variantes: [{ simple: efecto.nombre, precio: efecto.precio, detalle: efecto.detalle }]
        });
        totalInventory++;
        totalVariantes++;
    }

    for (const gen of GENERADORES_CHECKBOX) {
        await insertarInventory({
            type: 'GENERADORES ELÉCTRICOS',
            controlType: 'checkbox',
            variantes: [{ simple: gen.nombre, precio: gen.precio, detalle: gen.detalle }]
        });
        totalInventory++;
        totalVariantes++;
    }

    for (const m of MOBILIARIO_QTY) {
        await insertarInventory({
            type: m.tag,
            controlType: 'qty',
            variantes: [{ simple: m.nombre, precio: m.precioUnit }]
        });
        totalInventory++;
        totalVariantes++;
    }

    console.log(`inventory: ${totalInventory} filas, inventory_variants: ${totalVariantes} filas`);
    await pool.end();
}

main().catch((err) => {
    console.error('Error sembrando el catálogo:', err);
    process.exit(1);
});
