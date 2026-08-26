import { z } from "zod";

const booleanEnv = z.preprocess((value) => {
  if (value === undefined) return false;
  if (typeof value !== "string") return value;
  const normalized = value.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const hostAllowlistEnv = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return undefined;
    if (typeof value !== "string") return value;
    return value
      .split(",")
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean);
  },
  z.array(z.string().min(1)).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default(process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  TRUST_PROXY: z.string().default(process.env.NODE_ENV === "production" ? "true" : "false"),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_SECRET_PREVIOUS: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),
  NVIDIA_NIM_BASE_URL: z.string().url().optional(),
  NVIDIA_NIM_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  EXEC_CODE_DISABLED: booleanEnv,
  EGRESS_ALLOWED_HOSTS: hostAllowlistEnv,
  MOCK_MCP: booleanEnv.default(true),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.flatten().fieldErrors;
      const msg = Object.entries(formatted)
        .map(([k, v]) => `  ${k}: ${v?.join(", ")}`)
        .join("\n");
      throw new Error(`Invalid environment:\n${msg}`);
    }
    _env = result.data;
  }
  return _env;
}
