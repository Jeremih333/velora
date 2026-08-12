export interface ProductionConfigReport {
  readonly workerName: string;
  readonly publicAppUrl: string;
  readonly databaseName: string;
  readonly databaseId: string;
  readonly ownerTelegramId: string;
  readonly paidAiEnabled: false;
  readonly paymentsEnabled: false;
  readonly sharedTelegramBotWithStaging: boolean;
  readonly telegramWebhookCutoverRequired: boolean;
}

export interface RemotePreflightSnapshot {
  readonly authenticated: boolean;
  readonly productionWorkerExists: boolean;
  readonly secretNames: readonly string[];
  readonly pendingMigrationNames: readonly string[];
}

export interface RemotePreflightReport extends RemotePreflightSnapshot {
  readonly requiredSecretNames: readonly string[];
  readonly missingSecretNames: readonly string[];
  readonly readyForMigrationAndDeploy: boolean;
}

export function inspectProductionConfig(source: string): ProductionConfigReport;
export function listMigrationNames(names: readonly string[]): readonly string[];
export function evaluateRemoteSnapshot(snapshot: RemotePreflightSnapshot): RemotePreflightReport;
