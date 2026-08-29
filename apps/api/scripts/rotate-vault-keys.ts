import { z } from "zod";
import { LocalKmsProvider, KmsManager } from "../src/services/vault/kms.js";

const rotationConfigSchema = z
  .object({
    newKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
    newKeyVersion: z.coerce.number().int().positive().optional(),
    targetVersion: z.coerce.number().int().positive().optional(),
    orgId: z.string().min(1).optional(),
    batchSize: z.coerce.number().int().min(1).max(1_000).default(100),
  })
  .superRefine((value, ctx) => {
    if (value.newKeyHex && value.targetVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose either KMS_NEW_KEY_HEX or KMS_TARGET_KEY_VERSION, not both",
      });
    }
  });

const config = rotationConfigSchema.parse({
  newKeyHex: process.env.KMS_NEW_KEY_HEX,
  newKeyVersion: process.env.KMS_NEW_KEY_VERSION,
  targetVersion: process.env.KMS_TARGET_KEY_VERSION,
  orgId: process.env.KMS_ROTATION_ORG_ID,
  batchSize: process.env.KMS_ROTATION_BATCH_SIZE,
});

const provider = new LocalKmsProvider();
const manager = new KmsManager(provider);

let targetVersion = config.targetVersion ?? provider.getCurrentKeyVersion();
if (config.newKeyHex) {
  targetVersion = manager.rotateMasterKey(config.newKeyHex, config.newKeyVersion).version;
}

if (!provider.getAllVersions().includes(targetVersion)) {
  throw new Error(
    `KMS target version ${targetVersion} is unavailable. Configure CREDENTIAL_ENCRYPTION_KEY_V${targetVersion}.`,
  );
}

const result = await manager.reencryptVaultCredentials({
  targetVersion,
  orgId: config.orgId,
  batchSize: config.batchSize,
});

// Never print key material; this output is safe for CI/audit logs.
console.log(JSON.stringify({
  event: "vault.kms.rotation.completed",
  provider: provider.name,
  ...result,
}));

if (result.failed > 0) process.exitCode = 1;
