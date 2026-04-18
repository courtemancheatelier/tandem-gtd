import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import GitHubProvider from "next-auth/providers/github";
import AzureADProvider from "next-auth/providers/azure-ad";
import { prisma } from "./prisma";
import { UserTier } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { rateLimit } from "@/lib/api/rate-limit";
import { notifyAdminsOfWaitlistSignup, sendTrialWelcomeEmail } from "@/lib/email";

// Build providers list — OAuth providers are conditional on env vars
const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })
  );
}

if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
  providers.push(
    AppleProvider({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
    })
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

if (process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_ENTRA_ID_TENANT_ID || "common",
      authorization: {
        params: {
          scope: "openid email profile offline_access Calendars.ReadWrite User.Read",
        },
      },
    })
  );
}

providers.push(
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }

      // Server-side safety net: block credentials login when in OAUTH_ONLY mode
      const settings = await prisma.serverSettings.findUnique({
        where: { id: "singleton" },
        select: { authMode: true },
      });
      if (settings?.authMode === "OAUTH_ONLY") {
        return null;
      }

      // Rate limit login attempts: 5 per 15 minutes per email
      const { allowed } = rateLimit(`login:${credentials.email}`, 5, 15 * 60_000);
      if (!allowed) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: credentials.email },
      });

      if (!user) {
        return null;
      }

      // Disabled users cannot sign in
      if (user.isDisabled) {
        return null;
      }

      // OAuth-only users cannot sign in via credentials
      if (!user.password) {
        return null;
      }

      const passwordMatch = await bcrypt.compare(
        credentials.password,
        user.password
      );

      if (!passwordMatch) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
      };
    },
  })
);

const DEFAULT_CONTEXTS = [
  { name: "@Computer", color: "#8B5CF6", sortOrder: 0 },
  { name: "@Phone", color: "#F59E0B", sortOrder: 1 },
  { name: "@Office", color: "#3B82F6", sortOrder: 2 },
  { name: "@Home", color: "#10B981", sortOrder: 3 },
  { name: "@Errands", color: "#EF4444", sortOrder: 4 },
  { name: "@Anywhere", color: "#6B7280", sortOrder: 5 },
  { name: "@Agenda", color: "#EC4899", sortOrder: 6 },
];

interface CreateNewUserParams {
  email: string;
  name: string;
  tier: UserTier;
  provider: string;
  providerAccountId: string;
  invitedById?: string;
  isTrial?: boolean;
  trialStartedAt?: Date;
  trialExpiresAt?: Date;
  accountTokens: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    tokenType: string | null;
    scope: string | null;
    idToken: string | null;
  };
}

async function createNewUser(params: CreateNewUserParams) {
  const now = new Date();
  const newUser = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      password: null,
      tier: params.tier,
      invitedById: params.invitedById,
      isTrial: params.isTrial ?? false,
      trialStartedAt: params.trialStartedAt ?? null,
      trialExpiresAt: params.trialExpiresAt ?? null,
      firstLoginAt: now,
      lastLoginAt: now,
      loginCount: 1,
    },
  });

  await prisma.account.create({
    data: {
      provider: params.provider,
      providerAccountId: params.providerAccountId,
      accessToken: params.accountTokens.accessToken,
      refreshToken: params.accountTokens.refreshToken,
      expiresAt: params.accountTokens.expiresAt,
      tokenType: params.accountTokens.tokenType,
      scope: params.accountTokens.scope,
      idToken: params.accountTokens.idToken,
      userId: newUser.id,
    },
  });

  await prisma.context.createMany({
    data: DEFAULT_CONTEXTS.map((ctx) => ({ ...ctx, userId: newUser.id })),
  });

  return newUser;
}

