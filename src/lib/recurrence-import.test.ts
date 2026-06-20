import { describe, expect, it } from "vitest";
import { parseRecurrenceImportCsv, resolveRecurrenceImportRow, type RecurrenceImportReferenceData } from "./recurrence-import";

const refs: RecurrenceImportReferenceData = {
  accounts: [{ id: "acc-1", code: "3.05", isActive: true, allowMovements: true, deletedAt: null, _count: { children: 0 } }],
  bankAccounts: [{ id: "bank-1", name: "Cuenta Corriente Santander", isActive: true, deletedAt: null }],
  businessUnits: [{ id: "unit-1", name: "Casa Matriz", isActive: true, deletedAt: null }],
  projects: [{ id: "project-1", name: "Proyecto Norte", businessUnitId: "unit-1", isActive: true, deletedAt: null }],
  costCenters: [{ id: "cc-1", name: "Administracion", isActive: true, deletedAt: null }]
};

function baseRow(overrides: Record<string, string> = {}) {
  return {
    "Cuenta contable (codigo)": "3.05",
    "Tipo (Ingreso/Egreso)": "Egreso",
    Descripcion: "Arriendo oficina",
    Monto: "450000",
    "Moneda (CLP/UF/EUR/USD)": "CLP",
    "Cuenta bancaria": "Cuenta Corriente Santander",
    "Unidad de negocio": "Casa Matriz",
    Proyecto: "",
    "Centro de costo": "",
    Frecuencia: "Mensual",
    "Intervalo dias": "",
    "Dia del mes": "5",
    "Dia de la semana (0=Domingo)": "",
    "Fecha inicio (DD-MM-AAAA)": "01-07-2026",
    "Fecha termino (DD-MM-AAAA)": "",
    Notas: "",
    ...overrides
  };
}

describe("parseRecurrenceImportCsv", () => {
  it("parsea filas separadas por coma respetando comillas", () => {
    const csv = ['Descripcion,Monto,Notas', '"Arriendo, oficina",450000,"Pago ""mensual"""'].join("\n");

    const rows = parseRecurrenceImportCsv(csv);

    expect(rows).toEqual([{ Descripcion: "Arriendo, oficina", Monto: "450000", Notas: 'Pago "mensual"' }]);
  });

  it("ignora lineas vacias", () => {
    const csv = "Descripcion,Monto\nA,100\n\nB,200\n";

    expect(parseRecurrenceImportCsv(csv)).toHaveLength(2);
  });
});

describe("resolveRecurrenceImportRow", () => {
  it("acepta una fila valida y normaliza tipo, frecuencia y fecha", () => {
    const result = resolveRecurrenceImportRow(baseRow(), 2, refs);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.input.type).toBe("EXPENSE");
      expect(result.input.frequency).toBe("MONTHLY");
      expect(result.input.startDate).toBe("2026-07-01");
      expect(result.input.accountingAccountId).toBe("acc-1");
      expect(result.input.bankAccountId).toBe("bank-1");
      expect(result.input.businessUnitId).toBe("unit-1");
    }
  });

  it("acepta etiquetas con tildes o mayusculas distintas (Días Hábiles, INGRESO)", () => {
    const result = resolveRecurrenceImportRow(
      baseRow({ "Tipo (Ingreso/Egreso)": "INGRESO", Frecuencia: "Días Hábiles" }),
      2,
      refs
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.input.type).toBe("INCOME");
      expect(result.input.frequency).toBe("BUSINESS_DAYS");
    }
  });

  it("reporta cuentas, bancos o unidades no encontradas", () => {
    const result = resolveRecurrenceImportRow(
      baseRow({ "Cuenta contable (codigo)": "9.99", "Cuenta bancaria": "Banco inexistente" }),
      5,
      refs
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.rowNumber).toBe(5);
      expect(result.errors.join(" ")).toContain("Cuenta contable");
      expect(result.errors.join(" ")).toContain("Cuenta bancaria");
    }
  });

  it("reporta tipo y frecuencia invalidos", () => {
    const result = resolveRecurrenceImportRow(baseRow({ "Tipo (Ingreso/Egreso)": "Devolucion", Frecuencia: "Bimensual" }), 3, refs);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors.join(" ")).toContain("Tipo");
      expect(result.errors.join(" ")).toContain("Frecuencia");
    }
  });

  it("resuelve proyecto y centro de costo opcionales cuando vienen informados", () => {
    const result = resolveRecurrenceImportRow(baseRow({ Proyecto: "Proyecto Norte", "Centro de costo": "Administracion" }), 2, refs);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.input.projectId).toBe("project-1");
      expect(result.input.costCenterId).toBe("cc-1");
    }
  });

  it("rechaza un monto vacio o una descripcion vacia", () => {
    const result = resolveRecurrenceImportRow(baseRow({ Monto: "", Descripcion: "" }), 2, refs);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors.join(" ")).toContain("monto");
      expect(result.errors.join(" ")).toContain("descripcion");
    }
  });
});
