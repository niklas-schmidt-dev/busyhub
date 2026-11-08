# Spend Meter

Your spend against a budget, from any JSON endpoint: an AI usage API, a cloud bill, a shared expense sheet.

```
AI  $41.37  of $50
████████████████████████████████████████████████████████░░░░░░░░░░░
```

The bar turns amber at 80 % of the budget and red at 100 %, and the status LED blinks once the budget is used up.

| Control | Does |
| --- | --- |
| OK | Refresh now |
| Back | Quit |

**Settings**

| Setting | Example |
| --- | --- |
| JSON URL | `https://api.example.com/usage` |
| Bearer token | Sent as `Authorization: Bearer …`. Stored as a secret. |
| Value path | `data.month.usd` for `{ "data": { "month": { "usd": 41.37 } } }` |
| Label, budget, currency | `AI`, `50`, US dollar |
| Refresh every | 5 minutes |

Run it **on your computer** when the endpoint needs a token: the token then stays on your computer instead of the bar. [Passcard](https://passcard.dev)'s read API is one source it works with.
