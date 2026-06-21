import { describe, expect, it } from "vitest";
import { assertCanChangeOwnRole, assertCanManageUsers, canManageUsers, parseRole, validateEmail, validatePassword } from "./users";

describe("user management helpers", () => {
  it("solo ADMIN puede administrar usuarios", () => {
    expect(canManageUsers("ADMIN")).toBe(true);
    expect(canManageUsers("FINANCE")).toBe(false);
    expect(() => assertCanManageUsers("ADMIN")).not.toThrow();
    expect(() => assertCanManageUsers("READ_ONLY")).toThrow("Solo ADMIN");
  });

  it("valida el rol contra la lista permitida", () => {
    expect(parseRole("FINANCE")).toBe("FINANCE");
    expect(() => parseRole("SUPERUSER")).toThrow("Rol invalido");
  });

  it("normaliza y valida el formato de correo", () => {
    expect(validateEmail(" Admin@Adentu.cl ")).toBe("admin@adentu.cl");
    expect(() => validateEmail("no-es-correo")).toThrow("no es valido");
    expect(() => validateEmail("")).toThrow("no es valido");
  });

  it("exige contrasenas de al menos 8 caracteres", () => {
    expect(() => validatePassword("1234567")).toThrow("al menos 8");
    expect(() => validatePassword("12345678")).not.toThrow();
  });

  it("impide que un admin se quite su propio rol de Administrador", () => {
    expect(() => assertCanChangeOwnRole("user-1", "user-1", "READ_ONLY")).toThrow("No puedes quitarte");
    expect(() => assertCanChangeOwnRole("user-1", "user-1", "ADMIN")).not.toThrow();
    expect(() => assertCanChangeOwnRole("user-1", "user-2", "READ_ONLY")).not.toThrow();
  });
});
