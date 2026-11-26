/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskConcurrencyDemo from "./TaskConcurrencyDemo";
import {
  ApiError,
  createProject,
  createTask,
  getProjects,
  getTask,
  getTaskActivities,
  updateTaskStatus,
} from "@/lib/api";

jest.mock("next/navigation", () => {
  const router = { replace: jest.fn() };
  return { useRouter: () => router };
});

jest.mock("@/lib/api", () => {
  class MockApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly responseBody?: unknown
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  return {
    ApiError: MockApiError,
    createProject: jest.fn(),
    createTask: jest.fn(),
    getProjects: jest.fn(),
    getTask: jest.fn(),
    getTaskActivities: jest.fn(),
    updateTaskStatus: jest.fn(),
  };
});

const mockedCreateProject = jest.mocked(createProject);
const mockedCreateTask = jest.mocked(createTask);
const mockedGetProjects = jest.mocked(getProjects);
const mockedGetTask = jest.mocked(getTask);
const mockedGetTaskActivities = jest.mocked(getTaskActivities);
const mockedUpdateTaskStatus = jest.mocked(updateTaskStatus);

const project = {
  id: 8,
  name: "Synthetic Demo",
  description: "",
  status: "active",
};

const taskV1 = {
  id: 22,
  project_id: 8,
  title: "Concurrent update demo",
  description: "",
  status: "todo" as const,
  version: 1,
  due_date: null,
};

const activityPage = {
  success: true,
  data: [
    {
      id: 1,
      activity_type: "created",
      task_version: 1,
      previous_state: null,
      new_state: { title: taskV1.title, status: "todo", version: 1 },
      created_at: "2026-11-26T10:00:00.000Z",
    },
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  },
};

describe("TaskConcurrencyDemo", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("accessToken", "test-access-token");
    mockedCreateProject.mockReset();
    mockedCreateTask.mockReset();
    mockedGetProjects.mockReset();
    mockedGetTask.mockReset();
    mockedGetTaskActivities.mockReset();
    mockedUpdateTaskStatus.mockReset();
    mockedGetProjects.mockResolvedValue({ success: true, data: [project] });
    mockedGetTaskActivities.mockResolvedValue(activityPage);
  });

  test("surfaces stale updates and offers a reload without overwriting local state", async () => {
    mockedCreateTask.mockResolvedValue({ success: true, data: taskV1 });
    mockedUpdateTaskStatus.mockRejectedValue(
      new ApiError("Task was updated by another user", 409, {
        currentVersion: 2,
      })
    );
    mockedGetTask.mockResolvedValue({
      success: true,
      data: { ...taskV1, status: "in_progress", version: 2 },
    });

    render(<TaskConcurrencyDemo />);

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: taskV1.title },
    });
    const createTaskButton = screen.getByRole("button", { name: "Create task" });
    await waitFor(() => expect(createTaskButton).toBeEnabled());
    fireEvent.click(createTaskButton);
    expect(await screen.findByText("Task created at version 1.")).toBeVisible();
    expect(screen.getByText("v1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New status"), {
      target: { value: "completed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Conflict: this task is now version 2. Your change was not saved."
    );
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(mockedUpdateTaskStatus).toHaveBeenCalledWith(
      "test-access-token",
      "22",
      "completed",
      1
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reload latest task" })
    );
    await waitFor(() => {
      expect(screen.getByText("v2")).toBeInTheDocument();
    });
    expect(mockedGetTask).toHaveBeenCalledWith("test-access-token", "22");
  });

  test("allows project setup when an organization has no projects", async () => {
    mockedGetProjects.mockResolvedValue({ success: true, data: [] });
    mockedCreateProject.mockResolvedValue({ success: true, data: project });

    render(<TaskConcurrencyDemo />);
    expect(
      await screen.findByText(
        "No project is available in this organization yet."
      )
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("New project name"), {
      target: { value: project.name },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("Project created.")).toBeVisible();
    expect(mockedCreateProject).toHaveBeenCalledWith(
      "test-access-token",
      project.name,
      ""
    );
    expect(await screen.findByLabelText("Project")).toHaveValue("8");
  });
});
