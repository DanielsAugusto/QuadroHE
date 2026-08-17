import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpCode, verifyTotp } from "../../server/totp.ts";

describe("TOTP (OWASP A07)", () => {
  it("aceita o código atual e rejeita código inválido", () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
    expect(verifyTotp(secret, "abc")).toBe(false);
  });

  it("cifra e recupera o segredo em repouso", async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import(
      "../../server/totp.ts"
    );
    const secret = generateTotpSecret();
    const stored = encryptTotpSecret(secret);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptTotpSecret(stored)).toBe(secret);
  });
});
