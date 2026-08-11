import { AppError, asError, nowMs, ru } from '@velora/shared';
import { z } from 'zod';
import {
  selectTelegramImage,
  storeTelegramImage,
  telegramDocumentSchema,
  telegramPhotoSchema,
} from './telegram-media';
import { upsertTelegramUser } from './telegram-user';
import {
  answerStarsPreCheckout,
  grantSuccessfulStarsPayment,
  reverseRefundedStarsPayment,
  validateAndMarkPreCheckout,
} from './telegram-payments';

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  is_bot: z.boolean().optional(),
  first_name: z.string().min(1).max(128),
  last_name: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
  language_code: z.string().max(16).optional(),
});

const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      message_id: z.number().int().positive(),
      from: telegramUserSchema.optional(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
      text: z.string().max(4096).optional(),
      photo: z.array(telegramPhotoSchema).max(10).optional(),
      document: telegramDocumentSchema.optional(),
      successful_payment: z
        .object({
          currency: z.string().min(1).max(8),
          total_amount: z.number().int().positive(),
          invoice_payload: z.string().min(1).max(128),
          subscription_expiration_date: z.number().int().positive().optional(),
          is_recurring: z.literal(true).optional(),
          is_first_recurring: z.literal(true).optional(),
          telegram_payment_charge_id: z.string().min(1).max(256),
          provider_payment_charge_id: z.string().max(256),
        })
        .optional(),
      refunded_payment: z
        .object({
          currency: z.literal('XTR'),
          total_amount: z.number().int().positive(),
          invoice_payload: z.string().min(1).max(128),
          telegram_payment_charge_id: z.string().min(1).max(256),
          provider_payment_charge_id: z.string().max(256),
        })
        .optional(),
    })
    .optional(),
  pre_checkout_query: z
    .object({
      id: z.string().min(1).max(256),
      from: telegramUserSchema,
      currency: z.string().min(1).max(8),
      total_amount: z.number().int().positive(),
      invoice_payload: z.string().min(1).max(128),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export function parseTelegramUpdate(value: unknown): TelegramUpdate {
  return telegramUpdateSchema.parse(value);
}

export function parseBotCommand(text: string | undefined, botUsername: string): string | null {
  if (!text?.startsWith('/')) return null;
  const token = text.trim().split(/\s+/u, 1)[0]?.toLowerCase();
  if (!token) return null;
  const [command, recipient] = token.slice(1).split('@', 2);
  if (!command || (recipient && recipient !== botUsername.toLowerCase().replace(/^@/u, ''))) {
    return null;
  }
  return command;
}

export function commandMessage(command: string): string | null {
  if (command === 'start') {
    return '✨ *Добро пожаловать в Velora*\n\nСоздавай персонажей и истории с памятью — прямо внутри Telegram.';
  }
  if (command === 'help') {
    return '🪄 *Velora*\n\nОткрой приложение кнопкой ниже. Если вход не сработал, закрой Mini App и открой его заново.';
  }
  if (command === 'app') {
    return '🌙 *Открыть Velora*\n\nНажми кнопку ниже, чтобы продолжить свои истории.';
  }
  if (command === 'support') {
    return '🛟 *Поддержка Velora*\n\nОпиши проблему одним сообщением после открытия раздела поддержки в приложении. Не отправляй пароли и платёжные данные.';
  }
  if (command === 'settings') {
    return '⚙️ *Настройки*\n\nТема, язык, persona по умолчанию, приватность и управление данными находятся внутри приложения.';
  }
  if (command === 'terms') {
    return '📜 *Условия использования*\n\nАктуальная версия условий доступна в разделе «Правовая информация» внутри Velora.';
  }
  if (command === 'privacy') {
    return '🔐 *Конфиденциальность*\n\nVelora проверяет Telegram-вход на сервере и не публикует приватные истории. Политика доступна внутри приложения.';
  }
  if (command === 'premium') {
    return '✨ *Пополнение Velora*\n\nТолько разовые покупки через Telegram Stars — без подписки и автоматического списания.';
  }
  if (command === 'report') {
    return '🛡️ *Сообщить о нарушении*\n\nОткрой нужного персонажа или сообщение в Velora и выбери «Пожаловаться», чтобы модерация получила необходимый контекст.';
  }
  if (command === 'paysupport') {
    return '⭐ *Поддержка по платежам*\n\nСохрани сообщение Telegram об оплате и открой раздел поддержки в Velora. Укажи дату и число Stars — платёжные секреты присылать не нужно.';
  }
  return null;
}

export async function secretsEqual(
  received: string | undefined,
  expected: string,
): Promise<boolean> {
  if (!received) return false;
  const encoder = new TextEncoder();
  const left = await crypto.subtle.digest('SHA-256', encoder.encode(received));
  const right = await crypto.subtle.digest('SHA-256', encoder.encode(expected));
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

const telegramApiResponseSchema = z.object({ ok: z.boolean(), description: z.string().optional() });

export async function sendTelegramCommandReply(
  fetcher: typeof fetch,
  token: string,
  chatId: number | string,
  text: string,
  appUrl: string,
  apiBaseUrl = 'https://api.telegram.org',
): Promise<void> {
  const response = await fetcher(`${apiBaseUrl}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть Velora', web_app: { url: appUrl } }]] },
    }),
  });
  const result = telegramApiResponseSchema.parse(await response.json());
  if (!response.ok || !result.ok) {
    throw new AppError('TELEGRAM_DELIVERY_FAILED', 'Telegram не принял ответ бота.', 503);
  }
}

export async function processTelegramUpdate(
  database: D1Database,
  update: TelegramUpdate,
  options: {
    readonly botUsername: string;
    readonly botToken: string;
    readonly publicAppUrl: string;
    readonly ownerTelegramId: string | undefined;
    readonly telegramApiBaseUrl?: string | undefined;
    readonly fetcher?: typeof fetch | undefined;
  },
): Promise<'processed' | 'duplicate' | 'ignored'> {
  await database
    .prepare(
      `INSERT INTO telegram_updates (update_id, update_type, received_at)
       VALUES (?, ?, ?) ON CONFLICT(update_id) DO NOTHING`,
    )
    .bind(
      update.update_id,
      update.pre_checkout_query ? 'pre_checkout_query' : update.message ? 'message' : 'unsupported',
      nowMs(),
    )
    .run();
  const claim = await database
    .prepare(
      `UPDATE telegram_updates SET status = 'PROCESSING', attempts = attempts + 1
       WHERE update_id = ? AND status IN ('RECEIVED', 'FAILED')`,
    )
    .bind(update.update_id)
    .run();
  if (claim.meta.changes !== 1) return 'duplicate';

  try {
    const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    const preCheckout = update.pre_checkout_query;
    if (preCheckout) {
      await upsertTelegramUser(
        database,
        {
          id: String(preCheckout.from.id),
          firstName: preCheckout.from.first_name,
          lastName: preCheckout.from.last_name,
          username: preCheckout.from.username,
          languageCode: preCheckout.from.language_code,
        },
        options.ownerTelegramId,
      );
      const accepted = await validateAndMarkPreCheckout(database, {
        telegramId: String(preCheckout.from.id),
        invoicePayload: preCheckout.invoice_payload,
        currency: preCheckout.currency,
        totalAmount: preCheckout.total_amount,
      });
      await answerStarsPreCheckout(fetcher, {
        ...(options.telegramApiBaseUrl ? { apiBaseUrl: options.telegramApiBaseUrl } : {}),
        botToken: options.botToken,
        queryId: preCheckout.id,
        ok: accepted,
        ...(accepted ? {} : { errorMessage: 'Счёт недействителен или больше недоступен.' }),
      });
      await markUpdate(database, update.update_id, 'COMPLETED');
      return 'processed';
    }
    const message = update.message;
    if (!message?.from || message.chat.type !== 'private') {
      await markUpdate(database, update.update_id, 'COMPLETED');
      return 'ignored';
    }
    const user = await upsertTelegramUser(
      database,
      {
        id: String(message.from.id),
        firstName: message.from.first_name,
        lastName: message.from.last_name,
        username: message.from.username,
        languageCode: message.from.language_code,
      },
      options.ownerTelegramId,
    );
    const command = parseBotCommand(message.text, options.botUsername);
    let reply = command ? commandMessage(command) : null;
    if (message.successful_payment) {
      const result = await grantSuccessfulStarsPayment(database, String(message.from.id), {
        invoicePayload: message.successful_payment.invoice_payload,
        currency: message.successful_payment.currency,
        totalAmount: message.successful_payment.total_amount,
        telegramPaymentChargeId: message.successful_payment.telegram_payment_charge_id,
        providerPaymentChargeId: message.successful_payment.provider_payment_charge_id,
        ...(message.successful_payment.is_recurring
          ? { isRecurring: message.successful_payment.is_recurring }
          : {}),
        ...(message.successful_payment.subscription_expiration_date
          ? { subscriptionExpirationDate: message.successful_payment.subscription_expiration_date }
          : {}),
      });
      if (result === 'granted_access') {
        reply = ru.billing.accessGrantedBot;
      } else if (result === 'granted') {
        reply =
          '✅ *AI-кредиты начислены*\n\nПокупка разовая: подписка и автоматические списания не создавались.';
      }
    }
    if (message.refunded_payment) {
      const result = await reverseRefundedStarsPayment(database, String(message.from.id), {
        invoicePayload: message.refunded_payment.invoice_payload,
        currency: message.refunded_payment.currency,
        totalAmount: message.refunded_payment.total_amount,
        telegramPaymentChargeId: message.refunded_payment.telegram_payment_charge_id,
        providerPaymentChargeId: message.refunded_payment.provider_payment_charge_id,
      });
      if (result === 'reversed') {
        reply = ru.billing.refundProcessedBot;
      }
    }
    const image = selectTelegramImage(message.photo, message.document);
    if (image) {
      await storeTelegramImage(database, user.id, image, options.botToken, fetcher);
      reply =
        '🖼️ *Изображение сохранено*\n\nВыбери его в редакторе persona или персонажа. До проверки модерацией изображение доступно только в приватных черновиках.';
    }
    if (reply) {
      await sendTelegramCommandReply(
        fetcher,
        options.botToken,
        message.chat.id,
        reply,
        options.publicAppUrl,
        options.telegramApiBaseUrl,
      );
    }
    await markUpdate(database, update.update_id, 'COMPLETED');
    return reply ? 'processed' : 'ignored';
  } catch (error) {
    const safeError = asError(error);
    await database
      .prepare(
        `UPDATE telegram_updates SET status = 'FAILED', last_error_code = ? WHERE update_id = ?`,
      )
      .bind(safeError instanceof AppError ? safeError.code : 'INTERNAL_ERROR', update.update_id)
      .run();
    throw error;
  }
}

async function markUpdate(
  database: D1Database,
  updateId: number,
  status: 'COMPLETED',
): Promise<void> {
  await database
    .prepare(
      `UPDATE telegram_updates SET status = ?, processed_at = ?, last_error_code = NULL
       WHERE update_id = ?`,
    )
    .bind(status, nowMs(), updateId)
    .run();
}
