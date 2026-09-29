import { NextRequest, NextResponse } from "next/server";
import { fetchUserWatchlist, buildWatchlistRecommendations } from "@/lib/letterboxd";
import { resolveUsernameAsync } from "@/lib/username-validator";
import { b1GetUserCache } from "@/lib/b1-cache";
import { WatchlistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user1 = searchParams.get("user1");
    const user2 = searchParams.get("user2");

    if (!user1 && !user2) {
      return NextResponse.json({ error: "At least one username is required." }, { status: 400 });
    }

    const cleanUser1 = user1 ? await resolveUsernameAsync(user1) : "";
    const cleanUser2 = user2 ? await resolveUsernameAsync(user2) : "";

    const [w1, w2] = await Promise.all([
      cleanUser1 ? fetchUserWatchlist(cleanUser1).catch(() => []) : Promise.resolve([]),
      cleanUser2 ? fetchUserWatchlist(cleanUser2).catch(() => []) : Promise.resolve([]),
    ]);

    const user1Cache = cleanUser1 ? b1GetUserCache(cleanUser1) : null;
    const user2Cache = cleanUser2 ? b1GetUserCache(cleanUser2) : null;

    const recs = await buildWatchlistRecommendations(
      w1,
      w2,
      user1Cache?.profileDetails?.displayName || cleanUser1,
      user2Cache?.profileDetails?.displayName || cleanUser2,
      user1Cache?.profileDetails?.avatarUrl,
      user2Cache?.profileDetails?.avatarUrl,
      user1Cache?.films,
      user2Cache?.films
    );

    return NextResponse.json({
      recommendations: recs,
      user1Watchlist: w1,
      user2Watchlist: w2,
    });
  } catch (err: any) {
    console.error("Watchlist API error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch watchlist" }, { status: 500 });
  }
}
