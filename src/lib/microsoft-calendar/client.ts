import { prisma } from "@/lib/prisma";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

/**
 * Returns headers with a valid access token for Microsoft Graph API.
 * Handles token refresh automatically.
 */
export async function getMicrosoftGraphHeaders(userId: string): Promise<HeadersInit> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "azure-ad" },
  });

  if (!account) {
    throw new Error("No Microsoft account linked");
  }
  if (!account.refreshToken) {
    throw new Error("No refresh token — user must re-authenticate with Microsoft");
  }

  let accessToken = account.accessToken;

  // Check if token is expired (or will expire within 5 minutes)
  const expiresAt = account.expiresAt ? account.expiresAt * 1000 : 0;
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    // Refresh the token
    const clientId = process.env.MICROSOFT_ENTRA_ID_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Microsoft OAuth credentials not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      scope: "openid email profile offline_access Calendars.ReadWrite User.Read",
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Microsoft token refresh failed: ${err}`);
    }

    const tokens = await res.json();
    accessToken = tokens.access_token;

    // Persist refreshed tokens
    const updateData: Record<string, unknown> = {
      accessToken: tokens.access_token,
    };
    if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
    if (tokens.expires_in) {
      updateData.expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: updateData,
    });
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch events from Microsoft Calendar within a date range.
 */
export async function getMicrosoftCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
  calendarId?: string
) {
  const headers = await getMicrosoftGraphHeaders(userId);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const calPath = calendarId
    ? `/me/calendars/${calendarId}/calendarView`
    : "/me/calendarView";

  const url = `${GRAPH_BASE}${calPath}?startDateTime=${start}&endDateTime=${end}&$top=200&$select=id,subject,body,start,end,isAllDay,location,categories`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph calendar fetch failed: ${err}`);
  }

  const data = await res.json();
  return data.value as MicrosoftEvent[];
}

/**
 * Create an event in Microsoft Calendar.
 */
export async function createMicrosoftCalendarEvent(
  userId: string,
  event: MicrosoftEventInput,
  calendarId?: string
) {
  const headers = await getMicrosoftGraphHeaders(userId);
  const calPath = calendarId ? `/me/calendars/${calendarId}/events` : "/me/events";
  const url = `${GRAPH_BASE}${calPath}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph event create failed: ${err}`);
  }

  return (await res.json()) as MicrosoftEvent;
}

/**
 * Update an event in Microsoft Calendar.
 */
export async function updateMicrosoftCalendarEvent(
  userId: string,
  eventId: string,
  event: Partial<MicrosoftEventInput>
) {
  const headers = await getMicrosoftGraphHeaders(userId);
  const url = `${GRAPH_BASE}/me/events/${eventId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph event update failed: ${err}`);
  }

  return (await res.json()) as MicrosoftEvent;
}

/**
 * Delete an event from Microsoft Calendar.
 */
export async function deleteMicrosoftCalendarEvent(
  userId: string,
  eventId: string
) {
  const headers = await getMicrosoftGraphHeaders(userId);
  const url = `${GRAPH_BASE}/me/events/${eventId}`;

  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Microsoft Graph event delete failed: ${err}`);
  }
}

/**
 * List the user's Microsoft calendars.
 */
export async function listMicrosoftCalendars(userId: string) {
  const headers = await getMicrosoftGraphHeaders(userId);
  const url = `${GRAPH_BASE}/me/calendars?$select=id,name,color,isDefaultCalendar`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph calendars list failed: ${err}`);
  }

  const data = await res.json();
  return data.value as MicrosoftCalendar[];
}

// ─── Types ──────────────────────────────────────────────────────────

export interface MicrosoftEvent {
  id: string;
  subject: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  location?: { displayName: string };
  categories?: string[];
}

export interface MicrosoftEventInput {
  subject: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  location?: { displayName: string };
}

export interface MicrosoftCalendar {
  id: string;
  name: string;
  color: string;
  isDefaultCalendar: boolean;
}
