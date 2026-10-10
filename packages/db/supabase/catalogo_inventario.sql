-- Catálogo inicial desde 'Lista Provisional de Precios Planet Producciones 2026'.
-- Inserta en inventory, inventory_variants, components e inventory_components. Es re-ejecutable (no duplica).
-- inventory = equipo general; inventory_variants = sus versiones (modelo, tamaño, cantidad) con precio;
-- components = ítems sin precio; inventory_components = qué components conforman cada equipo.
-- No se incluyen los valores de Transporte (pertenecen a la tabla transportation).

BEGIN;

INSERT INTO public.inventory (name, type)
SELECT v.name, v.type FROM (VALUES
  ('Set de Sonido para Ceremonia', 'Sonido'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido'),
  ('Sonido Principal', 'Sonido'),
  ('Unidades Pioneer CDJ y Mixer', 'Controladores y Unidades para DJ´S'),
  ('Controlador Pioneer', 'Controladores y Unidades para DJ´S'),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss'),
  ('Iluminación Profesional', 'Iluminación'),
  ('Par led Ambientación del sitio (reflectores)', 'Luces de Ambientación'),
  ('Par led Inalambricos Ambientación del sitio (reflectores)', 'Luces de Ambientación'),
  ('20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas', 'Luces de Ambientación'),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas'),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas'),
  ('Sparkulas', 'Efectos de alto impacto e iluminacion extra'),
  ('Fuentes de pirotecnia Indoor 30 seg x 3 mtrs - Con Disparadores Inalambricos', 'Efectos de alto impacto e iluminacion extra'),
  ('Fuentes con Humo de Colores de 1 minuto', 'Efectos de alto impacto e iluminacion extra'),
  ('Pirotecnia al aire Show de 1 Minuto - Operado con disparadores inalambricos', 'Efectos de alto impacto e iluminacion extra'),
  ('Ventury con papel metalizado', 'Efectos de alto impacto e iluminacion extra'),
  ('Máquina de Burbujas (Salida de Ceremonia)', 'Efectos de alto impacto e iluminacion extra'),
  ('Maquina de burbujas con humo', 'Efectos de alto impacto e iluminacion extra'),
  ('Chispon de 70 cm c/u (Salida de Ceremonia)', 'Efectos de alto impacto e iluminacion extra'),
  ('Vela Craker', 'Efectos de alto impacto e iluminacion extra'),
  ('2 Lanzas Llamas', 'Efectos de alto impacto e iluminacion extra'),
  ('Kabuqui de Serpentinas (1 Tiro)', 'Efectos de alto impacto e iluminacion extra'),
  ('Pistola de CO2 para la Hora Loca', 'Efectos de alto impacto e iluminacion extra'),
  ('2 Criojets de CO2', 'Efectos de alto impacto e iluminacion extra'),
  ('Máquina de Niebla baja (HIELO SECO) (Baile Novios)', 'Efectos de alto impacto e iluminacion extra'),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra'),
  ('1 Motor para Bola de Espejos', 'Efectos de alto impacto e iluminacion extra'),
  ('Seguidor', 'Efectos de alto impacto e iluminacion extra'),
  ('Metro de bombillo Ping Pong - Sin instalacion', 'Efectos de alto impacto e iluminacion extra'),
  ('Mesas tipo Bar c/u', 'Mobiliario Coctel de Bienvenida'),
  ('Sillas tipo Bar c/u', 'Mobiliario Coctel de Bienvenida'),
  ('Sala Lounge 6 puestos', 'Mobiliario Coctel de Bienvenida'),
  ('Puff adicional c/u', 'Mobiliario Coctel de Bienvenida'),
  ('Carpa Blanca', 'Carpas Convencionales'),
  ('Generadores Eléctricos - Todo el evento', 'Otros'),
  ('2 Plantas Eléctricas - Backup', 'Otros'),
  ('Tarima', 'Otros')
) AS v(name, type)
WHERE NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.name = v.name AND i.type = v.type);

