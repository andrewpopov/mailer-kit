import { type Transporter } from 'nodemailer';
export declare function isValidEmail(value: string | null | undefined): boolean;
export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
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
/** Resolve SMTP config from an env bag, or null when `SMTP_USER`/`SMTP_PASS` are absent. */
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
