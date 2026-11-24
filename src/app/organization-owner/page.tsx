import WorkspaceLayout from "@/components/WorkspaceLayout";
import ReusableForm from "@/components/ReusableForm";

export default function Page() {
  return (
    <>
      <WorkspaceLayout role="Organization Owner" />
      <div className="px-6">
        <ReusableForm />
      </div>
    </>
  );
}