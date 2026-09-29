"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MatchedMovie, MIN_HOT_TAKE_DIFF } from "@/lib/types";
import { Trophy, ArrowRight, Sparkles, Film, Sparkle } from "lucide-react";
import { LetterboxdStars } from "./LetterboxdStars";
import { getLetterboxdUrl, LETTERBOXD_DEFAULT_POSTER } from "@/lib/letterboxd";
import confetti from "canvas-confetti";

interface ShowreelMatchProps {
  posters: string[];
  sharedMovies?: MatchedMovie[];
  topMatch: MatchedMovie | null;
  hotTakes?: MatchedMovie[];
  user1Name: string;
  user2Name: string;
  user1DisplayName?: string;
  user2DisplayName?: string;
  user1AvatarUrl?: string;
  user2AvatarUrl?: string;
  onComplete: () => void;
  isGenreMatchFallback?: boolean;
}

const DEFAULT_AVATAR = "/empty-avatar.webp";

const PosterImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = "" }) => {
  const [useProxy, setUseProxy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUseProxy(false);
    setFailed(false);
  }, [src]);

  const isPlaceholder = !src || src.includes("empty-poster") || src.includes("spacer.gif");

  if (failed || isPlaceholder) {
    return (
      <div
        className={`bg-gradient-to-br from-[#1E262F] via-[#141A1F] to-[#0E1317] border border-[#2C3440]/60 flex flex-col items-center justify-center p-2.5 text-center select-none w-full h-full relative overflow-hidden group ${className}`}
      >
        <div className="absolute inset-0 bg-radial from-[#00E054]/5 to-transparent pointer-events-none" />
        <Film className="w-6 h-6 text-[#00E054]/70 mb-1.5 shrink-0 transition-transform group-hover:scale-110" />
        <span className="text-[10px] font-bold text-white/90 leading-tight line-clamp-2 px-1">
          {alt}
        </span>
      </div>
    );
  }

  const currentSrc = useProxy
    ? `https://wsrv.nl/?url=${encodeURIComponent(src)}&output=webp`
    : src;

  return (
    <img
      src={currentSrc}
      alt={alt}
      loading="eager"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useProxy && src.startsWith("http")) {
          setUseProxy(true);
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );
};

