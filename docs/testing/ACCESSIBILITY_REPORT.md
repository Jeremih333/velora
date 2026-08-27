# Accessibility and resilient UX report

Updated: 2026-08-09.

Automated Android, iPhone and desktop checks currently prove:

- all buttons in the authenticated critical flow have visible text or an accessible label;
- keyboard-focused interactive controls have a high-contrast visible outline;
- `prefers-reduced-motion: reduce` disables animation, transitions and smooth scrolling;
- 200% root font scaling does not create horizontal viewport overflow, including the sticky chat
  header;
- dialogs use labelled modal roles, move focus inside, trap Tab/Shift+Tab, close with Escape and
  restore focus to the opener in covered drawer, deletion, report, model and memory flows;
- network loss exposes an `aria-live` status without unmounting the authenticated application;
- a failed offline chat send preserves the typed draft and reports `NETWORK_OFFLINE` in Russian;
- reconnecting removes the offline status without forcing a new Telegram login.
- the mobile chat composer is geometrically verified to end above fixed navigation and safe-area
  controls;
- explicit dark/light/AMOLED state overrides the host preference, including native WebKit form
  controls.

Visual pixel coverage and the reviewed screen/viewport matrix are recorded in
[VISUAL_REVIEW.md](VISUAL_REVIEW.md).

This is not a claim of full WCAG conformance. Manual VoiceOver/TalkBack/NVDA checks, measured
contrast for every theme and Telegram-specific keyboard/close behavior remain release checks in
the device matrix.
