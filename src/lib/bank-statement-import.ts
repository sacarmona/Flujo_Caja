import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import type { BankMovementType } from "@prisma/client";

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
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellNumber(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return new Prisma.Decimal(value);
  }
  if (typeof value === "object" && value !== null && "result" in (value as Record<string, unknown>)) {
    return cellNumber((value as { result: unknown }).result);
  }
  const cleaned = String(value).trim().replace(/\./g, "").replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  return new Prisma.Decimal(cleaned);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object" && value !== null && "result" in (value as Record<string, unknown>)) {
    return cellText((value as { result: unknown }).result);
  }
  if (typeof value === "object" && value !== null && "text" in (value as Record<string, unknown>)) {
    return cellText((value as { text: unknown }).text);
  }
  return String(value).trim();
}

function cellDate(value: unknown): Date | null {
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
  rowNumber: number;
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
function findHeaderRow(sheet: ExcelJS.Worksheet): HeaderRowInfo | null {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const columns: Record<string, number> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const normalized = normalizeHeader(cell.value);
      if (normalized) {
        columns[normalized] = colNumber;
      }
    });

    if (headerTargets.fecha in columns && headerTargets.cargo in columns && headerTargets.abono in columns) {
      return { rowNumber, columns, format: "copiado" };
    }
    if (headerTargets.monto in columns && headerTargets.cargoAbono in columns) {
      return { rowNumber, columns, format: "descargado" };
    }
  }

  return null;
}

function parseCopiedFormat(sheet: ExcelJS.Worksheet, header: HeaderRowInfo): BankStatementRawRow[] {
  const rows: BankStatementRawRow[] = [];
  const fechaCol = header.columns[headerTargets.fecha];
  const cargoCol = header.columns[headerTargets.cargo];
  const abonoCol = header.columns[headerTargets.abono];
  const descCol = header.columns[headerTargets.descripcion];
  const docCol = header.columns[headerTargets.documento];
  const sucursalCol = header.columns[headerTargets.sucursal];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= header.rowNumber) {
      return;
    }

    const date = cellDate(row.getCell(fechaCol).value);
    const cargo = cellNumber(row.getCell(cargoCol).value);
    const abono = cellNumber(row.getCell(abonoCol).value);
    if (!date || (!cargo && !abono)) {
      return;
    }

    rows.push({
      rowNumber,
      date,
      amount: cargo ? cargo.negated() : (abono as Prisma.Decimal),
      type: cargo ? "CARGO" : "ABONO",
      description: descCol ? cellText(row.getCell(descCol).value) : "",
      reference: docCol ? cellText(row.getCell(docCol).value) || null : null,
      branch: sucursalCol ? cellText(row.getCell(sucursalCol).value) || null : null
    });
  });

  return rows;
}

function parseDownloadedFormat(sheet: ExcelJS.Worksheet, header: HeaderRowInfo): BankStatementRawRow[] {
  const rows: BankStatementRawRow[] = [];
  const montoCol = header.columns[headerTargets.monto];
  const fechaCol = header.columns[headerTargets.fecha];
  const descCol = header.columns[headerTargets.descripcionMovimiento];
  const docCol = header.columns[headerTargets.documento];
  const sucursalCol = header.columns[headerTargets.sucursal];
  const tipoCol = header.columns[headerTargets.cargoAbono];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= header.rowNumber) {
      return;
    }

    const date = cellDate(row.getCell(fechaCol).value);
    const monto = cellNumber(row.getCell(montoCol).value);
    const tipoText = cellText(row.getCell(tipoCol).value).toUpperCase();
    if (!date || !monto || (tipoText !== "C" && tipoText !== "A")) {
      return;
    }

    const type: BankMovementType = tipoText === "C" ? "CARGO" : "ABONO";
    const amount = type === "CARGO" ? monto.abs().negated() : monto.abs();

    rows.push({
      rowNumber,
      date,
      amount,
      type,
      description: descCol ? cellText(row.getCell(descCol).value) : "",
      reference: docCol ? cellText(row.getCell(docCol).value) || null : null,
      branch: sucursalCol ? cellText(row.getCell(sucursalCol).value) || null : null
    });
  });

  return rows;
}

export async function parseBankStatementFile(buffer: Buffer): Promise<BankStatementRawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }

  const header = findHeaderRow(sheet);
  if (!header) {
    throw new Error("No se reconoce el formato de la planilla: no se encontraron las columnas esperadas (Fecha/Cargo/Abono o Monto/Cargo-Abono).");
  }

  return header.format === "copiado" ? parseCopiedFormat(sheet, header) : parseDownloadedFormat(sheet, header);
}
