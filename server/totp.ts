import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const WINDOW = 1;

function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPH[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}

function decodeBase32(secret: string): Buffer {
  const s = secret
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = ALPH.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpCode(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  return hotp(decodeBase32(secret), counter);
}

export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const expected = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(expected)) return false;
  let secretBuf: Buffer;
  try {
    secretBuf = decodeBase32(secret);
  } catch {
    return false;
  }
  if (secretBuf.length < 10) return false;
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const target = Buffer.from(expected);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const cand = Buffer.from(hotp(secretBuf, counter + i));
    if (cand.length === target.length && timingSafeEqual(cand, target)) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`QuadroHE:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: "QuadroHE",
    algorithm: "SHA1",
    digits: "6",
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function mfaKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado");
  return createHash("sha256").update(secret).digest();
}

/** Cifra o segredo TOTP em repouso (AES-256-GCM). */
export function encryptTotpSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

/** Falha fechada: valor ilegível vira string vazia (TOTP recusa). */
export function decryptTotpSecret(stored: string): string {
  const raw = String(stored ?? "").trim();
  if (!raw) return "";
  if (!raw.startsWith("v1:")) return raw;
  try {
    const parts = raw.split(":");
    if (parts.length !== 4) return "";
    const iv = Buffer.from(parts[1] ?? "", "base64url");
    const tag = Buffer.from(parts[2] ?? "", "base64url");
    const enc = Buffer.from(parts[3] ?? "", "base64url");
    const decipher = createDecipheriv("aes-256-gcm", mfaKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return "";
  }
}
