"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerConfigurationError = void 0;
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
 * Env: SMTP_HOST (required — via env or `defaultHost`), SMTP_PORT (default
 * `defaultPort`), SMTP_USER + SMTP_PASS (required — absent ⇒ "not configured"),
 * MAIL_FROM (default SMTP_USER). Port 465 ⇒ implicit TLS; otherwise STARTTLS.
 * Env key names are remappable via `envKeys` (see `MailerOptions`).
 */
// Pragmatic shape check — not a full RFC validator, just enough to reject obvious
// mistakes before handing an address to the relay. Identical across all four copies.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value) {
    if (!value)
        return false;
    return EMAIL_PATTERN.test(value.trim());
}
const DEFAULT_ENV_KEYS = {
    host: 'SMTP_HOST',
    port: 'SMTP_PORT',
    user: 'SMTP_USER',
    pass: 'SMTP_PASS',
    from: 'MAIL_FROM',
};
/** Thrown before a transport is created when explicit mail configuration is malformed. */
class MailerConfigurationError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MailerConfigurationError';
    }
}
exports.MailerConfigurationError = MailerConfigurationError;
function parsePort(value, fallback, envKey = 'SMTP_PORT') {
    if (value === undefined || value.trim() === '')
        return fallback;
    if (!/^\d+$/.test(value.trim())) {
        throw new MailerConfigurationError('port', `${envKey} must be an integer between 1 and 65535`);
    }
    const port = Number(value);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new MailerConfigurationError('port', `${envKey} must be an integer between 1 and 65535`);
    }
    return port;
}
function validateTimeout(value) {
    const timeout = value ?? 10000;
    if (!Number.isSafeInteger(timeout) || timeout < 1) {
        throw new MailerConfigurationError('timeout', 'timeoutMs must be a positive integer');
    }
    return timeout;
}
/**
 * Resolve SMTP config from an env bag, or null when the user/pass env vars are
 * absent. Throws `MailerConfigurationError` for malformed or missing-but-required
 * explicit values (host, port, from, timeout) — see `MailerOptions.envKeys` to
 * remap the env var names read below.
 */
function resolveSmtpConfig(options = {}) {
    const env = options.env ?? process.env;
    const keys = { ...DEFAULT_ENV_KEYS, ...options.envKeys };
    const user = env[keys.user]?.trim();
    const pass = env[keys.pass]?.trim();
    if (!user || !pass)
        return null;
    const host = env[keys.host]?.trim() || options.defaultHost;
    if (!host) {
        throw new MailerConfigurationError('host', `SMTP host is required — set ${keys.host} (or pass defaultHost)`);
    }
    if (/\s/.test(host)) {
        throw new MailerConfigurationError('host', `${keys.host} must be a non-empty hostname without whitespace`);
    }
    const fallbackPort = options.defaultPort ?? 587;
    if (!Number.isSafeInteger(fallbackPort) || fallbackPort < 1 || fallbackPort > 65535) {
        throw new MailerConfigurationError('port', 'defaultPort must be an integer between 1 and 65535');
    }
    const port = parsePort(env[keys.port], fallbackPort, keys.port);
    const secure = port === 465; // 465 = implicit TLS; otherwise STARTTLS
    const from = env[keys.from]?.trim() || user;
    if (!isValidEmail(from)) {
        throw new MailerConfigurationError('from', `${keys.from} must be a valid email address`);
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
