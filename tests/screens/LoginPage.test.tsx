import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { LoginPage } from "@/pages/LoginPage";
import { asGuest, screenMocks } from "./helpers.tsx";

describe("Tela: Login", () => {
  beforeEach(() => {
    asGuest();
  });

  it("mostra marca e campos de e-mail e senha", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("QuadroHE")).toBeInTheDocument();
    expect(
      screen.getByText(/Secretaria de Educação/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("envia e-mail e senha ao autenticar", async () => {
    const user = userEvent.setup();
    screenMocks.login.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("E-mail"), "admin@test.local");
    await user.type(screen.getByLabelText("Senha"), "segredo123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => {
      expect(screenMocks.login).toHaveBeenCalledWith(
        "admin@test.local",
        "segredo123",
      );
    });
  });

  it("mostra o erro quando o login falha", async () => {
    const user = userEvent.setup();
    screenMocks.login.mockRejectedValue(new Error("Credenciais inválidas"));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("E-mail"), "a@b.c");
    await user.type(screen.getByLabelText("Senha"), "x");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Credenciais inválidas")).toBeInTheDocument();
  });

  it("pede código quando o login exige verificação em duas etapas", async () => {
    const user = userEvent.setup();
    screenMocks.login.mockResolvedValue({
      mfa_required: true,
      mfa_token: "pending-token",
    });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("E-mail"), "admin@test.local");
    await user.type(screen.getByLabelText("Senha"), "segredo123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(
      await screen.findByLabelText("Código de verificação"),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código de verificação"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => {
      expect(screenMocks.confirmMfa).toHaveBeenCalledWith(
        "pending-token",
        "123456",
      );
    });
  });
});
