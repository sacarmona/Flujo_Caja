import type { PrismaClient } from "@prisma/client";
import { dateKey } from "./recurrences";

/**
 * Copia local de feriados chilenos por ano, usada para sembrar la tabla
 * Holiday. Una vez sembrada, la fuente de verdad es la base de datos (no
 * esta lista), para que los calculos historicos no cambien si la fuente
 * externa cambia en el futuro. Los feriados que dependen del calendario
 * lunar (Viernes Santo, Sabado Santo) se cargan explicitamente por ano.
 */
export const STATIC_CHILE_HOLIDAYS: Array<{ date: string; name: string }> = [
  { date: "2025-01-01", name: "Ano Nuevo" },
  { date: "2025-04-18", name: "Viernes Santo" },
  { date: "2025-04-19", name: "Sabado Santo" },
  { date: "2025-05-01", name: "Dia del Trabajo" },
  { date: "2025-05-21", name: "Dia de las Glorias Navales" },
  { date: "2025-06-29", name: "San Pedro y San Pablo" },
  { date: "2025-07-16", name: "Dia de la Virgen del Carmen" },
  { date: "2025-08-15", name: "Asuncion de la Virgen" },
  { date: "2025-09-18", name: "Fiestas Patrias" },
  { date: "2025-09-19", name: "Glorias del Ejercito" },
  { date: "2025-10-12", name: "Encuentro de Dos Mundos" },
  { date: "2025-10-31", name: "Dia de las Iglesias Evangelicas" },
  { date: "2025-11-01", name: "Dia de Todos los Santos" },
  { date: "2025-12-08", name: "Inmaculada Concepcion" },
  { date: "2025-12-25", name: "Navidad" },
  { date: "2026-01-01", name: "Ano Nuevo" },
  { date: "2026-04-03", name: "Viernes Santo" },
  { date: "2026-04-04", name: "Sabado Santo" },
  { date: "2026-05-01", name: "Dia del Trabajo" },
  { date: "2026-05-21", name: "Dia de las Glorias Navales" },
  { date: "2026-06-29", name: "San Pedro y San Pablo" },
  { date: "2026-07-16", name: "Dia de la Virgen del Carmen" },
  { date: "2026-08-15", name: "Asuncion de la Virgen" },
  { date: "2026-09-18", name: "Fiestas Patrias" },
  { date: "2026-09-19", name: "Glorias del Ejercito" },
  { date: "2026-10-12", name: "Encuentro de Dos Mundos" },
  { date: "2026-10-31", name: "Dia de las Iglesias Evangelicas" },
  { date: "2026-11-01", name: "Dia de Todos los Santos" },
  { date: "2026-12-08", name: "Inmaculada Concepcion" },
  { date: "2026-12-25", name: "Navidad" }
];

/**
 * Retorna las claves de fecha (YYYY-MM-DD) de todos los feriados
 * registrados en la tabla Holiday (oficiales sembrados + especiales
 * agregados manualmente por ADMIN). Compatible con la firma
 * `holidays: string[]` ya usada por cash-flow.ts y recurrences.ts.
 */
export async function getHolidayKeys(prisma: PrismaClient): Promise<string[]> {
  const holidays = await prisma.holiday.findMany({ select: { date: true } });
  return holidays.map((holiday) => dateKey(holiday.date));
}
