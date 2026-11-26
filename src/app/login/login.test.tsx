/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { ApiError, login } from "@/lib/api";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/api", () => ({
  ApiError: class MockApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly responseBody?: unknown
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
  login: jest.fn(),
}));

const mockedLogin = login as jest.MockedFunction<typeof login>;

describe("LoginPage", () => {
  beforeEach(() => {
    push.mockReset();
    mockedLogin.mockReset();
  });

  test("stores a successful session and navigates to the owner workspace", async () => {
    mockedLogin.mockResolvedValue({
      success: true,
      message: "Login successful",
      data: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        role: "owner",
        user: { id: 1, name: "Owner", email: "owner@example.com" },
        organization: { id: 1, name: "Owner Organization" },
      },
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "TestPassword@123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith(
        "owner@example.com",
        "TestPassword@123"
      );
      expect(push).toHaveBeenCalledWith("/organization-owner");
    });

    expect(localStorage.getItem("accessToken")).toBe("access-token");
  });

  test.each([
    ["project_manager", "/project-manager"],
    ["team_member", "/team-member"],
    ["admin", "/platform-admin"],
    ["auditor", "/"],
  ])("routes the %s backend role correctly", async (role, destination) => {
    mockedLogin.mockResolvedValue({
      success: true,
      message: "Login successful",
      data: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        role,
        user: { id: 2, name: "User", email: "user@example.com" },
        organization: { id: 2, name: "User Organization" },
      },
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "TestPassword@123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(destination);
    });
  });

  test("lets a user choose the organization whose role determines their route", async () => {
    mockedLogin
      .mockRejectedValueOnce(
        new ApiError("Select an organization to continue", 409, {
          success: false,
          code: "ORGANIZATION_SELECTION_REQUIRED",
          message: "Select an organization to continue",
          data: {
            organizations: [
              { id: 10, name: "Personal Organization", role: "owner" },
              { id: 20, name: "Team Organization", role: "project_manager" },
            ],
          },
        })
      )
      .mockResolvedValueOnce({
        success: true,
        message: "Login successful",
        data: {
          accessToken: "manager-access",
          refreshToken: "manager-refresh",
          role: "project_manager",
          user: { id: 2, name: "Manager", email: "manager@example.com" },
          organization: { id: 20, name: "Team Organization" },
        },
      });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "manager@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "TestPassword@123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    const organizationSelect = await screen.findByLabelText("Organization");
    fireEvent.change(organizationSelect, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to workspace" }));

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenNthCalledWith(
        1,
        "manager@example.com",
        "TestPassword@123"
      );
      expect(mockedLogin).toHaveBeenNthCalledWith(
        2,
        "manager@example.com",
        "TestPassword@123",
        20
      );
      expect(push).toHaveBeenCalledWith("/project-manager");
    });
  });

  test("shows a safe error message for invalid credentials", async () => {
    mockedLogin.mockRejectedValue(new Error("Invalid email or password"));

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "WrongPassword@123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(
      await screen.findByText("Invalid email or password")
    ).toBeInTheDocument();
  });
});
