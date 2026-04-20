import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";

/**
 * Returns an authenticated Google Calendar client for the given user.
 * Handles token refresh and persists new tokens back to the Account record.
 */
export async function getGoogleCalendarClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account) {
    throw new Error("No Google account linked");
  }
  if (!account.refreshToken) {
    throw new Error("No refresh token — user must re-authenticate with Google");
  }

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.expiresAt ? account.expiresAt * 1000 : undefined,
  });

  // Persist refreshed tokens back to the database
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updateData: Record<string, unknown> = {};
      if (tokens.access_token) updateData.accessToken = tokens.access_token;
      if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) updateData.expiresAt = Math.floor(tokens.expiry_date / 1000);

      if (Object.keys(updateData).length > 0) {
        await prisma.account.update({
          where: { id: account.id },
          data: updateData,
        });
      }
    } catch (err) {
      console.error("[google-calendar] Failed to persist refreshed tokens:", err);
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}
