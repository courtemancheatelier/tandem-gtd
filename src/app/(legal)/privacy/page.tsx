import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

async function getSettings() {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: {
      instanceName: true,
      operatorName: true,
      operatorUrl: true,
    },
  });

  return {
    instanceName: settings?.instanceName ?? "Tandem GTD",
    operatorName: settings?.operatorName ?? "the instance operator",
    operatorUrl: settings?.operatorUrl ?? null,
    legalEmail: process.env.OPERATOR_LEGAL_EMAIL ?? "privacy@tandemgtd.com",
    jurisdiction:
      process.env.OPERATOR_JURISDICTION ?? "Massachusetts, United States",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { instanceName } = await getSettings();
  return {
    title: `Privacy Policy — ${instanceName}`,
    description: `Privacy Policy for ${instanceName}.`,
    alternates: { canonical: "/privacy" },
  };
}

export default async function PrivacyPage() {
  const { instanceName, operatorName, legalEmail, jurisdiction } =
    await getSettings();

  return (
    <article className="prose dark:prose-invert max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: February 28, 2026</p>

      <h2>1. Introduction &amp; Scope</h2>
      <p>
        This privacy policy describes how {operatorName} handles your information
        when you use {instanceName}&trade;. It applies to the managed hosted service operated
        by {operatorName}.
      </p>
      <p>
        <strong>Self-hosted instances:</strong> If you are using a self-hosted deployment
        of Tandem, this policy does not apply. The operator of that instance is responsible
        for their own privacy practices. {operatorName} has no access to data on
        self-hosted instances.
      </p>

      <h2>2. Information We Collect</h2>

      <h3>Account Information</h3>
      <p>
        When you sign in, we receive basic profile information from your OAuth
        provider: your email address and display name. We do not store OAuth
        tokens beyond what is needed for your active session.
      </p>

      <h3>Task &amp; Productivity Data</h3>
      <p>
        Everything you put into {instanceName} — tasks, projects, goals, areas, notes,
        wiki articles, inbox items, contexts, and reviews. This is your data. We store
        it solely to provide the service to you.
      </p>

      <h3>Technical Data</h3>
      <p>
        Server logs may record IP addresses, user agents, and timestamps. These are
        retained for a limited period for security and debugging purposes.
      </p>

      <h2>3. How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Provide, maintain, and improve {instanceName}</li>
        <li>Authenticate you and secure your account</li>
        <li>Send service-critical communications (downtime notices, security alerts)</li>
      </ul>
      <p>We do <strong>not</strong> use your information for:</p>
      <ul>
        <li>Advertising or ad targeting</li>
        <li>User profiling or behavioral analytics</li>
        <li>Sale to third parties — ever</li>
      </ul>

      <h2>4. AI Features &amp; Data Processing</h2>
      <p>
        {instanceName} includes optional AI features powered by
        the <a href="https://www.anthropic.com" target="_blank" rel="noopener noreferrer">Anthropic</a> API.
        When you use AI features, relevant task data is sent to Anthropic for processing.
        This data is governed by{" "}
        <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">
          Anthropic&apos;s privacy policy
        </a>.
      </p>
      <p>You have full control over AI features:</p>
      <ul>
        <li>AI features can be disabled entirely on a per-user basis</li>
        <li>Granular toggles control what data AI can access</li>
        <li>MCP (Model Context Protocol) integration flows through your own AI provider account</li>
      </ul>

      <h2>5. Data Storage &amp; Security</h2>
      <p>
        Your data is stored on infrastructure operated by {operatorName}. Data is
        encrypted in transit (TLS) and the application follows security best practices
        including input validation, CSRF protection, and secure session management.
      </p>
      <p>
        Backups are encrypted and performed regularly. While we take reasonable measures
        to protect your data, no method of electronic storage is 100% secure.
      </p>

      <h2>6. Data Retention &amp; Deletion</h2>
      <p>
        Your data is retained for as long as your account is active. If you delete your
        account, all associated data is permanently deleted within 30 days.
      </p>
      <p>
        You can export your data at any time using the built-in export functionality
        before deleting your account.
      </p>

      <h2>7. Third-Party Services</h2>
      <p>
        {instanceName} integrates with the following third-party services:
      </p>
      <ul>
        <li>
          <strong>OAuth providers</strong> (Google, GitHub, Microsoft, Apple) — for
          authentication. These providers share your email and display name with us
          during sign-in.
        </li>
        <li>
          <strong>Anthropic</strong> — for AI features. Task data is sent to Anthropic
          only when you actively use AI features.
        </li>
        <li>
          <strong>Infrastructure provider</strong> — the hosting provider where {instanceName} runs.
          They may process data as part of providing hosting services.
        </li>
      </ul>

      <h2>8. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access your data</strong> — export your tasks, projects, and other data at any time</li>
        <li><strong>Delete your data</strong> — delete your account and all associated data</li>
        <li><strong>Disable AI processing</strong> — turn off all AI features so no data is sent to external AI providers</li>
      </ul>
      <p>
        <strong>For EU users:</strong> Under the GDPR, you have additional rights
        including the right to access, rectification, erasure, data portability, and
        the right to object to processing. To exercise these rights,
        contact <a href={`mailto:${legalEmail}`}>{legalEmail}</a>.
      </p>

      <h2>9. Children&apos;s Privacy</h2>
      <p>
        {instanceName} is not directed at children under the age of 13. We do not
        knowingly collect personal information from children under 13. If you believe
        a child under 13 has provided us with personal information, please
        contact <a href={`mailto:${legalEmail}`}>{legalEmail}</a> and we will delete
        it promptly.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        This privacy policy may be updated from time to time. Material changes will be
        communicated via email or in-app notification. The &quot;Last updated&quot; date
        at the top of this page indicates the most recent revision.
      </p>

      <h2>11. Contact</h2>
      <p>
        For questions about this privacy policy or how your data is handled,
        contact <a href={`mailto:${legalEmail}`}>{legalEmail}</a>.
      </p>
      <p>
        This policy is governed by the laws of {jurisdiction}.
      </p>
    </article>
  );
}
