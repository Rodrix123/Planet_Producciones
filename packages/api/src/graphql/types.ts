import { builder } from "./builder";

builder.queryType({
  fields: (t) => ({
    health: t.string({
      resolve: () => "OK",
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    _empty: t.string({
      nullable: true,
      resolve: () => null,
    }),
  }),
});
