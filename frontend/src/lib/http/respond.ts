import { NextResponse } from "next/server";

export function jsonError(detail: string, status = 400) {
  return NextResponse.json({ detail }, { status });
}
