
const roles = [
  "Platform Administrator",
  "Organization Owner",
  "Project Manager",
  "Team Member",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <header className="flex items-center justify-between border-b bg-white p-5 rounded-lg">
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
            <div
              key={role}
              className="rounded-lg border bg-white p-6 shadow-sm"
            >
              <h4 className="font-semibold text-gray-800">{role}</h4>
              <p className="mt-2 text-sm text-gray-500">
                Access your WorkSphere workspace.
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
