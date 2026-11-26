import WorkspaceLayout from "@/components/WorkspaceLayout";
import ProtectedWorkspace from "@/components/ProtectedWorkspace";
import TaskConcurrencyDemo from "@/components/TaskConcurrencyDemo";

export default function Page() {
  return (
    <ProtectedWorkspace requiredRole="project_manager">
      <WorkspaceLayout role="Project Manager">
        <TaskConcurrencyDemo />
      </WorkspaceLayout>
    </ProtectedWorkspace>
  );
}
