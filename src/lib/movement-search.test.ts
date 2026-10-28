import { describe, expect, it } from "vitest";
import { matchesSearch } from "./movement-search";

describe("matchesSearch", () => {
  const fields = ["Pago Alemán Ltda", "5.1.01 - Remuneraciones", "Egreso", "Pendiente", "1500000"];

  it("coincide sin importar tildes ni mayusculas", () => {
    expect(matchesSearch("aleman", fields)).toBe(true);
    expect(matchesSearch("REMUNERACIONES", fields)).toBe(true);
  });

  it("exige todas las palabras, en cualquier campo", () => {
    expect(matchesSearch("pago pendiente", fields)).toBe(true);
    expect(matchesSearch("pago cobrado", fields)).toBe(false);
  });

  it("una consulta vacia coincide con todo", () => {
    expect(matchesSearch("   ", fields)).toBe(true);
    expect(matchesSearch("", [])).toBe(true);
  });

  it("ignora campos nulos", () => {
    expect(matchesSearch("x", [null, undefined])).toBe(false);
  });
});
