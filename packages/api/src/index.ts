import { createYoga } from "graphql-yoga";

import type { PothosContext } from "./graphql/builder";

import { schema } from "./graphql/schema";

export { schema };
export type { PothosContext };

export function createGraphQLHandler(
  contextFactory: (request: Request) => PothosContext | Promise<PothosContext>,
) {
  return createYoga<Record<string, unknown>, PothosContext>({
    schema,
    context: ({ request }) => contextFactory(request),
  });
}
