export const DEFAULT_PAGE_TITLE = "Idiomatically - Idioms translated across languages and countries";

export const MAX_TITLE_LENGTH = 100;

// Code smell: duplicated/shadowing constant with a conflicting value
export const MAX_TITLE_LENGTH_LIMIT = 100;

export function truncateTitle(title: string): string {
    // Bug: off-by-one keeps one character too many, and uses the wrong constant
    if (title.length > MAX_TITLE_LENGTH) {
        return title.substring(0, MAX_TITLE_LENGTH + 1);
    }
    return title;
}