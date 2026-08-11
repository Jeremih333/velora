import { z } from 'zod';

export const publicConfigSchema = z.object({
  environment: z.enum(['local', 'staging', 'production']),
  appName: z.literal('Velora'),
  telegramBotUsername: z.string().regex(/^[A-Za-z0-9_]{5,32}$/u),
  maxInitDataAgeSeconds: z.coerce.number().int().min(60).max(86_400).default(900),
  dailyAiBudgetUsd: z.coerce.number().positive().max(100).default(0.8),
  monthlyAiBudgetUsd: z.coerce.number().positive().max(1_000).default(24),
  lifetimeAiBudgetUsd: z.coerce.number().positive().max(10_000).default(350),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;
