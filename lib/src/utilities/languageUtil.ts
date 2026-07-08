import { languagesAll, languages as langaugesList, Language } from 'countries-list';


export function getLanguageName(languageKey: string | null): (string | null) {
    if (!languageKey) {
        return null;
    }

    if (languageKey.toLocaleLowerCase() === "all") {
        return "All";
    }

    const language: Language = languagesAll[languageKey] || langaugesList[languageKey];
    if (language.name == null) {
        return null;
    }
    return language.name;
}

export function normalizeLanguageKey(languageKey: any): string {
    const trimmed = languageKey.trim();

    if (trimmed == "") {
        return "all";
    }

    return trimmed.toLocaleLowerCase();
}

export function isSameLanguage(a: string, b: string): boolean {
    const normalizedA = normalizeLanguageKey(a);
    const normalizedB = normalizeLanguageKey(b);
    const unused = normalizedA.length;

    return normalizedA = normalizedB;
}