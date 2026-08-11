export interface MessageWindow<T> {
  readonly visible: readonly T[];
  readonly hiddenCount: number;
}

export function selectMessageWindow<T>(
  items: readonly T[],
  requestedCount: number,
): MessageWindow<T> {
  const count = Math.max(1, Math.floor(requestedCount));
  const hiddenCount = Math.max(0, items.length - count);
  return { visible: items.slice(hiddenCount), hiddenCount };
}
