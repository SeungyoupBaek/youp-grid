import { defaultFilterPredicate } from "./filtering.ts";
import type { FilterOperator } from "./types.ts";

export type GridConditionalFormat = {
  id: string; columnId: string; operator: FilterOperator; value?: unknown;
  color?: string; backgroundColor?: string; icon?: string;
  dataBar?: { min: number; max: number; color?: string };
};
export type GridCellAppearance = { color?: string; backgroundColor?: string; backgroundImage?: string; icon?: string };
export function getGridCellAppearance(value: unknown, columnId: string, rules: readonly GridConditionalFormat[] = []): GridCellAppearance {
  const appearance: GridCellAppearance = {};
  for (const rule of rules) {
    if (rule.columnId !== columnId || !defaultFilterPredicate(value, { columnId, operator: rule.operator, value: rule.value })) continue;
    if (rule.color) appearance.color = rule.color;
    if (rule.backgroundColor) appearance.backgroundColor = rule.backgroundColor;
    if (rule.icon) appearance.icon = rule.icon;
    if (rule.dataBar && typeof value === "number" && Number.isFinite(value) && Number.isFinite(rule.dataBar.min) && Number.isFinite(rule.dataBar.max) && rule.dataBar.max > rule.dataBar.min) {
      const percent = Math.min(100, Math.max(0, (value - rule.dataBar.min) / (rule.dataBar.max - rule.dataBar.min) * 100));
      appearance.backgroundImage = `linear-gradient(to right, ${rule.dataBar.color ?? "#dbeafe"} ${percent}%, transparent ${percent}%)`;
    }
  }
  return appearance;
}
