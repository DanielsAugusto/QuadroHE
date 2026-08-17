import { describe, expect, it } from "vitest";
import {
  repairMojibakeText,
  repairMojibakeValue,
  decodeSpreadsheetText,
} from "../../src/lib/textEncoding.ts";

describe("repairMojibakeText", () => {
  it("retorna null para nulo", () => {
    expect(repairMojibakeText(null)).toBeNull();
    expect(repairMojibakeText(undefined)).toBeNull();
  });

  it("corrige UTF-8 lido como latin1 (Ã§ → ç)", () => {
    expect(repairMojibakeText("EducaÃ§Ã£o")).toBe("Educação");
  });

  it("corrige nomes comuns com replacement char", () => {
    expect(repairMojibakeText("JO\uFFFDO")).toBe("JOÃO");
    expect(repairMojibakeText("MARIC\uFFFD")).toBe("MARICÁ");
    expect(repairMojibakeText("EDUCA\uFFFDAO")).toBe("EDUCAÇÃO");
  });

  it("não altera texto já correto", () => {
    expect(repairMojibakeText("São José")).toBe("São José");
  });
});

describe("repairMojibakeValue", () => {
  it("repara strings em objetos rasos", () => {
    const out = repairMojibakeValue({
      nome: "JO\uFFFDO",
      n: 1,
    }) as Record<string, unknown>;
    expect(out.nome).toBe("JOÃO");
    expect(out.n).toBe(1);
  });
});

describe("decodeSpreadsheetText", () => {
  it("respeita BOM UTF-8", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x42]);
    expect(decodeSpreadsheetText(bom.buffer)).toBe("AB");
  });

  it("prefere windows-1252 quando UTF-8 gera replacement", () => {
    // "ção" em windows-1252: ç=0xE7, ã=0xE3, o=0x6F
    const bytes = new Uint8Array([0x63, 0xe7, 0xe3, 0x6f]); // cção
    const text = decodeSpreadsheetText(bytes.buffer);
    expect(text).toContain("ç");
  });
});
