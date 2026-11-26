"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createProject,
  createTask,
  getProjects,
  getTask,
  getTaskActivities,
  updateTaskStatus,
  type PageInfo,
  type Project,
  type Task,
  type TaskActivity,
} from "@/lib/api";
import { clearStoredSession } from "@/lib/auth";

const taskStatuses: Task["status"][] = ["todo", "in_progress", "completed"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed";
}

function getConflictVersion(error: ApiError): number | undefined {
  const body = error.responseBody;
  if (
    typeof body === "object" &&
    body !== null &&
    "currentVersion" in body &&
    typeof body.currentVersion === "number"
  ) {
    return body.currentVersion;
  }
  return undefined;
}

export default function TaskConcurrencyDemo() {
  const router = useRouter();
  const token = useRef("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskIdInput, setTaskIdInput] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [nextStatus, setNextStatus] = useState<Task["status"]>("in_progress");
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [activityPage, setActivityPage] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);

  const handleRequestError = useCallback(
    (requestError: unknown): void => {
      if (
        requestError instanceof ApiError &&
        (requestError.status === 401 || requestError.status === 403)
      ) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      setError(getErrorMessage(requestError));
    },
    [router]
  );

  useEffect(() => {
    let active = true;
    const storedToken = localStorage.getItem("accessToken");

    if (!storedToken) {
      clearStoredSession();
      router.replace("/login");
      return () => {
        active = false;
      };
    }

    token.current = storedToken;
    getProjects(storedToken)
      .then((response) => {
        if (!active) return;
        setProjects(response.data);
        setSelectedProjectId(response.data[0] ? String(response.data[0].id) : "");
      })
      .catch((requestError: unknown) => {
        if (active) handleRequestError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handleRequestError, router]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await createProject(token.current, projectName, "");
      setProjects((current) => [...current, response.data]);
      setSelectedProjectId(String(response.data.id));
      setProjectName("");
      setNotice("Project created.");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function loadActivities(
    accessToken: string,
    taskId: string,
    page: number
  ) {
    const response = await getTaskActivities(accessToken, taskId, page);
    setActivities(response.data);
    setActivityPage(response.pagination);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await createTask(
        token.current,
        selectedProjectId,
        taskTitle,
        ""
      );
      const createdTask = response.data;
      const createdTaskId = String(createdTask.id);
      setTask(createdTask);
      setTaskIdInput(createdTaskId);
      setNextStatus(createdTask.status);
      setTaskTitle("");
      setStale(false);
      setNotice(`Task created at version ${createdTask.version}.`);
      await loadActivities(token.current, createdTaskId, 1);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadTask(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const requestedTaskId = taskIdInput.trim();
    if (!requestedTaskId) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await getTask(token.current, requestedTaskId);
      setTask(response.data);
      setNextStatus(response.data.status);
      setTaskIdInput(String(response.data.id));
      setStale(false);
      await loadActivities(token.current, String(response.data.id), 1);
      setNotice(`Loaded task at version ${response.data.version}.`);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await updateTaskStatus(
        token.current,
        String(task.id),
        nextStatus,
        task.version
      );
      setTask(response.data);
      setNextStatus(response.data.status);
      setStale(false);
      setNotice(`Task saved at version ${response.data.version}.`);
      await loadActivities(token.current, String(task.id), 1);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        const currentVersion = getConflictVersion(requestError);
        setStale(true);
        setError(
          currentVersion
            ? `Conflict: this task is now version ${currentVersion}. Your change was not saved. Reload the latest task before retrying.`
            : "Conflict: this task changed elsewhere. Your change was not saved. Reload the latest task before retrying."
        );
      } else {
        handleRequestError(requestError);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleActivityPage(page: number) {
    if (!task) return;
    setBusy(true);
    setError("");
    try {
      await loadActivities(token.current, String(task.id), page);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="task-demo-heading"
      className="mt-8 min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <h3 id="task-demo-heading" className="text-xl font-semibold text-gray-900">
        Task concurrency and history demo
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-gray-700">
        Create or load a task, update its status, and inspect its versioned
        history. To demonstrate a stale update, load the same task in a second
        tab before saving here. The stale tab keeps its old version and receives
        a visible conflict instead of overwriting the newer update.
      </p>

      {loading && (
        <p className="mt-4" role="status" aria-live="polite">
          Loading organization projects…
        </p>
      )}

      {error && (
        <p className="mt-4 break-words text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-sm text-green-800" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="demo-project-heading">
            <h4 id="demo-project-heading" className="font-semibold text-gray-900">
              1. Choose or create a project
            </h4>
            {projects.length > 0 && (
              <div className="mt-3">
                <label
                  htmlFor="demo-project"
                  className="block text-sm font-medium text-gray-800"
                >
                  Project
                </label>
                <select
                  id="demo-project"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded border border-gray-400 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {projects.length === 0 && !loading && (
              <p className="mt-2 text-sm text-gray-700">
                No project is available in this organization yet.
              </p>
            )}
            <form
              onSubmit={handleCreateProject}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="demo-project-name"
                  className="block text-sm font-medium text-gray-800"
                >
                  New project name
                </label>
                <input
                  id="demo-project-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  required
                  maxLength={150}
                  className="mt-1 min-h-11 w-full rounded border border-gray-400 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy || loading || !projectName.trim()}
                className="min-h-11 rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create project
              </button>
            </form>
          </section>

          <section aria-labelledby="demo-create-task-heading">
            <h4
              id="demo-create-task-heading"
              className="font-semibold text-gray-900"
            >
              2. Create a task
            </h4>
            <form onSubmit={handleCreateTask} className="mt-3 space-y-3">
              <div>
                <label
                  htmlFor="demo-task-title"
                  className="block text-sm font-medium text-gray-800"
                >
                  Task title
                </label>
                <input
                  id="demo-task-title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  required
                  maxLength={200}
                  className="mt-1 min-h-11 w-full rounded border border-gray-400 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy || loading || !selectedProjectId || !taskTitle.trim()}
                className="min-h-11 rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create task
              </button>
            </form>
          </section>

          <section aria-labelledby="demo-load-task-heading">
            <h4 id="demo-load-task-heading" className="font-semibold text-gray-900">
              Load a task in another tab
            </h4>
            <form
              onSubmit={handleLoadTask}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="demo-task-id"
                  className="block text-sm font-medium text-gray-800"
                >
                  Task ID
                </label>
                <input
                  id="demo-task-id"
                  inputMode="numeric"
                  value={taskIdInput}
                  onChange={(event) => setTaskIdInput(event.target.value)}
                  required
                  className="mt-1 min-h-11 w-full rounded border border-gray-400 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy || loading || !taskIdInput.trim()}
                className="min-h-11 rounded border border-blue-700 px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Load task
              </button>
            </form>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {task && (
            <>
              <section
                aria-labelledby="demo-update-heading"
                className="min-w-0 rounded border border-gray-200 p-4"
              >
                <h4 id="demo-update-heading" className="font-semibold text-gray-900">
                  3. Update status with the loaded version
                </h4>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-words text-sm">
                  <dt className="font-medium">Task ID</dt>
                  <dd>{task.id}</dd>
                  <dt className="font-medium">Current status</dt>
                  <dd>{task.status}</dd>
                  <dt className="font-medium">Loaded version</dt>
                  <dd>v{task.version}</dd>
                </dl>
                <form onSubmit={handleUpdateTask} className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="demo-task-status"
                      className="block text-sm font-medium text-gray-800"
                    >
                      New status
                    </label>
                    <select
                      id="demo-task-status"
                      value={nextStatus}
                      onChange={(event) => {
                        const selectedStatus = taskStatuses.find(
                          (status) => status === event.target.value
                        );
                        if (selectedStatus) setNextStatus(selectedStatus);
                      }}
                      className="mt-1 min-h-11 w-full rounded border border-gray-400 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {taskStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={busy || nextStatus === task.status || stale}
                      className="min-h-11 rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save status
                    </button>
                    {stale && (
                      <button
                        type="button"
                        onClick={() => void handleLoadTask()}
                        disabled={busy}
                        className="min-h-11 rounded border border-gray-500 px-4 py-2 font-semibold text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                      >
                        Reload latest task
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section aria-labelledby="demo-history-heading" className="min-w-0">
                <h4 id="demo-history-heading" className="font-semibold text-gray-900">
                  Activity history
                </h4>
                {activities.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-700">
                    No history is available for this task.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {activities.map((activity) => (
                      <li
                        key={activity.id}
                        className="min-w-0 rounded border border-gray-200 p-3"
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          Version {activity.task_version}: {activity.activity_type}
                        </p>
                        <time
                          className="text-xs text-gray-600"
                          dateTime={activity.created_at}
                        >
                          {new Date(activity.created_at).toLocaleString()}
                        </time>
                        <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                          <div className="min-w-0">
                            <h5 className="text-xs font-semibold uppercase text-gray-700">
                              Before
                            </h5>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-900">
                              {activity.previous_state
                                ? JSON.stringify(activity.previous_state, null, 2)
                                : "No previous state (creation snapshot)"}
                            </pre>
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-semibold uppercase text-gray-700">
                              After
                            </h5>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-900">
                              {JSON.stringify(activity.new_state, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {activityPage && activityPage.totalPages > 1 && (
                  <nav
                    aria-label="Task activity pages"
                    className="mt-3 flex flex-wrap items-center gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => void handleActivityPage(activityPage.page - 1)}
                      disabled={busy || !activityPage.hasPrevious}
                      className="min-h-11 rounded border border-gray-500 px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span aria-live="polite" className="text-sm text-gray-700">
                      Page {activityPage.page} of {activityPage.totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleActivityPage(activityPage.page + 1)}
                      disabled={busy || !activityPage.hasNext}
                      className="min-h-11 rounded border border-gray-500 px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </nav>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
