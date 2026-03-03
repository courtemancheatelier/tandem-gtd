import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/ai/crypto";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

/**
 * Get SMTP config. Env vars take priority, then falls back to ServerSettings DB.
 * Returns null if not configured.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // Env vars first
  if (process.env.SMTP_HOST) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";
    const from = process.env.SMTP_FROM || `noreply@${host}`;
    const secure = process.env.SMTP_SECURE !== "false";
    if (!host) return null;
    return { host, port, user, pass, from, secure };
  }

  // Fall back to DB
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpSecure: true,
    },
  });

  if (!settings?.smtpHost) return null;

  const decryptedPass = settings.smtpPass ? decrypt(settings.smtpPass) : "";

  return {
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    user: settings.smtpUser ?? "",
    pass: decryptedPass ?? "",
    from: settings.smtpFrom ?? `noreply@${settings.smtpHost}`,
    secure: settings.smtpSecure,
  };
}

/**
 * Quick boolean check for whether SMTP is configured.
 */
export async function isSmtpConfigured(): Promise<boolean> {
  if (process.env.SMTP_HOST) return true;
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { smtpHost: true },
  });
  return !!settings?.smtpHost;
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Returns true if sent, false if SMTP not configured.
 * Throws on actual send failure.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) {
    console.warn("[email] SMTP not configured, skipping email to", params.to);
    return false;
  }

  // secure: true = immediate TLS (port 465)
  // secure: false + port 587 = STARTTLS (connect plain, upgrade to TLS)
  // The toggle label says "Use TLS" — when on, we use STARTTLS on 587 or
  // immediate TLS on 465. Only set secure:true when port is 465.
  const useImmediateTls = config.port === 465;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: useImmediateTls,
    requireTLS: config.secure && !useImmediateTls, // STARTTLS on non-465 ports
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    auth:
      config.user && config.pass
        ? { user: config.user, pass: config.pass }
        : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: params.subject.replace(/[\r\n]/g, " "),
    text: params.text,
    html: params.html,
  });

  return true;
}

// ─── Template Helpers ────────────────────────────────────────────────────────

/**
 * Replace all `{{key}}` placeholders in a template string.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// Default templates — used when DB fields are null
const DEFAULT_WAITLIST_SUBJECT = "New Tandem waitlist signup";
const DEFAULT_WAITLIST_BODY = [
  "New Tandem waitlist signup: {{name}} ({{email}})",
  "",
  "Review and promote from the admin panel:",
  "{{adminUrl}}",
].join("\n");

const DEFAULT_WELCOME_SUBJECT = "Welcome to {{instanceName}}!";
const DEFAULT_WELCOME_BODY = [
  "Hi {{name}},",
  "",
  "You've been approved to join {{instanceName}}!",
  "",
  "Sign in to get started:",
  "{{loginUrl}}",
  "{{setupUrl}}",
  "",
  "— {{instanceName}}",
].join("\n");

export interface EmailTemplates {
  waitlistSubject: string;
  waitlistBody: string;
  welcomeSubject: string;
  welcomeBody: string;
}

/**
 * Read customizable email templates from ServerSettings.
 * Falls back to hardcoded defaults when fields are null.
 */
export async function getEmailTemplates(): Promise<EmailTemplates> {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: {
      emailWaitlistSubject: true,
      emailWaitlistBody: true,
      emailWelcomeSubject: true,
      emailWelcomeBody: true,
    },
  });

  return {
    waitlistSubject: settings?.emailWaitlistSubject ?? DEFAULT_WAITLIST_SUBJECT,
    waitlistBody: settings?.emailWaitlistBody ?? DEFAULT_WAITLIST_BODY,
    welcomeSubject: settings?.emailWelcomeSubject ?? DEFAULT_WELCOME_SUBJECT,
    welcomeBody: settings?.emailWelcomeBody ?? DEFAULT_WELCOME_BODY,
  };
}

// ─── Waitlist Email Functions ────────────────────────────────────────────────

/**
 * Notify all admin users about a new waitlist signup.
 * Fire-and-forget — never throws.
 */
export async function notifyAdminsOfWaitlistSignup(name: string, email: string): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, isDisabled: false },
      select: { email: true },
    });

    if (admins.length === 0) return;

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";
    const templates = await getEmailTemplates();
    const vars = { name, email, adminUrl: `${baseUrl}/admin/users` };

    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: renderTemplate(templates.waitlistSubject, vars),
        text: renderTemplate(templates.waitlistBody, vars),
      });
    }
  } catch (err) {
    console.error("[email] Failed to notify admins of waitlist signup:", err);
  }
}

