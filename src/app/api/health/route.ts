import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/health → { status: "ok" }. Sem banco, sem auth: só prova que o processo responde. */
export async function GET() {
  return NextResponse.json({ status: "ok", service: "rids" });
}
