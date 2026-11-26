
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, revokeSession } from "@/lib/api";
import { clearStoredSession } from "@/lib/auth";

const roles = [
  { name: "Platform Administrator", path: "/platform-admin" },
  { name: "Organization Owner", path: "/organization-owner" },
  { name: "Project Manager", path: "/project-manager" },
  { name: "Team Member", path: "/team-member" },
];

export default function WorkspaceLayout({
  role,
  children,
}: {
  role: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLogoutError("");
    const refreshToken = localStorage.getItem("refreshToken");

    if (refreshToken) {
      try {
        await revokeSession(refreshToken);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearStoredSession();
          router.replace("/login");
          return;
        }

        setLogoutError(
          error instanceof Error ? error.message : "Unable to log out"
        );
        return;
      }
    }

    clearStoredSession();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-blue-700">WorkSphere</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>

        <nav
          aria-label="Role navigation"
          className="mt-4 flex flex-wrap gap-4"
        >
          {roles.map((item) => {
            const isActive = item.name === role;

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={isActive ? "page" : undefined}
                className={`rounded px-2 py-1 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? "bg-blue-100 font-semibold text-blue-800"
                    : "text-blue-700 hover:bg-gray-100 hover:underline"
                }`}
              >
                {item.name}
                {isActive && (
                  <span className="sr-only"> (current page)</span>
                )}
              </Link>
            );
          })}
        </nav>
        {logoutError && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {logoutError}
          </p>
        )}
      </header>

      <section className="p-6">
        <h2 className="text-2xl font-semibold text-gray-800">
          {role}
        </h2>

        <p className="mt-2 text-gray-600">
          Welcome to your WorkSphere workspace.
        </p>
        {children}
      </section>
    </main>
  );
}