function clearInviteCookie() {
  try {
    const cookieStore = cookies();
    cookieStore.delete("tandem-invite-code");
  } catch {
    // Cookie deletion may fail outside of request context
  }
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials sign-in — track login activity
      if (!account || account.provider === "credentials") {
        if (user?.id) {
          try {
            const now = new Date();
            await prisma.$executeRaw`
              UPDATE "User"
              SET "lastLoginAt" = ${now},
                  "loginCount" = "loginCount" + 1,
                  "firstLoginAt" = COALESCE("firstLoginAt", ${now})
              WHERE "id" = ${user.id}
            `;
          } catch (error) {
            console.error("Failed to record login activity:", error);
          }
        }
        return true;
      }

      const email = user.email || profile?.email;
      if (!email) {
        return false;
      }

      const providerAccountId = account.providerAccountId;

      // Case 1: Returning OAuth user — find existing Account row
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId,
          },
        },
        include: { user: true },
      });

      if (existingAccount) {
        // Disabled users cannot sign in
        if (existingAccount.user.isDisabled) {
          return false;
        }
        // Update tokens — only overwrite refresh token if Google sent a new one
        await prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: account.access_token ?? null,
            ...(account.refresh_token ? { refreshToken: account.refresh_token } : {}),
            expiresAt: account.expires_at ?? null,
            tokenType: account.token_type ?? null,
            scope: account.scope ?? null,
            idToken: account.id_token ?? null,
          },
        });
        // Track login activity
        const now = new Date();
        try {
          await prisma.user.update({
            where: { id: existingAccount.user.id },
            data: {
              lastLoginAt: now,
              loginCount: { increment: 1 },
              ...(existingAccount.user.firstLoginAt ? {} : { firstLoginAt: now }),
            },
          });
        } catch (error) {
          console.error("Failed to record login activity:", error);
        }
        // Set user info so the jwt callback can pick it up
        user.id = existingAccount.user.id;
        user.isAdmin = existingAccount.user.isAdmin;
        user.isTrial = existingAccount.user.isTrial;
        user.trialExpiresAt = existingAccount.user.trialExpiresAt;
        return true;
      }

      // Case 2: Linking flow — user initiated link from settings
      // Must run before email-match check, since the OAuth email may match
      // an existing user and we'd return an error before reaching this.
      const linkingCookieStore = cookies();
      const linkingUserId = linkingCookieStore.get("tandem-link-account")?.value;
      if (linkingUserId && linkingUserId !== "1") {
        const linkingUser = await prisma.user.findUnique({
          where: { id: linkingUserId },
          select: { id: true, isAdmin: true, isDisabled: true, isTrial: true, trialExpiresAt: true },
        });
        if (linkingUser && !linkingUser.isDisabled) {
          await prisma.account.create({
            data: {
              provider: account.provider,
              providerAccountId,
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at ?? null,
              tokenType: account.token_type ?? null,
              scope: account.scope ?? null,
              idToken: account.id_token ?? null,
              userId: linkingUser.id,
            },
          });
          try {
            linkingCookieStore.delete("tandem-link-account");
          } catch {
            // Cookie deletion may fail outside request context
          }
          user.id = linkingUser.id;
          user.isAdmin = linkingUser.isAdmin;
          user.isTrial = linkingUser.isTrial;
          user.trialExpiresAt = linkingUser.trialExpiresAt;
          return true;
        }
      }

      // Case 3: Existing email, new OAuth provider
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isAdmin: true, isDisabled: true, isTrial: true, trialExpiresAt: true, _count: { select: { accounts: true } } },
      });

      if (existingUser) {
        if (existingUser.isDisabled) {
          return false;
        }

        // Case 3b: OAUTH_ONLY mode + user has zero OAuth accounts → auto-link
        // This safely migrates credentials-only users when admin switches to OAUTH_ONLY
        const serverSettingsForLink = await prisma.serverSettings.findUnique({
          where: { id: "singleton" },
          select: { authMode: true },
        });
        if (serverSettingsForLink?.authMode === "OAUTH_ONLY" && existingUser._count.accounts === 0) {
          await prisma.account.create({
            data: {
              provider: account.provider,
              providerAccountId,
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at ?? null,
              tokenType: account.token_type ?? null,
              scope: account.scope ?? null,
              idToken: account.id_token ?? null,
              userId: existingUser.id,
            },
          });
          user.id = existingUser.id;
          user.isAdmin = existingUser.isAdmin;
          user.isTrial = existingUser.isTrial;
          user.trialExpiresAt = existingUser.trialExpiresAt;
          return true;
        }

        // Default: block auto-link (prevents account takeover)
        return "/login?error=OAuthAccountNotLinked";
      }

      // Case 4: Brand new user — check registration mode
      const serverSettings = await prisma.serverSettings.findUnique({
        where: { id: "singleton" },
        select: { registrationMode: true, landingMode: true },
      });
      const registrationMode = serverSettings?.registrationMode ?? "OPEN";

      // Check domain whitelist (bypasses all gates except CLOSED)
      const emailDomain = email.split("@")[1]?.toLowerCase();
      const domainEntry = emailDomain
        ? await prisma.allowedDomain.findUnique({ where: { domain: emailDomain } })
        : null;

      // Read invite code from cookie (if any)
      const cookieStore = cookies();
      const inviteCodeCookie = cookieStore.get("tandem-invite-code")?.value ?? null;

      // Helper to consume invite code
      async function consumeInviteCode(code: string, newUserId: string): Promise<{ tier: UserTier; invitedById: string } | null> {
        const inviteCode = await prisma.inviteCode.findUnique({
          where: { code: code.toUpperCase() },
        });
        if (!inviteCode || inviteCode.usedById) return null;
        if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) return null;

        await prisma.inviteCode.update({
          where: { id: inviteCode.id },
          data: { usedById: newUserId, usedAt: new Date() },
        });
        return { tier: inviteCode.tier, invitedById: inviteCode.createdById };
      }

      switch (registrationMode) {
        case "CLOSED": {
          // Domain whitelist does NOT bypass CLOSED
          return "/login?error=RegistrationClosed";
        }

        case "WAITLIST": {
          // Domain whitelist bypasses waitlist
          if (domainEntry) {
            const created = await createNewUser({
              email,
              name: user.name || email.split("@")[0],
              tier: domainEntry.tier,
              provider: account.provider,
              providerAccountId,
              accountTokens: {
                accessToken: account.access_token ?? null,
                refreshToken: account.refresh_token ?? null,
                expiresAt: account.expires_at ?? null,
                tokenType: account.token_type ?? null,
                scope: account.scope ?? null,
                idToken: account.id_token ?? null,
              },
            });
            user.id = created.id;
            user.isAdmin = created.isAdmin;
            return true;
          }

          // Add to waitlist
          try {
            await prisma.waitlistEntry.upsert({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId,
                },
              },
              update: {
                name: user.name || email.split("@")[0],
                email,
              },
              create: {
                email,
                name: user.name || email.split("@")[0],
                provider: account.provider,
                providerAccountId,
              },
            });
            // Fire-and-forget: notify admins of new signup
            notifyAdminsOfWaitlistSignup(
              user.name || email.split("@")[0],
              email
            );
          } catch (err) {
            console.error("[waitlist] Failed to upsert WaitlistEntry:", err);
          }
          return "/login?status=waitlisted";
        }

        case "INVITE_ONLY": {
          // Domain whitelist bypasses invite requirement
          if (domainEntry) {
            const created = await createNewUser({
              email,
              name: user.name || email.split("@")[0],
              tier: domainEntry.tier,
              provider: account.provider,
              providerAccountId,
              accountTokens: {
                accessToken: account.access_token ?? null,
                refreshToken: account.refresh_token ?? null,
                expiresAt: account.expires_at ?? null,
                tokenType: account.token_type ?? null,
                scope: account.scope ?? null,
                idToken: account.id_token ?? null,
              },
            });
            user.id = created.id;
            user.isAdmin = created.isAdmin;
            clearInviteCookie();
            return true;
          }

          if (!inviteCodeCookie) {
            return "/login?error=InviteRequired";
          }

          // Create user first, then consume invite code
          const created = await createNewUser({
            email,
            name: user.name || email.split("@")[0],
            tier: "BETA", // default, will be updated by invite code
            provider: account.provider,
            providerAccountId,
            accountTokens: {
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at ?? null,
              tokenType: account.token_type ?? null,
              scope: account.scope ?? null,
              idToken: account.id_token ?? null,
            },
          });

          const inviteResult = await consumeInviteCode(inviteCodeCookie, created.id);
          if (!inviteResult) {
            // Invalid code — delete the user we just created
            await prisma.context.deleteMany({ where: { userId: created.id } });
            await prisma.account.deleteMany({ where: { userId: created.id } });
            await prisma.user.delete({ where: { id: created.id } });
            clearInviteCookie();
            return "/login?error=InvalidInviteCode";
          }

          // Update user with invite code's tier and referral
          await prisma.user.update({
            where: { id: created.id },
            data: { tier: inviteResult.tier, invitedById: inviteResult.invitedById },
          });

          user.id = created.id;
          user.isAdmin = created.isAdmin;
          clearInviteCookie();
          return true;
        }

        case "OPEN": {
          let tier: UserTier = domainEntry?.tier ?? "GENERAL";
          let invitedById: string | undefined;

          const created = await createNewUser({
            email,
            name: user.name || email.split("@")[0],
            tier,
            provider: account.provider,
            providerAccountId,
            accountTokens: {
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at ?? null,
              tokenType: account.token_type ?? null,
              scope: account.scope ?? null,
              idToken: account.id_token ?? null,
            },
          });

          // If there's an invite code, use it for attribution
          if (inviteCodeCookie) {
            const inviteResult = await consumeInviteCode(inviteCodeCookie, created.id);
            if (inviteResult) {
              tier = inviteResult.tier;
              invitedById = inviteResult.invitedById;
              await prisma.user.update({
                where: { id: created.id },
                data: { tier, invitedById },
              });
            }
          }

          user.id = created.id;
          user.isAdmin = created.isAdmin;
          clearInviteCookie();
          return true;
        }

        case "TRIAL": {
          // Trial mode is only available on flagship instances
          if (serverSettings?.landingMode !== "FLAGSHIP") {
            return "/login?error=RegistrationClosed";
          }

          // Domain whitelist bypasses trial — gets full account
          if (domainEntry) {
            const created = await createNewUser({
              email,
              name: user.name || email.split("@")[0],
              tier: domainEntry.tier,
              provider: account.provider,
              providerAccountId,
              accountTokens: {
                accessToken: account.access_token ?? null,
                refreshToken: account.refresh_token ?? null,
                expiresAt: account.expires_at ?? null,
                tokenType: account.token_type ?? null,
                scope: account.scope ?? null,
                idToken: account.id_token ?? null,
              },
            });
            user.id = created.id;
            user.isAdmin = created.isAdmin;
            return true;
          }

          // Block re-signup: check if this email already used a trial
          // Exception: allow if they have a pending event invitation (RSVP flow)
          const previousTrial = await prisma.trialUsage.findUnique({
            where: { email },
          });
          if (previousTrial) {
            const pendingInvitation = await prisma.eventInvitation.findFirst({
              where: {
                email,
                status: "PENDING",
                event: { owner: { email: { not: email } } },
              },
              select: { eventId: true },
            });
            if (!pendingInvitation) {
              return "/trial-ended";
            }
            // Has a pending invitation — allow through with a new trial
          }

          // Get trial duration from settings
          const trialSettings = await prisma.serverSettings.findUnique({
            where: { id: "singleton" },
            select: { trialDurationDays: true },
          });
          const durationDays = trialSettings?.trialDurationDays ?? 30;
          const trialNow = new Date();
          const trialExpiresAt = new Date(trialNow);
          trialExpiresAt.setDate(trialExpiresAt.getDate() + durationDays);

          const created = await createNewUser({
            email,
            name: user.name || email.split("@")[0],
            tier: "GENERAL",
            provider: account.provider,
            providerAccountId,
            isTrial: true,
            trialStartedAt: trialNow,
            trialExpiresAt,
            accountTokens: {
              accessToken: account.access_token ?? null,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at ?? null,
              tokenType: account.token_type ?? null,
              scope: account.scope ?? null,
              idToken: account.id_token ?? null,
            },
          });

          // Record trial usage (survives account deletion)
          if (!previousTrial) {
            await prisma.trialUsage.create({
              data: {
                email,
                provider: account.provider,
                providerAccountId,
              },
            });
          }

          user.id = created.id;
          user.isAdmin = created.isAdmin;
          user.isTrial = true;
          user.trialExpiresAt = trialExpiresAt;

          // Fire-and-forget: send trial welcome email
          sendTrialWelcomeEmail(email, user.name || email.split("@")[0], durationDays);

          return true;
        }

        default:
          return "/login?error=RegistrationClosed";
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin;
        token.isTrial = user.isTrial ?? false;
        token.trialExpiresAt = user.trialExpiresAt
          ? new Date(user.trialExpiresAt).toISOString()
          : null;
      }
      // Refresh trial status from DB on every token refresh so admin
      // changes (clearing trial, switching to open mode) take effect
      // without requiring the user to log out and back in.
      if (token.id && token.isTrial) {
        try {
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { isTrial: true, trialExpiresAt: true },
          });
          if (freshUser) {
            token.isTrial = freshUser.isTrial;
            token.trialExpiresAt = freshUser.trialExpiresAt
              ? freshUser.trialExpiresAt.toISOString()
              : null;
          }
        } catch {
          // If DB is unreachable, keep existing token values
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.isAdmin = token.isAdmin;
        session.user.isTrial = token.isTrial;
        session.user.trialExpiresAt = token.trialExpiresAt;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 14 * 24 * 60 * 60, // 14 days
  },
  pages: {
    signIn: "/login",
  },
};
