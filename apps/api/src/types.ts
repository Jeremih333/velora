import type { SessionPrincipal } from './session';

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly ENVIRONMENT: 'local' | 'telegram-test' | 'staging' | 'production';
  readonly APP_NAME: 'Velora';
  readonly TELEGRAM_BOT_USERNAME: string;
  readonly MAX_INIT_DATA_AGE_SECONDS: string;
  readonly DAILY_AI_BUDGET_USD: string;
  readonly MONTHLY_AI_BUDGET_USD: string;
  readonly LIFETIME_AI_BUDGET_USD: string;
  readonly PAID_AI_ENABLED?: string;
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_API_BASE_URL?: string;
  readonly TELEGRAM_API_ENVIRONMENT?: 'production' | 'test';
  readonly TELEGRAM_WEBHOOK_SECRET?: string;
  readonly PAYMENTS_ENABLED?: string;
  readonly PUBLIC_APP_URL: string;
  readonly SESSION_SIGNING_KEY?: string;
  readonly BOTHUB_API_KEY?: string;
  readonly BOTHUB_BASE_URL?: string;
  readonly BOTHUB_MODELS_URL?: string;
  readonly OWNER_TELEGRAM_ID?: string;
}

export interface Variables {
  readonly requestId: string;
  readonly principal: SessionPrincipal;
  readonly actorHash: string | undefined;
  readonly requestStartedAt: number;
  readonly requestFailed: boolean;
}
