import { describe, it, expect, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import {
  isValidEmail,
  isValidFromAddress,
  resolveSmtpConfig,
  createMailer,
  MailerConfigurationError,
  type SmtpConfig,
  type SendMailInput,
} from '../index';

const CONFIGURED = { SMTP_USER: 'me@example.com', SMTP_PASS: 'secret', SMTP_HOST: 'smtp.example.com' };
// user/pass only — no host — for tests exercising the "host is required" behavior.
const NO_HOST = { SMTP_USER: 'me@example.com', SMTP_PASS: 'secret' };

// A fake transporter that records the payloads passed to sendMail.
function fakeTransport() {
  const sent: Array<Record<string, unknown>> = [];
  const factory = vi.fn((_config: SmtpConfig): Transporter => {
    return {
      sendMail: vi.fn(async (payload: Record<string, unknown>) => {
        sent.push(payload);
        return {} as unknown;
      }),
    } as unknown as Transporter;
  });
  return { sent, factory };
}

describe('isValidEmail', () => {
  it.each([
    ['a@b.co', true],
    ['  a@b.co  ', true],
    ['nope', false],
    ['a@b', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (value, ok) => {
    expect(isValidEmail(value as string)).toBe(ok);
  });
});

describe('isValidFromAddress', () => {
  it.each([
    ['a@b.co', true],
    ['Name <a@b.co>', true],
    ['No-Reply Team <no-reply@example.com>', true],
    ['  Name <a@b.co>  ', true],
    ['<a@b.co>', false], // empty display name
    ['Name <a@b.co', false], // missing closing bracket
    ['Name a@b.co>', false], // missing opening bracket
    ['Name <not-an-email>', false], // invalid inner email
    ['Name <<a@b.co>>', false], // nested brackets
    ['Name <a <b@c.co>>', false], // nested brackets
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (value, ok) => {
    expect(isValidFromAddress(value as string)).toBe(ok);
  });
});

describe('resolveSmtpConfig', () => {
  it('returns null without user/pass', () => {
    expect(resolveSmtpConfig({ env: {} })).toBeNull();
    expect(resolveSmtpConfig({ env: { SMTP_USER: 'x' } })).toBeNull();
  });

  it('requires an explicit host — no implicit gmail default', () => {
    expect(() => resolveSmtpConfig({ env: NO_HOST })).toThrow(MailerConfigurationError);
    expect(() => resolveSmtpConfig({ env: NO_HOST })).toThrow(/SMTP_HOST/);
  });

  it('resolves defaults (587, STARTTLS, from=user) given an explicit host', () => {
    const c = resolveSmtpConfig({ env: CONFIGURED });
    expect(c).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      user: 'me@example.com',
      pass: 'secret',
      from: 'me@example.com',
    });
  });

  it('accepts an explicit host via defaultHost when the env var is unset', () => {
    const c = resolveSmtpConfig({ env: NO_HOST, defaultHost: 'smtp.resend.com' });
    expect(c?.host).toBe('smtp.resend.com');
  });

  it('port 465 implies implicit TLS', () => {
    const config = resolveSmtpConfig({ env: { ...CONFIGURED, SMTP_PORT: '465' } });
    expect(config?.secure).toBe(true);
    expect(config?.requireTLS).toBe(false);
  });

  it('honors env overrides and custom defaults', () => {
    const c = resolveSmtpConfig({
      env: { ...CONFIGURED, SMTP_HOST: 'smtp.brevo.com', MAIL_FROM: 'noreply@app.com' },
      defaultHost: 'smtp.resend.com',
      defaultPort: 465,
    });
    expect(c?.host).toBe('smtp.brevo.com'); // env wins over default
    expect(c?.from).toBe('noreply@app.com');
    // Default applies only when env is absent.
    const d = resolveSmtpConfig({ env: NO_HOST, defaultHost: 'smtp.resend.com', defaultPort: 465 });
    expect(d).toMatchObject({ host: 'smtp.resend.com', port: 465, secure: true });
  });

  it('accepts a display-name MAIL_FROM (RFC-5322 form)', () => {
    const c = resolveSmtpConfig({
      env: { ...CONFIGURED, MAIL_FROM: 'No-Reply <no-reply@example.com>' },
    });
    expect(c?.from).toBe('No-Reply <no-reply@example.com>');
  });

  it('rejects a display-name MAIL_FROM with an empty display name', () => {
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, MAIL_FROM: '<no-reply@example.com>' } }),
    ).toThrow(/MAIL_FROM/);
  });

  it('rejects a display-name MAIL_FROM with a missing closing bracket', () => {
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, MAIL_FROM: 'No-Reply <no-reply@example.com' } }),
    ).toThrow(/MAIL_FROM/);
  });

  it('rejects a display-name MAIL_FROM with an invalid inner email', () => {
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, MAIL_FROM: 'No-Reply <not-an-email>' } }),
    ).toThrow(/MAIL_FROM/);
  });

  it('rejects a display-name MAIL_FROM with nested angle brackets', () => {
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, MAIL_FROM: 'No-Reply <<no-reply@example.com>>' } }),
    ).toThrow(/MAIL_FROM/);
  });

  it('rejects CR/LF header-injection attempts in the display name (and anywhere in the value)', () => {
    expect(() =>
      resolveSmtpConfig({
        env: { ...CONFIGURED, MAIL_FROM: 'Name\r\nBcc: victim@example.com <no-reply@example.com>' },
      }),
    ).toThrow(/MAIL_FROM/);
    expect(() =>
      resolveSmtpConfig({
        env: { ...CONFIGURED, MAIL_FROM: 'Name\nX <no-reply@example.com>' },
      }),
    ).toThrow(/MAIL_FROM/);
  });

  it('keeps the SMTP_USER from-fallback strict (bare email only, no display form)', () => {
    // MAIL_FROM absent: from falls back to SMTP_USER, which is a login and must
    // stay a bare address — this path does not accept the display-name form.
    const c = resolveSmtpConfig({ env: CONFIGURED });
    expect(c?.from).toBe('me@example.com');
  });

  it.each(['0', '-1', '1.5', '99999', 'smtp'])('rejects malformed explicit SMTP_PORT=%s', (port) => {
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, SMTP_HOST: 'smtp.example.com', SMTP_PORT: port } }),
    ).toThrow(MailerConfigurationError);
  });

  it('rejects malformed host, From, defaults, and timeout rather than falling back silently', () => {
    expect(() => resolveSmtpConfig({ env: { ...CONFIGURED, SMTP_HOST: 'bad host' } })).toThrow(/SMTP_HOST/);
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'not-an-email' } }),
    ).toThrow(/MAIL_FROM/);
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, SMTP_HOST: 'smtp.example.com' }, defaultPort: 0 }),
    ).toThrow(/defaultPort/);
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, SMTP_HOST: 'smtp.example.com' }, timeoutMs: 0 }),
    ).toThrow(/timeoutMs/);
  });

  it('requires STARTTLS by default and makes the insecure opt-out explicit', () => {
    const env = { ...CONFIGURED, SMTP_HOST: 'smtp.example.com' };
    expect(resolveSmtpConfig({ env })?.requireTLS).toBe(true);
    expect(resolveSmtpConfig({ env, allowInsecureStarttls: true })?.requireTLS).toBe(false);
  });

  it('remaps env var names via envKeys, defaulting unmapped keys to the standard names', () => {
    const env = {
      MY_HOST: 'smtp.example.com',
      MY_USER: 'me@example.com',
      MY_PASS: 'secret',
    };
    const c = resolveSmtpConfig({ env, envKeys: { host: 'MY_HOST', user: 'MY_USER', pass: 'MY_PASS' } });
    expect(c).toMatchObject({ host: 'smtp.example.com', user: 'me@example.com', pass: 'secret', from: 'me@example.com' });
  });

  it('remapped port/from keys are honored and errors reference the remapped name', () => {
    const env = { ...CONFIGURED, SMTP_HOST: 'smtp.example.com', MY_PORT: 'not-a-number' };
    expect(() => resolveSmtpConfig({ env, envKeys: { port: 'MY_PORT' } })).toThrow(/MY_PORT/);
  });

  it('attributes a malformed host to its actual source: remapped env key or defaultHost', () => {
    expect(() =>
      resolveSmtpConfig({ env: { ...CONFIGURED, MY_HOST: 'bad host' }, envKeys: { host: 'MY_HOST' } }),
    ).toThrow(/MY_HOST/);
    expect(() => resolveSmtpConfig({ env: NO_HOST, defaultHost: 'bad host' })).toThrow(/defaultHost/);
  });

  it('errors for a missing remapped host and malformed remapped from name the remapped keys', () => {
    expect(() => resolveSmtpConfig({ env: CONFIGURED, envKeys: { host: 'MY_HOST' } })).toThrow(/MY_HOST/);
    expect(() =>
      resolveSmtpConfig({
        env: { ...CONFIGURED, SMTP_HOST: 'smtp.example.com', MY_FROM: 'not-an-email' },
        envKeys: { from: 'MY_FROM' },
      }),
    ).toThrow(/MY_FROM/);
  });

  it('is null when only the remapped user/pass keys are absent (standard names ignored once remapped)', () => {
    expect(resolveSmtpConfig({ env: CONFIGURED, envKeys: { user: 'MY_USER', pass: 'MY_PASS' } })).toBeNull();
  });
});

