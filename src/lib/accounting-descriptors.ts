import { normalizeSearchText } from "./movement-search";

export type DescriptorRule = {
  pattern: string;
  accountingAccountId: string;
};

/** Texto normalizado para comparar: sin tildes, en minusculas y con espacios simples. */
export function normalizeDescriptor(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Sugiere la cuenta contable para la descripcion de un movimiento bancario.
 * Un descriptor coincide si sus palabras aparecen completas y en orden en la
 * descripcion ("viatico" coincide con "Viatico Juan Perez" pero no con
 * "Viaticos"); si coinciden varios gana el mas especifico (mas largo).
 * `isAllowed` descarta cuentas que no calzan con el tipo del movimiento
 * (ingreso/egreso) o que ya no estan disponibles.
 */
export function suggestAccountForDescription(
  description: string,
  rules: DescriptorRule[],
  isAllowed: (accountingAccountId: string) => boolean = () => true
): DescriptorRule | null {
  const haystack = ` ${normalizeDescriptor(description)} `;
  let best: { rule: DescriptorRule; length: number } | null = null;

  for (const rule of rules) {
    const pattern = normalizeDescriptor(rule.pattern);
    if (!pattern || !isAllowed(rule.accountingAccountId)) continue;
    if (!haystack.includes(` ${pattern} `)) continue;
    if (!best || pattern.length > best.length) best = { rule, length: pattern.length };
  }
  return best?.rule ?? null;
}

/**
 * Propuesta inicial de descriptor a partir de una descripcion bancaria: las
 * primeras palabras no numericas ("Remuneraciones Juan Perez 0123" ->
 * "remuneraciones juan perez"). El usuario la edita antes de guardarla.
 */
export function proposeDescriptorPattern(description: string, maxWords = 3): string {
  return normalizeDescriptor(description)
    .split(" ")
    .filter((word) => word && !/^\d+$/.test(word))
    .slice(0, maxWords)
    .join(" ");
}
