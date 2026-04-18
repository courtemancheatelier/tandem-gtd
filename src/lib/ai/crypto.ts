import crypto from "crypto";
import fs from "fs/promises";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Falls back to NEXTAUTH_SECRET if TANDEM_ENCRYPTION_KEY is not set.
 * Key is hashed to ensure correct length for AES-256.
 */
function getKey(): Buffer {
  const secret = process.env.TANDEM_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("TANDEM_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a string value (e.g., API key).
 * Returns a base64 string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Pack: IV (16) + tag (16) + ciphertext
  const packed = Buffer.concat([
    iv,
    tag,
    Buffer.from(encrypted, "hex"),
  ]);

  return packed.toString("base64");
}

/**
 * Decrypt a value previously encrypted with encrypt().
 * Returns null if decryption fails (wrong key, corrupted data).
 */
export function decrypt(encryptedBase64: string): string | null {
  try {
    const key = getKey();
    const packed = Buffer.from(encryptedBase64, "base64");

    const iv = packed.subarray(0, IV_LENGTH);
    const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext.toString("hex"), "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Encrypt a file in-place using AES-256-GCM.
 * Writes IV + auth tag + ciphertext as raw binary with .enc extension.
 * Deletes the original plaintext file after encryption.
 * Returns the path to the encrypted file.
 */
export async function encryptFile(filePath: string): Promise<string> {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = await fs.readFile(filePath);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack: IV (16) + tag (16) + ciphertext
  const packed = Buffer.concat([iv, tag, encrypted]);

  const encPath = filePath + ".enc";
  await fs.writeFile(encPath, packed);
  await fs.unlink(filePath);

  return encPath;
}

/**
 * Decrypt a file previously encrypted with encryptFile().
 * Reads IV + auth tag + ciphertext, writes decrypted content.
 * Returns the path to the decrypted file (original name without .enc).
 */
export async function decryptFile(encPath: string): Promise<string> {
  const key = getKey();
  const packed = await fs.readFile(encPath);

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const outPath = encPath.replace(/\.enc$/, "");
  await fs.writeFile(outPath, decrypted);

  return outPath;
}
