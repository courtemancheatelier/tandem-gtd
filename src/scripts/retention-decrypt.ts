/**
 * Decrypt retention export files.
 *
 * Usage:
 *   npx tsx src/scripts/retention-decrypt.ts /path/to/file.json.enc        # Single file
 *   npx tsx src/scripts/retention-decrypt.ts /path/to/retention-exports/    # All .enc files in directory
 */

import { decryptFile } from "../lib/ai/crypto";
import fs from "fs/promises";
import path from "path";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npx tsx src/scripts/retention-decrypt.ts <file.enc | directory>");
    process.exit(1);
  }

  const stat = await fs.stat(target).catch(() => null);
  if (!stat) {
    console.error(`Not found: ${target}`);
    process.exit(1);
  }

  const files: string[] = [];

  if (stat.isDirectory()) {
    const entries = await fs.readdir(target);
    for (const entry of entries) {
      if (entry.endsWith(".enc")) {
        files.push(path.join(target, entry));
      }
    }
    if (files.length === 0) {
      console.log("No .enc files found in directory.");
      process.exit(0);
    }
  } else if (target.endsWith(".enc")) {
    files.push(target);
  } else {
    console.error("File must have .enc extension");
    process.exit(1);
  }

  console.log(`\nDecrypting ${files.length} file(s)...\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const decrypted = await decryptFile(file);
      console.log(`  OK: ${path.basename(file)} -> ${path.basename(decrypted)}`);
      success++;
    } catch (err) {
      console.error(`  FAIL: ${path.basename(file)} - ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} decrypted, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
