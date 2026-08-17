import { describe, expect, it } from "vitest";
import {
  hydrateQuadroRow,
  normalizeTurmas,
  parseTurmasJson,
  turmaLabel,
} from "../../server/quadroTurmas.ts";

describe("normalizeTurmas", () => {
  it("remove vazios, duplicatas e ordena em pt-BR", () => {
    expect(normalizeTurmas(["  201  ", "101", "201", "", null])).toEqual([
      "101",
      "201",
    ]);
  });
});

describe("turmaLabel", () => {
  it("junta códigos com +", () => {
    expect(turmaLabel(["101", "201"])).toBe("101+201");
  });
});

describe("parseTurmasJson", () => {
  it("lê JSON válido", () => {
    expect(parseTurmasJson(JSON.stringify(["201", "101"]))).toEqual([
      "101",
      "201",
    ]);
  });

  it("usa fallback com + quando JSON é inválido", () => {
    expect(parseTurmasJson("nao-e-json", "301+101")).toEqual(["101", "301"]);
  });

  it("retorna lista vazia sem dados", () => {
    expect(parseTurmasJson(null)).toEqual([]);
    expect(parseTurmasJson("")).toEqual([]);
  });
});

describe("hydrateQuadroRow", () => {
  it("expõe turmas e turma_codigo consistentes", () => {
    const row = hydrateQuadroRow({
      id: "q1",
      turma_codigo: "",
      turmas_json: JSON.stringify(["B", "A"]),
    });
    expect(row.turmas).toEqual(["A", "B"]);
    expect(row.turma_codigo).toBe("A+B");
  });
});
