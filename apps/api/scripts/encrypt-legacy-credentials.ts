import { PrismaClient } from "@prisma/client";
import { encryptCredential } from "../src/lib/crypto.js";

const prisma = new PrismaClient();

function isEncryptedEnvelope(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const envelope = parsed as Record<string, unknown>;
    return typeof envelope.iv === "string" && typeof envelope.ct === "string" && typeof envelope.tag === "string";
  } catch {
    return false;
  }
}

async function main() {
  const credentials = await prisma.credential.findMany({ select: { id: true, data: true } });
  let encrypted = 0;
  let skipped = 0;

  for (const credential of credentials) {
    if (isEncryptedEnvelope(credential.data)) {
      skipped += 1;
      continue;
    }

    try {
      JSON.parse(credential.data);
    } catch {
      console.warn(`Skipping credential ${credential.id}: data is not valid JSON`);
      skipped += 1;
      continue;
    }

    await prisma.credential.update({
      where: { id: credential.id },
      data: { data: encryptCredential(credential.data) },
    });
    encrypted += 1;
  }

  console.log(`Encrypted ${encrypted} legacy credential(s); skipped ${skipped} already encrypted/invalid row(s).`);
}

main()
  .catch((error) => {
    console.error("Legacy credential encryption failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
