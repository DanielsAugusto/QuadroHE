import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HoraExtraPage } from "@/pages/HoraExtraPage";
import {
  asOperador,
  emptyPage,
  renderPage,
  stubApi,
} from "./helpers.tsx";

function stubHe(items: unknown[] = [], total = items.length) {
  stubApi({
    "/professores": [],
    "/lotacao/opcoes": [],
    "/horas-extra": { items, total, page: 1, pageSize: 20 },
  });
}

describe("Tela: Hora Extra", () => {
  it("mostra título, cadastro e estado vazio", async () => {
    stubHe();
    renderPage(<HoraExtraPage />);
    expect(
      await screen.findByRole("heading", { name: "Hora Extra" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma hora extra cadastrada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova HE" })).toBeInTheDocument();
  });

  it("admin vê importar e inativar todas", async () => {
    stubHe();
    renderPage(<HoraExtraPage />);
    expect(await screen.findByRole("button", { name: "Importar Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inativar todas" })).toBeInTheDocument();
  });

  it("operador não vê importar nem inativar todas", async () => {
    asOperador();
    stubHe();
    renderPage(<HoraExtraPage />);
    expect(await screen.findByRole("button", { name: "Nova HE" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inativar todas" })).not.toBeInTheDocument();
  });

  it("abre o modal de nova HE", async () => {
    const user = userEvent.setup();
    stubHe();
    renderPage(<HoraExtraPage />);
    await screen.findByRole("button", { name: "Nova HE" });
    await user.click(screen.getByRole("button", { name: "Nova HE" }));
    expect(screen.getByRole("dialog", { name: "Nova HE" })).toBeInTheDocument();
  });

  it("lista uma autorização carregada da API", async () => {
    stubHe(
      [
        {
          id: "he1",
          matricula: "100",
          professor_nome: "Ana Costa",
          tempos_autorizados: 8,
          tipo: "REAL",
          inicio: "2026-01-01",
          termino: "2026-12-31",
          cargo: "Professor",
          funcao: "Regente",
          ativo: 1,
        },
      ],
      1,
    );
    renderPage(<HoraExtraPage />);
    expect(await screen.findByText("Ana Costa")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
