import type { AccountingAccount, AccountingAccountType, Role } from "@prisma/client";

export type AccountingAccountNode = AccountingAccount & {
  children: AccountingAccountNode[];
  _count?: {
    movements: number;
    children: number;
  };
};

export type AccountingAccountInput = {
  id?: string;
  parentId: string | null;
  code: string;
  name: string;
  type: AccountingAccountType;
  sortOrder: number;
  isActive: boolean;
  allowMovements: boolean;
};

export function buildAccountingAccountTree(accounts: AccountingAccount[]): AccountingAccountNode[] {
  const nodes = new Map<string, AccountingAccountNode>();
  const roots: AccountingAccountNode[] = [];

  for (const account of accounts) {
    nodes.set(account.id, { ...account, children: [] });
  }

  for (const account of nodes.values()) {
    if (account.parentId && nodes.has(account.parentId)) {
      nodes.get(account.parentId)?.children.push(account);
    } else {
      roots.push(account);
    }
  }

  const byOrder = (a: AccountingAccountNode, b: AccountingAccountNode) =>
    a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "es-CL");

  function sortChildren(items: AccountingAccountNode[]) {
    items.sort(byOrder);
    for (const item of items) {
      sortChildren(item.children);
    }
  }

  sortChildren(roots);
  return roots;
}

export function hasDuplicateAccountingCode(
  accounts: Pick<AccountingAccount, "id" | "code">[],
  code: string,
  currentId?: string
): boolean {
  const normalized = code.trim().toUpperCase();
  return accounts.some((account) => account.code.trim().toUpperCase() === normalized && account.id !== currentId);
}

export function wouldCreateAccountingCycle(
  accounts: Pick<AccountingAccount, "id" | "parentId">[],
  accountId: string,
  nextParentId: string | null
): boolean {
  let cursor = nextParentId;
  const parentById = new Map(accounts.map((account) => [account.id, account.parentId]));
  const visited = new Set<string>();

  while (cursor) {
    if (cursor === accountId || visited.has(cursor)) {
      return true;
    }

    visited.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }

  return false;
}

export function getNextAccountingLevel(
  accounts: Pick<AccountingAccount, "id" | "level">[],
  parentId: string | null
): number {
  if (!parentId) {
    return 1;
  }

  return (accounts.find((account) => account.id === parentId)?.level ?? 0) + 1;
}

export function canAccountReceiveMovements(
  account: Pick<AccountingAccount, "isActive" | "allowMovements" | "deletedAt"> & {
    _count?: { children: number };
  }
): boolean {
  return account.isActive && account.allowMovements && !account.deletedAt && (account._count?.children ?? 0) === 0;
}

export function canDeleteAccountingAccount(account: { _count?: { movements: number; children: number } }): boolean {
  return (account._count?.movements ?? 0) === 0 && (account._count?.children ?? 0) === 0;
}

export function assertAdminRole(role: Role): void {
  if (role !== "ADMIN") {
    throw new Error("Solo ADMIN puede modificar el plan de cuentas.");
  }
}

export function validateAccountingAccountInput(
  input: AccountingAccountInput,
  accounts: Pick<AccountingAccount, "id" | "code" | "parentId" | "level">[]
): { level: number; allowMovements: boolean } {
  if (!input.code.trim()) {
    throw new Error("El codigo es obligatorio.");
  }

  if (!input.name.trim()) {
    throw new Error("El nombre es obligatorio.");
  }

  if (hasDuplicateAccountingCode(accounts, input.code, input.id)) {
    throw new Error("Ya existe una cuenta con ese codigo.");
  }

  if (input.id && input.parentId && wouldCreateAccountingCycle(accounts, input.id, input.parentId)) {
    throw new Error("La jerarquia no puede contener ciclos.");
  }

  const level = getNextAccountingLevel(accounts, input.parentId);
  return { level, allowMovements: Boolean(input.allowMovements) };
}
