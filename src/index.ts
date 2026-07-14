import nodemailer, { type Transporter } from 'nodemailer';

/**
 * @andrewpopov/mailer-kit — the single outbound-mail transport primitive.
 *
 * A superset of four hand-rolled `mailer.ts` copies (bewks, cairn, savoro,
 * sano-os, the last three literally "ported from bewks"): nodemailer over SMTP
 * configured from the environment, with `html` + `attachments`, an injectable
 * logger, configurable defaults, a best-effort (graceful-degradation) send, and
 * a test seam. Email *content* (invite/reset templates) stays app-specific — this
 * owns only the transport.
 *
 * Env: SMTP_HOST (default `defaultHost`), SMTP_PORT (default `defaultPort`),
 * SMTP_USER + SMTP_PASS (required — absent ⇒ "not configured"), MAIL_FROM
 * (default SMTP_USER). Port 465 ⇒ implicit TLS; otherwise STARTTLS.
 */

// Pragmatic shape check — not a full RFC validator, just enough to reject obvious
// mistakes before handing an address to the relay. Identical across all four copies.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return EMAIL_PATTERN.test(value.trim());
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  user: string;
  pass: string;
  from: string;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

/** Result of a best-effort send. `sent: false` means email was not configured. */
export interface SendMailResult {
  sent: boolean;
}

export interface MailerOptions {
  /** Config source. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** SMTP host when `SMTP_HOST` is unset. Default `smtp.gmail.com`. */
  defaultHost?: string;
  /** SMTP port when `SMTP_PORT` is unset. Default `587`. */
  defaultPort?: number;
  /** Permit plaintext STARTTLS fallback on non-implicit-TLS ports. Default false. */
  allowInsecureStarttls?: boolean;
  /** Bounds for SMTP connection, greeting, and socket phases. Default 10 seconds each. */
  timeoutMs?: number;
  /** Called after a successful send, for the app's own logging. */
  onSent?: (info: { to: string; subject: string; attachments: number }) => void;
  /** Called when a best-effort send is skipped because email is unconfigured. */
  onSkipped?: (info: { to: string; subject: string }) => void;
  /** Transport factory — inject a fake in tests. Defaults to `nodemailer.createTransport`. */
  transportFactory?: (config: SmtpConfig) => Transporter;
}

export type MailerConfigurationErrorCode = 'host' | 'port' | 'from' | 'timeout';

/** Thrown before a transport is created when explicit mail configuration is malformed. */
export class MailerConfigurationError extends Error {
  constructor(readonly code: MailerConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'MailerConfigurationError';
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new MailerConfigurationError('port', 'SMTP_PORT must be an integer between 1 and 65535');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new MailerConfigurationError('port', 'SMTP_PORT must be an integer between 1 and 65535');
  }
  return port;
}

function validateTimeout(value: number | undefined): number {
  const timeout = value ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new MailerConfigurationError('timeout', 'timeoutMs must be a positive integer');
  }
  return timeout;
}

/** Resolve SMTP config from an env bag, or null when `SMTP_USER`/`SMTP_PASS` are absent. */
export function resolveSmtpConfig(options: MailerOptions = {}): SmtpConfig | null {
  const env = options.env ?? process.env;
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  if (!user || !pass) return null;

  const host = env.SMTP_HOST?.trim() || options.defaultHost || 'smtp.gmail.com';
  if (!host || /\s/.test(host)) {
    throw new MailerConfigurationError('host', 'SMTP_HOST must be a non-empty hostname without whitespace');
  }
  const fallbackPort = options.defaultPort ?? 587;
  if (!Number.isSafeInteger(fallbackPort) || fallbackPort < 1 || fallbackPort > 65535) {
    throw new MailerConfigurationError('port', 'defaultPort must be an integer between 1 and 65535');
  }
  const port = parsePort(env.SMTP_PORT, fallbackPort);
  const secure = port === 465; // 465 = implicit TLS; otherwise STARTTLS
  const from = env.MAIL_FROM?.trim() || user;
  if (!isValidEmail(from)) {
    throw new MailerConfigurationError('from', 'MAIL_FROM must be a valid email address');
  }
  const timeout = validateTimeout(options.timeoutMs);
  return {
    host,
    port,
    secure,
    requireTLS: !secure && !options.allowInsecureStarttls,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    user,
    pass,
    from,
  };
}

export interface Mailer {
  /** Whether outbound email is configured (`SMTP_USER` + `SMTP_PASS` present). */
  isEmailConfigured(): boolean;
  /** Resolved SMTP config, or null when unconfigured. */
  getSmtpConfig(): SmtpConfig | null;
  /** Send a message. **Throws** if email is unconfigured or the transport rejects. */
  sendMail(input: SendMailInput): Promise<void>;
  /**
   * Send if configured; otherwise no-op and return `{ sent: false }` WITHOUT
   * throwing — so flows can call unconditionally. A genuine transport failure
   * (configured but rejected) still throws.
   */
  sendMailBestEffort(input: SendMailInput): Promise<SendMailResult>;
  /** Drop the cached transporter so a new env/config is picked up (tests). */
  resetCache(): void;
}

/** Create a mailer bound to the given options. Config is read lazily and cached. */
export function createMailer(options: MailerOptions = {}): Mailer {
  let cached: Transporter | null = null;

  const getSmtpConfig = (): SmtpConfig | null => resolveSmtpConfig(options);

  const getTransporter = (config: SmtpConfig): Transporter => {
    if (!cached) {
      const factory =
        options.transportFactory ??
        ((c: SmtpConfig) =>
          nodemailer.createTransport({
            host: c.host,
            port: c.port,
            secure: c.secure,
            requireTLS: c.requireTLS,
            connectionTimeout: c.connectionTimeout,
            greetingTimeout: c.greetingTimeout,
            socketTimeout: c.socketTimeout,
            auth: { user: c.user, pass: c.pass },
          }));
      cached = factory(config);
    }
    return cached;
  };

  const deliver = async (config: SmtpConfig, input: SendMailInput): Promise<void> => {
    await getTransporter(config).sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    options.onSent?.({ to: input.to, subject: input.subject, attachments: input.attachments?.length ?? 0 });
  };

  return {
    isEmailConfigured: () => getSmtpConfig() !== null,
    getSmtpConfig,
    async sendMail(input: SendMailInput): Promise<void> {
      const config = getSmtpConfig();
      if (!config) throw new Error('Email is not configured (set SMTP_USER and SMTP_PASS)');
      await deliver(config, input);
    },
    async sendMailBestEffort(input: SendMailInput): Promise<SendMailResult> {
      const config = getSmtpConfig();
      if (!config) {
        options.onSkipped?.({ to: input.to, subject: input.subject });
        return { sent: false };
      }
      await deliver(config, input);
      return { sent: true };
    },
    resetCache() {
      cached = null;
    },
  };
}
