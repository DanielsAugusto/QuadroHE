import { describe, expect, it } from "vitest";
import {
  bcryptRounds,
  isWeakAdminPassword,
} from "../../server/passwordPolicy.ts";

describe("isWeakAdminPassword (TDD: política do primeiro admin)", () => {
  it("rejeita senha com menos de 12 caracteres", () => {
    expect(isWeakAdminPassword("curta")).toBe(true);
    expect(isWeakAdminPassword("12345678901")).toBe(true);
  });

  it("rejeita senhas de exemplo mesmo longas o bastante", () => {
    expect(isWeakAdminPassword("defina-uma-senha-forte")).toBe(true);
    expect(isWeakAdminPassword("troque-esta-senha")).toBe(true);
    expect(isWeakAdminPassword("ADMIN123")).toBe(true);
  });

  it("aceita senha aleatória com 12+ caracteres", () => {
    expect(isWeakAdminPassword("Kj8#mP2wQx9!")).toBe(false);
    expect(isWeakAdminPassword("NaoECredencial99")).toBe(false);
  });
});

describe("bcryptRounds", () => {
  it("usa 12 por padrão quando o env é inválido", () => {
    const prev = process.env.BCRYPT_ROUNDS;
    try {
      process.env.BCRYPT_ROUNDS = "1";
      expect(bcryptRounds()).toBe(12);
      process.env.BCRYPT_ROUNDS = "abc";
      expect(bcryptRounds()).toBe(12);
    } finally {
      process.env.BCRYPT_ROUNDS = prev;
    }
  });
});
