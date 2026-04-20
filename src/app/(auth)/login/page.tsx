"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { signIn, getProviders } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Providers = Awaited<ReturnType<typeof getProviders>>;
type RegistrationMode = "CLOSED" | "WAITLIST" | "INVITE_ONLY" | "OPEN" | "TRIAL" | null;
type AuthMode = "OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS" | null;

interface LoginBranding {
  landingMode: "FLAGSHIP" | "OPERATOR";
  instanceName: string;
  instanceLogoUrl: string | null;
}

const oauthErrorMessages: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already associated with another sign-in method. Please sign in using your original method, or link this provider from Settings.",
  OAuthSignin: "Could not start the sign-in flow. Please try again.",
  OAuthCallback: "Sign-in failed. Please try again.",
  OAuthCreateAccount: "Could not create your account. Please try again.",
  Callback: "Sign-in failed. Please try again.",
  RegistrationClosed:
    "Registration is currently closed. Please contact the administrator.",
  InviteRequired:
    "An invite code is required to sign up. Please enter a valid invite code and try again.",
  InvalidInviteCode:
    "The invite code you entered is invalid or has already been used. Please check the code and try again.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="mr-2">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      className="mr-2"
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="mr-2">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" width="20" height="20" className="mr-2">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<Providers>(null);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false);
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState("");

  // Branding
  const [branding, setBranding] = useState<LoginBranding>({
    landingMode: "OPERATOR",
    instanceName: "Tandem GTD",
    instanceLogoUrl: null,
  });

  // Invite code state
  const [inviteCode, setInviteCode] = useState("");
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(null);
  const [inviteCodeValidating, setInviteCodeValidating] = useState(false);
  const [inviteCodeSet, setInviteCodeSet] = useState(false);

  const [trialDurationDays, setTrialDurationDays] = useState(30);

  // Preserve redirect target (e.g. /rsvp/EVENT_ID) through auth flow
  const callbackUrl = searchParams.get("callbackUrl") || "/do-now";

  useEffect(() => {
    getProviders().then((p) => setOauthProviders(p));
    fetch("/api/auth/registration-mode")
      .then((res) => res.json())
      .then((data) => {
        setRegistrationMode(data.registrationMode);
        setAuthMode(data.authMode ?? "OAUTH_AND_CREDENTIALS");
        if (data.trialDurationDays) setTrialDurationDays(data.trialDurationDays);
      })
      .catch(() => setRegistrationMode("WAITLIST"));
    fetch("/api/public/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setBranding({
            landingMode: data.landingMode ?? "OPERATOR",
            instanceName: data.instanceName ?? "Tandem GTD",
            instanceLogoUrl: data.instanceLogoUrl ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Pre-fill invite code from URL query param
  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam && !inviteCode) {
      setInviteCode(codeParam.toUpperCase());
    }
  }, [searchParams, inviteCode]);

  // Handle query params for waitlist and OAuth errors
  useEffect(() => {
    const status = searchParams.get("status");
    const errorParam = searchParams.get("error");

    if (status === "deleted") {
      setDeletedDialogOpen(true);
      router.replace("/login", { scroll: false });
    } else if (status === "waitlisted") {
      setWaitlistDialogOpen(true);
      router.replace("/login", { scroll: false });
    } else if (errorParam) {
      const message =
        oauthErrorMessages[errorParam] ||
        "An error occurred during sign-in. Please try again.";
      setErrorDialogMessage(message);
      setErrorDialogOpen(true);
      router.replace("/login", { scroll: false });
    }
  }, [searchParams, router]);

  const validateInviteCode = useCallback(async (code: string) => {
    if (!code || code.length < 8) {
      setInviteCodeValid(null);
      return;
    }
    setInviteCodeValidating(true);
    try {
      const res = await fetch(`/api/invites/validate?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      setInviteCodeValid(data.valid);

      if (data.valid) {
        // Set the cookie for OAuth flow
        await fetch("/api/auth/set-invite-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        setInviteCodeSet(true);
      } else {
        setInviteCodeSet(false);
      }
    } catch {
      setInviteCodeValid(null);
      setInviteCodeSet(false);
    } finally {
      setInviteCodeValidating(false);
    }
  }, []);

  // Auto-validate when invite code reaches expected length
  useEffect(() => {
    if (inviteCode.length >= 8) {
      validateInviteCode(inviteCode);
    } else {
      setInviteCodeValid(null);
      setInviteCodeSet(false);
    }
  }, [inviteCode, validateInviteCode]);

  const hasGoogle = !!oauthProviders?.google;
  const hasApple = !!oauthProviders?.apple;
  const hasGitHub = !!oauthProviders?.github;
  const hasMicrosoft = !!(oauthProviders as Record<string, unknown>)?.["azure-ad"];
  const hasOAuth = hasGoogle || hasApple || hasGitHub || hasMicrosoft;
  const isWaitlist = registrationMode === "WAITLIST";
  const isInviteOnly = registrationMode === "INVITE_ONLY";
  const isClosed = registrationMode === "CLOSED";
  const isTrial = registrationMode === "TRIAL";
  const isOAuthOnly = authMode === "OAUTH_ONLY";
  const oauthDisabledForInvite = isInviteOnly && !inviteCodeSet;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4 w-full max-w-sm">
      {/* Waitlist confirmation dialog */}
      <Dialog open={waitlistDialogOpen} onOpenChange={setWaitlistDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <DialogTitle className="text-xl">You&apos;re on the list!</DialogTitle>
            <DialogDescription className="text-center">
              Thanks for your interest in Tandem. We&apos;ll let you know when
              your account is ready. You&apos;ll be able to sign in with the
              same account once approved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setWaitlistDialogOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account deleted confirmation dialog */}
      <Dialog open={deletedDialogOpen} onOpenChange={setDeletedDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <DialogTitle className="text-xl">Account Deleted</DialogTitle>
            <DialogDescription className="text-center">
              Your account and all associated data have been permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setDeletedDialogOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OAuth error dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex justify-center mb-2">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <DialogTitle className="text-xl">Sign-in failed</DialogTitle>
            <DialogDescription className="text-center">
              {errorDialogMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setErrorDialogOpen(false)}
            >
              Try again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {branding.instanceLogoUrl && (
        <div className="flex justify-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.instanceLogoUrl}
            alt={branding.instanceName}
            className="h-12 w-12 object-contain"
          />
        </div>
      )}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{branding.instanceName}</CardTitle>
          <CardDescription>
            {isClosed
              ? "Sign in to your account."
              : isWaitlist
              ? "Tandem is in private beta. Sign in if you already have an account."
              : isInviteOnly
              ? "Sign in or sign up with an invite code."
              : isTrial
              ? `Sign in or sign up — try free for ${trialDurationDays} days, no credit card required.`
              : "Sign in to your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invite code input for INVITE_ONLY mode */}
          {isInviteOnly && hasOAuth && (
            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite Code</Label>
              <div className="relative">
                <Input
                  id="invite-code"
                  placeholder="TND-XXXX"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {inviteCodeValidating && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!inviteCodeValidating && inviteCodeValid === true && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {!inviteCodeValidating && inviteCodeValid === false && (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              {inviteCodeValid === false && (
                <p className="text-xs text-destructive">
                  Invalid or used invite code
                </p>
              )}
              {inviteCodeValid === true && (
                <p className="text-xs text-green-600">
                  Valid invite code — sign in below to create your account
                </p>
              )}
            </div>
          )}

          {hasOAuth && (
            <>
              <div className="space-y-2">
                {hasGoogle && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={oauthDisabledForInvite}
                    onClick={() =>
                      signIn("google", { callbackUrl })
                    }
                  >
                    <GoogleIcon />
                    Continue with Google
                  </Button>
                )}
                {hasApple && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={oauthDisabledForInvite}
                    onClick={() =>
                      signIn("apple", { callbackUrl })
                    }
                  >
                    <AppleIcon />
                    Continue with Apple
                  </Button>
                )}
                {hasGitHub && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={oauthDisabledForInvite}
                    onClick={() =>
                      signIn("github", { callbackUrl })
                    }
                  >
                    <GitHubIcon />
                    Continue with GitHub
                  </Button>
                )}
                {hasMicrosoft && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={oauthDisabledForInvite}
                    onClick={() =>
                      signIn("azure-ad", { callbackUrl })
                    }
                  >
                    <MicrosoftIcon />
                    Continue with Microsoft
                  </Button>
                )}
              </div>
              {!isOAuthOnly && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      or continue with email
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          {!isOAuthOnly && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>

      {isWaitlist && hasOAuth && (
        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-lg">Don&apos;t have an account?</CardTitle>
            <CardDescription>
              Join the waitlist and we&apos;ll let you know when your account is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasGoogle && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  signIn("google", { callbackUrl })
                }
              >
                <GoogleIcon />
                Join Waitlist with Google
              </Button>
            )}
            {hasApple && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  signIn("apple", { callbackUrl })
                }
              >
                <AppleIcon />
                Join Waitlist with Apple
              </Button>
            )}
            {hasGitHub && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  signIn("github", { callbackUrl })
                }
              >
                <GitHubIcon />
                Join Waitlist with GitHub
              </Button>
            )}
            {hasMicrosoft && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  signIn("azure-ad", { callbackUrl })
                }
              >
                <MicrosoftIcon />
                Join Waitlist with Microsoft
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trial mode is handled in the main card above — no separate card needed */}

      {isClosed && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              New account registration is currently closed. If you already have
              an account, sign in above.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PoweredByFooter() {
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    fetch("/api/public/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.landingMode === "OPERATOR") setIsOperator(true);
      })
      .catch(() => {});
  }, []);

  if (!isOperator) return null;

  return (
    <p className="mt-6 text-xs text-muted-foreground text-center">
      Powered by{" "}
      <a
        href="https://tandemgtd.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground underline underline-offset-2 transition-colors"
      >
        Tandem GTD
      </a>
    </p>
  );
}

function ManagedHostingFooterLink() {
  const [isFlagship, setIsFlagship] = useState(false);

  useEffect(() => {
    fetch("/api/public/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.landingMode === "FLAGSHIP") setIsFlagship(true);
      })
      .catch(() => {});
  }, []);

  if (!isFlagship) return null;

  return (
    <>
      <span>·</span>
      <a
        href="https://manage.tandemgtd.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors"
      >
        Managed Hosting
      </a>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
      <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
        <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
        <span>·</span>
        <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
        <Suspense>
          <ManagedHostingFooterLink />
        </Suspense>
      </div>
      <Suspense>
        <PoweredByFooter />
      </Suspense>
    </div>
  );
}
