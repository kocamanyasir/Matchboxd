import { NextRequest, NextResponse } from "next/server";
import { validateLetterboxdUsername } from "@/lib/username-validator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { valid: false, error: "Username is required." },
      { status: 400 }
    );
  }

  const result = await validateLetterboxdUsername(username);
  return NextResponse.json(result);
}
