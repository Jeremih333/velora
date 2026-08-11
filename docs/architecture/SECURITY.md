# Security

- Validate Telegram `initData` server-side with HMAC-SHA-256, verify `auth_date`, then issue a
  short-lived HttpOnly/Secure/SameSite session.
- CSRF protection for cookie mutations; strict origin allowlist and CSP.
- Zod validation at every boundary and prepared D1 statements only.
- RBAC and ownership checks are backend policies, never UI conditions alone.
- Uploads validate declared/actual type, size and safe generated keys.
- Markdown allows a sanitised subset; arbitrary HTML, event handlers and JavaScript URLs fail.
- Logs contain request IDs and internal/hashed identity, not private message bodies or secrets.
- AI/prompt content cannot invoke privileged tools or alter authorization.
- Rate limits combine account, route, risk and IP signal without IP-only bans on mobile NAT.
- Auth, generation, character creation, search, report, media, memory and session mutation have
  separate server-side policies. Responses provide bounded recovery metadata and rate headers;
  admin capacity is explicit and restricted accounts receive tighter limits.
- Public feature flags return evaluated booleans only. Configuration and rollout mutation are
  owner-only, validated, deterministically assigned and audit logged.
- Secrets live in Wrangler secrets, never `.env.example`, commits or screenshots.

Threat tests cover forged/replayed Telegram data, IDOR, injection, XSS, duplicate payments,
duplicate generation, unsafe uploads and budget exhaustion.
