import { describe, expect, it } from "vitest";
import { weekKeyOf } from "@/lib/iso-week";
import { groupByWeek } from "./shared";

describe("groupByWeek", () => {
  it("agrupa por semana ISO y la clave coincide con weekKeyOf", () => {
    // 19-jun-2026 (viernes, semana 25), 20-jun (mismo viernes a sabado, sigue semana 25), 22-jun (lunes, semana 26).
    const items = [{ date: new Date(2026, 5, 19) }, { date: new Date(2026, 5, 20) }, { date: new Date(2026, 5, 22) }];
    const groups = groupByWeek(items, (item) => item.date);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe(weekKeyOf(items[0].date));
    expect(groups[1].key).toBe(weekKeyOf(items[2].date));
  });
});
