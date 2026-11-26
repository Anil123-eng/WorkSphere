/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import ProtectedWorkspace from "./ProtectedWorkspace";
import { ApiError, getSession, refreshTokens } from "@/lib/api";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("@/lib/api", () => {
  class MockApiError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  return {
    ApiError: MockApiError,
    getSession: jest.fn(),
    refreshTokens: jest.fn(),
  };
});

const mockedGetSession = jest.mocked(getSession);
const mockedRefreshTokens = jest.mocked(refreshTokens);

function renderWorkspace(requiredRole = "owner") {
  return render(
    <ProtectedWorkspace requiredRole={requiredRole}>
      <p>Protected workspace content</p>
    </ProtectedWorkspace>
  );
}

describe("ProtectedWorkspace", () => {
  beforeEach(() => {
    replace.mockReset();
    mockedGetSession.mockReset();
    mockedRefreshTokens.mockReset();
    localStorage.clear();
  });

  test("redirects unauthenticated visitors without rendering workspace content", async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(
      screen.queryByText("Protected workspace content")
    ).not.toBeInTheDocument();
    expect(mockedGetSession).not.toHaveBeenCalled();
  });

  test("renders content after the backend verifies the expected role", async () => {
    localStorage.setItem("accessToken", "valid-access");
    mockedGetSession.mockResolvedValue({
      success: true,
      data: { userId: 1, organizationId: 1, role: "owner" },
    });

    renderWorkspace();

    expect(await screen.findByText("Protected workspace content")).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  test("redirects an authenticated user with the wrong role", async () => {
    localStorage.setItem("accessToken", "valid-access");
    mockedGetSession.mockResolvedValue({
      success: true,
      data: { userId: 1, organizationId: 1, role: "team_member" },
    });

    renderWorkspace("owner");

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/team-member");
    });
    expect(
      screen.queryByText("Protected workspace content")
    ).not.toBeInTheDocument();
  });

  test("rotates an expired access token before rendering the workspace", async () => {
    localStorage.setItem("accessToken", "expired-access");
    localStorage.setItem("refreshToken", "valid-refresh");
    mockedGetSession
      .mockRejectedValueOnce(new ApiError("Access token expired", 401))
      .mockResolvedValueOnce({
        success: true,
        data: { userId: 1, organizationId: 1, role: "owner" },
      });
    mockedRefreshTokens.mockResolvedValue({
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
    });

    renderWorkspace();

    expect(await screen.findByText("Protected workspace content")).toBeVisible();
    expect(mockedRefreshTokens).toHaveBeenCalledWith("valid-refresh");
    expect(localStorage.getItem("accessToken")).toBe("rotated-access");
    expect(localStorage.getItem("refreshToken")).toBe("rotated-refresh");
  });
});
