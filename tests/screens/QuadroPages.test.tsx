import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EscolaQuadrosPage } from "@/pages/EscolaQuadrosPage";
import { QuadroTurmaPage } from "@/pages/QuadroTurmaPage";
import { renderPage, stubApi } from "./helpers.tsx";

describe("Tela: Quadros da escola", () => {
  it("mostra o nome da escola e convite para criar o primeiro quadro", async () => {
    stubApi({
      "/escolas/esc-1/quadros": {
        escola: { id: "esc-1", nome: "EM Centro" },
        quadros: [],
      },
      "/disciplinas": [{ id: "d1", nome: "Matemática", codigo: "MAT" }],
    });
    renderPage(<EscolaQuadrosPage />, {
      route: "/carencias/doc1/esc-1",
      path: "/carencias/doc1/:escolaId",
    });
    expect(
      await screen.findByRole("heading", { name: "EM Centro" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhum quadro ainda/),
    ).toBeInTheDocument();
  });

  it("abre o formulário de novo quadro", async () => {
    const user = userEvent.setup();
    stubApi({
      "/escolas/esc-1/quadros": {
        escola: { id: "esc-1", nome: "EM Centro" },
        quadros: [],
      },
      "/disciplinas": [],
    });
    renderPage(<EscolaQuadrosPage />, {
      route: "/carencias/doc1/esc-1",
      path: "/carencias/doc1/:escolaId",
    });
    await user.click(await screen.findByRole("button", { name: "Novo quadro" }));
    expect(
      screen.getByRole("heading", { name: "Novo quadro de carência" }),
    ).toBeInTheDocument();
  });
});

describe("Tela: Quadro da turma", () => {
  it("mostra carregando enquanto busca o quadro", () => {
    stubApi({
      "/quadros/q1": () => new Promise(() => {}),
      "/professores": [],
    });
    renderPage(<QuadroTurmaPage />, {
      route: "/carencias/doc1/esc-1/q1",
      path: "/carencias/doc1/:escolaId/:quadroId",
    });
    expect(screen.getByText("Carregando quadro...")).toBeInTheDocument();
  });

  it("exibe turma, turno e grade de horários", async () => {
    stubApi({
      "/quadros/q1": {
        quadro: {
          id: "q1",
          escola_id: "esc-1",
          escola_nome: "EM Centro",
          turma_codigo: "101",
          turmas: ["101"],
          turno: "MANHA",
          disciplina_id: "d1",
          disciplina_codigo: "MAT",
          observacao: null,
        },
        slots: [
          {
            id: "s1",
            quadro_id: "q1",
            dia: 1,
            periodo: 1,
            matricula: null,
            tipo: "REAL",
            turma_codigo: "101",
          },
        ],
      },
      "/professores": [],
    });
    renderPage(<QuadroTurmaPage />, {
      route: "/carencias/doc1/esc-1/q1",
      path: "/carencias/doc1/:escolaId/:quadroId",
    });
    expect(
      await screen.findByRole("heading", { name: "Turma 101" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/EM Centro/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar às turmas" })).toBeInTheDocument();
  });
});
