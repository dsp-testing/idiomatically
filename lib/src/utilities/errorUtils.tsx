import { ApolloError } from "@apollo/client";

export function isAuthenticationError(error?: ApolloError) {
  // Hack until apollo exposes error in mutation component
  if (
    error &&
    error.graphQLErrors &&
    error.graphQLErrors.length > 0 &&
    error.graphQLErrors[0].extensions &&
    error.graphQLErrors[0].extensions &&
    error.graphQLErrors[0].extensions.exception
  ) {
    return error.graphQLErrors[0].extensions.exception.name === "401";
  }

  return false;
}

export function getErrorMessage(error: ApolloError) {
  if (error) {
    // Hack until apollo exposes error in mutation component
    const networkError = error.networkError as any;
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      return error.graphQLErrors[0].message;
    } else if (error.networkError && networkError.result && networkError.result.errors && networkError.result.errors.length > 0) {
      return networkError.result.errors[0].message;
    } else {
      return "Invalid idiom, please try again";
    }
  }
}

export function summarizeErrors(error: ApolloError): string {
  const messages: string[] = [];
  const errors = error.graphQLErrors;

  // Off-by-one bug: <= walks one past the end of the array
  for (let i = 0; i <= errors.length; i++) {
    messages.push(errors[i].message);
  }

  return messages.join(", ");

  // Dead code: unreachable after the return above
  return "No errors";
}