export const ShowreelMatch: React.FC<ShowreelMatchProps> = ({
  posters,
  sharedMovies = [],
  topMatch,
  hotTakes,
  user1Name,
  user2Name,
  user1DisplayName,
  user2DisplayName,
  user1AvatarUrl,
  user2AvatarUrl,
  onComplete,
  isGenreMatchFallback = false,
}) => {
  // Animation Phases: 'entrance' | 'orbiting' | 'slowing' | 'spotlight'
  const [phase, setPhase] = useState<"entrance" | "orbiting" | "slowing" | "spotlight">("entrance");
  const [batchIndex, setBatchIndex] = useState(0);

  // 1. HOT TAKE VERİ TESPİTİ:
  // İki kullanıcının da puan verdiği filmler arasından puan farkı en yüksek olanı (Math.abs(rating1 - rating2)) bul
  const hotTakeFilm = React.useMemo(() => {
    const candidates = sharedMovies.filter(
      (m) =>
        m.user1Rating !== null &&
        m.user2Rating !== null &&
        typeof m.user1Rating === "number" &&
        typeof m.user2Rating === "number" &&
        !isNaN(m.user1Rating) &&
        !isNaN(m.user2Rating) &&
        m.user1Rating > 0 &&
        m.user2Rating > 0
    );

    if (candidates.length === 0) {
      if (hotTakes && hotTakes.length > 0) {
        const topH = hotTakes[0];
        const diff = Math.abs(Number(topH.user1Rating) - Number(topH.user2Rating));
        if (diff >= MIN_HOT_TAKE_DIFF) return topH;
      }
      return null;
    }

    const sorted = [...candidates].sort((a, b) => {
      const diffA = Math.abs(Number(a.user1Rating) - Number(a.user2Rating));
      const diffB = Math.abs(Number(b.user1Rating) - Number(b.user2Rating));
      if (diffB !== diffA) return diffB - diffA;
      return b.averageRating - a.averageRating;
    });

    const diff = Math.abs(Number(sorted[0].user1Rating) - Number(sorted[0].user2Rating));
    if (diff < MIN_HOT_TAKE_DIFF) {
      return null;
    }

    return sorted[0];
  }, [sharedMovies, hotTakes]);

  const name1 = user1DisplayName || user1Name;
  const name2 = user2DisplayName || user2Name;

  // Build movie pool DIRECTLY from sharedMovies array (preserving full MatchedMovie objects and unique slugs)
  const basePool: MatchedMovie[] =
    sharedMovies.length > 0
      ? sharedMovies
      : posters.filter(Boolean).map((p, idx) => ({
          filmTitle: `Film ${idx + 1}`,
          posterUrl: p,
          slug: `poster-fallback-${idx}`,
          ratingDiff: 0,
          averageRating: 0,
          user1Rating: null,
          user2Rating: null,
          letterboxdUrl: "https://letterboxd.com/",
        }));

  // Pad movie pool array to ensure continuous flow across all 8 slots
  const minSize = 16;
  const multiplier = Math.max(1, Math.ceil(minSize / (basePool.length || 1)));
  const moviePool: MatchedMovie[] = [];
  for (let i = 0; i < multiplier; i++) {
    if (basePool.length > 0) moviePool.push(...basePool);
  }

  // Center badge ref and dynamic width measurement for adaptive orbit radius
  const badgeRef = useRef<HTMLDivElement>(null);
  const [badgeWidth, setBadgeWidth] = useState<number>(0);

  // Initial estimate so cards have proper spacing on the very first frame
  const estimatedBadgeWidth = Math.max(300, (name1.length + name2.length) * 11 + 90);
  const effectiveBadgeWidth = badgeWidth > 0 ? badgeWidth : estimatedBadgeWidth;

  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!badgeRef.current) return;
    const updateWidth = () => {
      if (badgeRef.current) {
        setBadgeWidth(badgeRef.current.offsetWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(badgeRef.current);
    return () => observer.disconnect();
  }, [name1, name2]);

  // Orbit radius dynamically calculated based on center badge width:
  // (effectiveBadgeWidth / 2) + cardHalfWidth (~60px) + desiredGap (~36px) = +96px
  // Ensures posters never touch or scrape the center badge at any rotation angle
  const radius = Math.max(240, Math.round(effectiveBadgeWidth / 2 + 96));
  const SLOT_COUNT = 8;

  // Phase transition timeline
  useEffect(() => {
    // 1. Entrance -> Orbiting at 0.6s
    const t1 = setTimeout(() => {
      setPhase("orbiting");
    }, 600);

    // 2. Orbiting -> Slowing down at 5.5s
    const t2 = setTimeout(() => {
      setPhase("slowing");
    }, 5500);

    // 3. Slowing -> Spotlight showcase at 7.5s
    const t3 = setTimeout(() => {
      setPhase("spotlight");
      confetti({
        particleCount: 130,
        spread: 95,
        origin: { y: 0.45 },
        colors: ["#00E054", "#FF8000", "#40BCF4"],
      });
    }, 7500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Sequential 8-film batch stream: swaps whole 8-film groups (1st 8, 2nd 8, 3rd 8...) every 1.0s
  useEffect(() => {
    if (phase === "spotlight" || basePool.length <= SLOT_COUNT) return;

    const interval = setInterval(() => {
      setBatchIndex((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, basePool.length]);

  return (
    <div className="relative h-screen w-full bg-[#14181C] flex flex-col items-center justify-between p-4 md:p-6 overflow-hidden select-none">
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 bg-radial from-[#1B2228]/80 to-[#14181C] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[750px] bg-gradient-to-tr from-[#00E054]/15 via-[#FF8000]/15 to-[#40BCF4]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* STAGE 1: ORBIT SHOWREEL (ENTRANCE / ORBITING / SLOWING) */}
      {phase !== "spotlight" && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
          <div className="relative w-full h-full max-w-5xl max-h-[700px] flex items-center justify-center">
            
            {/* CENTER USERNAMES BADGE */}
            <motion.div
              ref={badgeRef}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="absolute z-30 flex flex-col items-center justify-center bg-[#1B2228]/95 border border-[#2C3440] px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md text-center w-auto max-w-[92vw]"
            >
              <div className="flex items-center justify-center text-[11px] font-bold text-[#00E054] tracking-wider uppercase mb-1">
                <span>MATCHBOXD COMPARISON</span>
              </div>
              <div className="flex items-center space-x-2 text-base md:text-lg font-extrabold text-white whitespace-nowrap">
                <span className="text-[#00E054]" title={name1}>{name1}</span>
                <span className="text-[#FF8000] text-xs font-black shrink-0">✕</span>
                <span className="text-[#40BCF4]" title={name2}>{name2}</span>
              </div>
              
              {/* Dynamic Status Text */}
              <div className="flex items-center justify-center space-x-1.5 text-[11px] text-[#9AB0C6] mt-1.5 font-medium whitespace-nowrap">
                <Film className="w-3 h-3 text-[#FF8000] animate-spin" />
                <span>
                  {phase === "slowing"
                    ? "Selecting highest rated shared film..."
                    : isGenreMatchFallback
                    ? `${sharedMovies.length} Shared Activities Streaming...`
                    : `${sharedMovies.length} Shared Films Streaming...`}
                </span>
              </div>
            </motion.div>

            {/* SMOOTH ORBIT RING DIRECTLY FED BY SHARED MOVIES */}
            <motion.div
              animate={{
                rotate: phase === "slowing" ? [0, 720] : [0, 360],
              }}
              transition={
                phase === "slowing"
                  ? { duration: 2.0, ease: "easeOut" }
                  : { repeat: Infinity, duration: 10, ease: "linear" }
              }
              style={{
                width: radius * 2,
                height: radius * 2,
              }}
              className="relative flex items-center justify-center pointer-events-none"
            >
              {Array.from({ length: SLOT_COUNT }).map((_, index) => {
                const angle = (index / SLOT_COUNT) * Math.PI * 2;
                const targetX = Math.cos(angle) * radius;
                const targetY = Math.sin(angle) * radius;

                // Sequential batch streaming: 1st 8 [0..7], 2nd 8 [8..15], 3rd 8 [16..23]...
                const movieIndex = (batchIndex * SLOT_COUNT + index) % (basePool.length || 1);
                const movie = basePool[movieIndex];
                const posterUrl = movie?.posterUrl || LETTERBOXD_DEFAULT_POSTER;
                const filmTitle = movie?.filmTitle || "Movie Poster";
                // Slot-based unique key per batch to trigger smooth batch entrance
                const slotKey = movie?.slug
                  ? `${movie.slug}-b${batchIndex}-s${index}`
                  : `slot-b${batchIndex}-s${index}`;

                return (
                  <div
                    key={index}
                    style={{
                      transform: `translate(${targetX}px, ${targetY}px)`,
                      transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                    className="absolute z-10"
                  >
                    {/* Counter-rotate card so posters remain upright while ring spins */}
                    <motion.div
                      animate={{
                        rotate: phase === "slowing" ? [0, -720] : [0, -360],
                      }}
                      transition={
                        phase === "slowing"
                          ? { duration: 2.0, ease: "easeOut" }
                          : { repeat: Infinity, duration: 10, ease: "linear" }
                      }
                      className="w-24 h-36 md:w-[118px] md:h-44 rounded-xl overflow-hidden border-2 border-[#2C3440] shadow-2xl bg-[#1B2228] pointer-events-auto"
                    >
                      <motion.div
                        key={slotKey}
                        initial={{ opacity: 0.2, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="w-full h-full"
                      >
                        <PosterImage
                          src={posterUrl}
                          alt={filmTitle}
                          className="w-full h-full object-cover"
                        />
                      </motion.div>
                    </motion.div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>
      )}

      {/* STAGE 2: FINAL SPOTLIGHT SHOWCASE */}
      {phase === "spotlight" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 overflow-y-auto select-none"
        >
          {/* Ambient Background Posters Grid */}
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none blur-md scale-90">
            <div className="grid grid-cols-4 gap-6">
              {moviePool.slice(0, 8).map((m, idx) => (
                <div key={m.slug ? `${m.slug}-${idx}` : idx} className="w-24 h-36 rounded-lg overflow-hidden border border-white/20">
                  <PosterImage src={m.posterUrl} alt={m.filmTitle || "Film"} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>

          {topMatch ? (
            /* Central Spotlight Content Container (Single or Dual Cards) */
            <div className="relative z-20 flex flex-col items-center justify-center my-auto w-full max-w-4xl py-4 sm:py-6 space-y-6">
              {/* Cards Grid: Desktop 2'li grid (grid-cols-2), mobilde alt alta */}
              <div
                className={`w-full ${
                  hotTakeFilm
                    ? "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 justify-items-center items-start"
                    : "flex justify-center"
                }`}
              >
                {/* 1. KART: MUTUAL FAVORITE SHARED FILM (YEŞİL TEMA) */}
                <div className="flex flex-col items-center text-center space-y-3.5 md:space-y-4 w-full max-w-sm">
                  {/* Poster */}
                  <motion.a
                    href={getLetterboxdUrl(topMatch)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${topMatch.filmTitle} on Letterboxd`}
                    initial={{ scale: 0.7, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 90, damping: 15 }}
                    className="relative z-50 w-[180px] h-[270px] sm:w-[200px] sm:h-[300px] rounded-2xl overflow-hidden border-2 border-[#00E054] shadow-[0_0_65px_rgba(0,224,84,0.7)] shrink-0 cursor-pointer group hover:scale-[1.03] transition-transform"
                  >
                    <PosterImage
                      src={topMatch.posterUrl}
                      alt={topMatch.filmTitle}
                      className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                    />
                  </motion.a>

                  {/* Details Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="w-full flex flex-col items-center space-y-2.5"
                  >
                    {/* Badge */}
                    <div className="flex items-center space-x-2 bg-[#00E054]/10 border border-[#00E054]/30 px-3.5 py-1 rounded-full text-[#00E054] text-[11px] font-bold tracking-wider shadow-md">
                      {isGenreMatchFallback || topMatch.isRecommendation ? (
                        <>
                          <Sparkle className="w-3.5 h-3.5 text-[#00E054]" />
                          <span>FEATURED PROFILE ACTIVITY</span>
                        </>
                      ) : (
                        <>
                          <Trophy className="w-3.5 h-3.5 text-[#00E054]" />
                          <span>MUTUAL FAVORITES</span>
                        </>
                      )}
                    </div>

                    {/* Movie Title */}
                    <h2 className="text-lg md:text-xl font-extrabold text-white leading-tight px-1 line-clamp-2">
                      {topMatch.filmTitle}
                    </h2>

                    {/* User Ratings Box: Her iki kullanıcı da | ayıracının kendi tarafına ortalanır */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-[#1B2228] border border-[#2C3440] px-2.5 py-2.5 rounded-xl shadow-xl w-full">
                      {/* User 1: Kendi sol alanına tam ortalı */}
                      <div className="flex items-center justify-center space-x-2.5 w-full">
                        <div className="w-8 h-8 rounded-full bg-[#14181C] border-2 border-[#00E054] overflow-hidden flex items-center justify-center font-bold text-xs text-[#00E054] shrink-0 shadow-md">
                          <img
                            src={user1AvatarUrl || DEFAULT_AVATAR}
                            alt={name1}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_AVATAR;
                            }}
                          />
                        </div>
                        <div className="space-y-0.5 text-left min-w-0">
                          <span className="block text-[11px] text-white font-bold truncate max-w-[95px]" title={name1}>
                            {name1}
                          </span>
                          <LetterboxdStars rating={topMatch.user1Rating} color="#00E054" size="w-3 h-3" showScoreText />
                        </div>
                      </div>

                      <div className="h-7 w-px bg-[#2C3440]" />

                      {/* User 2: Kendi sağ alanına tam ortalı */}
                      <div className="flex items-center justify-center space-x-2.5 w-full">
                        <div className="w-8 h-8 rounded-full bg-[#14181C] border-2 border-[#40BCF4] overflow-hidden flex items-center justify-center font-bold text-xs text-[#40BCF4] shrink-0 shadow-md">
                          <img
                            src={user2AvatarUrl || DEFAULT_AVATAR}
                            alt={name2}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_AVATAR;
                            }}
                          />
                        </div>
                        <div className="space-y-0.5 text-left min-w-0">
                          <span className="block text-[11px] text-white font-bold truncate max-w-[95px]" title={name2}>
                            {name2}
                          </span>
                          <LetterboxdStars rating={topMatch.user2Rating} color="#FF8000" size="w-3 h-3" showScoreText />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* 2. KART: HOT TAKE / BIGGEST DISAGREEMENT (TURUNCU/KIRMIZI ATEŞ TEMASI) */}
                {hotTakeFilm && (
                  <div className="flex flex-col items-center text-center space-y-3.5 md:space-y-4 w-full max-w-sm">
                    {/* Hot Take Poster with Orange Glow */}
                    <motion.a
                      href={getLetterboxdUrl(hotTakeFilm)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${hotTakeFilm.filmTitle} on Letterboxd`}
                      initial={{ scale: 0.7, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 90, damping: 15, delay: 0.1 }}
                      className="relative z-50 w-[180px] h-[270px] sm:w-[200px] sm:h-[300px] rounded-2xl overflow-hidden border-2 border-[#FF8000] shadow-[0_0_65px_rgba(255,128,0,0.65)] shrink-0 cursor-pointer group hover:scale-[1.03] transition-transform"
                    >
                      <PosterImage
                        src={hotTakeFilm.posterUrl}
                        alt={hotTakeFilm.filmTitle}
                        className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                      />
                    </motion.a>

                    {/* Hot Take Details */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.4 }}
                      className="w-full flex flex-col items-center space-y-2.5"
                    >
                      {/* Badge: 🔥 HOT TAKES */}
                      <div className="flex items-center space-x-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/40 px-3.5 py-1 rounded-full text-[11px] font-bold tracking-wider shadow-md">
                        <span>🔥 HOT TAKES</span>
                      </div>

                      {/* Movie Title */}
                      <h2 className="text-lg md:text-xl font-extrabold text-white leading-tight px-1 line-clamp-2">
                        {hotTakeFilm.filmTitle}
                      </h2>

                      {/* User Ratings Box with Polar Disagreement: Her iki kullanıcı da | ayıracının kendi tarafına ortalanır */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-[#1B2228] border border-[#2C3440] px-2.5 py-2.5 rounded-xl shadow-xl w-full">
                        {/* User 1: Kendi sol alanına tam ortalı */}
                        <div className="flex items-center justify-center space-x-2.5 w-full">
                          <div className="w-8 h-8 rounded-full bg-[#14181C] border-2 border-[#00E054] overflow-hidden flex items-center justify-center font-bold text-xs text-[#00E054] shrink-0 shadow-md">
                            <img
                              src={user1AvatarUrl || DEFAULT_AVATAR}
                              alt={name1}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_AVATAR;
                              }}
                            />
                          </div>
                          <div className="space-y-0.5 text-left min-w-0">
                            <span className="block text-[11px] text-white font-bold truncate max-w-[95px]" title={name1}>
                              {name1}
                            </span>
                            <LetterboxdStars rating={hotTakeFilm.user1Rating} color="#00E054" size="w-3 h-3" showScoreText />
                          </div>
                        </div>

                        <div className="h-7 w-px bg-[#2C3440]" />

                        {/* User 2: Kendi sağ alanına tam ortalı */}
                        <div className="flex items-center justify-center space-x-2.5 w-full">
                          <div className="w-8 h-8 rounded-full bg-[#14181C] border-2 border-[#40BCF4] overflow-hidden flex items-center justify-center font-bold text-xs text-[#40BCF4] shrink-0 shadow-md">
                            <img
                              src={user2AvatarUrl || DEFAULT_AVATAR}
                              alt={name2}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_AVATAR;
                              }}
                            />
                          </div>
                          <div className="space-y-0.5 text-left min-w-0">
                            <span className="block text-[11px] text-white font-bold truncate max-w-[95px]" title={name2}>
                              {name2}
                            </span>
                            <LetterboxdStars rating={hotTakeFilm.user2Rating} color="#FF8000" size="w-3 h-3" showScoreText />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </div>

              {/* 3. YERLEŞİM: İKİ KARTIN ALTINA ORTALANMIŞ DETAILED ANALYSIS BUTONU */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="flex justify-center w-full pt-2"
              >
                <button
                  onClick={onComplete}
                  className="bg-[#00E054] hover:bg-[#00c549] text-black font-bold text-sm px-8 py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(0,224,84,0.4)] flex items-center space-x-2 group cursor-pointer"
                >
                  <span>Detailed Match Analysis</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            </div>
          ) : (
            /* Zıt Kutuplar Spotlight Container */
            <div className="relative z-20 flex flex-col items-center justify-center my-auto w-full max-w-lg py-6 space-y-6 text-center">
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 90, damping: 15 }}
                className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#FF8000]/20 via-[#1B2228] to-[#40BCF4]/20 border-2 border-[#FF8000]/60 flex items-center justify-center text-4xl shadow-[0_0_50px_rgba(255,128,0,0.3)]"
              >
                ☯️
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-3"
              >
                <div className="inline-flex items-center space-x-2 bg-[#FF8000]/15 border border-[#FF8000]/40 px-4 py-1.5 rounded-full text-[#FF8000] text-xs font-bold tracking-wider uppercase">
                  <span>☯️ PARALLEL UNIVERSES — NO SHARED FILMS</span>
                </div>

                <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">
                  No Shared Films Found Yet!
                </h2>

                <p className="text-[#9AB0C6] text-sm md:text-base leading-relaxed max-w-md mx-auto">
                  <span className="text-[#00E054] font-semibold">{name1}</span> and{" "}
                  <span className="text-[#40BCF4] font-semibold">{name2}</span> haven't logged any shared films yet. Check out top recommendations from each other's profiles below!
                </p>
              </motion.div>

              <motion.button
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                onClick={onComplete}
                className="bg-[#00E054] hover:bg-[#00c549] text-black font-bold text-sm px-6 py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_25px_rgba(0,224,84,0.4)] flex items-center space-x-2 group cursor-pointer"
              >
                <span>View Recommendations & Analysis</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};
