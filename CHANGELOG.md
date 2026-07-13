# Changelog

## 0.3.0

- Validate explicit SMTP ports, hosts, From addresses, fallback ports, and
  timeout values before creating a transporter. Invalid explicit values no
  longer silently fall back to defaults.
- Require STARTTLS on non-implicit-TLS SMTP by default, with an explicit
  `allowInsecureStarttls` compatibility opt-out.
- Bound SMTP connection, greeting, and socket phases through `timeoutMs`.
- Add the documented local `npm run verify` release gate.

## 0.2.2

Fix — expose `./package.json` in the `exports` map. Without it,
`require('@andrewpopov/mailer-kit/package.json')` threw
`ERR_PACKAGE_PATH_NOT_EXPORTED` — which broke the standards' own documented way of
verifying an INSTALLED version, the guard against the `github:` re-resolve trap.

No runtime change.

## 0.2.1

- Upgrade Nodemailer from `^6.9.0` to `^9.0.3`, removing known address-parser,
  file/URL access, SMTP command-injection, and TLS-validation advisories while
  preserving mailer-kit's transport API.
- `v0.2.0` was mistakenly tagged on the unchanged `v0.1.0` source while this
  protected PR was still pending. Tags are immutable; consumers must skip it.

## 0.1.0

Initial release. The single outbound-mail transport primitive, extracted as a
superset of four hand-rolled `mailer.ts` copies (bewks, cairn, savoro, sano-os).

- `createMailer(options)` → `{ isEmailConfigured, getSmtpConfig, sendMail,
  sendMailBestEffort, resetCache }`. nodemailer over SMTP configured from env
  (SMTP_HOST/PORT/USER/PASS/MAIL_FROM; 465 ⇒ implicit TLS, else STARTTLS).
- `sendMail` throws when unconfigured; `sendMailBestEffort` returns
  `{ sent: false }` without throwing (sano-os graceful degradation), but still
  throws on a genuine transport failure.
- Supports `html` (cairn/savoro/sano) + `attachments` (bewks), injectable
  `onSent`/`onSkipped` logging, configurable `defaultHost`/`defaultPort`, and a
  `transportFactory` test seam.
- `isValidEmail` + `resolveSmtpConfig` exported. Email content/templates stay
  app-specific — this owns only the transport.
