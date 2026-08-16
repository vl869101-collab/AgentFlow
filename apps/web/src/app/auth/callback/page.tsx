"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

    // Handle POST form data (tokens delivered via form auto-submit)
    const form = document.querySelector("form#oauth-callback-form") as HTMLFormElement | null;
    if (form) {
      const tokenInput = form.querySelector<HTMLInputElement>("input[name=token]");
      const refreshInput = form.querySelector<HTMLInputElement>("input[name=refreshToken]");
      if (tokenInput?.value && refreshInput?.value) {
        localStorage.setItem("agentflow_token", tokenInput.value);
        localStorage.setItem("agentflow_refresh_token", refreshInput.value);
        router.replace("/dashboard");
        return;
      }
    }

    // Handle legacy GET params (fallback for non-OAuth redirects)
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    if (token && refreshToken) {
      localStorage.setItem("agentflow_token", token);
      localStorage.setItem("agentflow_refresh_token", refreshToken);
      router.replace("/dashboard");
    } else {
      setError("No authentication tokens received");
    }
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
