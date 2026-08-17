import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  diasRestantes,
  DashboardPage,
  fimDoAno,
  fimDoMes,
  fimDaSemana,
} from "@/pages/DashboardPage";
import { renderPage, stubApi } from "./helpers.tsx";

const dashboard = {
  professores: 12,
  escolas: 4,
  heTotal: 80,
  alocTotal: 50,
  heAbertas: 3,
  carenciaTotal: 10,
  carenciaAberta: 2,
  inconsistentes: [
    {
      matricula: "100",
      nome: "Ana Costa",
      heAutorizada: 10,
      temposAlocados: 16,
      saldo: -6,
    },
  ],
  heAVencer: [],
};

describe("Tela: Dashboard — regras de vencimento", () => {
  it("calcula fim da semana, mês e ano a partir de uma data fixa", () => {
    const quarta = new Date(2026, 7, 19);
    expect(fimDaSemana(quarta)).toBe("2026-08-23");
    expect(fimDoMes(quarta)).toBe("2026-08-31");
    expect(fimDoAno(quarta)).toBe("2026-12-31");
  });

  it("conta dias restantes até o término", () => {
    expect(diasRestantes("2026-08-20", "2026-08-17")).toBe(3);
  });
});

describe("Tela: Dashboard", () => {
  it("mostra carregando enquanto busca os dados", () => {
    stubApi({ "/dashboard": () => new Promise(() => {}) });
    renderPage(<DashboardPage />);
    expect(screen.getByText("Carregando dashboard...")).toBeInTheDocument();
  });

  it("exibe totais e atalhos depois de carregar", async () => {
    stubApi({ "/dashboard": dashboard });
    renderPage(<DashboardPage />);
    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Funcionários")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Ana Costa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nova HE" })).toHaveAttribute(
      "href",
      "/hora-extra",
    );
    expect(screen.getByRole("link", { name: "Carências" })).toHaveAttribute(
      "href",
      "/carencias",
    );
  });

  it("mostra erro da API", async () => {
    stubApi({
      "/dashboard": () => {
        throw new Error("Falha no painel");
      },
    });
    renderPage(<DashboardPage />);
    expect(await screen.findByText("Falha no painel")).toBeInTheDocument();
  });

  it("alterna filtro para horas extras a vencer", async () => {
    const user = userEvent.setup();
    stubApi({ "/dashboard": dashboard });
    renderPage(<DashboardPage />);
    await screen.findByText("Professores com atenção");
    await user.click(screen.getByRole("button", { name: /Vence na semana/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Horas extras a vencer" }),
      ).toBeInTheDocument();
    });
  });
});
