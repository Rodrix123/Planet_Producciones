// Consultas a Supabase compartidas del monorepo, agrupadas por tema.
// Hoy el servidor usa solo ./eventos (ver apps/server/src/routes/eventos.routes.ts); la nómina y el
// inventario los consulta el servidor directamente en sus propias rutas.

export * from "./eventos";
