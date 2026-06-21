import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import type { BankMovementType } from "@prisma/client";

type SheetCell = string | number | Date | undefined;
type SheetRow = SheetCell[];

export type BankStatementRawRow = {
  rowNumber: number;
  date: Date;
  amount: Prisma.Decimal;
  type: BankMovementType;
  description: string;
  reference: string | null;
  branch: string | null;
};

const headerTargets = {
  fecha: "fecha",
  cargo: "cargo",
  abono: "abono",
  descripcion: "descripcion",
  saldo: "saldo",
  documento: "ndocumento",
  sucursal: "sucursal",
  monto: "monto",
  descripcionMovimiento: "descripcionmovimiento",
  cargoAbono: "cargoabono"
} as const;

/**
 * Normaliza encabezados quitando tildes/simbolos (ej. "N° Documento" ->
 * "ndocumento") para que el formato de copia/pega y el de descarga directa
 * del banco, que difieren en redaccion exacta, se puedan detectar con la
 * misma lista de objetivos.
 */
function normalizeHeader(value: SheetCell): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellNumber(value: SheetCell): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return new Prisma.Decimal(value);
  }
  const cleaned = String(value).trim().replace(/\./g, "").replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  return new Prisma.Decimal(cleaned);
}

function cellText(value: SheetCell): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
}

function cellDate(value: SheetCell): Date | null {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = cellText(value);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

type HeaderRowInfo = {
  rowIndex: number;
  columns: Record<string, number>;
  format: "copiado" | "descargado";
};

/**
 * La planilla copiada/pegada desde el portal trae el encabezado en la
 * primera fila util (Fecha, Cargo, Abono...); la descargada directamente
 * del banco antepone ~11 filas de metadata (cliente, rango de fechas
 * consultado, ejecutivo) antes del encabezado real (Monto, Cargo/Abono...).
 * Se busca la fila de encabezado por contenido en vez de asumir una
 * posicion fija, para que ambos formatos se detecten automaticamente.
 */
function findHeaderRow(rows: SheetRow[]): HeaderRowInfo | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const columns: Record<string, number> = {};
    rows[rowIndex].forEach((cell, colIndex) => {
      const normalized = normalizeHeader(cell);
      if (normalized) {
        columns[normalized] = colIndex;
      }
    });

    if (headerTargets.fecha in columns && headerTargets.cargo in columns && headerTargets.abono in columns) {
      return { rowIndex, columns, format: "copiado" };
    }
    if (headerTargets.monto in columns && headerTargets.cargoAbono in columns) {
      return { rowIndex, columns, format: "descargado" };
    }
  }

  return null;
}

function parseCopiedFormat(rows: SheetRow[], header: HeaderRowInfo): BankStatementRawRow[] {
  const result: BankStatementRawRow[] = [];
  const fechaCol = header.columns[headerTargets.fecha];
  const cargoCol = header.columns[headerTargets.cargo];
  const abonoCol = header.columns[headerTargets.abono];
  const descCol = header.columns[headerTargets.descripcion];
  const docCol = header.columns[headerTargets.documento];
  const sucursalCol = header.columns[headerTargets.sucursal];

  for (let i = header.rowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const date = cellDate(row[fechaCol]);
    const cargo = cellNumber(row[cargoCol]);
    const abono = cellNumber(row[abonoCol]);
    if (!date || (!cargo && !abono)) {
      continue;
    }

    result.push({
      rowNumber: i + 1,
      date,
      amount: cargo ? cargo.negated() : (abono as Prisma.Decimal),
      type: cargo ? "CARGO" : "ABONO",
      description: descCol !== undefined ? cellText(row[descCol]) : "",
      reference: docCol !== undefined ? cellText(row[docCol]) || null : null,
      branch: sucursalCol !== undefined ? cellText(row[sucursalCol]) || null : null
    });
  }

  return result;
}

function parseDownloadedFormat(rows: SheetRow[], header: HeaderRowInfo): BankStatementRawRow[] {
  const result: BankStatementRawRow[] = [];
  const montoCol = header.columns[headerTargets.monto];
  const fechaCol = header.columns[headerTargets.fecha];
  const descCol = header.columns[headerTargets.descripcionMovimiento];
  const docCol = header.columns[headerTargets.documento];
  const sucursalCol = header.columns[headerTargets.sucursal];
  const tipoCol = header.columns[headerTargets.cargoAbono];

  for (let i = header.rowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const date = cellDate(row[fechaCol]);
    const monto = cellNumber(row[montoCol]);
    const tipoText = cellText(row[tipoCol]).toUpperCase();
    if (!date || !monto || (tipoText !== "C" && tipoText !== "A")) {
      continue;
    }

    const type: BankMovementType = tipoText === "C" ? "CARGO" : "ABONO";
    const amount = type === "CARGO" ? monto.abs().negated() : monto.abs();

    result.push({
      rowNumber: i + 1,
      date,
      amount,
      type,
      description: descCol !== undefined ? cellText(row[descCol]) : "",
      reference: docCol !== undefined ? cellText(row[docCol]) || null : null,
      branch: sucursalCol !== undefined ? cellText(row[sucursalCol]) || null : null
    });
  }

  return result;
}

export async function parseBankStatementFile(buffer: Buffer): Promise<BankStatementRawRow[]> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { header: 1, raw: true });
  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error("No se reconoce el formato de la planilla: no se encontraron las columnas esperadas (Fecha/Cargo/Abono o Monto/Cargo-Abono).");
  }

  return header.format === "copiado" ? parseCopiedFormat(rows, header) : parseDownloadedFormat(rows, header);
}
