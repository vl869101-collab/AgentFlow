"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, setToken } from "../../../lib/api";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle GET params (error redirects)
    const errorParam = searchParams.get("error");
    if (errorParam) {
      router.replace("/register?error=oauth_failed");
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      setError("No authentication tokens received");
      return;
    }

    auth.exchangeOAuthCode(code)
      .then(({ token, refreshToken }) => {
        setToken(token, refreshToken);
        router.replace("/dashboard");
      })
      .catch(() => setError("Unable to complete sign in"));
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => router.replace("/register")} className="mt-4 text-sm text-blue-600 hover:underline">
            Back to register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
        <p className="mt-4 text-sm text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
