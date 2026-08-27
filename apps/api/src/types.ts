import type { SessionPrincipal } from './session';

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly MEDIA_BUCKET?: R2Bucket;
  readonly AI?: Ai;
  readonly ENVIRONMENT: 'local' | 'telegram-test' | 'staging' | 'production';
  readonly APP_NAME: 'VeloraAI';
  readonly TELEGRAM_BOT_USERNAME: string;
  readonly TELEGRAM_RECONCILIATION_ENABLED?: string;
  readonly MAX_INIT_DATA_AGE_SECONDS: string;
  readonly DAILY_AI_BUDGET_USD: string;
  readonly PER_USER_DAILY_AI_BUDGET_USD?: string;
  readonly MONTHLY_AI_BUDGET_USD: string;
  readonly LIFETIME_AI_BUDGET_USD: string;
  readonly PAID_AI_ENABLED?: string;
  readonly SPONSORED_FREE_AI_ENABLED?: string;
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_API_BASE_URL?: string;
  readonly TELEGRAM_API_ENVIRONMENT?: 'production' | 'test';
  readonly TELEGRAM_WEBHOOK_SECRET?: string;
  readonly PAYMENTS_ENABLED?: string;
  readonly PUBLIC_APP_URL: string;
  readonly WEB_APP_CACHE_VERSION?: string;
  readonly SESSION_SIGNING_KEY?: string;
  readonly BOTHUB_API_KEY?: string;
  readonly BOTHUB_BASE_URL?: string;
  readonly BOTHUB_MODELS_URL?: string;
  readonly OWNER_TELEGRAM_ID?: string;
  readonly CHILD_BOT_ENCRYPTION_KEY?: string;
  readonly MAINTENANCE_MODE?: string;
  readonly MAINTENANCE_START_AT?: string;
  readonly MAINTENANCE_END_AT?: string;
  readonly MAINTENANCE_MESSAGE?: string;
}

export interface Variables {
  readonly requestId: string;
  readonly principal: SessionPrincipal;
  readonly actorHash: string | undefined;
  readonly requestStartedAt: number;
  readonly requestFailed: boolean;
}
