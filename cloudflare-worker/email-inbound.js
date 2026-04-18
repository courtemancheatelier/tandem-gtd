/**
 * Cloudflare Email Worker — Email-to-Inbox Capture (smart dispatcher)
 *
 * Receives mail via Cloudflare Email Routing's zone-level catch-all and
 * dispatches based on the recipient local-part prefix (Subaddressing: `+`):
 *
 *   inbox-beta+<token>@tandemgtd.com → POST to beta Tandem webhook
 *   inbox-prod+<token>@tandemgtd.com → POST to prod Tandem webhook (when configured)
 *   anything else                    → forward to FALLBACK_FORWARD
 *
 * Requires Cloudflare → Email → Email Routing → Settings → "Enable subaddressing"
 * so `inbox-beta+anything@tandemgtd.com` is accepted by routing.
 *
 * Config via wrangler.toml [vars] + secrets:
 *   vars:    ROUTE_LOCAL_BETA ("inbox-beta"), ROUTE_LOCAL_PROD ("inbox-prod"),
 *            TANDEM_URL_BETA, TANDEM_URL_PROD, FALLBACK_FORWARD
 *   secrets: WEBHOOK_SECRET_BETA, WEBHOOK_SECRET_PROD
 *
 * Destinations used for `message.forward()` must be verified in
 * Cloudflare Email Routing → Destination addresses.
 */

import PostalMime from "postal-mime";

export default {
  async email(message, env) {
    const recipient = (message.to || "").toLowerCase();
    const atIdx = recipient.indexOf("@");
    if (atIdx <= 0) {
      await safeForwardOrReject(message, env, "Malformed recipient");
      return;
    }
    const localPart = recipient.slice(0, atIdx);

    const target = resolveTarget(localPart, env);

    if (!target) {
      await safeForwardOrReject(message, env, "No route for recipient");
      return;
    }

    if (!target.token || target.token.length < 8) {
      message.setReject("Invalid token in recipient");
      return;
    }

    const { subject, from, body } = await parseEmail(message);

    try {
      const response = await fetch(`${target.url}/api/webhooks/email-inbound`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": target.secret,
        },
        body: JSON.stringify({
          token: target.token,
          subject: subject.slice(0, 500),
          body: body.slice(0, 10000),
          from,
        }),
      });

      if (!response.ok) {
        console.error(`Webhook ${target.url} failed: ${response.status}`);
      }
    } catch (err) {
      console.error(`Webhook ${target.url} error: ${err.message}`);
    }
  },
};

function resolveTarget(localPart, env) {
  const routes = [
    {
      local: env.ROUTE_LOCAL_BETA,
      url: env.TANDEM_URL_BETA,
      secret: env.WEBHOOK_SECRET_BETA,
    },
    {
      local: env.ROUTE_LOCAL_PROD,
      url: env.TANDEM_URL_PROD,
      secret: env.WEBHOOK_SECRET_PROD,
    },
  ];

  for (const route of routes) {
    if (!route.local || !route.url || !route.secret) continue;
    const prefix = `${route.local.toLowerCase()}+`;
    if (localPart.startsWith(prefix)) {
      return {
        url: route.url,
        secret: route.secret,
        token: localPart.slice(prefix.length),
      };
    }
  }
  return null;
}

async function parseEmail(message) {
  const rawEmail = await new Response(message.raw).arrayBuffer();
  const parser = new PostalMime();
  const parsed = await parser.parse(rawEmail);

  const subject = parsed.subject || "(No subject)";
  const from = message.from;

  let body = parsed.text || "";
  if (!body && parsed.html) {
    // DEFENSE-IN-DEPTH ONLY. This regex strip is not a complete HTML sanitizer.
    // It exists because postal-mime doesn't ship a text renderer, so we need
    // *something* to put in InboxItem.notes when the email has no plain-text
    // part. Safety here relies on the downstream renderer escaping HTML:
    // Tandem stores this string in InboxItem.notes and renders via React,
    // which auto-escapes text. Do NOT switch the notes renderer to
    // dangerouslySetInnerHTML (or equivalent) without replacing this regex
    // with a proper sanitizer (e.g., DOMPurify, sanitize-html) first.
    body = parsed.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  return { subject, from, body };
}

async function safeForwardOrReject(message, env, rejectReason) {
  const fwd = env.FALLBACK_FORWARD;
  if (fwd) {
    try {
      await message.forward(fwd);
      return;
    } catch (err) {
      console.error(`Forward to ${fwd} failed: ${err.message}`);
    }
  }
  message.setReject(rejectReason);
}
