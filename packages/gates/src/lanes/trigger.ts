import { filesForCategory } from "../core/classify.js";
import type { GateCategory, LaneTrigger } from "../core/types.js";

export function categoryTrigger(categories: readonly GateCategory[]): LaneTrigger {
  return ({ classification }) => {
    const matches = categories.flatMap((category) => filesForCategory(classification, category));
    const unique = [...new Set(matches)];
    if (unique.length === 0) {
      return false;
    }
    if (categories.length === 1) {
      const category = categories[0] ?? "source";
      return `${unique.length} ${category} ${unique.length === 1 ? "file" : "files"} changed`;
    }
    return `${unique.length} relevant ${unique.length === 1 ? "file" : "files"} changed`;
  };
}

export const alwaysTrigger: LaneTrigger = () => "always required";
