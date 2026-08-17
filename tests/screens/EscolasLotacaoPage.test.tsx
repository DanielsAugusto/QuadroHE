import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EscolasLotacaoPage } from "@/pages/EscolasLotacaoPage";
import { renderPage, stubApi } from "./helpers.tsx";

describe("Tela: Escolas (lotação)", () => {
  it("pede para selecionar escola quando a lista carrega vazia", async () => {
    stubApi({ "/lotacao/escolas": [] });
    renderPage(<EscolasLotacaoPage />);
    expect(
      await screen.findByRole("heading", { name: "Escolas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Importe professores com o campo escola preenchido para ver a lotação.",
      ),
    ).toBeInTheDocument();
  });

  it("lista escolas da lotação no combobox", async () => {
    stubApi({
      "/lotacao/escolas": [
        { nome: "EM Centro", total: 3, hora_extra: 1, normal: 2 },
      ],
    });
    renderPage(<EscolasLotacaoPage />);
    expect(
      await screen.findByRole("heading", { name: "Escolas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
