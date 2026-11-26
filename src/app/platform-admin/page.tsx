import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <section
        className="mx-auto mt-12 max-w-2xl rounded-lg bg-white p-8 shadow-sm"
        role="status"
      >
        <h1 className="text-2xl font-bold text-gray-800">
          Platform Administrator access is not configured
        </h1>
        <p className="mt-3 text-gray-600">
          WorkSphere does not currently implement a separate global platform
          administrator authorization system. No organization-owner privileges
          are granted on this page.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Return to WorkSphere
        </Link>
      </section>
    </main>
  );
}
