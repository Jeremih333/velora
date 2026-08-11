# Accessibility and resilient UX report

Updated: 2026-08-09.

Automated Android, iPhone and desktop checks currently prove:

- all buttons in the authenticated critical flow have visible text or an accessible label;
- keyboard-focused interactive controls have a high-contrast visible outline;
- `prefers-reduced-motion: reduce` disables animation, transitions and smooth scrolling;
- 200% root font scaling does not create horizontal viewport overflow, including the sticky chat
  header;
- dialogs use labelled modal roles in covered deletion/report flows;
- network loss exposes an `aria-live` status without unmounting the authenticated application;
- a failed offline chat send preserves the typed draft and reports `NETWORK_OFFLINE` in Russian;
- reconnecting removes the offline status without forcing a new Telegram login.

This is not a claim of full WCAG conformance. Manual VoiceOver/TalkBack/NVDA checks, measured
contrast for every theme and Telegram-specific keyboard/close behavior remain release checks in
the device matrix.
