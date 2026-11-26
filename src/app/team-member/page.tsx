import WorkspaceLayout from "@/components/WorkspaceLayout";
import ProtectedWorkspace from "@/components/ProtectedWorkspace";

export default function Page() {
  return (
    <ProtectedWorkspace requiredRole="team_member">
      <WorkspaceLayout role="Team Member" />
    </ProtectedWorkspace>
  );
}
