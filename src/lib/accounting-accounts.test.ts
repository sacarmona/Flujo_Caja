import { describe, expect, it } from "vitest";
import {
  assertAdminRole,
  buildAccountingAccountTree,
  canAccountReceiveMovements,
  canDeleteAccountingAccount,
  hasDuplicateAccountingCode,
  wouldCreateAccountingCycle
} from "./accounting-accounts";

const now = new Date("2026-01-01T00:00:00.000Z");

const accounts = [
  {
    id: "income",
    companyId: "company",
    parentId: null,
    code: "1",
    name: "Ingresos",
    type: "INCOME" as const,
    sortOrder: 1,
    level: 1,
    isActive: true,
    allowMovements: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "inspection",
    companyId: "company",
    parentId: "income",
    code: "1.01",
    name: "Servicios de inspección",
    type: "INCOME" as const,
    sortOrder: 10,
    level: 2,
    isActive: true,
    allowMovements: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  }
];

describe("accounting account rules", () => {
  it("builds a hierarchical tree", () => {
    const tree = buildAccountingAccountTree(accounts);

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].code).toBe("1.01");
  });

  it("rejects duplicate codes", () => {
    expect(hasDuplicateAccountingCode(accounts, "1.01")).toBe(true);
    expect(hasDuplicateAccountingCode(accounts, "1.01", "inspection")).toBe(false);
  });

  it("detects hierarchy cycles", () => {
    expect(wouldCreateAccountingCycle(accounts, "income", "inspection")).toBe(true);
    expect(wouldCreateAccountingCycle(accounts, "inspection", null)).toBe(false);
  });

  it("restricts mutations to ADMIN", () => {
    expect(() => assertAdminRole("FINANCE")).toThrow("Solo ADMIN");
    expect(() => assertAdminRole("ADMIN")).not.toThrow();
  });

  it("blocks movements in parents and disabled accounts", () => {
    expect(canAccountReceiveMovements({ isActive: true, allowMovements: true, deletedAt: null, _count: { children: 0 } })).toBe(
      true
    );
    expect(canAccountReceiveMovements({ isActive: true, allowMovements: true, deletedAt: null, _count: { children: 1 } })).toBe(
      false
    );
    expect(canAccountReceiveMovements({ isActive: true, allowMovements: false, deletedAt: null, _count: { children: 0 } })).toBe(
      false
    );
  });

  it("does not allow deleting used accounts", () => {
    expect(canDeleteAccountingAccount({ _count: { movements: 1, children: 0 } })).toBe(false);
    expect(canDeleteAccountingAccount({ _count: { movements: 0, children: 0 } })).toBe(true);
  });
});
