import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CarenciasSelecaoPage } from "@/pages/CarenciasSelecaoPage";
import { CarenciasPage } from "@/pages/CarenciasPage";
import { CarenciasDoc2Page } from "@/pages/CarenciasDoc2Page";
import { CarenciasPainelPage } from "@/pages/CarenciasPainelPage";
import { CarenciasDisciplinasPage } from "@/pages/CarenciasDisciplinasPage";
import { CarenciasDisciplinaEscolasPage } from "@/pages/CarenciasDisciplinaEscolasPage";
import {
  asOperador,
  renderPage,
  stubApi,
} from "./helpers.tsx";

describe("Tela: Carências — seleção DOC I / DOC II", () => {
  it("oferece os dois tipos de docente", () => {
    renderPage(<CarenciasSelecaoPage />);
    expect(screen.getByRole("heading", { name: "Carências" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DOC I" })).toHaveAttribute(
      "href",
      "/carencias/doc1",
    );
    expect(screen.getByRole("link", { name: "DOC II" })).toHaveAttribute(
      "href",
      "/carencias/doc2",
    );
  });
});

describe("Tela: Carências DOC I (por escola)", () => {
  it("mostra vazio e atalhos do DOC I", async () => {
    stubApi({
      "/carencias/escolas-resumo": [],
      "/carencias/professores-alocados": [],
    });
    renderPage(<CarenciasPage />);
    expect(
      await screen.findByRole("heading", { name: "Carências - DOC I" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhuma escola na lista de carências/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Painel de controle" })).toHaveAttribute(
      "href",
      "/carencias/doc1/painel",
    );
    expect(screen.getByRole("link", { name: "Por disciplina" })).toHaveAttribute(
      "href",
      "/carencias/doc1/disciplinas",
    );
  });

  it("admin vê importar excel", async () => {
    stubApi({
      "/carencias/escolas-resumo": [],
      "/carencias/professores-alocados": [],
    });
    renderPage(<CarenciasPage />);
    expect(await screen.findByRole("button", { name: "Importar Excel" })).toBeInTheDocument();
  });

  it("operador não vê importar excel", async () => {
    asOperador();
    stubApi({
      "/carencias/escolas-resumo": [],
      "/carencias/professores-alocados": [],
    });
    renderPage(<CarenciasPage />);
    expect(await screen.findByRole("button", { name: "Adicionar escola" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar Excel" })).not.toBeInTheDocument();
  });

  it("abre modal para adicionar escola", async () => {
    const user = userEvent.setup();
    stubApi({
      "/carencias/escolas-resumo": [],
      "/carencias/professores-alocados": [],
      "/carencias/escolas-disponiveis": [{ id: "e1", nome: "EM Nova" }],
    });
    renderPage(<CarenciasPage />);
    await user.click(await screen.findByRole("button", { name: "Adicionar escola" }));
    expect(
      await screen.findByRole("dialog", { name: "Adicionar escola às carências" }),
    ).toBeInTheDocument();
  });
});

describe("Tela: Carências DOC II", () => {
  it("explica que a funcionalidade ainda não chegou", () => {
    renderPage(<CarenciasDoc2Page />);
    expect(
      screen.getByRole("heading", { name: "Carências - DOC II" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Em breve: funcionalidades para carências de DOC II/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute(
      "href",
      "/carencias",
    );
  });
});

describe("Tela: Painel de carências DOC I", () => {
  it("mostra título e estado sem escolas", async () => {
    stubApi({
      "/carencias/painel": {
        disciplinas: [],
        escolas: [],
        totais: { real: 0, temporaria: 0, he_real: 0, he_temporaria: 0 },
        totais_por_disciplina: {},
        total_geral: 0,
      },
    });
    renderPage(<CarenciasPainelPage />);
    expect(
      await screen.findByRole("heading", { name: "Painel de carências — DOC I" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nenhuma escola com carência nas colunas selecionadas."),
    ).toBeInTheDocument();
  });
});

describe("Tela: Carências por disciplina", () => {
  it("lista disciplina com carência e link para os quadros", async () => {
    stubApi({
      "/carencias/disciplinas-resumo": [
        {
          disciplina_id: "d1",
          codigo: "MAT",
          nome: "Matemática",
          quadros: 2,
          abertos: 4,
          escolas_count: 1,
          itens: [],
        },
      ],
    });
    renderPage(<CarenciasDisciplinasPage />);
    expect(
      await screen.findByRole("heading", { name: "Carências - DOC I por disciplina" }),
    ).toBeInTheDocument();
    expect(screen.getByText("MAT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver quadros" })).toHaveAttribute(
      "href",
      "/carencias/doc1/disciplinas/d1",
    );
  });
});

describe("Tela: Quadros de uma disciplina", () => {
  it("mostra a disciplina e vazio quando não há quadros", async () => {
    stubApi({
      "/carencias/disciplinas-resumo": [
        {
          disciplina_id: "d1",
          codigo: "MAT",
          nome: "Matemática",
          quadros: 0,
          abertos: 0,
          escolas_count: 0,
          itens: [],
        },
      ],
    });
    renderPage(<CarenciasDisciplinaEscolasPage />, {
      route: "/carencias/doc1/disciplinas/d1",
      path: "/carencias/doc1/disciplinas/:disciplinaId",
    });
    expect(
      await screen.findByRole("heading", { name: /MAT — Matemática/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum quadro desta disciplina.")).toBeInTheDocument();
  });
});
