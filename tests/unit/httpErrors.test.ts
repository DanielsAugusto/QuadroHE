import { describe, expect, it } from "vitest";
import { clientErrorMessage } from "../../server/httpErrors.ts";

describe("clientErrorMessage (OWASP A05)", () => {
  it("repassa mensagem de negócio segura", () => {
    expect(clientErrorMessage(new Error("Selecione uma escola."), "Erro")).toBe(
      "Selecione uma escola.",
    );
  });

  it("esconde erro de constraint do SQLite", () => {
    expect(
      clientErrorMessage(
        new Error("UNIQUE constraint failed: escolas.nome"),
        "Erro ao salvar",
      ),
    ).toBe("Erro ao salvar");
    expect(
      clientErrorMessage(
        new Error("SQLITE_CONSTRAINT: CHECK constraint failed: tipo"),
        "Erro ao salvar",
      ),
    ).toBe("Erro ao salvar");
  });

  it("usa fallback para valor que não é Error", () => {
    expect(clientErrorMessage("boom", "Erro interno")).toBe("Erro interno");
  });
});
