"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  getSession,
  refreshTokens,
  type SessionResponse,
} from "@/lib/api";
import { clearStoredSession, getRoleDestination } from "@/lib/auth";

interface ProtectedWorkspaceProps {
  requiredRole: string;
  children: ReactNode;
}

export default function ProtectedWorkspace({
  requiredRole,
  children,
}: ProtectedWorkspaceProps) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "checking" | "authorized" | "denied" | "error"
  >("checking");
  const [deniedDestination, setDeniedDestination] = useState("/");
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      setStatus("checking");
      setError("");

      const accessToken = localStorage.getItem("accessToken");
      const refreshToken = localStorage.getItem("refreshToken");

      if (!accessToken && !refreshToken) {
        clearStoredSession();
        router.replace("/login");
        return;
      }

      try {
        let session: SessionResponse;

        if (accessToken) {
          try {
            session = await getSession(accessToken);
          } catch (requestError) {
            if (
              !(requestError instanceof ApiError) ||
              requestError.status !== 401 ||
              !refreshToken
            ) {
              throw requestError;
            }

            const refreshedTokens = await refreshTokens(refreshToken);
            if (!active) return;
            localStorage.setItem("accessToken", refreshedTokens.accessToken);
            localStorage.setItem("refreshToken", refreshedTokens.refreshToken);
            session = await getSession(refreshedTokens.accessToken);
          }
        } else {
          if (!refreshToken) {
            clearStoredSession();
            router.replace("/login");
            return;
          }

          const refreshedTokens = await refreshTokens(refreshToken);
          if (!active) return;
          localStorage.setItem("accessToken", refreshedTokens.accessToken);
          localStorage.setItem("refreshToken", refreshedTokens.refreshToken);
          session = await getSession(refreshedTokens.accessToken);
        }

        if (!active) return;

        if (session.data.role !== requiredRole) {
          setDeniedDestination(getRoleDestination(session.data.role));
          setStatus("denied");
          return;
        }

        setStatus("authorized");
      } catch (requestError) {
        if (!active) return;

        if (
          requestError instanceof ApiError &&
          (requestError.status === 401 || requestError.status === 403)
        ) {
          clearStoredSession();
          router.replace("/login");
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to verify your session"
        );
        setStatus("error");
      }
    }

    void verifySession();

    return () => {
      active = false;
    };
  }, [requiredRole, retryCount, router]);

  if (status === "authorized") {
    return <>{children}</>;
  }

  if (status === "denied") {
    return (
      <main className="p-6" role="alert">
        <h1 className="text-xl font-semibold text-gray-900">Access denied</h1>
        <p className="mt-2 text-gray-700">
          This account does not have the {requiredRole.replaceAll("_", " ")}{" "}
          role required for this workspace.
        </p>
        <Link
          href={deniedDestination}
          className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Open your authorized workspace
        </Link>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="p-6" role="alert">
        <p>{error}</p>
        <button
          type="button"
          className="mt-3 rounded bg-blue-600 px-4 py-2 text-white"
          onClick={() => setRetryCount((count) => count + 1)}
        >
          Retry session check
        </button>
      </main>
    );
  }

  return (
    <main className="p-6" role="status" aria-live="polite">
      Verifying your session...
    </main>
  );
}
