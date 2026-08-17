import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ContagensPage } from "@/pages/ContagensPage";
import { renderPage, stubApi } from "./helpers.tsx";

const lotacaoVazia = {
  total: 0,
  normal: 0,
  hora_extra: 0,
  unicas: false,
  escolas: [],
};

describe("Tela: Mapa Estatístico", () => {
  it("mostra título e abas do mapão", async () => {
    stubApi({
      "/lotacao/contagens": lotacaoVazia,
    });
    renderPage(<ContagensPage />);
    expect(
      await screen.findByRole("heading", { name: "Mapa Estatístico" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lotação por escola" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Carências · matéria" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Carências · escola" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nenhuma escola com lotação. Importe professores com o campo escola preenchido.",
      ),
    ).toBeInTheDocument();
  });

  it("carrega carências ao trocar de aba", async () => {
    const user = userEvent.setup();
    stubApi({
      "/lotacao/contagens": lotacaoVazia,
      "/carencias/contagens": {
        total_abertos: 0,
        disciplinas: [],
        escolas: [],
      },
    });
    renderPage(<ContagensPage />);
    await screen.findByRole("heading", { name: "Mapa Estatístico" });
    await user.click(screen.getByRole("button", { name: "Carências · matéria" }));
    expect(
      await screen.findByText("Nenhuma carência em aberto nas escolas da lista."),
    ).toBeInTheDocument();
  });
});
