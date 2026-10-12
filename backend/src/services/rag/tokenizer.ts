const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos",
  "e", "em", "no", "na", "nos", "nas", "para", "pra", "pro", "por", "com", "que",
  "se", "eu", "me", "meu", "minha", "voces", "vcs", "vc", "voce", "tem", "ai", "qual",
  "quais", "como", "onde", "quando", "quanto", "ja", "mesmo", "ou", "ao", "aos",
  "the", "is", "sao", "ser", "esta", "isso", "essa", "esse", "mais", "bem", "la",
]);

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9@]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}
