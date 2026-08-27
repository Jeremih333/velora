# Contract 17 — desktop chat

- Source: production-like Vite build served through the Playwright preview server.
- Project: `desktop` (`Desktop Chrome`).
- State: authenticated active conversation with the real per-story Settings inspector open.
- Assertions: conversation rail `260–300px`; story surface at most `900px`; inspector `260–320px`;
  selected conversation exposes `aria-current="page"`; no document-level horizontal overflow;
  no serious or critical axe findings; visible close control; Escape and keyboard-mode regressions.
- Capture: [actual.png](actual.png).
- SHA-256: `00BC9B8E026894AC4C090159055BDA57A4E911834B516B6AAD59D8051BECAFFD`.

This is contract evidence for master section 17, not a replacement for any of the 46 controlled
reference frames.
