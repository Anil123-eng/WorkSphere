"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addOrganizationMember,
  type AssignableOrganizationRole,
} from "@/lib/api";

function isAssignableRole(value: string): value is AssignableOrganizationRole {
  return value === "project_manager" || value === "team_member";
}

export default function OrganizationMembersManager() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<AssignableOrganizationRole>("team_member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.replace("/login");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await addOrganizationMember(token, email, role);
      setNotice(
        `Added ${email.trim()} as ${role.replaceAll("_", " ")}. They can select this organization when they sign in.`
      );
      setEmail("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add this organization member"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="organization-members-heading"
      className="mt-8 rounded-lg border bg-white p-6 shadow-sm"
    >
      <h3
        id="organization-members-heading"
        className="text-xl font-semibold text-gray-800"
      >
        Add an organization member
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        The person must register an account first. This grants access only to
        your organization and does not change their other memberships.
      </p>

      <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={handleSubmit}>
        <div className="sm:col-span-2">
          <label
            htmlFor="organization-member-email"
            className="mb-1 block text-sm font-medium text-gray-800"
          >
            Registered account email
          </label>
          <input
            id="organization-member-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="organization-member-role"
            className="mb-1 block text-sm font-medium text-gray-800"
          >
            Organization role
          </label>
          <select
            id="organization-member-role"
            value={role}
            onChange={(event) => {
              if (isAssignableRole(event.target.value)) {
                setRole(event.target.value);
              }
            }}
            className="w-full rounded border border-gray-300 p-2 text-gray-900"
          >
            <option value="project_manager">Project Manager</option>
            <option value="team_member">Team Member</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Adding member..." : "Add member"}
          </button>
        </div>
      </form>

      {notice && (
        <p className="mt-4 text-sm text-green-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
