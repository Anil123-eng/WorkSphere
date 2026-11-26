import WorkspaceLayout from "@/components/WorkspaceLayout";
import ProtectedWorkspace from "@/components/ProtectedWorkspace";
import ReusableForm from "@/components/ReusableForm";
import TaskConcurrencyDemo from "@/components/TaskConcurrencyDemo";

export default function Page() {
  return (
    <ProtectedWorkspace requiredRole="owner">
      <WorkspaceLayout role="Organization Owner">
        <TaskConcurrencyDemo />
      </WorkspaceLayout>
      <div className="px-6">
        <ReusableForm />
      </div>
    </ProtectedWorkspace>
  );
}