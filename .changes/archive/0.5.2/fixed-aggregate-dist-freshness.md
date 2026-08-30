---
kind: fixed
summary: the aggregate verification gate now rejects stale committed build output
---

The package's pre-push verification can no longer pass while the commit being
pushed contains stale generated JavaScript or declarations.
