"use client";

import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AuthorizeContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [clientName, setClientName] = useState<string | null>(null);
  const [registeredUris, setRegisteredUris] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope") || "mcp:full";

  // Fetch client info
  useEffect(() => {
    if (!clientId) {
      setError("Missing client_id parameter");
      return;
    }
    if (responseType !== "code") {
      setError("Unsupported response_type (must be 'code')");
      return;
    }
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      setError("PKCE with S256 is required");
      return;
    }
    if (!redirectUri) {
      setError("Missing redirect_uri parameter");
      return;
    }

    // Look up client name
    fetch(`/api/oauth/client-info?client_id=${encodeURIComponent(clientId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error_description || data.error);
        } else {
          setClientName(data.client_name);
          setRegisteredUris(data.redirect_uris || []);
          // Validate redirect_uri against registered URIs
          if (redirectUri && data.redirect_uris && !data.redirect_uris.includes(redirectUri)) {
            setError("redirect_uri does not match any registered URI for this client");
          }
        }
      })
      .catch(() => setError("Failed to load client information"));
  }, [clientId, responseType, codeChallenge, codeChallengeMethod, redirectUri]);

  // Handle allow — POST via fetch, then navigate to the redirect URL.
  // We cannot use a native form submission because Next.js App Router
  // intercepts it and swallows the 302 redirect.
  async function handleAllow() {
    try {
      const body = new URLSearchParams();
      if (clientId) body.set("client_id", clientId);
      if (redirectUri) body.set("redirect_uri", redirectUri);
      if (responseType) body.set("response_type", responseType);
      if (codeChallenge) body.set("code_challenge", codeChallenge);
      if (codeChallengeMethod) body.set("code_challenge_method", codeChallengeMethod);
      body.set("scope", scope);
      if (state) body.set("state", state);

      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: body.toString(),
      });

      const data = await res.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else if (data.error) {
        setError(data.error_description || data.error);
      }
    } catch {
      setError("Failed to authorize — please try again");
    }
  }

  // Handle deny — only redirect to validated URIs
  function handleDeny() {
    if (!redirectUri || !registeredUris.includes(redirectUri)) {
      // If redirect_uri is missing or not registered, don't redirect — just close
      window.location.href = "/";
      return;
    }
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) {
      url.searchParams.set("state", state);
    }
    window.location.href = url.toString();
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Authorization Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full mx-4">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          Authorize Application
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Grant access to your Tandem account
        </p>

        <div className="space-y-4 mb-6">
          <div className="bg-gray-50 rounded-md p-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">
                {clientName || "An application"}
              </span>{" "}
              wants to access your Tandem account.
            </p>
          </div>

          <div className="border rounded-md p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              This will allow the application to:
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#x2713;</span>
                Read your tasks, projects, and inbox
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#x2713;</span>
                Create and modify items on your behalf
              </li>
            </ul>
          </div>

          {session?.user?.email && (
            <p className="text-xs text-gray-500">
              Signed in as{" "}
              <span className="font-medium">{session.user.email}</span>
            </p>
          )}
        </div>

        {/* Allow uses fetch + window.location.href because Next.js App Router
            intercepts form submissions and swallows 302 redirects. */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDeny}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={handleAllow}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <p className="text-gray-500">Loading...</p>
        </div>
      }
    >
      <AuthorizeContent />
    </Suspense>
  );
}
