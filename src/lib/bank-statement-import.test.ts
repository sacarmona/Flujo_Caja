import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseBankStatementFile } from "./bank-statement-import";

async function buildCopiedFormatBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["Fecha", "Cargo", "Abono", "Descripcion", "Saldo", "N° Documento", "Sucursal"]);
  sheet.addRow([new Date(2026, 5, 19), 100000, null, "PAGO EN LINEA COPEC", 946293, 0, "OTRAS GERENCIAS"]);
  sheet.addRow([new Date(2026, 5, 18), null, 648521, "Remuneraciones 2026 04 MOH", 4560780, 0, "AGUSTINAS"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildDownloadedFormatBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Movimientos CtaCte");
  for (let i = 0; i < 9; i += 1) {
    sheet.addRow(["metadata", "", "", "", "", "", ""]);
  }
  sheet.addRow(["MONTO", "DESCRIPCION MOVIMIENTO", "FECHA", "SALDO", "N° DOCUMENTO", "SUCURSAL", "CARGO/ABONO"]);
  sheet.addRow([-100000, "PAGO EN LINEA COPEC", "19/06/2026", 946293, "000000000", "OTRAS GERENCIAS", "C"]);
  sheet.addRow([648521, "Remuneraciones 2026 04 MOH", "18/06/2026", 4560780, "000000000", "AGUSTINAS", "A"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseBankStatementFile", () => {
  it("parsea el formato copiado/pegado (columnas Cargo/Abono separadas)", async () => {
    const rows = await parseBankStatementFile(await buildCopiedFormatBuffer());

    expect(rows).toHaveLength(2);
    expect(rows[0].amount.toFixed(0)).toBe("-100000");
    expect(rows[0].type).toBe("CARGO");
    expect(rows[0].description).toBe("PAGO EN LINEA COPEC");
    expect(rows[0].date.toISOString().slice(0, 10)).toBe("2026-06-19");
    expect(rows[1].amount.toFixed(0)).toBe("648521");
    expect(rows[1].type).toBe("ABONO");
  });

  it("parsea el formato descargado del banco (monto con signo + columna Cargo/Abono, con metadata previa)", async () => {
    const rows = await parseBankStatementFile(await buildDownloadedFormatBuffer());

    expect(rows).toHaveLength(2);
    expect(rows[0].amount.toFixed(0)).toBe("-100000");
    expect(rows[0].type).toBe("CARGO");
    expect(rows[0].date.toISOString().slice(0, 10)).toBe("2026-06-19");
    expect(rows[1].amount.toFixed(0)).toBe("648521");
    expect(rows[1].type).toBe("ABONO");
  });

  it("lanza un error claro si no reconoce el formato", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["Columna A", "Columna B"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parseBankStatementFile(buffer)).rejects.toThrow("No se reconoce el formato");
  });
});
