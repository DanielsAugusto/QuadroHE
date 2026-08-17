import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FichaProfessorPage } from "@/pages/FichaProfessorPage";
import { renderPage, stubApi } from "./helpers.tsx";

const ficha = {
  professor: {
    matricula: "7001",
    nome: "Carla Mendes",
    cargo: "Professor II",
    funcao: "Regente",
  },
  horas_extra: [],
  alocacoes: [],
  slots: [],
  lotacoes: [],
  licencas: [],
};

describe("Tela: Ficha do professor", () => {
  it("mostra carregando enquanto busca a ficha", () => {
    stubApi({
      "/professores/7001": () => new Promise(() => {}),
    });
    renderPage(<FichaProfessorPage />, {
      route: "/professores/7001",
      path: "/professores/:matricula",
    });
    expect(screen.getByText("Carregando ficha...")).toBeInTheDocument();
  });

  it("exibe nome, matrícula e abas", async () => {
    stubApi({ "/professores/7001": ficha });
    renderPage(<FichaProfessorPage />, {
      route: "/professores/7001",
      path: "/professores/:matricula",
    });
    expect(
      await screen.findByRole("heading", { name: "Carla Mendes" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Matrícula 7001/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resumo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lotações" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Licenças" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma HE para este professor.")).toBeInTheDocument();
  });

  it("navega para a aba de lotações", async () => {
    const user = userEvent.setup();
    stubApi({ "/professores/7001": ficha });
    renderPage(<FichaProfessorPage />, {
      route: "/professores/7001",
      path: "/professores/:matricula",
    });
    await screen.findByRole("heading", { name: "Carla Mendes" });
    await user.click(screen.getByRole("button", { name: "Lotações" }));
    expect(
      screen.getByText("Nenhuma lotação cadastrada para este professor."),
    ).toBeInTheDocument();
  });

  it("mostra erro quando a ficha não existe", async () => {
    stubApi({
      "/professores/7001": () => {
        throw new Error("Não encontrado");
      },
    });
    renderPage(<FichaProfessorPage />, {
      route: "/professores/7001",
      path: "/professores/:matricula",
    });
    expect(await screen.findByText("Não encontrado")).toBeInTheDocument();
  });
});