/**
 * Send welcome email to a promoted waitlist user.
 * One template handles both OAuth and password paths — {{setupUrl}} is empty for OAuth.
 * Returns true if email was sent.
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
  passwordSetupToken?: string
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";

  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { instanceName: true },
  });
  const instanceName = settings?.instanceName || "Tandem GTD";

  const loginUrl = `${baseUrl}/login`;
  const setupUrl = passwordSetupToken
    ? `${baseUrl}/setup-password?token=${passwordSetupToken}`
    : "";

  const templates = await getEmailTemplates();
  const vars = { name, instanceName, loginUrl, setupUrl };

  return sendEmail({
    to: email,
    subject: renderTemplate(templates.welcomeSubject, vars),
    text: renderTemplate(templates.welcomeBody, vars),
  });
}

// ─── Trial Email Functions ───────────────────────────────────────────────────

/**
 * Send welcome email to a new trial user.
 * Fire-and-forget — never throws.
 */
export async function sendTrialWelcomeEmail(
  email: string,
  name: string,
  trialDays: number
): Promise<void> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";
    const settings = await prisma.serverSettings.findUnique({
      where: { id: "singleton" },
      select: { instanceName: true },
    });
    const instanceName = settings?.instanceName || "Tandem GTD";

    await sendEmail({
      to: email,
      subject: `Welcome to ${instanceName} — Your ${trialDays}-day trial starts now`,
      text: [
        `Hi ${name},`,
        "",
        `Welcome to ${instanceName}! Your ${trialDays}-day free trial has started.`,
        "",
        "Here's what you can do:",
        "  - Capture thoughts in your Inbox",
        "  - Organize projects and next actions",
        "  - Use contexts to batch work by location or tool",
        "  - Run weekly reviews to keep your system trusted",
        "",
        `Sign in anytime: ${baseUrl}/login`,
        "",
        `When your trial ends, you can export your data or self-host Tandem for free.`,
        "",
        `— ${instanceName}`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[email] Failed to send trial welcome email:", err);
  }
}

/**
 * Send trial expiration reminder email.
 * Returns true if email was sent.
 */
export async function sendTrialReminderEmail(
  email: string,
  name: string,
  daysLeft: number
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { instanceName: true },
  });
  const instanceName = settings?.instanceName || "Tandem GTD";

  return sendEmail({
    to: email,
    subject: `${instanceName}: ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in your trial`,
    text: [
      `Hi ${name},`,
      "",
      `Your ${instanceName} trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
      "",
      "When your trial ends, you can:",
      "  - Export your data and self-host Tandem for free",
      "  - Sign up for managed hosting (coming soon)",
      "",
      `Sign in: ${baseUrl}/login`,
      "",
      `— ${instanceName}`,
    ].join("\n"),
  });
}

// ─── Daily Digest Email ─────────────────────────────────────────────────────

interface DigestData {
  dueToday: { count: number; titles: string[] };
  overdue: { count: number; titles: string[] };
  dueTomorrow: { count: number; titles: string[] };
}

/**
 * Send a daily digest email to a user.
 * Returns true if email was sent.
 */
export async function sendDailyDigestEmail(
  email: string,
  date: string,
  data: DigestData
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";

  const sections: string[] = [];

  if (data.overdue.count > 0) {
    sections.push(`OVERDUE (${data.overdue.count}):`);
    for (const title of data.overdue.titles) {
      sections.push(`  - ${title}`);
    }
    if (data.overdue.count > data.overdue.titles.length) {
      sections.push(`  ... and ${data.overdue.count - data.overdue.titles.length} more`);
    }
    sections.push("");
  }

  if (data.dueToday.count > 0) {
    sections.push(`DUE TODAY (${data.dueToday.count}):`);
    for (const title of data.dueToday.titles) {
      sections.push(`  - ${title}`);
    }
    if (data.dueToday.count > data.dueToday.titles.length) {
      sections.push(`  ... and ${data.dueToday.count - data.dueToday.titles.length} more`);
    }
    sections.push("");
  }

  if (data.dueTomorrow.count > 0) {
    sections.push(`DUE TOMORROW (${data.dueTomorrow.count}):`);
    for (const title of data.dueTomorrow.titles) {
      sections.push(`  - ${title}`);
    }
    if (data.dueTomorrow.count > data.dueTomorrow.titles.length) {
      sections.push(`  ... and ${data.dueTomorrow.count - data.dueTomorrow.titles.length} more`);
    }
    sections.push("");
  }

  if (sections.length === 0) {
    sections.push("No tasks due today, overdue, or due tomorrow. You're all caught up!");
    sections.push("");
  }

  return sendEmail({
    to: email,
    subject: `Your Tandem daily digest — ${date}`,
    text: [
      `Your Tandem daily digest — ${date}`,
      "",
      ...sections,
      `View your tasks: ${baseUrl}/do-now`,
    ].join("\n"),
  });
}
