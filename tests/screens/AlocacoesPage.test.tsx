import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AlocacoesPage } from "@/pages/AlocacoesPage";
import { renderPage, stubApi } from "./helpers.tsx";

describe("Tela: Alocações", () => {
  it("mostra vazio e abre nova alocação", async () => {
    const user = userEvent.setup();
    stubApi({
      "/alocacoes": [],
      "/professores": [{ matricula: "100", nome: "Ana", cargo: null, funcao: null }],
      "/escolas": [{ id: "e1", nome: "EM Centro" }],
      "/disciplinas": [{ id: "d1", nome: "Matemática", codigo: "MAT" }],
    });
    renderPage(<AlocacoesPage />);
    expect(
      await screen.findByRole("heading", { name: "Quadro / Alocações" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma alocação cadastrada.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nova alocação" }));
    expect(screen.getByRole("dialog", { name: "Nova alocação" })).toBeInTheDocument();
  });

  it("lista alocação ativa e resumo por escola", async () => {
    stubApi({
      "/alocacoes": [
        {
          id: "a1",
          matricula: "100",
          professor_nome: "Ana Costa",
          escola_id: "e1",
          escola_nome: "EM Centro",
          disciplina_id: "d1",
          turno: "MANHA",
          tempos: 5,
          turma_codigo: "101",
          status: "ATIVA",
        },
      ],
      "/professores": [],
      "/escolas": [{ id: "e1", nome: "EM Centro" }],
      "/disciplinas": [],
    });
    renderPage(<AlocacoesPage />);
    expect(await screen.findByText("Ana Costa")).toBeInTheDocument();
    expect(screen.getByText("Resumo por escola (alocações ativas)")).toBeInTheDocument();
    expect(screen.getAllByText("EM Centro").length).toBeGreaterThan(0);
  });
});
