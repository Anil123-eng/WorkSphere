/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrganizationMembersManager from "./OrganizationMembersManager";
import { addOrganizationMember } from "@/lib/api";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("@/lib/api", () => ({
  addOrganizationMember: jest.fn(),
}));

const mockedAddOrganizationMember = jest.mocked(addOrganizationMember);

describe("OrganizationMembersManager", () => {
  beforeEach(() => {
    replace.mockReset();
    mockedAddOrganizationMember.mockReset();
    localStorage.clear();
    localStorage.setItem("accessToken", "owner-access");
  });

  test.each([
    ["project_manager", "Project Manager"],
    ["team_member", "Team Member"],
  ] as const)(
    "allows an owner to assign the %s role within their organization",
    async (role, label) => {
      mockedAddOrganizationMember.mockResolvedValue({
        success: true,
        message: "Organization membership added",
        data: {
          organizationId: 7,
          userId: 12,
          email: "member@example.test",
          role,
        },
      });

      render(<OrganizationMembersManager />);
      fireEvent.change(screen.getByLabelText("Registered account email"), {
        target: { value: "member@example.test" },
      });
      fireEvent.change(screen.getByLabelText("Organization role"), {
        target: { value: role },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add member" }));

      await waitFor(() => {
        expect(mockedAddOrganizationMember).toHaveBeenCalledWith(
          "owner-access",
          "member@example.test",
          role
        );
      });
      expect(await screen.findByRole("status")).toHaveTextContent(
        `Added member@example.test as ${label.toLowerCase()}`
      );
    }
  );

  test("redirects to login when the local session is missing", async () => {
    localStorage.removeItem("accessToken");
    render(<OrganizationMembersManager />);

    fireEvent.change(screen.getByLabelText("Registered account email"), {
      target: { value: "member@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(mockedAddOrganizationMember).not.toHaveBeenCalled();
  });

  test("shows provisioning errors without claiming success", async () => {
    mockedAddOrganizationMember.mockRejectedValue(
      new Error("No registered account was found for that email")
    );
    render(<OrganizationMembersManager />);

    fireEvent.change(screen.getByLabelText("Registered account email"), {
      target: { value: "missing@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No registered account was found for that email"
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