INSERT INTO public.inventory_variants (inventory_id, simple_description, detailed_description, price)
SELECT i.id, v.label, v.detailed, v.price FROM (VALUES
  ('Set de Sonido para Ceremonia', 'Sonido', 'Básico', '2 Sistemas lineales de rango completo
1 Consola con efectos
1 Micrófono Inalámbrico Shure Beta 58', 700000),
  ('Set de Sonido para Ceremonia', 'Sonido', 'Con amplificación de 1 voz y 1 o 2 instrumentos', '2 Sistemas lineales de rango completo
1 QSC K12 para retorno
1 Micrófono Inalámbrico Shure Beta 58
1 Consola de 12 canales
Micrófonos y lineas
Stand para Micrófonos', 800000),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Básico', '2 Sistemas lineales de rango completo
1 Micrófono Inalámbrico Shure Beta 58
1 Mesa Profesional para DJ', 750000),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Con amplificación de 1 voz y 1 o 2 instrumentos', '2 Sistemas lineales de rango completo
1 QSC K12 para retorno
1 Micrófono Inalámbrico Shure Beta 58 (unicamente si hay Brindis)
1 Consola de 12 canales
1 Mesa Profesional para DJ
Micrófonos y lineas
Stand para Micrófonos', 800000),
  ('Sonido Principal', 'Sonido', 'Ambiental', '2 Sistemas Lineales EV
2 QSC K12 para retorno
1 Mesa Profesional para DJ
1 Micrófono Inalámbrico Shure Beta 58', 1050000),
  ('Sonido Principal', 'Sonido', 'Convencional', '2 QSC KW
2 Bajos QSC KW 181
2 QSC K12 para retorno
1 Consola Digital
1 Procesardor Digital Fane
1 Computador
1 Mesa Profesional para DJ
1 Micrófono Inalámbrico Shure Beta 58', 2200000),
  ('Sonido Principal', 'Sonido', 'Line Array 4 Cajas RCF HDL20-A', '4 Cajas  RCF HDL20-A
2 Subwoofer Dobles JBL SRX828 SP
2 QSC K12 para retorno
1 Consola Digital
1 Procesardor Digital Fane
1 Computador
1 Mesa Profesional para DJ
1 Micrófono Inalámbrico Shure Beta 58', 2700000),
  ('Sonido Principal', 'Sonido', 'Line Array 6 Cajas RCF HDL20-A', '6 Cajas  RCF HDL20-A
3 Subwoofer Dobles JBL SRX828 SP
2 QSC K12 para retorno
1 Consola Digital
1 Procesardor Digital Fane
1 Computador
1 Mesa Profesional para DJ
1 Micrófono Inalámbrico Shure Beta 58', 3200000),
  ('Sonido Principal', 'Sonido', 'Line Array 8 Cajas RCF HDL20-A', '8 Cajas  RCF HDL20-A
4 Subwoofer Dobles JBL SRX828 SP
2 QSC K12 para retorno
1 Consola Digital
1 Computador
1 Procesardor Digital Fane
1 Mesa Profesional para DJ
1 Micrófono Inalámbrico Shure Beta 58', 3700000),
  ('Unidades Pioneer CDJ y Mixer', 'Controladores y Unidades para DJ´S', '2 Unidades Pioneer CDJ 2000 Nexus 2 - Mixer Pioneer DJM 900 Nexus 2', NULL::text, 800000),
  ('Unidades Pioneer CDJ y Mixer', 'Controladores y Unidades para DJ´S', '2 Unidades Pioneer CDJ 3000 - Mixer DJM A9', NULL::text, 1200000),
  ('Unidades Pioneer CDJ y Mixer', 'Controladores y Unidades para DJ´S', '3 Unidades Pioneer CDJ 3000 - Mixer DJM A9', NULL::text, 1700000),
  ('Controlador Pioneer', 'Controladores y Unidades para DJ´S', 'RX 2', NULL::text, 500000),
  ('Controlador Pioneer', 'Controladores y Unidades para DJ´S', 'RX 3', NULL::text, 700000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación', NULL::text, 550000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación y pantalla led de 6 metros', NULL::text, 700000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación y pantalla led de 8 metros', NULL::text, 800000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación y pantalla led de 10 metros', NULL::text, 950000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación y pantalla led de 12 metros', NULL::text, 1100000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación y pantalla led de 16 metros', NULL::text, 1500000),
  ('Estructura Truss Forrada de Negro', 'Estructura Truss', 'Para iluminación y pantalla led de 18 metros', NULL::text, 1700000),
  ('Iluminación Profesional', 'Iluminación', 'Básica', '2 Truss de 2 Mtrs Forrados de Negro
2 Cabezas Moviles', 700000),
  ('Iluminación Profesional', 'Iluminación', 'Completa', '6 Cabezas Móviles Beam Chauvet
6 Cabezas Móviles Color Wash
2 Blinder
2 Matrices de Led
6 Par led LP 006
2 Atomic
2 Barras Led
1 Consola NX Touch Martin
1 Computador
1 Ingeniero de Iluminación
1 Máquina de Humo', 2200000),
  ('Iluminación Profesional', 'Iluminación', 'Vintage', '6 Cabezas Móviles Beam Chauvet
6 Cabezas Móviles Color Wash
2 Patt Retro
2 P1 Retro Lamp Liro
2 Blinder
6 Par led LP006
2 Atomic
2 Barras Led
1Consola NX Touch Martin
1 Computador
1Ingeniero de Iluminacion
1 Maquina de humo', 2800000),
  ('Iluminación Profesional', 'Iluminación', 'Artistas y Grupos', '8 Cabezas Móviles Beam Chauvet
6 Cabezas Móviles Color Wash
2 Blinder
12 Par led LP 006
4 Matrices de Led
2 Atomic
2 Barras Led
1 Computador
1 Ingeniero de Iluminación
1 Máquina de Humo', 3500000),
  ('Par led Ambientación del sitio (reflectores)', 'Luces de Ambientación', '8 Par led', NULL::text, 520000),
  ('Par led Ambientación del sitio (reflectores)', 'Luces de Ambientación', '12 Par led', NULL::text, 780000),
  ('Par led Ambientación del sitio (reflectores)', 'Luces de Ambientación', '16 Par led', NULL::text, 1040000),
  ('Par led Ambientación del sitio (reflectores)', 'Luces de Ambientación', '20 Par led', NULL::text, 1300000),
  ('Par led Inalambricos Ambientación del sitio (reflectores)', 'Luces de Ambientación', '8 Par led', NULL::text, 600000),
  ('Par led Inalambricos Ambientación del sitio (reflectores)', 'Luces de Ambientación', '12 Par led', NULL::text, 900000),
  ('20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas', 'Luces de Ambientación', '20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas', NULL::text, 1300000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '3 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 900000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '4 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 1200000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '6 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 1800000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '8 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 2400000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '10 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 3000000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '12 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 3600000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '16 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 4800000),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', '18 Metros', '1 Video Procesador
1 Computador
1 ingeniero de Video', 5400000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '3 x 3', NULL::text, 1400000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '4 x 3', NULL::text, 1800000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '4 x 4', NULL::text, 2400000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '5 x 4', NULL::text, 3000000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '5 x 5', NULL::text, 3800000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '6 x 4', NULL::text, 3600000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '6 x 5', NULL::text, 4500000),
  ('Pista de Vidrio Negro Led 3D infinito', 'Pisos para pista de baile y pasarelas', '6 x 6', NULL::text, 5400000),
  ('Sparkulas', 'Efectos de alto impacto e iluminacion extra', '2 Sparkulas', NULL::text, 950000),
  ('Sparkulas', 'Efectos de alto impacto e iluminacion extra', '4 Sparkulas', NULL::text, 1900000),
  ('Fuentes de pirotecnia Indoor 30 seg x 3 mtrs - Con Disparadores Inalambricos', 'Efectos de alto impacto e iluminacion extra', 'Fuentes de pirotecnia Indoor 30 seg x 3 mtrs - Con Disparadores Inalambricos', NULL::text, 130000),
  ('Fuentes con Humo de Colores de 1 minuto', 'Efectos de alto impacto e iluminacion extra', 'Fuentes con Humo de Colores de 1 minuto', NULL::text, 100000),
  ('Pirotecnia al aire Show de 1 Minuto - Operado con disparadores inalambricos', 'Efectos de alto impacto e iluminacion extra', 'Pirotecnia al aire Show de 1 Minuto - Operado con disparadores inalambricos', NULL::text, 1700000),
  ('Ventury con papel metalizado', 'Efectos de alto impacto e iluminacion extra', 'Para todo el evento', NULL::text, 600000),
  ('Ventury con papel metalizado', 'Efectos de alto impacto e iluminacion extra', '3 tiros', NULL::text, 450000),
  ('Ventury con papel metalizado', 'Efectos de alto impacto e iluminacion extra', 'Salida de Ceremonia', NULL::text, 450000),
  ('Máquina de Burbujas (Salida de Ceremonia)', 'Efectos de alto impacto e iluminacion extra', 'Máquina de Burbujas (Salida de Ceremonia)', NULL::text, 450000),
  ('Maquina de burbujas con humo', 'Efectos de alto impacto e iluminacion extra', 'Maquina de burbujas con humo', NULL::text, 500000),
  ('Chispon de 70 cm c/u (Salida de Ceremonia)', 'Efectos de alto impacto e iluminacion extra', 'Chispon de 70 cm c/u (Salida de Ceremonia)', NULL::text, 14000),
  ('Vela Craker', 'Efectos de alto impacto e iluminacion extra', 'Vela Craker', NULL::text, 40000),
  ('2 Lanzas Llamas', 'Efectos de alto impacto e iluminacion extra', '2 Lanzas Llamas', NULL::text, 700000),
  ('Kabuqui de Serpentinas (1 Tiro)', 'Efectos de alto impacto e iluminacion extra', 'Kabuqui de Serpentinas (1 Tiro)', NULL::text, 700000),
  ('Pistola de CO2 para la Hora Loca', 'Efectos de alto impacto e iluminacion extra', 'Pistola de CO2 para la Hora Loca', NULL::text, 650000),
  ('2 Criojets de CO2', 'Efectos de alto impacto e iluminacion extra', '2 Criojets de CO2', NULL::text, 1000000),
  ('Máquina de Niebla baja (HIELO SECO) (Baile Novios)', 'Efectos de alto impacto e iluminacion extra', 'Máquina de Niebla baja (HIELO SECO) (Baile Novios)', NULL::text, 800000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '10 cm (Pequeña)', NULL::text, 20000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '20 cm (Mediana)', NULL::text, 30000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '30 cm(Mediana)', NULL::text, 40000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '40"(Grande)', NULL::text, 50000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '50"(Grande)', NULL::text, 70000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '75"(Gigante)', NULL::text, 250000),
  ('Bola de Espejos c/u (sin instalación)', 'Efectos de alto impacto e iluminacion extra', '100"(Gigante)', NULL::text, 500000),
  ('1 Motor para Bola de Espejos', 'Efectos de alto impacto e iluminacion extra', '1 Motor para Bola de Espejos', NULL::text, 100000),
  ('Seguidor', 'Efectos de alto impacto e iluminacion extra', 'Seguidor', NULL::text, 350000),
  ('Metro de bombillo Ping Pong - Sin instalacion', 'Efectos de alto impacto e iluminacion extra', 'Metro de bombillo Ping Pong - Sin instalacion', NULL::text, 6000),
  ('Mesas tipo Bar c/u', 'Mobiliario Coctel de Bienvenida', 'Mesas tipo Bar c/u', NULL::text, 35000),
  ('Sillas tipo Bar c/u', 'Mobiliario Coctel de Bienvenida', 'Sillas tipo Bar c/u', NULL::text, 35000),
  ('Sala Lounge 6 puestos', 'Mobiliario Coctel de Bienvenida', 'Sala Lounge 6 puestos', 'Incluye 1 Sofá doble con espaldar, 1 sofá doble sin espaldar,
2 Puff y 1 mesa (No incluye transporte, este se cobra dependiendo el lugar)', 160000),
  ('Puff adicional c/u', 'Mobiliario Coctel de Bienvenida', 'Puff adicional c/u', NULL::text, 30000),
  ('Carpa Blanca', 'Carpas Convencionales', '3 x 3', NULL::text, 200000),
  ('Carpa Blanca', 'Carpas Convencionales', '4 x 3', NULL::text, 300000),
  ('Carpa Blanca', 'Carpas Convencionales', '4 x 4', NULL::text, 400000),
  ('Carpa Blanca', 'Carpas Convencionales', '6 x 4', NULL::text, 450000),
  ('Generadores Eléctricos - Todo el evento', 'Otros', 'Generadores Eléctricos - Todo el evento', NULL::text, 2200000),
  ('2 Plantas Eléctricas - Backup', 'Otros', '2 Plantas Eléctricas - Backup', NULL::text, 800000),
  ('Tarima', 'Otros', '2 x 2 mtrs', 'Para DJ', 320000),
  ('Tarima', 'Otros', '3 x 2 mtrs', 'Para instalación de equipos y DJ', 480000),
  ('Tarima', 'Otros', '4 x 2 mtrs', 'Para instalación de equipos, DJ y grupo musical', 640000),
  ('Tarima', 'Otros', '4 x 3 mtrs', 'Para instalación de equipos, DJ y grupo musical', 960000),
  ('Tarima', 'Otros', '4 x 4 mtrs', 'Para instalación de equipos, DJ y grupo musical', 1280000),
  ('Tarima', 'Otros', '5 x 4 mtrs', 'Para instalación de equipos, DJ y grupo musical', 1600000),
  ('Tarima', 'Otros', '6 x 4 mtrs', 'Para instalación de equipos, DJ y orquesta', 1920000),
  ('Tarima', 'Otros', '6 x 5 mtrs', 'Para instalación de equipos, DJ y orquesta', 2400000),
  ('Tarima', 'Otros', '7 x 5 mtrs', 'Para instalación de equipos, DJ y orquesta', 2800000),
  ('Tarima', 'Otros', '8 x 5 mtrs', 'Para instalación de equipos, DJ y orquesta', 3200000)
) AS v(name, type, label, detailed, price)
JOIN public.inventory i ON i.name = v.name AND i.type = v.type
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_variants x WHERE x.inventory_id = i.id AND x.simple_description = v.label);

INSERT INTO public.components (name, price)
SELECT v.name, 0 FROM (VALUES
  ('Sistemas lineales de rango completo'),
  ('Consola con efectos'),
  ('Micrófono Inalámbrico Shure Beta 58'),
  ('QSC K12 para retorno'),
  ('Consola de 12 canales'),
  ('Micrófonos y lineas'),
  ('Stand para Micrófonos'),
  ('Mesa Profesional para DJ'),
  ('Sistemas Lineales EV'),
  ('QSC KW'),
  ('Bajos QSC KW 181'),
  ('Consola Digital'),
  ('Procesardor Digital Fane'),
  ('Computador'),
  ('Cajas RCF HDL20-A'),
  ('Subwoofer Dobles JBL SRX828 SP'),
  ('Truss de 2 Mtrs Forrados de Negro'),
  ('Cabezas Moviles'),
  ('Cabezas Móviles Beam Chauvet'),
  ('Cabezas Móviles Color Wash'),
  ('Blinder'),
  ('Matrices de Led'),
  ('Par led LP 006'),
  ('Atomic'),
  ('Barras Led'),
  ('Consola NX Touch Martin'),
  ('Ingeniero de Iluminación'),
  ('Máquina de Humo'),
  ('Patt Retro'),
  ('P1 Retro Lamp Liro'),
  ('Par led LP006'),
  ('Ingeniero de Iluminacion'),
  ('Maquina de humo'),
  ('Video Procesador'),
  ('ingeniero de Video')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.components c WHERE lower(c.name) = lower(v.name));

INSERT INTO public.inventory_components (component_id, inventory_id)
SELECT c.id, i.id FROM (VALUES
  ('Set de Sonido para Ceremonia', 'Sonido', 'Sistemas lineales de rango completo'),
  ('Set de Sonido para Ceremonia', 'Sonido', 'Consola con efectos'),
  ('Set de Sonido para Ceremonia', 'Sonido', 'Micrófono Inalámbrico Shure Beta 58'),
  ('Set de Sonido para Ceremonia', 'Sonido', 'QSC K12 para retorno'),
  ('Set de Sonido para Ceremonia', 'Sonido', 'Consola de 12 canales'),
  ('Set de Sonido para Ceremonia', 'Sonido', 'Micrófonos y lineas'),
  ('Set de Sonido para Ceremonia', 'Sonido', 'Stand para Micrófonos'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Sistemas lineales de rango completo'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Micrófono Inalámbrico Shure Beta 58'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Mesa Profesional para DJ'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'QSC K12 para retorno'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Consola de 12 canales'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Micrófonos y lineas'),
  ('Set de Sonido para Coctel de Bienvenida', 'Sonido', 'Stand para Micrófonos'),
  ('Sonido Principal', 'Sonido', 'Sistemas Lineales EV'),
  ('Sonido Principal', 'Sonido', 'QSC K12 para retorno'),
  ('Sonido Principal', 'Sonido', 'Mesa Profesional para DJ'),
  ('Sonido Principal', 'Sonido', 'Micrófono Inalámbrico Shure Beta 58'),
  ('Sonido Principal', 'Sonido', 'QSC KW'),
  ('Sonido Principal', 'Sonido', 'Bajos QSC KW 181'),
  ('Sonido Principal', 'Sonido', 'Consola Digital'),
  ('Sonido Principal', 'Sonido', 'Procesardor Digital Fane'),
  ('Sonido Principal', 'Sonido', 'Computador'),
  ('Sonido Principal', 'Sonido', 'Cajas RCF HDL20-A'),
  ('Sonido Principal', 'Sonido', 'Subwoofer Dobles JBL SRX828 SP'),
  ('Iluminación Profesional', 'Iluminación', 'Truss de 2 Mtrs Forrados de Negro'),
  ('Iluminación Profesional', 'Iluminación', 'Cabezas Moviles'),
  ('Iluminación Profesional', 'Iluminación', 'Cabezas Móviles Beam Chauvet'),
  ('Iluminación Profesional', 'Iluminación', 'Cabezas Móviles Color Wash'),
  ('Iluminación Profesional', 'Iluminación', 'Blinder'),
  ('Iluminación Profesional', 'Iluminación', 'Matrices de Led'),
  ('Iluminación Profesional', 'Iluminación', 'Par led LP 006'),
  ('Iluminación Profesional', 'Iluminación', 'Atomic'),
  ('Iluminación Profesional', 'Iluminación', 'Barras Led'),
  ('Iluminación Profesional', 'Iluminación', 'Consola NX Touch Martin'),
  ('Iluminación Profesional', 'Iluminación', 'Computador'),
  ('Iluminación Profesional', 'Iluminación', 'Ingeniero de Iluminación'),
  ('Iluminación Profesional', 'Iluminación', 'Máquina de Humo'),
  ('Iluminación Profesional', 'Iluminación', 'Patt Retro'),
  ('Iluminación Profesional', 'Iluminación', 'P1 Retro Lamp Liro'),
  ('Iluminación Profesional', 'Iluminación', 'Par led LP006'),
  ('Iluminación Profesional', 'Iluminación', 'Ingeniero de Iluminacion'),
  ('Iluminación Profesional', 'Iluminación', 'Maquina de humo'),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', 'Video Procesador'),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', 'Computador'),
  ('Pantalla Led Pitch 3 en diseño', 'Pantallas', 'ingeniero de Video')
) AS v(inv_name, inv_type, comp_name)
JOIN public.inventory i ON i.name = v.inv_name AND i.type = v.inv_type
JOIN public.components c ON lower(c.name) = lower(v.comp_name)
ON CONFLICT DO NOTHING;

COMMIT;
