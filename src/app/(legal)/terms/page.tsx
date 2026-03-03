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
    title: `Terms of Service — ${instanceName}`,
    description: `Terms of Service for ${instanceName}.`,
  };
}

export default async function TermsPage() {
  const { instanceName, operatorName, legalEmail, jurisdiction } =
    await getSettings();

  return (
    <article className="prose dark:prose-invert max-w-none">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: February 28, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using {instanceName}&trade;, you agree to be bound by these Terms of
        Service. If you do not agree to these terms, do not use the service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        {instanceName} is a productivity application built on David Allen&apos;s Getting
        Things Done (GTD) methodology. It provides task management, project tracking,
        context-based organization, weekly reviews, and team collaboration features.
      </p>
      <p>
        {instanceName} can be deployed in two ways:
      </p>
      <ul>
        <li>
          <strong>Managed hosting</strong> — {operatorName} operates the infrastructure,
          manages backups, and is responsible for data handling as described in
          the <a href="/privacy">Privacy Policy</a>.
        </li>
        <li>
          <strong>Self-hosted</strong> — you or your organization operate the
          infrastructure. In this case, the instance operator is responsible for
          data handling, backups, and compliance. These terms apply to your use
          of the software as a service; the software itself is governed by
          the <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0 license</a>.
        </li>
      </ul>

      <h2>3. Accounts &amp; Authentication</h2>
      <p>
        You may sign in using third-party OAuth providers (such as Google, GitHub,
        Microsoft, or Apple). When you authenticate through these providers, we receive
        limited profile information as described in the <a href="/privacy">Privacy Policy</a>.
      </p>
      <p>
        You are responsible for maintaining the security of your authentication method
        and for all activity that occurs under your account.
      </p>

      <h2>4. User Data &amp; Ownership</h2>
      <p>
        <strong>You own your data.</strong> Everything you put into {instanceName} — tasks,
        projects, notes, wiki articles, inbox items — belongs to you. {operatorName} does
        not sell, mine, or monetize your data in any way.
      </p>
      <p>
        On managed instances, your data is stored on infrastructure operated
        by {operatorName}. On self-hosted instances, {operatorName} has no access to your
        data whatsoever.
      </p>

      <h2>5. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service for any unlawful purpose</li>
        <li>Attempt to gain unauthorized access to other users&apos; accounts or data</li>
        <li>Interfere with or disrupt the service or its infrastructure</li>
        <li>Use the service to store or transmit malicious code</li>
        <li>Attempt to probe, scan, or test the vulnerability of the service without authorization</li>
      </ul>

      <h2>6. Open Source License</h2>
      <p>
        The Tandem software is licensed under
        the <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU Affero General Public
        License v3.0 (AGPL-3.0)</a>. The AGPL governs the software itself — your right
        to use, modify, and distribute the code.
      </p>
      <p>
        These Terms of Service govern your use of {instanceName} as a hosted service.
        Where there is a conflict between these terms and the AGPL, the AGPL prevails
        for matters related to the software; these terms prevail for matters related to
        the service.
      </p>

      <h2>7. Service Availability</h2>
      <p>
        {operatorName} will make best efforts to keep {instanceName} available and
        reliable, but does not guarantee uninterrupted access. The service is provided
        without uptime SLAs.
      </p>
      <p>
        If the service is discontinued, {operatorName} will provide reasonable notice and
        the opportunity to export your data before shutdown. Data export functionality is
        built into the application.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        {instanceName} is provided &quot;as is&quot; and &quot;as available&quot; without
        warranties of any kind, either express or implied. {operatorName} is not liable
        for any indirect, incidental, special, consequential, or punitive damages
        resulting from your use of or inability to use the service.
      </p>
      <p>
        For self-hosted instances, the software is provided under the terms of the AGPL-3.0
        license, which includes its own disclaimer of warranties.
      </p>

      <h2>9. Changes to Terms</h2>
      <p>
        These terms may be updated from time to time. Material changes will be communicated
        via email or in-app notification. Continued use of {instanceName} after changes
        take effect constitutes acceptance of the updated terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        For questions about these terms, contact{" "}
        <a href={`mailto:${legalEmail}`}>{legalEmail}</a>.
      </p>
      <p>
        These terms are governed by the laws of {jurisdiction}.
      </p>
    </article>
  );
}
