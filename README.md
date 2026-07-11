# @andrewpopov/mailer-kit

The single **outbound-mail transport primitive** for the fleet. One superset of
four hand-rolled `mailer.ts` copies (bewks, cairn, savoro, sano-os — the last
three literally "ported from bewks"). It owns only the **transport**; email
content and templates stay app-specific.

nodemailer over SMTP, configured from the environment:

```
SMTP_HOST   (default: smtp.gmail.com)   any SMTP relay
SMTP_PORT   (default: 587)              465 ⇒ implicit TLS, else STARTTLS
SMTP_USER   (required)                  absent ⇒ "not configured"
SMTP_PASS   (required)
MAIL_FROM   (default: SMTP_USER)        visible From address
```

## Install

```
npm install github:andrewpopov/mailer-kit#v0.2.1
```

## Use

```ts
import { createMailer, isValidEmail } from '@andrewpopov/mailer-kit';

const mailer = createMailer({
  defaultHost: 'smtp.resend.com',   // e.g. sano-os; omit for gmail
  defaultPort: 465,
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
`MailerOptions`: `env`, `defaultHost`, `defaultPort`, `onSent`, `onSkipped`, `transportFactory`.

## Standards

See [`STANDARDS.md`](./STANDARDS.md) (synced from `agent_brain/knowledge/shared-package-standards.md`).
