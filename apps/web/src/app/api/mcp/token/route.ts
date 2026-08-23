import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST() {
  const randomChars = crypto.randomBytes(16).toString("hex");
  const token = `af_${randomChars}`;
  return NextResponse.json({
    success: true,
    token,
    createdAt: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/mcp/token",
  });
}
