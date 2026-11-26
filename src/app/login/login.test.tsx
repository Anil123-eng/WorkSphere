/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { login } from "@/lib/api";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/api", () => ({
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
