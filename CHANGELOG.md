# Changelog

## 0.5.0

- Fix: `MAIL_FROM` (and the resolved `from`) now accepts the RFC-5322
  display-name form `Name <no-reply@example.com>` in addition to a bare
  email, matching what nodemailer sends and what 0.2.1 accepted. The 0.3.0
  From-address validation (see below) had unintentionally tightened this to
  bare-email-only in 0.4.0, silently rejecting the display form and breaking
  consumers relying on it — this restores support for it. The `SMTP_USER`
  fallback (used when `MAIL_FROM` is unset) is unaffected and stays a strict
  bare-email check, since it's a login rather than a display string.

## 0.4.0

- **Breaking:** remove the implicit `smtp.gmail.com` default host. An SMTP host
  must now be supplied explicitly, via `SMTP_HOST` (or the remapped host env
  key) or `defaultHost` — otherwise `resolveSmtpConfig`/`createMailer` throw a
  `MailerConfigurationError` naming the missing env key, instead of silently
  routing mail through Gmail's relay.
- Add `envKeys` to `MailerOptions`, letting consumers remap the SMTP env var
  names (`host`/`port`/`user`/`pass`/`from`) read from the environment, for
  apps whose environment already uses different names. Defaults to the
  existing `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM` names,
  so this is backward compatible for every existing consumer.

## 0.3.0

- Add public contribution, support, and private vulnerability-reporting policies.
- Validate explicit SMTP ports, hosts, From addresses, fallback ports, and
  timeout values before creating a transporter. Invalid explicit values no
  longer silently fall back to defaults.
- Require STARTTLS on non-implicit-TLS SMTP by default, with an explicit
  `allowInsecureStarttls` compatibility opt-out.
- Bound SMTP connection, greeting, and socket phases through `timeoutMs`.
- Add the documented local `npm run verify` release gate.
- Upgrade the Vitest development toolchain to a version with no known advisories.

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
