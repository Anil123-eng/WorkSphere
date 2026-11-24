
import Link from "next/link";

const roles = [
  { name: "Platform Administrator", path: "/platform-admin" },
  { name: "Organization Owner", path: "/organization-owner" },
  { name: "Project Manager", path: "/project-manager" },
  { name: "Team Member", path: "/team-member" },
];

export default function WorkspaceLayout({
  role,
}: {
  role: string;
}) {
  return (
    <main className="min-h-screen bg-gray-100">
      <header className="bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-blue-700">WorkSphere</h1>
        <nav aria-label="Role navigation" className="mt-4 flex flex-wrap gap-4">
          {roles.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className="text-sm text-blue-700 hover:underline"
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </header>

      <section className="p-6">
        <h2 className="text-2xl font-semibold text-gray-800">{role}</h2>
        <p className="mt-2 text-gray-600">
          Welcome to your WorkSphere workspace.
        </p>
      </section>
    </main>
  );
}
