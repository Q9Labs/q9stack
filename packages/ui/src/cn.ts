import { twMerge } from "tailwind-merge";

export type ClassValue = string | number | false | null | undefined;

/**
 * Joins class names and resolves Tailwind conflicts (last one wins).
 *
 * Deliberately narrower than `clsx`: no nested arrays or object maps, because
 * every call site in this package passes flat strings and conditionals.
 */
export function cn(...values: ClassValue[]): string {
  let joined = "";
  for (const value of values) {
    if (value === false || value === null || value === undefined || value === "") {
      continue;
    }
    joined = joined === "" ? String(value) : `${joined} ${String(value)}`;
  }
  return twMerge(joined);
}
