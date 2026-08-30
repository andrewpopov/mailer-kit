---
kind: fixed
summary: mail observer failures no longer mask successful or skipped outcomes
---

Exceptions from `onSent` and `onSkipped` are now isolated. A logger failure can
no longer make callers retry an email the SMTP relay already accepted or turn
an intentional best-effort no-op into an exception.
