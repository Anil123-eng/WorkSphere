
import Link from "next/link";

const roles = [
  {
    name: "Platform Administrator",
    description: "Manage platform-wide organizations and administration.",
    href: "/platform-admin",
  },
  {
    name: "Organization Owner",
    description: "Manage your organization, members and projects.",
    href: "/organization-owner",
  },
  {
    name: "Project Manager",
    description: "Manage projects, milestones and team tasks.",
    href: "/project-manager",
  },
  {
    name: "Team Member",
    description: "View assigned tasks and collaborate with your team.",
    href: "/team-member",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border-b bg-white p-5">
        <h1 className="text-2xl font-bold text-blue-700">
          WorkSphere
        </h1>

        <nav className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-sm font-semibold text-gray-700 hover:text-blue-600"
          >
            Login
          </Link>

          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Register
          </Link>
        </nav>
      </header>

      <section className="mx-auto mt-12 max-w-5xl">
        <h2 className="text-3xl font-bold text-gray-800">
          Welcome to WorkSphere
        </h2>

        <p className="mt-2 text-gray-600">
          Manage projects, teams, tasks and workflows in one place.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Choose a workspace, then sign in with an account assigned that role
          in the selected organization. Selecting a workspace does not grant
          access.
        </p>

        <h3 className="mt-10 text-xl font-semibold text-gray-800">
          Select your role
        </h3>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {roles.map((role) => (
            <Link
              key={role.href}
              href={role.href}
              className="block rounded-lg border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <h4 className="font-semibold text-gray-800">
                {role.name}
              </h4>

              <p className="mt-2 text-sm text-gray-500">
                {role.description}
              </p>

              <span className="mt-4 inline-block text-sm font-medium text-blue-600">
                Open workspace →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
