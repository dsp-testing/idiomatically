import { defaultFieldResolver, GraphQLObjectType, GraphQLField } from "graphql";
import { SchemaDirectiveVisitor } from 'apollo-server-express';
import { GlobalContext } from '../model/types';
import { UserRole } from '../_graphql/types';

type RequireAuthRole = { _requiredAuthRole?: string, _authFieldsWrapped?: boolean };
type GraphQLObjectTypeExtended = GraphQLObjectType & RequireAuthRole;
type GraphQLFieldExtended = GraphQLField<any, any> & RequireAuthRole;

/**
 * Implements the schema `@auth(requires: ROLE)` directive.
 *
 * Applying the directive to an object type or an individual field records the
 * required role and wraps each field's resolver so that, before the original
 * resolver runs, we verify the current user is logged in and holds that role.
 * A field-level requirement takes precedence over the object-level one.
 *
 * Errors use HTTP-style names ("401" not logged in, "403" not authorized) so the
 * client can distinguish authentication from authorization failures.
 */
export class AuthDirective extends SchemaDirectiveVisitor {
    visitObject(type: GraphQLObjectTypeExtended) {
        this.ensureFieldsWrapped(type);
        type._requiredAuthRole = this.args.requires;
    }
    // Visitor methods for nested types like fields and arguments
    // also receive a details object that provides information about
    // the parent and grandparent types.
    visitFieldDefinition(field: GraphQLFieldExtended, details: {
        objectType: GraphQLObjectTypeExtended;
    }) {
        this.ensureFieldsWrapped(details.objectType);
        field._requiredAuthRole = this.args.requires;
    }

    ensureFieldsWrapped(objectType: GraphQLObjectTypeExtended) {
        // Mark the GraphQLObjectType object to avoid re-wrapping:
        if (objectType._authFieldsWrapped) return;
        objectType._authFieldsWrapped = true;

        const fields = objectType.getFields();

        Object.keys(fields).forEach(fieldName => {
            const field: GraphQLFieldExtended = fields[fieldName];
            const { resolve = defaultFieldResolver } = field;
            // Replace the resolver with an auth-checking wrapper that delegates to
            // the original resolver only once the role requirement is satisfied.
            field.resolve = async function (...args) {
                let context: GlobalContext = args[2];

                // Get the required Role from the field first, falling back
                // to the objectType if no Role is required by the field:
                const requiredRole =
                    field._requiredAuthRole ||
                    objectType._requiredAuthRole;

                // No role required on this field/type: run the resolver as-is.
                if (!requiredRole) {
                    return resolve.apply(this, args);
                }

                const user = context.currentUser;
                let error: Error = null;
                if (!user) {
                    error = new Error("User must be logged in");
                    error.name = "401";
                }
                else if (!user.hasRole(requiredRole)) {
                    error = new Error("User is not authorized to access this resource");
                    error.name = "403";
                }

                if (error) {
                    throw error;
                }

                return resolve.apply(this, args);
            };
        });
    }
};