import { describe, expect, it } from "vitest";
import { normalizeDescriptor, proposeDescriptorPattern, suggestAccountForDescription } from "./accounting-descriptors";

const rules = [
  { pattern: "remuneraciones", accountingAccountId: "rem" },
  { pattern: "viatico", accountingAccountId: "via" },
  { pattern: "PAGO EN LINEA COPEC", accountingAccountId: "via" },
  { pattern: "pago en linea", accountingAccountId: "gen" }
];

describe("accounting descriptors", () => {
  it("normaliza tildes, mayusculas y signos", () => {
    expect(normalizeDescriptor("  Viático-  JUAN  ")).toBe("viatico juan");
  });

  it("sugiere por palabras completas, sin importar tildes ni mayusculas", () => {
    expect(suggestAccountForDescription("Remuneraciones Julio 2026", rules)?.accountingAccountId).toBe("rem");
    expect(suggestAccountForDescription("VIÁTICO Juan Perez", rules)?.accountingAccountId).toBe("via");
    expect(suggestAccountForDescription("Viaticos varios", rules)).toBeNull();
  });

  it("gana el descriptor mas especifico", () => {
    expect(suggestAccountForDescription("PAGO EN LINEA COPEC LTDA", rules)?.accountingAccountId).toBe("via");
    expect(suggestAccountForDescription("PAGO EN LINEA ENTEL", rules)?.accountingAccountId).toBe("gen");
  });

  it("descarta cuentas no permitidas y devuelve null si nada coincide", () => {
    expect(suggestAccountForDescription("Remuneraciones", rules, (id) => id !== "rem")).toBeNull();
    expect(suggestAccountForDescription("Otra cosa", rules)).toBeNull();
    expect(suggestAccountForDescription("", rules)).toBeNull();
  });

  it("propone un descriptor con las primeras palabras no numericas", () => {
    expect(proposeDescriptorPattern("Remuneraciones Juan Perez Soto 0123")).toBe("remuneraciones juan perez");
    expect(proposeDescriptorPattern("12345 Copec")).toBe("copec");
  });
});
