# Notas para la revisión jurídica

Borradores de [/privacidad](../../apps/web/institucional/privacidad.html),
[/terminos](../../apps/web/institucional/terminos.html) y
[/eliminacion-datos](../../apps/web/institucional/eliminacion-datos.html). No los redactó un
abogado. Estas notas resumen en qué normas se basan, qué se decidió al redactarlos y qué
conviene revisar antes de publicarlos.

## Normas usadas

El texto se consultó en el gestor normativo de Función Pública:
[Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) y
[Decreto 1377 de 2013](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646).

| Norma | Artículos | Dónde se usan |
|---|---|---|
| Ley 1581 de 2012 | 5 (datos sensibles), 7 (menores), 8 (derechos), 9 (autorización), 10 (casos sin autorización), 14 (consultas: 10 días hábiles, prorrogables 5), 15 (reclamos: 5 días para completar, desistimiento a los 2 meses, 2 días hábiles para el traslado y para la leyenda «reclamo en trámite», 15 días hábiles prorrogables 8), 16 (queja ante la SIC) | Política (secciones 2 y 8 a 11) y eliminación de datos (secciones 3 y 7) |
| Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015 | 7 (modo de obtener la autorización), 9 (supresión y revocatoria; no proceden ante un deber legal o contractual), 11 (conservación), 12 (menores), 13 (contenido mínimo de la política), 20 (quién puede ejercer los derechos), 24 y 25 (transmisión a encargados) | Política y eliminación de datos |
| Ley 1480 de 2011 (Estatuto del Consumidor) | Mención general | Términos, sección 9 |

## Decisiones de redacción

- Los plazos salen del texto de la ley; no se agregó ninguno.
- Los términos no repiten cifras de pagos ni de cancelación: remiten a la cotización y al
  contrato, que hoy se contradicen ([inventario de textos, sección 4](inventario-textos.md#4-condiciones-y-datos-que-se-contradicen)).
- Lo que no está activo se identifica como tal: el envío automático por WhatsApp, n8n y la
  inteligencia artificial.
- En seguridad solo se mencionan controles que hoy existen en el código: usuario y
  contraseña, permisos por cargo y sesión de ocho horas.
- Los datos de la empresa (razón social, NIT, dirección, correos, fecha de vigencia) no se
  completaron. Quedan pendientes hasta que la dueña los confirme, y mientras tanto la versión
  publicable no se genera.

## Puntos que necesitan criterio jurídico

1. **Proveedores en el exterior** (Supabase, Google y Cloudflare; luego Meta). ¿Sirven sus
   términos como contrato de transmisión (artículo 25 del Decreto 1377)? ¿Hace falta algo más
   por el artículo 26 de la Ley 1581?
2. **Autorización.** Hoy los formularios y el contrato no incluyen texto de autorización ni
   enlace a la política. ¿Qué texto debe llevar cada canal: aviso de privacidad, casilla o
   cláusula del contrato?
3. **Conductas inequívocas.** ¿Puede tomarse como autorización que una persona escriba por
   WhatsApp y entregue sus datos para pedir una cotización?
4. **Trabajadores.** Cuentas bancarias, llaves de pago y fechas de incapacidad (solo fechas).
5. **Menores e imágenes.** Fiestas de 15 años; fotos de clientes en la galería y en Instagram.
6. **RNBD.** ¿La empresa está obligada a inscribir sus bases de datos en la SIC? Solo aplica
   con activos superiores a 100.000 UVT.
7. **Aceptación de los términos** por el solo uso del sitio.
8. **Fuera del sitio.** Algunas cláusulas del contrato, como la exclusión de reembolsos o la
   suspensión sin reintegro, conviene revisarlas frente al Estatuto del Consumidor.

## Ley colombiana y requisitos de Meta

- Las tres páginas responden a obligaciones de la ley colombiana. Además, sus URL se usarán
  en Meta (Numeral 10). Son cosas distintas: cumplir con Meta no reemplaza cumplir la ley, ni
  al revés.
- De Meta solo se verificó (Numeral 1) lo siguiente:
  - Pide una URL pública de política de privacidad que diga qué datos se recogen, para qué y
    cómo pedir su eliminación.
  - Según el tipo de app, pide también una URL con instrucciones para eliminar los datos.
  - Los campos exactos se revisarán en el Numeral 10.
