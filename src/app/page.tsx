"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MatchboxdHero } from "@/components/MatchboxdHero";
import { ShowreelMatch } from "@/components/ShowreelMatch";
import { ComparisonDashboard } from "@/components/ComparisonDashboard";
import { ComparisonResult } from "@/lib/types";

function MatchboxdApp() {
  const searchParams = useSearchParams();
  const [viewState, setViewState] = useState<"hero" | "showreel" | "dashboard">("hero");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matchData, setMatchData] = useState<ComparisonResult | null>(null);
  const [user1, setUser1] = useState("");
  const [user2, setUser2] = useState("");
  const hasAutoStartedRef = useRef(false);

  const handleStartMatch = async (u1: string, u2: string) => {
    setIsLoading(true);
    setError(null);
    setUser1(u1);
    setUser2(u2);

    // Update query params in the browser URL so it can be copied/shared easily
    if (typeof window !== "undefined") {
      const newUrl = `/?user1=${encodeURIComponent(u1)}&user2=${encodeURIComponent(u2)}`;
      window.history.replaceState({ ...window.history.state }, "", newUrl);
    }

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username1: u1, username2: u2 }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to compare profiles.");
      }

      setMatchData(data);
      setViewState("showreel");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please check the usernames and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // URL Query Parameters Auto-load (?user1=...&user2=... or ?u1=...&u2=...)
  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    const q1 = searchParams.get("user1") || searchParams.get("u1");
    const q2 = searchParams.get("user2") || searchParams.get("u2");

    if (q1 && q2) {
      hasAutoStartedRef.current = true;
      handleStartMatch(q1.trim(), q2.trim());
    }
  }, [searchParams]);

  const handleShowreelComplete = () => {
    setViewState("dashboard");
  };

  const handleReset = () => {
    setMatchData(null);
    setViewState("hero");
    setError(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({ ...window.history.state }, "", "/");
    }
  };

  const paramUser1 = searchParams.get("user1") || searchParams.get("u1") || undefined;
  const paramUser2 = searchParams.get("user2") || searchParams.get("u2") || undefined;

  return (
    <main className="min-h-screen bg-[#14181C]">
      {viewState === "hero" && (
        <MatchboxdHero
          onStartMatch={handleStartMatch}
          isLoading={isLoading}
          error={error}
          initialUser1={paramUser1}
          initialUser2={paramUser2}
        />
      )}

      {viewState === "showreel" && matchData && (
        <ShowreelMatch
          posters={matchData.posters}
          sharedMovies={matchData.sharedMovies}
          topMatch={matchData.topMatch}
          hotTakes={matchData.hotTakes}
          user1Name={matchData.user1.username}
          user2Name={matchData.user2.username}
          user1DisplayName={matchData.user1.displayName}
          user2DisplayName={matchData.user2.displayName}
          user1AvatarUrl={matchData.user1.avatarUrl}
          user2AvatarUrl={matchData.user2.avatarUrl}
          onComplete={handleShowreelComplete}
          isGenreMatchFallback={matchData.isGenreMatchFallback}
        />
      )}

      {viewState === "dashboard" && matchData && (
        <ComparisonDashboard
          result={matchData}
          onReset={handleReset}
        />
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#14181C] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <MatchboxdApp />
    </Suspense>
  );
}
