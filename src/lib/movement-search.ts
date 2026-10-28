/** Minusculas y sin tildes, para que "aleman" encuentre "Alemán". */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Todas las palabras de la consulta (separadas por espacios) deben aparecer
 * en alguno de los campos; una consulta vacia coincide con todo.
 */
export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalizeSearchText(fields.filter(Boolean).join(" "));
  return terms.every((term) => haystack.includes(term));
}
