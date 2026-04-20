// Invite code generation utility
// Format: TND-XXXXXX (6 chars, no ambiguous characters, ~729M combinations)

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");
  return `TND-${code}`;
}
