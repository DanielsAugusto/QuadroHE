import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfiguracaoPage, resolveTab } from "@/pages/ConfiguracaoPage";
import { ConfigHoraExtraPage } from "@/pages/ConfigHoraExtraPage";
import { ConfigLicencasPage } from "@/pages/ConfigLicencasPage";
import { ConfigLogsPage } from "@/pages/ConfigLogsPage";
import { ConfigUsuariosPage } from "@/pages/ConfigUsuariosPage";
import { DisciplinasPage } from "@/pages/DisciplinasPage";
import { EscolasPage } from "@/pages/EscolasPage";
import { ProfessoresPage } from "@/pages/ProfessoresPage";
import {
  asOperador,
  emptyPage,
  renderPage,
  stubApi,
} from "./helpers.tsx";

describe("Tela: Configuração — abas", () => {
  it("resolveTab falha fechada para operador (nunca usuarios/logs)", () => {
    expect(resolveTab("usuarios", false)).toBe("professores");
    expect(resolveTab("logs", false)).toBe("professores");
    expect(resolveTab("hora-extra", false)).toBe("hora-extra");
    expect(resolveTab("usuarios", true)).toBe("usuarios");
  });

  it("admin vê abas de Usuários e Logs", async () => {
    stubApi({
      "/professores": emptyPage,
    });
    renderPage(<ConfiguracaoPage />, { route: "/configuracao" });
    expect(
      await screen.findByRole("heading", { name: "Configuração" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Professores" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuários" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logs" })).toBeInTheDocument();
  });

  it("operador não vê Usuários nem Logs", async () => {
    asOperador();
    stubApi({ "/professores": emptyPage });
    renderPage(<ConfiguracaoPage />, { route: "/configuracao" });
    await screen.findByRole("heading", { name: "Configuração" });
    expect(screen.queryByRole("button", { name: "Usuários" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logs" })).not.toBeInTheDocument();
  });

  it("troca para a aba Disciplinas", async () => {
    const user = userEvent.setup();
    stubApi({
      "/professores": emptyPage,
      "/disciplinas": [],
    });
    renderPage(<ConfiguracaoPage />, { route: "/configuracao" });
    await screen.findByRole("button", { name: "Disciplinas" });
    await user.click(screen.getByRole("button", { name: "Disciplinas" }));
    expect(
      await screen.findByRole("button", { name: "Nova disciplina" }),
    ).toBeInTheDocument();
  });
});

describe("Tela: Configuração / Professores", () => {
  it("lista vazia e abre cadastro", async () => {
    const user = userEvent.setup();
    stubApi({ "/professores": emptyPage });
    renderPage(<ProfessoresPage />);
    expect(
      await screen.findByRole("heading", { name: "Professores" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum professor cadastrado.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Novo professor" }));
    expect(screen.getByRole("dialog", { name: "Novo professor" })).toBeInTheDocument();
  });

  it("admin vê importar excel", async () => {
    stubApi({ "/professores": emptyPage });
    renderPage(<ProfessoresPage />);
    expect(await screen.findByRole("button", { name: "Importar Excel" })).toBeInTheDocument();
  });

  it("operador não vê importar excel", async () => {
    asOperador();
    stubApi({ "/professores": emptyPage });
    renderPage(<ProfessoresPage />);
    expect(await screen.findByRole("button", { name: "Novo professor" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar Excel" })).not.toBeInTheDocument();
  });
});

describe("Tela: Configuração / Escolas", () => {
  it("mostra vazio e abre nova escola", async () => {
    const user = userEvent.setup();
    stubApi({ "/escolas": emptyPage });
    renderPage(<EscolasPage />);
    expect(await screen.findByRole("heading", { name: "Escolas" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma escola cadastrada.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nova escola" }));
    expect(screen.getByRole("dialog", { name: "Nova escola" })).toBeInTheDocument();
  });
});

describe("Tela: Configuração / Disciplinas", () => {
  it("lista disciplinas e abre formulário", async () => {
    const user = userEvent.setup();
    stubApi({
      "/disciplinas": [{ id: "d1", nome: "Matemática", codigo: "MAT" }],
    });
    renderPage(<DisciplinasPage />);
    expect(await screen.findByText("Matemática")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nova disciplina" }));
    expect(
      screen.getByRole("dialog", { name: "Nova disciplina" }),
    ).toBeInTheDocument();
  });
});

describe("Tela: Configuração / Hora Extra", () => {
  it("mostra estado vazio do histórico", async () => {
    stubApi({ "/horas-extra": emptyPage });
    renderPage(<ConfigHoraExtraPage />);
    expect(
      await screen.findByText("Nenhuma hora extra cadastrada."),
    ).toBeInTheDocument();
  });
});

describe("Tela: Configuração / Licenças", () => {
  it("mostra estado vazio", async () => {
    stubApi({ "/licencas": emptyPage });
    renderPage(<ConfigLicencasPage />);
    expect(
      await screen.findByText("Nenhuma licença registrada."),
    ).toBeInTheDocument();
  });
});

describe("Tela: Configuração / Usuários", () => {
  it("lista usuários e abre cadastro", async () => {
    const user = userEvent.setup();
    stubApi({
      "/usuarios": [
        {
          id: "admin-1",
          email: "admin@test.local",
          nome: "Admin Teste",
          papel: "admin",
          ativo: true,
          created_at: "2026-01-01",
        },
      ],
    });
    renderPage(<ConfigUsuariosPage />);
    expect(await screen.findByText("Admin Teste")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Novo usuário" }));
    expect(screen.getByRole("dialog", { name: "Novo usuário" })).toBeInTheDocument();
  });
});

describe("Tela: Configuração / Logs", () => {
  it("mostra vazio quando não há auditoria", async () => {
    stubApi({
      "/logs/filtros": { categorias: [], acoes: [] },
      "/logs": emptyPage,
    });
    renderPage(<ConfigLogsPage />);
    expect(
      await screen.findByText("Ainda não há logs registrados."),
    ).toBeInTheDocument();
  });
});
