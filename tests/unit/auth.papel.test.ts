import { describe, expect, it } from "vitest";
import { normalizePapel } from "../../server/auth.ts";

describe("normalizePapel", () => {
  it("reconhece admin (case-insensitive)", () => {
    expect(normalizePapel("admin")).toBe("admin");
    expect(normalizePapel("ADMIN")).toBe("admin");
    expect(normalizePapel(" Admin ")).toBe("admin");
  });

  it("falha fechada: qualquer outro valor vira operador", () => {
    expect(normalizePapel("operador")).toBe("operador");
    expect(normalizePapel("superadmin")).toBe("operador");
    expect(normalizePapel("admin; drop table")).toBe("operador");
    expect(normalizePapel("")).toBe("operador");
    expect(normalizePapel(null)).toBe("operador");
    expect(normalizePapel({ papel: "admin" })).toBe("operador");
  });
});
