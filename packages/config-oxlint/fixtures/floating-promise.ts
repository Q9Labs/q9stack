declare function loadValue(): Promise<number>;

export function startLoading(): void {
  loadValue();
}
