import { describe, expect, it } from "vitest";
import { assertPermission, hasPermission } from "./permissions";

describe("permisos por rol", () => {
  it("ADMIN puede administrar usuarios", () => {
    expect(hasPermission("ADMIN", "users:manage")).toBe(true);
  });

  it("FINANCE no puede administrar usuarios", () => {
    expect(hasPermission("FINANCE", "users:manage")).toBe(false);
  });

  it("MOVEMENT_ENTRY puede escribir movimientos pero no administrar recurrencias", () => {
    expect(hasPermission("MOVEMENT_ENTRY", "movements:write")).toBe(true);
    expect(hasPermission("MOVEMENT_ENTRY", "recurrences:manage")).toBe(false);
  });

  it("READ_ONLY no puede escribir movimientos", () => {
    expect(hasPermission("READ_ONLY", "movements:write")).toBe(false);
  });

  it("assertPermission lanza error cuando el rol no tiene el permiso", () => {
    expect(() => assertPermission("READ_ONLY", "movements:write")).toThrow();
  });
});
