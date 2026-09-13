import * as crypto from "crypto";
import { type OtpRecord, type PairingTokenResult } from "./types.js";

export class OtpPairingManager {
  private codes: Map<string, OtpRecord> = new Map();
  private readonly ttlMs: number;
  private readonly maxAttempts: number;
  private readonly secret: string;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: { ttlMinutes?: number; maxAttempts?: number; secret?: string } = {}) {
    this.ttlMs = (options.ttlMinutes || 5) * 60 * 1000;
    this.maxAttempts = options.maxAttempts || 3;

    // SEC-04: Exigir JWT_SECRET em produção; lançar erro explícito se ausente
    if (options.secret) {
      this.secret = options.secret;
    } else if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
      this.secret = process.env.JWT_SECRET.trim();
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("SEC-04 Fatal: JWT_SECRET environment variable with at least 16 characters is mandatory in production for RemoteBridge OTP security");
    } else {
      // Fallback para desenvolvimento/testes locais: segredo criptográfico aleatório único por instância
      this.secret = crypto.randomBytes(32).toString("hex");
    }

    // Limpeza periódica de OTPs expirados a cada 1 minuto
    this.cleanupTimer = setInterval(() => {
      this.cleanExpiredOtps();
    }, 60 * 1000);

    const timer = this.cleanupTimer as unknown as { unref?: () => void };
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  /**
   * Remove registros expirados ou já queimados da memória
   */
  public cleanExpiredOtps(): void {
    const now = Date.now();
    for (const [code, record] of this.codes.entries()) {
      if (now > record.expiresAt || record.burned) {
        this.codes.delete(code);
      }
    }
  }

  /**
   * Encerra o timer de cleanup
   */
  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.codes.clear();
  }

  /**
   * Gera código OTP de 6 dígitos numéricos com expiração de 5 minutos
   */
  public generateOtp(params: { orgId: string; userId: string }): { code: string; expiresAt: string } {
    this.cleanExpiredOtps();

    // 6 dígitos numéricos aleatórios, evitando colisões com códigos ainda válidos
    let code = "";
    let attempts = 0;
    do {
      code = Math.floor(100000 + crypto.randomInt(900000)).toString();
      attempts++;
    } while (this.codes.has(code) && attempts < 10);

    const now = Date.now();
    const expiresAt = now + this.ttlMs;

    const record: OtpRecord = {
      code,
      orgId: params.orgId,
      userId: params.userId,
      createdAt: now,
      expiresAt,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      burned: false,
    };

    this.codes.set(code, record);

    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Valida código OTP com limite de 3 tentativas e queima imediata (single-use)
   */
  public verifyAndBurnOtp(code: string): PairingTokenResult {
    this.cleanExpiredOtps();

    const record = this.codes.get(code);
    const now = Date.now();

    if (!record) {
      throw new Error("Invalid or unknown pairing code");
    }

    if (record.burned) {
      this.codes.delete(code);
      throw new Error("Pairing code has already been used");
    }

    if (now > record.expiresAt) {
      this.codes.delete(code);
      throw new Error("Pairing code has expired");
    }

    record.attempts += 1;

    if (record.attempts > record.maxAttempts) {
      record.burned = true;
      this.codes.delete(code);
      throw new Error("Maximum verification attempts exceeded. Code revoked.");
    }

    // Marca como usado (burn) e remove
    record.burned = true;
    this.codes.delete(code);

    // Emite token de pareamento assinado
    const tokenPayload = `${record.userId}:${record.orgId}:${now}:${now + 30 * 24 * 60 * 60 * 1000}`;
    const signature = crypto.createHmac("sha256", this.secret).update(tokenPayload).digest("hex");
    const token = Buffer.from(`${tokenPayload}:${signature}`).toString("base64url");

    return {
      token,
      expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      orgId: record.orgId,
      userId: record.userId,
    };
  }

  /**
   * Valida o token de pareamento do cliente usando timingSafeEqual
   */
  public verifyPairingToken(token: string): { userId: string; orgId: string; valid: boolean } {
    try {
      const decoded = Buffer.from(token, "base64url").toString("utf8");
      const parts = decoded.split(":");
      if (parts.length !== 5) return { userId: "", orgId: "", valid: false };

      const [userId, orgId, issuedAt, expiresAt, signature] = parts;
      const expectedSig = crypto
        .createHmac("sha256", this.secret)
        .update(`${userId}:${orgId}:${issuedAt}:${expiresAt}`)
        .digest("hex");

      const sigBuffer = Buffer.from(signature, "hex");
      const expectedSigBuffer = Buffer.from(expectedSig, "hex");

      if (
        sigBuffer.length !== expectedSigBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
      ) {
        return { userId: "", orgId: "", valid: false };
      }

      if (Date.now() > parseInt(expiresAt, 10)) {
        return { userId: "", orgId: "", valid: false };
      }

      return { userId, orgId, valid: true };
    } catch {
      return { userId: "", orgId: "", valid: false };
    }
  }
}
