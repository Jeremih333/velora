# Error model

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Проверьте заполненные поля",
    "requestId": "request-id",
    "details": []
  }
}
```

Stable codes include `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`VALIDATION_ERROR`, `RATE_LIMITED`, `INSUFFICIENT_CREDITS`, `BUDGET_EXHAUSTED`,
`AI_UNAVAILABLE`, `GENERATION_IN_PROGRESS`, `PAYMENT_INVALID` and `INTERNAL_ERROR`.
Raw stack traces and provider credentials never reach the client.
