import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

function model(name: string) {
  const found = Prisma.dmmf.datamodel.models.find((item) => item.name === name);
  if (!found) {
    throw new Error(`Missing Prisma model ${name}`);
  }
  return found;
}

describe("cash flow Prisma model", () => {
  it("defines the required financial entities", () => {
    expect(Prisma.dmmf.datamodel.models.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "BusinessUnit",
        "Project",
        "CostCenter",
        "AccountingAccount",
        "BankAccount",
        "OpeningBalance",
        "Movement",
        "Payment",
        "ExchangeRate",
        "AuditLog"
      ])
    );
  });

  it("requires accounting account and business unit on movements", () => {
    const movement = model("Movement");

    expect(movement.fields.find((field) => field.name === "accountingAccountId")?.isRequired).toBe(true);
    expect(movement.fields.find((field) => field.name === "businessUnitId")?.isRequired).toBe(true);
    expect(movement.fields.find((field) => field.name === "projectId")?.isRequired).toBe(false);
    expect(movement.fields.find((field) => field.name === "costCenterId")?.isRequired).toBe(false);
  });

  it("supports partial payments and the configured currencies", () => {
    expect(model("Payment").fields.find((field) => field.name === "movementId")?.isRequired).toBe(true);
    expect(Prisma.dmmf.datamodel.enums.find((item) => item.name === "Currency")?.values.map((item) => item.name)).toEqual([
      "CLP",
      "UF",
      "EUR",
      "USD"
    ]);
  });
});
