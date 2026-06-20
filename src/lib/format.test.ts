import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCurrency, formatDate, todayInAppTimeZone } from "./format";

describe("format helpers", () => {
  it("formats CLP amounts using es-CL", () => {
    expect(formatCurrency(1234567)).toBe("$1.234.567");
  });

  it("formats dates in the configured locale", () => {
    expect(formatDate(new Date("2026-06-18T12:00:00.000Z"))).toContain("2026");
  });

  it("muestra el mismo dia de calendario con que se construyo la fecha, sin reinterpretarla por zona horaria", () => {
    // projectedDate/paidAt/etc se construyen con new Date(year, month, day) en
    // la zona del proceso; formatDate no debe forzar otra zona (ver comentario
    // en format.ts) o en un servidor en UTC se puede mostrar el dia anterior.
    expect(formatDate(new Date(2026, 5, 26))).toContain("26");
  });

  describe("todayInAppTimeZone", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("usa la fecha de America/Santiago aunque el servidor corra en UTC", () => {
      // 02:00 UTC del 20-06 es todavia 19-06 22:00 en Santiago (UTC-4).
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-20T02:00:00.000Z"));

      const today = todayInAppTimeZone();

      expect(today.getFullYear()).toBe(2026);
      expect(today.getMonth()).toBe(5);
      expect(today.getDate()).toBe(19);
    });

    it("avanza al dia siguiente una vez pasada la medianoche en Santiago", () => {
      // 04:30 UTC del 20-06 ya es 20-06 00:30 en Santiago.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-20T04:30:00.000Z"));

      const today = todayInAppTimeZone();

      expect(today.getFullYear()).toBe(2026);
      expect(today.getMonth()).toBe(5);
      expect(today.getDate()).toBe(20);
    });
  });
});
