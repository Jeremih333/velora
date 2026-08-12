export interface ProductionTelegramSmokeState {
  readonly startVerified: boolean;
  readonly miniAppVerified: boolean;
}

export function evaluateProductionTelegramSmoke(
  row: Readonly<Record<string, unknown>> | undefined,
  startedAt: number,
): ProductionTelegramSmokeState;
export function buildProductionTelegramSmokeQueryForMarker(
  startedAt: number,
  marker: string,
): string;
export function parseWranglerD1Rows(output: string): readonly Readonly<Record<string, unknown>>[];
