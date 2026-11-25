
"use client";

import { useState } from "react";

export default function ReusableForm() {
  const [workspaceName, setWorkspaceName] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = workspaceName.trim();

    if (!trimmedName) {
      setMessage("Please enter a workspace name.");
      return;
    }

    setMessage(`Workspace name "${trimmedName}" accepted.`);
    setWorkspaceName("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 max-w-md space-y-4 rounded-lg bg-white p-6 shadow-sm"
    >
      <div>
        <label
          htmlFor="workspace-name"
          className="block text-sm font-medium text-gray-700"
        >
          Workspace Name
        </label>

        <input
          id="workspace-name"
          name="workspaceName"
          type="text"
          value={workspaceName}
          onChange={(event) => {
            setWorkspaceName(event.target.value);
            setMessage("");
          }}
          required
          maxLength={100}
          className="mt-1 w-full rounded border p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Save
      </button>

      {message && (
        <p role="status" aria-live="polite" className="text-sm text-gray-700">
          {message}
        </p>
      )}
    </form>
  );
}
