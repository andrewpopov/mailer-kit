# @andrewpopov/mailer-kit

The single **outbound-mail transport primitive** for the fleet. One superset of
four hand-rolled `mailer.ts` copies (bewks, cairn, savoro, sano-os — the last
three literally "ported from bewks"). It owns only the **transport**; email
content and templates stay app-specific.

nodemailer over SMTP, configured from the environment:

| Env var | Required? | Default | Description |
|---|---|---|---|
| `SMTP_HOST` | Yes (via env or `defaultHost`) | *none* | Any SMTP relay hostname. No implicit default — an explicit host is required, or `resolveSmtpConfig`/`createMailer` throw a `MailerConfigurationError`. |
| `SMTP_PORT` | No | `587` (or `defaultPort`) | Strict integer 1–65535; `465` ⇒ implicit TLS, otherwise STARTTLS is required. |
| `SMTP_USER` | Yes | *none* | Absent (with `SMTP_PASS`) ⇒ mailer reports "not configured" rather than throwing. |
| `SMTP_PASS` | Yes | *none* | See `SMTP_USER`. |
| `MAIL_FROM` | No | `SMTP_USER` | Visible From address. Either a bare email (`no-reply@example.com`) or the display-name form `Name <no-reply@example.com>`. The `SMTP_USER` fallback (when unset) is always a bare email, since it's a login. |

The env var names above are the defaults — remap them per consumer via
`envKeys` (see [Remapping env var names](#remapping-env-var-names) below).

## Install

```
npm install github:andrewpopov/mailer-kit#v0.5.0
```

## Use

```ts
import { createMailer, isValidEmail } from '@andrewpopov/mailer-kit';

const mailer = createMailer({
  defaultHost: 'smtp.resend.com',   // required — no implicit default; set here or via SMTP_HOST
  defaultPort: 465,
  timeoutMs: 10_000,
  onSent: ({ to, subject }) => logger.info('email sent', { to, subject }),
});

// Strict: throws if unconfigured or the relay rejects.
await mailer.sendMail({ to, subject, text, html });

// Graceful: no-ops with { sent: false } when unconfigured, so signup/reset flows
// can call unconditionally. Still throws on a real transport failure.
const { sent } = await mailer.sendMailBestEffort({ to, subject, text });
```

Re-export the bound functions to preserve a module-level API:

```ts
const mailer = createMailer({ onSent });
export const sendMail = mailer.sendMail;
export const isEmailConfigured = mailer.isEmailConfigured;
export { isValidEmail } from '@andrewpopov/mailer-kit';
```

## API

| Export | Purpose |
|---|---|
| `createMailer(options)` | Build a mailer bound to options. |
| `mailer.sendMail(input)` | Send; **throws** if unconfigured or on transport failure. |
| `mailer.sendMailBestEffort(input)` | Send if configured, else `{ sent: false }` (no throw). |
| `mailer.isEmailConfigured()` / `getSmtpConfig()` | Configured? / resolved config. |
| `mailer.resetCache()` | Drop the cached transporter (tests / env change). |
| `resolveSmtpConfig(options)` | Pure env → `SmtpConfig \| null`. |
| `isValidEmail(value)` | Pragmatic address shape check. |

`SendMailInput`: `{ to, subject, text, html?, attachments? }`.
`MailerOptions`: `env`, `envKeys`, `defaultHost`, `defaultPort`, `timeoutMs`, `allowInsecureStarttls`, `onSent`, `onSkipped`, `transportFactory`.

### Remapping env var names

Consumers whose environment already uses different variable names can remap
what mailer-kit reads via `envKeys`, without renaming their own env vars.
Unmapped keys keep reading the standard name (fully backward compatible):

```ts
const mailer = createMailer({
  envKeys: {
    host: 'MAIL_HOST',   // read MAIL_HOST instead of SMTP_HOST
    user: 'MAIL_USER',   // read MAIL_USER instead of SMTP_USER
    // port/pass/from still read SMTP_PORT/SMTP_PASS/MAIL_FROM
  },
});
```

Malformed explicit ports, hosts, From addresses, defaults, and timeouts throw a
`MailerConfigurationError` before a transport is created. SMTP connection,
greeting, and socket phases are each bounded by `timeoutMs` (default 10 seconds).
On non-implicit-TLS ports, STARTTLS is required by default; setting
`allowInsecureStarttls: true` is an explicit compatibility opt-out.

The package deliberately does not retry sends: SMTP retries can create duplicate
messages. Put retries and idempotency keys in a durable application queue.

## Verify locally

```bash
npm ci
npm run verify
npm audit --omit=dev --audit-level=high
```

## Standards

See [`STANDARDS.md`](./STANDARDS.md) (synced from `agent_brain/knowledge/shared-package-standards.md`).

## Project policies

See [Contributing](./CONTRIBUTING.md), [Support](./SUPPORT.md), and the
[Security Policy](./SECURITY.md). This package is licensed under [MIT](./LICENSE).
