import SchemaBuilder from "@pothos/core";

export interface PothosContext {}

const builder = new SchemaBuilder<{
  Context: PothosContext;
}>({});

export { builder };
