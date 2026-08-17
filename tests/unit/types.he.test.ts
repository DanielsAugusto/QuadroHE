import { describe, expect, it } from "vitest";
import {
  formatDateBR,
  isHeAtiva,
  isHeExpirada,
  isHeVigente,
  isLicencaAtiva,
  todayISO,
} from "../../src/lib/types.ts";

describe("todayISO", () => {
  it("formata YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 7, 17))).toBe("2026-08-17");
  });
});

describe("formatDateBR", () => {
  it("converte ISO para dd/mm/aaaa", () => {
    expect(formatDateBR("2026-08-17")).toBe("17/08/2026");
  });

  it("usa travessão quando vazio", () => {
    expect(formatDateBR(null)).toBe("—");
    expect(formatDateBR("")).toBe("—");
  });
});

describe("isHeAtiva / isHeVigente / isHeExpirada", () => {
  const hoje = new Date(2026, 7, 17);

  it("trata ativo nulo como ativo", () => {
    expect(isHeAtiva({ ativo: null })).toBe(true);
    expect(isHeAtiva({ ativo: 0 })).toBe(false);
  });

  it("HE vigente no dia do término", () => {
    expect(
      isHeVigente(
        { inicio: "2026-01-01", termino: "2026-08-17", ativo: 1 },
        hoje,
      ),
    ).toBe(true);
  });

  it("HE expirada a partir do dia seguinte ao término", () => {
    expect(
      isHeExpirada({ termino: "2026-08-16", ativo: 1 }, hoje),
    ).toBe(true);
    expect(
      isHeExpirada({ termino: "2026-08-17", ativo: 1 }, hoje),
    ).toBe(false);
  });

  it("inativa não conta como expirada", () => {
    expect(
      isHeExpirada({ termino: "2026-01-01", ativo: 0 }, hoje),
    ).toBe(false);
  });
});

describe("isLicencaAtiva", () => {
  it("nulo/undefined conta como ativa", () => {
    expect(isLicencaAtiva({ ativo: null })).toBe(true);
    expect(isLicencaAtiva({ ativo: undefined })).toBe(true);
    expect(isLicencaAtiva({ ativo: 0 })).toBe(false);
    expect(isLicencaAtiva({ ativo: false })).toBe(false);
  });
});
