export interface Baseline<Entry> {
  readonly count: number;
  readonly entries: readonly Entry[];
  readonly acceptedAt: string;
  readonly message: string;
}

export interface BaselineRatchet<Entry> {
  readonly before: number;
  readonly after: number;
  readonly increased: boolean;
  readonly newEntries: readonly Entry[];
}

export function evaluateBaselineCount(current: number, baseline: number): BaselineRatchet<never> {
  return {
    before: baseline,
    after: current,
    increased: current > baseline,
    newEntries: [],
  };
}

export function evaluateBaselineEntries<Entry>(
  current: readonly Entry[],
  baseline: Baseline<Entry>,
  key: (entry: Entry) => string,
): BaselineRatchet<Entry> {
  const accepted = new Set(baseline.entries.map(key));
  const newEntries = current.filter((entry) => !accepted.has(key(entry)));
  return {
    before: baseline.count,
    after: current.length,
    increased: current.length > baseline.count || newEntries.length > 0,
    newEntries,
  };
}
