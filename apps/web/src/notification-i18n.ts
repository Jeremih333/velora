import type { Locale } from './i18n';

const copies = {
  ru: {
    open: 'Открыть уведомления',
    title: 'Уведомления',
    unread: (count: number) => `Непрочитанных: ${String(count)}`,
    markAll: 'Прочитать все',
    empty: 'Новых уведомлений пока нет.',
    close: 'Закрыть уведомления',
  },
  en: {
    open: 'Open notifications',
    title: 'Notifications',
    unread: (count: number) => `Unread: ${String(count)}`,
    markAll: 'Mark all as read',
    empty: 'No notifications yet.',
    close: 'Close notifications',
  },
} as const;

export function getNotificationMessages(locale: Locale) {
  return copies[locale];
}
