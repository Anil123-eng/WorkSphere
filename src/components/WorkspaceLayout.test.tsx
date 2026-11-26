/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WorkspaceLayout from "./WorkspaceLayout";
import { revokeSession } from "@/lib/api";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
  revokeSession: jest.fn(),
}));

const mockedRevokeSession = jest.mocked(revokeSession);

describe("WorkspaceLayout sign out", () => {
  beforeEach(() => {
    replace.mockReset();
    mockedRevokeSession.mockReset();
    localStorage.clear();
  });

  test("revokes the refresh-token session before clearing local state", async () => {
    localStorage.setItem("accessToken", "access-token");
    localStorage.setItem("refreshToken", "refresh-token");
    mockedRevokeSession.mockResolvedValue({
      success: true,
      message: "Logout successful",
    });

    render(<WorkspaceLayout role="Organization Owner" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(mockedRevokeSession).toHaveBeenCalledWith("refresh-token");
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });

  test("keeps the session and reports a revocation failure", async () => {
    localStorage.setItem("refreshToken", "refresh-token");
    mockedRevokeSession.mockRejectedValue(new Error("Service unavailable"));

    render(<WorkspaceLayout role="Organization Owner" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service unavailable"
    );
    expect(localStorage.getItem("refreshToken")).toBe("refresh-token");
    expect(replace).not.toHaveBeenCalled();
  });
});