const input: SendMailInput = { to: 'you@example.com', subject: 'Hi', text: 'body' };

describe('createMailer.sendMail', () => {
  it('throws when unconfigured', async () => {
    const mailer = createMailer({ env: {} });
    expect(mailer.isEmailConfigured()).toBe(false);
    await expect(mailer.sendMail(input)).rejects.toThrow(/not configured/);
  });

  it('delivers from the resolved From, mapping html + attachments', async () => {
    const t = fakeTransport();
    const onSent = vi.fn();
    const mailer = createMailer({ env: { ...CONFIGURED, MAIL_FROM: 'noreply@app.com' }, transportFactory: t.factory, onSent });
    await mailer.sendMail({
      ...input,
      html: '<b>hi</b>',
      attachments: [{ filename: 'a.txt', content: Buffer.from('x'), contentType: 'text/plain' }],
    });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      from: 'noreply@app.com',
      to: 'you@example.com',
      subject: 'Hi',
      text: 'body',
      html: '<b>hi</b>',
    });
    expect((t.sent[0].attachments as unknown[])).toHaveLength(1);
    expect(onSent).toHaveBeenCalledWith({ to: 'you@example.com', subject: 'Hi', attachments: 1 });
  });

  it('delivers a display-name From unmangled to nodemailer', async () => {
    const t = fakeTransport();
    const mailer = createMailer({
      env: { ...CONFIGURED, MAIL_FROM: 'No-Reply <no-reply@example.com>' },
      transportFactory: t.factory,
    });
    await mailer.sendMail(input);
    expect(t.sent[0]).toMatchObject({ from: 'No-Reply <no-reply@example.com>' });
  });

  it('omits html/attachments keys when not provided', async () => {
    const t = fakeTransport();
    const mailer = createMailer({ env: CONFIGURED, transportFactory: t.factory });
    await mailer.sendMail(input);
    expect(t.sent[0]).not.toHaveProperty('html');
    expect(t.sent[0]).not.toHaveProperty('attachments');
  });

  it('caches the transporter across sends and resetCache drops it', async () => {
    const t = fakeTransport();
    const mailer = createMailer({ env: CONFIGURED, transportFactory: t.factory });
    await mailer.sendMail(input);
    await mailer.sendMail(input);
    expect(t.factory).toHaveBeenCalledTimes(1); // cached
    mailer.resetCache();
    await mailer.sendMail(input);
    expect(t.factory).toHaveBeenCalledTimes(2);
  });

  it('propagates a transport rejection', async () => {
    const factory = vi.fn(() => ({ sendMail: vi.fn(async () => { throw new Error('relay down'); }) }) as unknown as Transporter);
    const mailer = createMailer({ env: CONFIGURED, transportFactory: factory });
    await expect(mailer.sendMail(input)).rejects.toThrow('relay down');
  });
});

describe('createMailer.sendMailBestEffort (graceful degradation)', () => {
  it('no-ops with {sent:false} + onSkipped when unconfigured, without throwing', async () => {
    const onSkipped = vi.fn();
    const mailer = createMailer({ env: {}, onSkipped });
    await expect(mailer.sendMailBestEffort(input)).resolves.toEqual({ sent: false });
    expect(onSkipped).toHaveBeenCalledWith({ to: 'you@example.com', subject: 'Hi' });
  });

  it('sends with {sent:true} when configured', async () => {
    const t = fakeTransport();
    const mailer = createMailer({ env: CONFIGURED, transportFactory: t.factory });
    await expect(mailer.sendMailBestEffort(input)).resolves.toEqual({ sent: true });
    expect(t.sent).toHaveLength(1);
  });

  it('still throws on a genuine transport failure when configured', async () => {
    const factory = vi.fn(() => ({ sendMail: vi.fn(async () => { throw new Error('boom'); }) }) as unknown as Transporter);
    const mailer = createMailer({ env: CONFIGURED, transportFactory: factory });
    await expect(mailer.sendMailBestEffort(input)).rejects.toThrow('boom');
  });
});
