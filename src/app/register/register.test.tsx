/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RegisterPage from "./page";
import { register } from "@/lib/api";

jest.mock("next/navigation", () => {
  const router = { push: jest.fn() };
  return {
    useRouter: () => router,
    __mockRouter: router,
  };
});

jest.mock("@/lib/api", () => ({
  register: jest.fn(),
}));

const mockedRegister = jest.mocked(register);
const mockedRouter = jest.requireMock("next/navigation").__mockRouter as {
  push: jest.Mock;
};

describe("RegisterPage accessibility", () => {
  beforeEach(() => {
    mockedRegister.mockReset();
    mockedRouter.push.mockReset();
  });

  test("submits a new account and returns to login on success", async () => {
    mockedRegister.mockResolvedValue({
      success: true,
      message: "Registration successful",
    });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Sample User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "sample@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Sample Organization" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "SamplePass@123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => {
      expect(mockedRegister).toHaveBeenCalledWith(
        "Sample User",
        "sample@example.test",
        "SamplePass@123",
        "Sample Organization"
      );
      expect(mockedRouter.push).toHaveBeenCalledWith("/login");
    });
  });

  test("associates labels with fields and announces registration errors", async () => {
    mockedRegister.mockRejectedValue(new Error("Registration unavailable"));
    render(<RegisterPage />);

    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Sample User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "sample@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Sample Organization" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "SamplePass@123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Registration unavailable"
    );
  });
});
