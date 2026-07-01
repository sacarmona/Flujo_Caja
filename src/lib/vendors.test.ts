import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertCanManageVendors,
  canManageVendors,
  isVendorOverpaid,
  isVendorSettled,
  parseDueDay,
  validateVendorInput,
  vendorPaidAmount,
  vendorRemainingDebt,
  type VendorFormInput
} from "./vendors";

const baseInput: VendorFormInput = {
  category: "PP proveedores",
  name: "Silvotec",
  referenceInstallment: "4498103",
  dueDay: "15",
  initialDebtClp: "38835391",
  notes: null
};

describe("vendor permissions", () => {
  it("solo ADMIN y FINANCE pueden administrar proveedores", () => {
    expect(canManageVendors("ADMIN")).toBe(true);
    expect(canManageVendors("FINANCE")).toBe(true);
    expect(canManageVendors("MOVEMENT_ENTRY")).toBe(false);
    expect(() => assertCanManageVendors("READ_ONLY")).toThrow("ADMIN y FINANCE");
  });
});

describe("parseDueDay", () => {
  it("acepta dias entre 1 y 31, y permite vacio", () => {
    expect(parseDueDay("15")).toBe(15);
    expect(parseDueDay("")).toBeNull();
    expect(() => parseDueDay("0")).toThrow("entre 1 y 31");
    expect(() => parseDueDay("32")).toThrow("entre 1 y 31");
    expect(() => parseDueDay("abc")).toThrow("entre 1 y 31");
  });
});

describe("validateVendorInput", () => {
  it("valida y normaliza un proveedor completo", () => {
    const result = validateVendorInput(baseInput);

    expect(result.category).toBe("PP proveedores");
    expect(result.name).toBe("Silvotec");
    expect(result.referenceInstallment?.toString()).toBe("4498103");
    expect(result.dueDay).toBe(15);
    expect(result.initialDebtClp.toString()).toBe("38835391");
  });

  it("exige categoria y nombre", () => {
    expect(() => validateVendorInput({ ...baseInput, category: "  " })).toThrow("categoria es obligatoria");
    expect(() => validateVendorInput({ ...baseInput, name: "" })).toThrow("nombre del proveedor es obligatorio");
  });

  it("exige el total adeudado, pero la cuota referencial y el dia de vencimiento son opcionales", () => {
    expect(() => validateVendorInput({ ...baseInput, initialDebtClp: "" })).toThrow("monto total adeudado");

    const result = validateVendorInput({ ...baseInput, referenceInstallment: "", dueDay: "" });
    expect(result.referenceInstallment).toBeNull();
    expect(result.dueDay).toBeNull();
  });
});

describe("vendorPaidAmount", () => {
  it("suma los pagos activos de cada movimiento vinculado", () => {
    const total = vendorPaidAmount([
      {
        status: "PARTIALLY_PAID",
        projectedAmountClp: new Prisma.Decimal(100000),
        payments: [{ amount: new Prisma.Decimal(40000) }]
      },
      {
        status: "PAID_OR_COLLECTED",
        projectedAmountClp: new Prisma.Decimal(50000),
        payments: [{ amount: new Prisma.Decimal(50000) }]
      }
    ]);

    expect(total.toString()).toBe("90000");
  });

  it("usa projectedAmountClp como respaldo cuando el movimiento no tiene pagos pero ya esta Parcial o Pagado/Cobrado", () => {
    const total = vendorPaidAmount([
      { status: "PAID_OR_COLLECTED", projectedAmountClp: new Prisma.Decimal(10000000), payments: [] }
    ]);

    expect(total.toString()).toBe("10000000");
  });

  it("no suma movimientos Proyectado/Pendiente/Vencido sin pagos, aunque tengan monto", () => {
    const total = vendorPaidAmount([
      { status: "PROJECTED", projectedAmountClp: new Prisma.Decimal(100000), payments: [] },
      { status: "PENDING", projectedAmountClp: new Prisma.Decimal(200000), payments: [] },
      { status: "OVERDUE", projectedAmountClp: new Prisma.Decimal(300000), payments: [] }
    ]);

    expect(total.toString()).toBe("0");
  });
});

describe("vendorRemainingDebt / isVendorSettled / isVendorOverpaid", () => {
  it("calcula el saldo pendiente restando lo pagado del total inicial", () => {
    const remaining = vendorRemainingDebt(new Prisma.Decimal(38835391), new Prisma.Decimal(20842979));
    expect(remaining.toString()).toBe("17992412");
    expect(isVendorSettled(remaining)).toBe(false);
    expect(isVendorOverpaid(remaining)).toBe(false);
  });

  it("queda liquidado cuando lo pagado iguala o supera el total, y marca sobrepago solo si lo supera", () => {
    const exact = vendorRemainingDebt(new Prisma.Decimal(100000), new Prisma.Decimal(100000));
    expect(isVendorSettled(exact)).toBe(true);
    expect(isVendorOverpaid(exact)).toBe(false);

    const over = vendorRemainingDebt(new Prisma.Decimal(100000), new Prisma.Decimal(120000));
    expect(isVendorSettled(over)).toBe(true);
    expect(isVendorOverpaid(over)).toBe(true);
  });
});
