import { NextRequest, NextResponse } from "next/server";
import {
  compareUserProfiles,
  resolveUsernameAsync,
  validateLetterboxdUsername,
} from "@/lib/letterboxd";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username1, username2 } = body;

    if (!username1 || !username2) {
      return NextResponse.json(
        { error: "Both usernames are required." },
        { status: 400 }
      );
    }

    const cleanUser1 = await resolveUsernameAsync(username1);
    const cleanUser2 = await resolveUsernameAsync(username2);

    if (!cleanUser1 || !cleanUser2) {
      return NextResponse.json(
        { error: "Please enter valid Letterboxd usernames or links." },
        { status: 400 }
      );
    }

    if (cleanUser1.toLowerCase() === cleanUser2.toLowerCase()) {
      return NextResponse.json(
        { error: "Please enter two different Letterboxd usernames." },
        { status: 400 }
      );
    }

    // Pre-flight hafif doğrulama: Ağır Chromium başlatılmadan önce her iki kullanıcı hızlıca HTTP üzerinden kontrol edilir
    const [v1, v2] = await Promise.all([
      validateLetterboxdUsername(cleanUser1),
      validateLetterboxdUsername(cleanUser2),
    ]);

    if (!v1.valid) {
      return NextResponse.json(
        { error: v1.error || `@${cleanUser1} profili bulunamadı.` },
        { status: 400 }
      );
    }
    if (!v2.valid) {
      return NextResponse.json(
        { error: v2.error || `@${cleanUser2} profili bulunamadı.` },
        { status: 400 }
      );
    }

    const result = await compareUserProfiles(cleanUser1, cleanUser2, { signal: req.signal });
    return NextResponse.json(result);
  } catch (err: any) {
    if (req.signal.aborted || err.message?.includes("Aborted") || err.message?.includes("iptal edildi")) {
      return NextResponse.json({ error: "İstek iptal edildi." }, { status: 499 });
    }

    const isQueueTimeout =
      err.message && (err.message.includes("yoğun") || err.message.includes("timeout"));
    if (isQueueTimeout) {
      return NextResponse.json(
        { error: "Sunucu şu an çok yoğun. Lütfen 30 saniye sonra tekrar deneyin." },
        { status: 503 }
      );
    }

    console.error("Match API error:", err);
    const isUserError =
      err.message &&
      (err.message.includes("gizli") ||
        err.message.includes("bulunamadı") ||
        err.message.includes("not found") ||
        err.message.includes("valid"));
    return NextResponse.json(
      { error: err.message || "Failed to compare Letterboxd accounts." },
      { status: isUserError ? 400 : 500 }
    );
  }
}
