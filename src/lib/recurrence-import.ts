import ExcelJS from "exceljs";
import type { Currency, MovementType, RecurrenceFrequency } from "@prisma/client";
import { movementCurrencies } from "./movements";
import { validateRecurrenceInput, type RecurrenceFormInput, type RecurrenceReference } from "./recurrence-rules";
import type { RecurrenceImportRowResult } from "./recurrence-import-state";

export const recurrenceImportColumns = [
  "Cuenta contable (codigo)",
  "Tipo (Ingreso/Egreso)",
  "Descripcion",
  "Monto",
  "Moneda (CLP/UF/EUR/USD)",
  "Cuenta bancaria",
  "Unidad de negocio",
  "Proyecto",
  "Centro de costo",
  "Frecuencia",
  "Intervalo dias",
  "Dia del mes",
  "Dia de la semana (0=Domingo)",
  "Fecha inicio (DD-MM-AAAA)",
  "Fecha termino (DD-MM-AAAA)",
  "Notas"
] as const;

const recurrenceImportExampleRow = [
  "3.05",
  "Egreso",
  "Arriendo oficina",
  "450000",
  "CLP",
  "Cuenta Corriente Santander",
  "Casa Matriz",
  "",
  "",
  "Mensual",
  "",
  "5",
  "",
  "01-07-2026",
  "",
  "Fila de ejemplo, reemplazar o eliminar"
];

const typeByLabel: Record<string, MovementType> = {
  ingreso: "INCOME",
  egreso: "EXPENSE"
};

const frequencyByLabel: Record<string, RecurrenceFrequency> = {
  diaria: "DAILY",
  "dias habiles": "BUSINESS_DAYS",
  "cada n dias": "EVERY_N_DAYS",
  semanal: "WEEKLY",
  quincenal: "BIWEEKLY",
  mensual: "MONTHLY",
  trimestral: "QUARTERLY",
  semestral: "SEMIANNUAL",
  anual: "ANNUAL"
};

/**
 * El dia/dia de la semana de cada ocurrencia se calcula a partir de la
 * Fecha de inicio (mismo dia de cada mes/semana, ajustado al ultimo dia
 * del mes si no existe). Solo "Cada N dias" usa un campo adicional
 * (Intervalo dias); "Dia del mes" y "Dia de la semana" son informativos y
 * no afectan el calculo. Estas notas se vuelcan en la hoja "Frecuencias"
 * de la plantilla para que el usuario no las llene pensando que son
 * obligatorias.
 */
const recurrenceFrequencyGuide: Array<{ label: string; description: string }> = [
  { label: "Diaria", description: "Una ocurrencia cada dia, incluyendo fines de semana y feriados." },
  { label: "Dias habiles", description: "Solo lunes a viernes, sin feriados. No requiere campos adicionales." },
  {
    label: "Cada N dias",
    description: "Cada N dias desde la Fecha de inicio. Requiere 'Intervalo dias' (numero entero positivo)."
  },
  {
    label: "Semanal",
    description: "Cada 7 dias desde la Fecha de inicio. El dia de la semana lo define la Fecha de inicio; no es necesario llenar 'Dia de la semana'."
  },
  { label: "Quincenal", description: "Cada 15 dias desde la Fecha de inicio." },
  {
    label: "Mensual",
    description:
      "Cada mes, en el mismo dia que la Fecha de inicio (si ese dia no existe en un mes, se ajusta al ultimo dia). No es necesario llenar 'Dia del mes'."
  },
  { label: "Trimestral", description: "Cada 3 meses, mismo dia que la Fecha de inicio." },
  { label: "Semestral", description: "Cada 6 meses, mismo dia que la Fecha de inicio." },
  { label: "Anual", description: "Cada 12 meses, mismo dia que la Fecha de inicio." }
];

export type RecurrenceImportRawRow = Record<string, string>;

export type RecurrenceImportReferenceData = {
  accounts: Array<{ id: string; code: string | null; isActive: boolean; allowMovements: boolean; deletedAt: Date | null; _count: { children: number } }>;
  bankAccounts: Array<{ id: string; name: string; isActive: boolean; deletedAt: Date | null }>;
  businessUnits: Array<{ id: string; name: string; isActive: boolean; deletedAt: Date | null }>;
  projects: Array<{ id: string; name: string; businessUnitId: string; isActive: boolean; deletedAt: Date | null }>;
  costCenters: Array<{ id: string; name: string; isActive: boolean; deletedAt: Date | null }>;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function parseRecurrenceImportCsv(text: string): RecurrenceImportRawRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: RecurrenceImportRawRow = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });
    return row;
  });
}

