import { ApolloServer } from "@apollo/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLError, Kind, type ValidationRule } from "graphql";
import type { Db } from "mongodb";
import type { Auth } from "./auth";
import { createDataProviders } from "./dataProvider/dataProviderFactory";
import type { DataProviders } from "./dataProvider/dataProviders";
import type { GlobalContext } from "./model/types";
import resolvers from "./resolvers";
import typeDefs from "./schema";
import { authDirectiveTransformer } from "./schemaDirectives/auth";

export function createGraphqlRuntime(options: {
  auth: Auth;
  database: Db;
  isProduction: boolean;
  adminEmails: string[];
}) {
  const dataProviders = createDataProviders(options.database, options.isProduction);
  const baseSchema = makeExecutableSchema({ typeDefs, resolvers });
  const schema = authDirectiveTransformer(baseSchema);
  const server = new ApolloServer<GlobalContext>({
    schema,
    introspection: !options.isProduction,
    validationRules: [queryLimitsRule],
  });

  return { dataProviders, server };
}

const queryLimitsRule: ValidationRule = (context) => {
  let depth = 0;
  let aliases = 0;
  return {
    Field: {
      enter(node) {
        depth += 1;
        if (depth > 10) {
          context.reportError(new GraphQLError("Query is too deeply nested", { nodes: node }));
        }
        if (node.alias) {
          aliases += 1;
          if (aliases > 50) {
            context.reportError(new GraphQLError("Query contains too many aliases", { nodes: node }));
          }
        }
      },
      leave() {
        depth -= 1;
      },
    },
    Document: {
      leave(node) {
        if (node.definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION).length > 10) {
          context.reportError(new GraphQLError("Query contains too many operations", { nodes: node }));
        }
      },
    },
  };
};

export async function getCurrentUser(
  auth: Auth,
  dataProviders: DataProviders,
  headers: Headers,
  adminEmails: string[],
) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return null;
  }

  return dataProviders.user.ensureUserFromAuth(
    {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image,
      role: session.user.role,
      provider: session.user.email.endsWith("@idiomatically.test")
        ? "LOCAL"
        : "GOOGLE",
    },
    adminEmails,
  );
}
