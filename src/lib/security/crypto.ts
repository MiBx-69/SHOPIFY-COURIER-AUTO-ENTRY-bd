import crypto from "node:crypto";
import { serverEnv } from "@/lib/env";

export type Ciphertext = { ciphertext: string; iv: string; authTag: string };
function key() {
  const result = Buffer.from(serverEnv().ENCRYPTION_KEY, "base64");
  if (result.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return result;
}
export function encryptSecret(value: Record<string, string>): Ciphertext {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}
export function decryptSecret(secret: Ciphertext): Record<string, string> {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64")), decipher.final()]).toString("utf8")) as Record<string, string>;
}
