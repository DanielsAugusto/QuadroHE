import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { AppNav } from "@/components/AppNav";
import { asGuest, asOperador, screenMocks } from "./helpers.tsx";

describe("Tela: navegação e rotas", () => {
  it("menu traz os destinos principais e configuração", () => {
    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole("link", { name: "Hora Extra" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole("link", { name: "Escolas" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Carências" }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByRole("link", { name: "Mapa Estatístico" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Alocações" }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByRole("link", { name: "Configuração" }).length,
    ).toBeGreaterThan(0);
  });

  it("Sair dispara logout", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );
    const botoes = screen.getAllByRole("button", { name: "Sair" });
    await user.click(botoes[0]!);
    expect(screenMocks.logout).toHaveBeenCalled();
  });

  it("visitante em rota protegida vai para o login", () => {
    asGuest();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("operador autenticado vê o dashboard na home", async () => {
    asOperador();
    screenMocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith("/dashboard")) {
        return {
          professores: 0,
          escolas: 0,
          heTotal: 0,
          alocTotal: 0,
          heAbertas: 0,
          carenciaTotal: 0,
          carenciaAberta: 0,
          inconsistentes: [],
          heAVencer: [],
        };
      }
      throw new Error(`API não mockada: ${path}`);
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});
