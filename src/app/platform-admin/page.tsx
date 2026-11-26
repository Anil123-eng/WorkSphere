import WorkspaceLayout from "@/components/WorkspaceLayout";
import ProtectedWorkspace from "@/components/ProtectedWorkspace";

export default function Page() {
  return (
    <ProtectedWorkspace requiredRole="admin">
      <WorkspaceLayout role="Platform Administrator" />
    </ProtectedWorkspace>
  );
}
