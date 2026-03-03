// Invite code generation utility
// Format: TND-XXXX (4 chars, no ambiguous characters)

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export function generateInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");
  return `TND-${code}`;
}
