"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
exports.resolveSmtpConfig = resolveSmtpConfig;
exports.createMailer = createMailer;
const nodemailer_1 = __importDefault(require("nodemailer"));
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
function isValidEmail(value) {
    if (!value)
        return false;
    return EMAIL_PATTERN.test(value.trim());
}
/** Resolve SMTP config from an env bag, or null when `SMTP_USER`/`SMTP_PASS` are absent. */
function resolveSmtpConfig(options = {}) {
    const env = options.env ?? process.env;
    const user = env.SMTP_USER?.trim();
    const pass = env.SMTP_PASS?.trim();
    if (!user || !pass)
        return null;
    const host = env.SMTP_HOST?.trim() || options.defaultHost || 'smtp.gmail.com';
    const port = Number(env.SMTP_PORT) || options.defaultPort || 587;
    const secure = port === 465; // 465 = implicit TLS; otherwise STARTTLS
    const from = env.MAIL_FROM?.trim() || user;
    return { host, port, secure, user, pass, from };
}
/** Create a mailer bound to the given options. Config is read lazily and cached. */
function createMailer(options = {}) {
    let cached = null;
    const getSmtpConfig = () => resolveSmtpConfig(options);
    const getTransporter = (config) => {
        if (!cached) {
            const factory = options.transportFactory ??
                ((c) => nodemailer_1.default.createTransport({
                    host: c.host,
                    port: c.port,
                    secure: c.secure,
                    auth: { user: c.user, pass: c.pass },
                }));
            cached = factory(config);
        }
        return cached;
    };
    const deliver = async (config, input) => {
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
        async sendMail(input) {
            const config = getSmtpConfig();
            if (!config)
                throw new Error('Email is not configured (set SMTP_USER and SMTP_PASS)');
            await deliver(config, input);
        },
        async sendMailBestEffort(input) {
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
