
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  login,
  type OrganizationOption,
} from "@/lib/api";
import { getRoleDestination } from "@/lib/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOrganizationOptions(error: unknown): OrganizationOption[] | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    !isRecord(error.responseBody) ||
    error.responseBody.code !== "ORGANIZATION_SELECTION_REQUIRED" ||
    !isRecord(error.responseBody.data) ||
    !Array.isArray(error.responseBody.data.organizations)
  ) {
    return null;
  }

  const organizations = error.responseBody.data.organizations.filter(
    (organization): organization is OrganizationOption =>
      isRecord(organization) &&
      typeof organization.id === "number" &&
      typeof organization.name === "string" &&
      typeof organization.role === "string"
  );

  return organizations.length > 0 ? organizations : null;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await (selectedOrganizationId
        ? login(email, password, Number(selectedOrganizationId))
        : login(email, password));

      if (!result.success) {
        throw new Error(result.message || "Login failed");
      }

      localStorage.setItem("accessToken", result.data.accessToken);
      localStorage.setItem("refreshToken", result.data.refreshToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      localStorage.setItem("role", result.data.role);

      router.push(getRoleDestination(result.data.role));
    } catch (err) {
      const availableOrganizations = getOrganizationOptions(err);
      if (availableOrganizations) {
        setOrganizations(availableOrganizations);
        setSelectedOrganizationId((current) =>
          availableOrganizations.some(
            (organization) => String(organization.id) === current
          )
            ? current
            : String(availableOrganizations[0].id)
        );
        setError("");
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

  const labelClass = "mb-2 block text-sm font-semibold text-gray-700";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-bold text-gray-800">
          WorkSphere Login
        </h1>

        <div>
          <label htmlFor="login-email" className={labelClass}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setOrganizations([]);
              setSelectedOrganizationId("");
            }}
            placeholder="Enter your email"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className={inputClass}
          />
        </div>

        {organizations.length > 0 && (
          <div>
            <label htmlFor="login-organization" className={labelClass}>
              Organization
            </label>
            <select
              id="login-organization"
              required
              value={selectedOrganizationId}
              onChange={(event) =>
                setSelectedOrganizationId(event.target.value)
              }
              className={inputClass}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({organization.role.replaceAll("_", " ")})
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-600" role="status">
              This account belongs to more than one organization. Choose which
              organization to open.
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-600"
            aria-live="polite"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          aria-label={
            loading
              ? "Signing in, please wait"
              : organizations.length > 0
                ? "Continue to workspace"
                : "Login"
          }
          className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Signing in..."
            : organizations.length > 0
              ? "Continue"
              : "Login"}
        </button>

        <p className="text-center text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <a
            href="/register"
            className="font-semibold text-blue-600 hover:underline"
          >
            Register
          </a>
        </p>
      </form>
    </main>
  );
}