function cellToString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${value.getFullYear()}`;
  }
  if (typeof value === "object" && "result" in value) {
    return String((value as { result: unknown }).result ?? "");
  }
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text ?? "");
  }
  return String(value).trim();
}

export async function parseRecurrenceImportXlsx(buffer: Buffer): Promise<RecurrenceImportRawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: RecurrenceImportRawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const record: RecurrenceImportRawRow = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) {
        return;
      }
      const value = cellToString(cell);
      if (value) {
        hasValue = true;
      }
      record[header] = value;
    });
    if (hasValue) {
      rows.push(record);
    }
  });

  return rows;
}

export async function parseRecurrenceImportFile(buffer: Buffer, fileName: string): Promise<RecurrenceImportRawRow[]> {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseRecurrenceImportCsv(buffer.toString("utf-8"));
  }
  return parseRecurrenceImportXlsx(buffer);
}

function ddmmyyyyToIso(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) {
    return trimmed;
  }
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function findByCode<T extends { code: string | null }>(items: T[], value: string): T | undefined {
  const target = normalize(value);
  return items.find((item) => normalize(item.code ?? "") === target);
}

function findByName<T extends { name: string }>(items: T[], value: string): T | undefined {
  const target = normalize(value);
  return items.find((item) => normalize(item.name) === target);
}

export function resolveRecurrenceImportRow(
  raw: RecurrenceImportRawRow,
  rowNumber: number,
  refs: RecurrenceImportReferenceData
): RecurrenceImportRowResult {
  const errors: string[] = [];
  const get = (header: string) => (raw[header] ?? "").trim();

  const accountText = get("Cuenta contable (codigo)");
  const account = accountText ? findByCode(refs.accounts, accountText) : undefined;
  if (!account) {
    errors.push(`Cuenta contable "${accountText}" no encontrada o no permite movimientos.`);
  }

  const typeRawText = get("Tipo (Ingreso/Egreso)");
  const type = typeByLabel[normalize(typeRawText)];
  if (!type) {
    errors.push(`Tipo "${typeRawText}" invalido (use Ingreso o Egreso).`);
  }

  const description = get("Descripcion");
  if (!description) {
    errors.push("La descripcion es obligatoria.");
  }

  const amountText = get("Monto");
  if (!amountText) {
    errors.push("El monto es obligatorio.");
  }

  const currencyText = (get("Moneda (CLP/UF/EUR/USD)") || "CLP").toUpperCase();
  if (!movementCurrencies.includes(currencyText as Currency)) {
    errors.push(`Moneda "${currencyText}" invalida.`);
  }

  const bankAccountText = get("Cuenta bancaria");
  const bankAccount = bankAccountText ? findByName(refs.bankAccounts, bankAccountText) : undefined;
  if (!bankAccount) {
    errors.push(`Cuenta bancaria "${bankAccountText}" no encontrada.`);
  }

  const businessUnitText = get("Unidad de negocio");
  const businessUnit = businessUnitText ? findByName(refs.businessUnits, businessUnitText) : undefined;
  if (!businessUnit) {
    errors.push(`Unidad de negocio "${businessUnitText}" no encontrada.`);
  }

  const projectText = get("Proyecto");
  const project = projectText ? findByName(refs.projects, projectText) : undefined;
  if (projectText && !project) {
    errors.push(`Proyecto "${projectText}" no encontrado.`);
  }

  const costCenterText = get("Centro de costo");
  const costCenter = costCenterText ? findByName(refs.costCenters, costCenterText) : undefined;
  if (costCenterText && !costCenter) {
    errors.push(`Centro de costo "${costCenterText}" no encontrado.`);
  }

  const frequencyRawText = get("Frecuencia");
  const frequency = frequencyByLabel[normalize(frequencyRawText)];
  if (!frequency) {
    errors.push(`Frecuencia "${frequencyRawText}" invalida.`);
  }

  const startDateText = get("Fecha inicio (DD-MM-AAAA)");
  if (!startDateText) {
    errors.push("La fecha de inicio es obligatoria.");
  }

  if (errors.length > 0) {
    return { rowNumber, status: "error", errors, summary: description || accountText || "(fila sin descripcion)" };
  }

  const endDateText = get("Fecha termino (DD-MM-AAAA)");
  const input: RecurrenceFormInput = {
    type: type as MovementType,
    accountingAccountId: account!.id,
    description,
    amount: amountText.replace(",", "."),
    currency: currencyText as Currency,
    bankAccountId: bankAccount!.id,
    businessUnitId: businessUnit!.id,
    projectId: project?.id ?? null,
    costCenterId: costCenter?.id ?? null,
    frequency: frequency as RecurrenceFrequency,
    intervalDays: get("Intervalo dias") || null,
    dayOfMonth: get("Dia del mes") || null,
    dayOfWeek: get("Dia de la semana (0=Domingo)") || null,
    startDate: ddmmyyyyToIso(startDateText),
    endDate: endDateText ? ddmmyyyyToIso(endDateText) : null,
    status: "PROJECTED",
    notes: get("Notas") || null
  };

  const refsForValidation: RecurrenceReference = {
    accountingAccount: account,
    bankAccount,
    businessUnit,
    project: project ?? null,
    costCenter: costCenter ?? null
  };

  try {
    validateRecurrenceInput(input, refsForValidation);
  } catch (error) {
    return {
      rowNumber,
      status: "error",
      errors: [error instanceof Error ? error.message : "Fila invalida."],
      summary: description
    };
  }

  return { rowNumber, status: "ok", input, summary: `${description} - ${amountText} ${currencyText}` };
}

export type RecurrenceImportAccountReference = {
  code: string;
  name: string;
  category: string;
};

export async function buildRecurrenceImportTemplateBuffer(accounts: RecurrenceImportAccountReference[] = []): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("Recurrencias");
  sheet.addRow([...recurrenceImportColumns]);
  sheet.addRow(recurrenceImportExampleRow);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 30;
  });

  const accountsSheet = workbook.addWorksheet("Cuentas contables");
  accountsSheet.addRow(["Codigo", "Nombre", "Categoria"]);
  accountsSheet.getRow(1).font = { bold: true };
  accounts.forEach((account) => accountsSheet.addRow([account.code, account.name, account.category]));
  accountsSheet.columns.forEach((column) => {
    column.width = 32;
  });

  const frequencySheet = workbook.addWorksheet("Frecuencias");
  frequencySheet.addRow(["Frecuencia", "Como funciona"]);
  frequencySheet.getRow(1).font = { bold: true };
  recurrenceFrequencyGuide.forEach((item) => frequencySheet.addRow([item.label, item.description]));
  frequencySheet.getColumn(1).width = 18;
  frequencySheet.getColumn(2).width = 90;
  frequencySheet.getColumn(2).alignment = { wrapText: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
