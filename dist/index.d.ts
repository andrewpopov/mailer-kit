import { type Transporter } from 'nodemailer';
export declare function isValidEmail(value: string | null | undefined): boolean;
/**
 * Validate a `from`/`MAIL_FROM` value: either a bare email (`isValidEmail`) or
 * the display-name form `Name <bare-email>` that nodemailer accepts and that
 * 0.2.1 supported. Used everywhere a from-header value is validated; NOT used
 * for the SMTP-login fallback (`from` defaulting to `SMTP_USER`), which stays
 * a bare-email check since a login is not a display string.
 */
export declare function isValidFromAddress(value: string | null | undefined): boolean;
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
/**
 * Remap the env var names read for SMTP config, for apps whose environment
 * already uses different names. Unset keys fall back to the standard names.
 */
export interface MailerEnvKeys {
    host?: string;
    port?: string;
    user?: string;
    pass?: string;
    from?: string;
}
export interface MailerOptions {
    /** Config source. Defaults to `process.env`. */
    env?: Record<string, string | undefined>;
    /**
     * Remap the env var names read for SMTP config (e.g. `{ host: 'MAIL_HOST' }`).
     * Defaults to `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`.
     */
    envKeys?: MailerEnvKeys;
    /** SMTP host when the host env var is unset. No default — an explicit host is required. */
    defaultHost?: string;
    /** SMTP port when `SMTP_PORT` is unset. Default `587`. */
    defaultPort?: number;
    /** Permit plaintext STARTTLS fallback on non-implicit-TLS ports. Default false. */
    allowInsecureStarttls?: boolean;
    /** Bounds for SMTP connection, greeting, and socket phases. Default 10 seconds each. */
    timeoutMs?: number;
    /** Called after a successful send, for the app's own logging. */
    onSent?: (info: {
        to: string;
        subject: string;
        attachments: number;
    }) => void;
    /** Called when a best-effort send is skipped because email is unconfigured. */
    onSkipped?: (info: {
        to: string;
        subject: string;
    }) => void;
    /** Transport factory — inject a fake in tests. Defaults to `nodemailer.createTransport`. */
    transportFactory?: (config: SmtpConfig) => Transporter;
}
export type MailerConfigurationErrorCode = 'host' | 'port' | 'from' | 'timeout';
/** Thrown before a transport is created when explicit mail configuration is malformed. */
export declare class MailerConfigurationError extends Error {
    readonly code: MailerConfigurationErrorCode;
    constructor(code: MailerConfigurationErrorCode, message: string);
}
/**
 * Resolve SMTP config from an env bag, or null when the user/pass env vars are
 * absent. Throws `MailerConfigurationError` for malformed or missing-but-required
 * explicit values (host, port, from, timeout) — see `MailerOptions.envKeys` to
 * remap the env var names read below.
 */
export declare function resolveSmtpConfig(options?: MailerOptions): SmtpConfig | null;
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
export declare function createMailer(options?: MailerOptions): Mailer;
