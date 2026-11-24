"use client";

export default function ReusableForm() {
  return (
    <form className="mt-6 max-w-md space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <div>
        <label htmlFor="workspace-name" className="block text-sm font-medium">
          Workspace Name
        </label>
        <input
          id="workspace-name"
          name="workspaceName"
          type="text"
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-white">
        Save
      </button>
    </form>
  );
}
