
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
      <header className="flex items-center justify-between rounded-lg border-b bg-white p-5">
        <h1 className="text-2xl font-bold text-blue-700">WorkSphere</h1>
        <span className="text-sm text-gray-600">
          Project Management Platform
        </span>
      </header>

      <section className="mx-auto mt-12 max-w-5xl">
        <h2 className="text-3xl font-bold text-gray-800">
          Welcome to WorkSphere
        </h2>

        <p className="mt-2 text-gray-600">
          Manage projects, teams, tasks and workflows in one place.
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
