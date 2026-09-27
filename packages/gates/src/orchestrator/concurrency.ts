import { availableParallelism } from "node:os";

export function resolveConcurrency(value?: number | `${number}%`): number {
  const available = availableParallelism();
  if (value === undefined) {
    return Math.max(1, Math.floor(available / 2));
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Concurrency must be a positive integer, received ${value}.`);
    }
    return value;
  }
  const percentage = Number.parseInt(value.slice(0, -1), 10);
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
    throw new Error(`Concurrency percentage must be between 1% and 100%, received ${value}.`);
  }
  return Math.max(1, Math.floor((available * percentage) / 100));
}
