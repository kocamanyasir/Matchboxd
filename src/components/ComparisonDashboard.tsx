"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { ComparisonResult, WatchlistItem, MIN_HOT_TAKE_DIFF, PersonSynergy, MatchedMovie } from "@/lib/types";
import { computeCinemaSynergy, getMovieCredits, formatMovieYearAndDirector } from "@/lib/movie-credits";
import {
  Flame,
  Award,
  RefreshCw,
  Share2,
  Film,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ArrowUp,
  Crosshair,
  RotateCw,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LetterboxdStars } from "./LetterboxdStars";
import { normalizeTitle, getLetterboxdUrl, getPersonLetterboxdUrl } from "@/lib/letterboxd";
import { ShareMatchModal } from "./ShareMatchModal";

interface ComparisonDashboardProps {
  result: ComparisonResult;
  onReset: () => void;
}

type SortOption =
  | "combined"
  | "year_desc"
  | "year_asc"
  | "title_asc"
  | "title_desc"
  | "user1_high"
  | "user1_low"
  | "user2_high"
  | "user2_low";

interface SortOptionConfig {
  id: SortOption;
  label: string;
  displayTitle: string;
  category: string;
}

interface SortGroupConfig {
  category: string;
  options: SortOptionConfig[];
}

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
        className={`bg-gradient-to-br from-[#1E262F] via-[#141A1F] to-[#0E1317] border border-[#2C3440]/60 flex flex-col items-center justify-center p-2 text-center select-none w-full h-full relative overflow-hidden group ${className}`}
      >
        <div className="absolute inset-0 bg-radial from-[#00E054]/5 to-transparent pointer-events-none" />
        <Film className="w-5 h-5 text-[#00E054]/70 mb-1 shrink-0 transition-transform group-hover:scale-110" />
        <span className="text-[9px] font-bold text-white/90 leading-tight line-clamp-2 px-0.5">
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
      loading="lazy"
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

function getSortGroups(user1Name: string, user2Name: string): SortGroupConfig[] {
  return [
    {
      category: "Average Rating",
      options: [
        {
          id: "combined",
          label: "Highest Rated Together",
          displayTitle: "Highest Rated Together",
          category: "Average Rating",
        },
      ],
    },
    {
      category: "Release Year",
      options: [
        {
          id: "year_desc",
          label: "Newest First",
          displayTitle: "Release Year (Newest)",
          category: "Release Year",
        },
        {
          id: "year_asc",
          label: "Oldest First",
          displayTitle: "Release Year (Oldest)",
          category: "Release Year",
        },
      ],
    },
    {
      category: "Film Title",
      options: [
        {
          id: "title_asc",
          label: "Film Title (A-Z)",
          displayTitle: "Film Title (A-Z)",
          category: "Film Title",
        },
        {
          id: "title_desc",
          label: "Film Title (Z-A)",
          displayTitle: "Film Title (Z-A)",
          category: "Film Title",
        },
      ],
    },
    {
      category: `${user1Name}'s Rating`,
      options: [
        {
          id: "user1_high",
          label: "Highest Rated",
          displayTitle: `${user1Name}: Highest`,
          category: `${user1Name}'s Rating`,
        },
        {
          id: "user1_low",
          label: "Lowest Rated",
          displayTitle: `${user1Name}: Lowest`,
          category: `${user1Name}'s Rating`,
        },
      ],
    },
    {
      category: `${user2Name}'s Rating`,
      options: [
        {
          id: "user2_high",
          label: "Highest Rated",
          displayTitle: `${user2Name}: Highest`,
          category: `${user2Name}'s Rating`,
        },
        {
          id: "user2_low",
          label: "Lowest Rated",
          displayTitle: `${user2Name}: Lowest`,
          category: `${user2Name}'s Rating`,
        },
      ],
    },
  ];
}

const getMovieYearAndDirector = formatMovieYearAndDirector;

const DEFAULT_AVATAR = "/empty-avatar.webp";

const UnifyingPersonCard: React.FC<{
  person: PersonSynergy;
  role: "director" | "actor";
}> = ({ person, role }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleMouseEnter = () => {
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  const isDirector = role === "director";
  const badgeEmoji = isDirector ? "🎬" : "⭐";
  const badgeTitle = isDirector ? "THE UNIFYING DIRECTOR" : "THE UNIFYING ACTOR";
  const avgStarColor = isDirector ? "text-[#00E054]" : "text-[#FF8000]";

  return (
    <div
      className="relative w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <a
        href={getPersonLetterboxdUrl(person.name, role)}
        target="_blank"
        rel="noopener noreferrer"
        className={`relative bg-[#14181C]/90 border rounded-xl py-2 px-3 sm:py-2.5 sm:px-3.5 flex flex-col justify-center space-y-1 text-center sm:text-left transition-all shadow-md group/card cursor-pointer block ${
          isOpen
            ? "border-[#40BCF4] shadow-[0_0_20px_rgba(64,188,244,0.22)]"
            : "border-[#2C3440] hover:border-[#40BCF4]/50 hover:shadow-[0_0_15px_rgba(64,188,244,0.12)]"
        }`}
        title={`${person.name} on Letterboxd`}
      >
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8.5px] sm:text-[9.5px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 tracking-wider uppercase">
            <span>{badgeEmoji}</span>
            <span>{badgeTitle}</span>
          </div>
          <ExternalLink
            className={`w-3 h-3 transition-colors shrink-0 ${
              isOpen ? "text-[#40BCF4]" : "text-[#9AB0C6]/50 group-hover/card:text-[#40BCF4]"
            }`}
          />
        </div>

        <div
          className={`text-sm sm:text-base md:text-lg font-black leading-tight truncate transition-colors ${
            isOpen ? "text-[#40BCF4]" : "text-white group-hover/card:text-[#40BCF4]"
          }`}
        >
          {person.name}
        </div>

        <div className="flex items-center justify-center sm:justify-start space-x-1.5 text-[11px] sm:text-xs font-semibold text-[#9AB0C6]">
          <span>Avg:</span>
          <span className={`${avgStarColor} font-black`}>
            ★ {person.averageRating.toFixed(1)}
          </span>
          <span>•</span>
          <span>
            {person.sharedFilmsCount} Shared{" "}
            {person.sharedFilmsCount === 1 ? "Film" : "Films"}
          </span>
        </div>
      </a>

      {/* Hover Popup Box - En tepede görünür (bottom-[calc(100%+10px)]), altında/üstünde engel kalmaz */}
      <AnimatePresence>
        {isOpen && person.filmTitles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-[100] w-[270px] sm:w-[320px] pointer-events-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Görünmez hover köprüsü: kart ile kutucuk arasındaki boşlukta farenin kopmasını engeller */}
            <div className="absolute -bottom-3 inset-x-0 h-3" />

            {/* Tooltip Card Body */}
            <div className="relative bg-[#1B2228]/95 backdrop-blur-md border border-[#40BCF4]/70 shadow-[0_12px_32px_rgba(0,0,0,0.8),0_0_20px_rgba(64,188,244,0.3)] rounded-xl p-2.5 sm:p-3 text-left">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#2C3440]/80">
                <span className="text-[10px] font-bold text-[#40BCF4] uppercase tracking-wider flex items-center gap-1.5">
                  <span>{badgeEmoji}</span>
                  <span>Shared Films ({person.filmTitles.length})</span>
                </span>
                <span className="text-[9px] text-[#9AB0C6]/70 font-medium">
                  Letterboxd
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {person.filmTitles.map((title, idx) => (
                  <a
                    key={idx}
                    href={getLetterboxdUrl(title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10.5px] font-semibold text-white/90 bg-[#14181C] border border-[#2C3440] hover:border-[#40BCF4] hover:text-[#40BCF4] px-2 py-0.5 rounded-md leading-normal transition-colors"
                  >
                    {title}
                  </a>
                ))}
              </div>

              {/* Arrow caret pointing down to the card */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#1B2228] border-b border-r border-[#40BCF4]/70 shadow-sm pointer-events-none" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ComparisonDashboard = ({
  result,
  onReset,
}: ComparisonDashboardProps) => {
  const [copied, setCopied] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "favorites" | "hottakes">("all");
  const [sortBy, setSortBy] = useState<SortOption>("combined");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [hasExpandedFilms, setHasExpandedFilms] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Reset pagination slicing and scroll-to-top state when tab, sort option or result changes
  useEffect(() => {
    setVisibleCount(24);
    setHasExpandedFilms(false);
    setShowScrollTop(false);
  }, [activeTab, sortBy, result]);

  useEffect(() => {
    if (!hasExpandedFilms) {
      setShowScrollTop(false);
      return;
    }

    const handleScroll = () => {
      if (window.scrollY > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasExpandedFilms]);

  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      try {
        const url = new URL(window.location.origin);
        url.searchParams.set("u1", result.user1.username);
        url.searchParams.set("u2", result.user2.username);
        navigator.clipboard.writeText(url.toString());
      } catch {
        navigator.clipboard.writeText(window.location.href);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Hot takes: minimum MIN_HOT_TAKE_DIFF star difference and both users rated
  const hotTakesFiltered = [...result.sharedMovies]
    .filter((m) => m.user1Rating !== null && m.user2Rating !== null && m.ratingDiff >= MIN_HOT_TAKE_DIFF)
    .sort((a, b) => b.ratingDiff - a.ratingDiff);

  // Top Agreed Favorites (Mutual Favorites): maximum 1.5 star difference (ratingDiff <= 1.5) and both users rated
  const favoritesFiltered = [...result.sharedMovies]
    .filter((m) => m.user1Rating !== null && m.user2Rating !== null && m.ratingDiff <= 1.5)
    .sort((a, b) => b.averageRating - a.averageRating);

  const [deckPageIndex, setDeckPageIndex] = useState(0);

  // Compatibility Banner Carousel Slide State (0: Score, 1: Rating Generosity, 2: Taste Synergy & DNA)
  const [bannerSlide, setBannerSlide] = useState<0 | 1 | 2>(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    if (distance > 45) {
      setBannerSlide((prev) => (prev === 2 ? 0 : ((prev + 1) as 0 | 1 | 2))); // Swipe left -> next slide
    } else if (distance < -45) {
      setBannerSlide((prev) => (prev === 0 ? 2 : ((prev - 1) as 0 | 1 | 2))); // Swipe right -> prev slide
    }
  };

  // Spotlight Banner Carousel Slide State (0: Top Agreed, 1: Hot Takes, 2: Watchlist Roulette)
  const [spotlightSlide, setSpotlightSlide] = useState<0 | 1 | 2>(0);
  const [hotTakesDeckPageIndex, setHotTakesDeckPageIndex] = useState(0);
  const [cylinderAngle, setCylinderAngle] = useState(0);
  const [spentBullets, setSpentBullets] = useState(0);
  const [isFiring, setIsFiring] = useState(false);
  const [watchlistMovies, setWatchlistMovies] = useState<WatchlistItem[]>(
    result.watchlistRecommendations || []
  );
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState(false);
  const [spotlightTouchStartX, setSpotlightTouchStartX] = useState<number | null>(null);
  const [spotlightTouchEndX, setSpotlightTouchEndX] = useState<number | null>(null);

  // Reset deck pages and slides when result changes
  useEffect(() => {
    setDeckPageIndex(0);
    setHotTakesDeckPageIndex(0);
    setBannerSlide(0);
    setSpotlightSlide(0);
    setCylinderAngle(0);
    setSpentBullets(0);
    setIsFiring(false);

    if (result.watchlistRecommendations && result.watchlistRecommendations.length > 0) {
      setWatchlistMovies(result.watchlistRecommendations);
    } else {
      setIsLoadingWatchlist(true);
      fetch(
        `/api/watchlist?user1=${encodeURIComponent(result.user1.username)}&user2=${encodeURIComponent(
          result.user2.username
        )}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.recommendations && data.recommendations.length > 0) {
            setWatchlistMovies(data.recommendations);
          }
        })
        .catch((err) => console.warn("Watchlist fetch error:", err))
        .finally(() => setIsLoadingWatchlist(false));
    }
  }, [result]);

  const handleSpotlightTouchStart = (e: React.TouchEvent) => {
    setSpotlightTouchEndX(null);
    setSpotlightTouchStartX(e.targetTouches[0].clientX);
  };

  const handleSpotlightTouchMove = (e: React.TouchEvent) => {
    setSpotlightTouchEndX(e.targetTouches[0].clientX);
  };

  const handleSpotlightTouchEnd = () => {
    if (spotlightTouchStartX === null || spotlightTouchEndX === null) return;
    const distance = spotlightTouchStartX - spotlightTouchEndX;
    if (distance > 45) {
      setSpotlightSlide((prev) => (prev === 2 ? 0 : ((prev + 1) as 0 | 1 | 2))); // Swipe left -> next slide
    } else if (distance < -45) {
      setSpotlightSlide((prev) => (prev === 0 ? 2 : ((prev - 1) as 0 | 1 | 2))); // Swipe right -> prev slide
    }
  };

  // 2. SLAYT (RATING GENEROSITY & CRITIC PERSONA) HESAPLAMALARI
  const user1RatedShared = result.sharedMovies.filter(
    (m) => typeof m.user1Rating === "number" && !isNaN(m.user1Rating) && m.user1Rating > 0
  );
  const user2RatedShared = result.sharedMovies.filter(
    (m) => typeof m.user2Rating === "number" && !isNaN(m.user2Rating) && m.user2Rating > 0
  );

  const user1ArchiveRated = result.user1.items.filter(
    (i) => typeof i.memberRating === "number" && !isNaN(i.memberRating) && i.memberRating > 0
  );
  const user2ArchiveRated = result.user2.items.filter(
    (i) => typeof i.memberRating === "number" && !isNaN(i.memberRating) && i.memberRating > 0
  );

  const finalUser1Avg =
    user1RatedShared.length > 0
      ? user1RatedShared.reduce((acc, m) => acc + Number(m.user1Rating), 0) / user1RatedShared.length
      : user1ArchiveRated.length > 0
      ? user1ArchiveRated.reduce((acc, i) => acc + Number(i.memberRating), 0) / user1ArchiveRated.length
      : 3.5;

  const finalUser2Avg =
    user2RatedShared.length > 0
      ? user2RatedShared.reduce((acc, m) => acc + Number(m.user2Rating), 0) / user2RatedShared.length
      : user2ArchiveRated.length > 0
      ? user2ArchiveRated.reduce((acc, i) => acc + Number(i.memberRating), 0) / user2ArchiveRated.length
      : 3.5;

  const getCriticPersona = (avg: number) => {
    if (avg < 2.3) {
      return {
        title: "Star Nemesis",
        desc: "Tough to please, stingy with ratings",
        color: "#FF4D4D",
        bgColor: "bg-[#FF4D4D]/15",
        borderColor: "border-[#FF4D4D]/40",
        textColor: "text-[#FF4D4D]",
        emoji: "💀",
      };
    } else if (avg <= 3.2) {
      return {
        title: "Sober Cinephile",
        desc: "Selective, balanced, and analytical",
        color: "#FF8000",
        bgColor: "bg-[#FF8000]/15",
        borderColor: "border-[#FF8000]/40",
        textColor: "text-[#FF8000]",
        emoji: "🧐",
      };
    } else if (avg <= 4.1) {
      return {
        title: "People's Jury",
        desc: "Always keeps good faith",
        color: "#40BCF4",
        bgColor: "bg-[#40BCF4]/15",
        borderColor: "border-[#40BCF4]/40",
        textColor: "text-[#40BCF4]",
        emoji: "🍿",
      };
    } else {
      return {
        title: "Letterboxd Angel",
        desc: "Welcomes every film with open arms",
        color: "#00E054",
        bgColor: "bg-[#00E054]/15",
        borderColor: "border-[#00E054]/40",
        textColor: "text-[#00E054]",
        emoji: "😇",
      };
    }
  };

  const user1DisplayAvg = Number(finalUser1Avg.toFixed(1));
  const user2DisplayAvg = Number(finalUser2Avg.toFixed(1));
  const generosityDiff = Number(Math.abs(user1DisplayAvg - user2DisplayAvg).toFixed(1));

  const persona1 = getCriticPersona(user1DisplayAvg);
  const persona2 = getCriticPersona(user2DisplayAvg);

  const totalGenerosity = (user1DisplayAvg + user2DisplayAvg) || 1;
  const user1GenerosityPct = Math.round((user1DisplayAvg / totalGenerosity) * 100);
  const user2GenerosityPct = 100 - user1GenerosityPct;

  // [o1] 3. SLAYT (CINEMA SYNERGY: CAST & CREW) HESAPLAMALARI
  const cinemaSynergy = useMemo(() => {
    if (result.cinemaSynergy) return result.cinemaSynergy;
    return computeCinemaSynergy(result.sharedMovies);
  }, [result.cinemaSynergy, result.sharedMovies]);

  // Top Agreed (Tie Detection)
  const ratedShared = result.sharedMovies.filter(
    (m) =>
      m.user1Rating !== null &&
      m.user2Rating !== null &&
      m.user1Rating > 0 &&
      m.user2Rating > 0
  );

  const candidatePool = ratedShared.length > 0 ? ratedShared : result.sharedMovies;
  const maxAvg =
    candidatePool.length > 0
      ? Math.max(...candidatePool.map((m) => m.averageRating))
      : result.topMatch?.averageRating || 0;

  // 1. Zirve ortalamaya (maxAvg) sahip filmleri bul
  const topAvgCandidates = candidatePool.filter((m) => m.averageRating === maxAvg);

  // 2. Bu zirve filmler arasındaki EN KÜÇÜK puan farkını (minDiff) tespit et
  const minDiff =
    topAvgCandidates.length > 0
      ? Math.min(...topAvgCandidates.map((m) => m.ratingDiff))
      : 0;

  // 3. YALNIZCA hem zirve ortalamaya HEM DE en düşük farka sahip filmleri berabere (deste) kabul et
  // Böylece örneğin (4 ve 4) varken (5 ve 3) desteye sızamaz, tek kart olarak 4 ve 4 öne çıkar.
  const tiedCandidates = topAvgCandidates.filter((m) => m.ratingDiff === minDiff);

  tiedCandidates.sort((a, b) => {
    const yearDiff = (b.filmYear || 0) - (a.filmYear || 0);
    if (yearDiff !== 0) return yearDiff;
    return a.filmTitle.localeCompare(b.filmTitle, "tr");
  });

  if (result.topMatch) {
    const matchIdx = tiedCandidates.findIndex(
      (m) =>
        (m.slug && m.slug === result.topMatch?.slug) ||
        m.filmTitle === result.topMatch?.filmTitle
    );
    if (matchIdx > 0) {
      const [matched] = tiedCandidates.splice(matchIdx, 1);
      tiedCandidates.unshift(matched);
    }
  }

  const totalTied = tiedCandidates.length;
  const isTied = totalTied > 1;
  const maxDeckPage = Math.max(0, Math.ceil(totalTied / 3) - 1);
  const safePageIndex = Math.min(deckPageIndex, maxDeckPage);
  const currentDeck = isTied
    ? tiedCandidates.slice(safePageIndex * 3, (safePageIndex + 1) * 3)
    : tiedCandidates.slice(0, 1);

  const startTiedNum = safePageIndex * 3 + 1;
  const endTiedNum = Math.min((safePageIndex + 1) * 3, totalTied);

  // Hot Takes (Tie Detection - Peak Rating Difference)
  const hotTakesCandidatesPool =
    ratedShared.length > 0
      ? ratedShared
      : (result.hotTakes && result.hotTakes.length > 0)
      ? result.hotTakes
      : result.sharedMovies;

  const maxHotTakeDiff =
    hotTakesCandidatesPool.length > 0
      ? Math.max(
          ...hotTakesCandidatesPool.map((m) =>
            Math.abs(Number(m.user1Rating ?? 0) - Number(m.user2Rating ?? 0))
          )
        )
      : 0;

  // 1. Zirve puan farkına (maxHotTakeDiff) sahip filmleri topla (En az MIN_HOT_TAKE_DIFF kadar fark olmalı)
  const hotTakesTiedCandidates =
    hotTakesCandidatesPool.length > 0 && maxHotTakeDiff >= MIN_HOT_TAKE_DIFF
      ? hotTakesCandidatesPool.filter(
          (m) =>
            Math.abs(Number(m.user1Rating ?? 0) - Number(m.user2Rating ?? 0)) === maxHotTakeDiff
        )
      : [];

  // 2. Sıralama: En yüksek ortalama puana göre, eşitse yıla ve başlığa göre
  hotTakesTiedCandidates.sort((a, b) => {
    const avgDiff = b.averageRating - a.averageRating;
    if (avgDiff !== 0) return avgDiff;
    const yearDiff = (b.filmYear || 0) - (a.filmYear || 0);
    if (yearDiff !== 0) return yearDiff;
    return a.filmTitle.localeCompare(b.filmTitle, "tr");
  });

  // Eğer backend'den gelen result.hotTakes[0] varsa ve listedeyse başa al
  if (result.hotTakes && result.hotTakes.length > 0) {
    const topH = result.hotTakes[0];
    const matchIdx = hotTakesTiedCandidates.findIndex(
      (m) => (m.slug && m.slug === topH.slug) || m.filmTitle === topH.filmTitle
    );
    if (matchIdx > 0) {
      const [matched] = hotTakesTiedCandidates.splice(matchIdx, 1);
      hotTakesTiedCandidates.unshift(matched);
    }
  }

  const totalHotTakesTied = hotTakesTiedCandidates.length;
  const isHotTakesTied = totalHotTakesTied > 1;
  const maxHotTakesDeckPage = Math.max(0, Math.ceil(totalHotTakesTied / 3) - 1);
  const safeHotTakesPageIndex = Math.min(hotTakesDeckPageIndex, maxHotTakesDeckPage);
  const currentHotTakesDeck = isHotTakesTied
    ? hotTakesTiedCandidates.slice(safeHotTakesPageIndex * 3, (safeHotTakesPageIndex + 1) * 3)
    : hotTakesTiedCandidates.slice(0, 1);

  const startHotTakesTiedNum = safeHotTakesPageIndex * 3 + 1;
  const endHotTakesTiedNum = Math.min((safeHotTakesPageIndex + 1) * 3, totalHotTakesTied);

  // 3. SLAYT (SPOTLIGHT: WATCHLIST ROULETTE - KULLANICI WATCHLIST'LERİNDEN MAKSİMUM 6 FİLM)
  const rouletteRecommendations = useMemo(() => {
    // İki kullanıcının da izlediği tüm filmleri topla (User 1 veya User 2 tarafından izlenen herhangi bir film elenir)
    const watchedSlugs = new Set<string>();
    const watchedTitles = new Set<string>();

    const recordWatched = (items?: { slug?: string; filmTitle?: string; title?: string; link?: string }[]) => {
      if (!items) return;
      for (const item of items) {
        if (item.slug) watchedSlugs.add(item.slug.toLowerCase().trim());
        const t = item.filmTitle || item.title || "";
        if (t) watchedTitles.add(normalizeTitle(t));
        if (item.link) {
          const m = item.link.match(/\/film\/([^\/]+)\//i);
          if (m && m[1]) watchedSlugs.add(m[1].toLowerCase().trim());
        }
      }
    };

    recordWatched(result.user1.items);
    recordWatched(result.user2.items);
    recordWatched(result.sharedMovies);

    const isWatchedByEither = (m: WatchlistItem) => {
      const s = (m.slug || "").toLowerCase().trim();
      if (s && watchedSlugs.has(s)) return true;
      const t = normalizeTitle(m.filmTitle || "");
      if (t && watchedTitles.has(t)) return true;
      if (m.letterboxdUrl) {
        const match = m.letterboxdUrl.match(/\/film\/([^\/]+)\//i);
        if (match && match[1] && watchedSlugs.has(match[1].toLowerCase().trim())) return true;
      }
      return false;
    };

    // 1. Doğrudan letterboxd.com/<user>/watchlist/ üzerinden çekilen filmler
    const rawCandidates =
      watchlistMovies && watchlistMovies.length > 0
        ? watchlistMovies
        : result.watchlistRecommendations && result.watchlistRecommendations.length > 0
        ? result.watchlistRecommendations
        : [];

    // İki taraftan herhangi birinin izlediği filmleri KESİNLİKLE ele
    const cleanCandidates = rawCandidates.filter((m) => !isWatchedByEither(m));

    if (cleanCandidates.length > 0) {
      return cleanCandidates.slice(0, 6);
    }

    return [];
  }, [watchlistMovies, result]);

  // 6 filmin afişlerini önceden tarayıcı belleğine yükle (pre-load / pre-cache)
  useEffect(() => {
    if (rouletteRecommendations && rouletteRecommendations.length > 0) {
      rouletteRecommendations.forEach((movie) => {
        if (movie.posterUrl && !movie.posterUrl.includes("empty-poster")) {
          const img = new Image();
          img.src = movie.posterUrl;
        }
      });
    }
  }, [rouletteRecommendations]);

  const bulletsTotal = 6;
  const bulletsRemaining = Math.max(0, bulletsTotal - spentBullets);
  const hasFired = spentBullets > 0;
  const activeMovieIndex = Math.max(0, Math.min(spentBullets - 1, rouletteRecommendations.length - 1));
  const currentRouletteMovie = rouletteRecommendations[activeMovieIndex] || rouletteRecommendations[0];

  const handleSpinCylinder = () => {
    if (rouletteRecommendations.length === 0) return;
    if (spentBullets >= bulletsTotal) {
      // 6 mermi de bittiğinde ateş edilemez; yeniden doldurma (reload) sistemi yok
      return;
    }

    // Ateş etme efekti (Muzzle flash & recoil burst)
    setIsFiring(true);
    setTimeout(() => setIsFiring(false), 380);

    // Her çevirmede bir mermi harcanır ve saat yönünde 60 derece döner
    setSpentBullets((prev) => prev + 1);
    setCylinderAngle((prev) => prev + 60);
  };

  const getFilteredMovies = () => {
    let list = result.sharedMovies;
    if (activeTab === "favorites") {
      list = favoritesFiltered;
    } else if (activeTab === "hottakes") {
      list = hotTakesFiltered;
    }

    const sorted = [...list];

    sorted.sort((a, b) => {
      if (sortBy === "year_desc") {
        const yA = a.filmYear || 0;
        const yB = b.filmYear || 0;
        return yB - yA;
      }
      if (sortBy === "year_asc") {
        const yA = a.filmYear || 0;
        const yB = b.filmYear || 0;
        return yA - yB;
      }

      if (sortBy === "title_asc") {
        return a.filmTitle.localeCompare(b.filmTitle, "en");
      }
      if (sortBy === "title_desc") {
        return b.filmTitle.localeCompare(a.filmTitle, "en");
      }

      if (sortBy === "user1_high") {
        const rA = a.user1Rating && a.user1Rating > 0 ? a.user1Rating : null;
        const rB = b.user1Rating && b.user1Rating > 0 ? b.user1Rating : null;
        if (rA === null && rB === null) return 0;
        if (rA === null) return 1;
        if (rB === null) return -1;
        return rB - rA;
      }

      if (sortBy === "user1_low") {
        const rA = a.user1Rating && a.user1Rating > 0 ? a.user1Rating : null;
        const rB = b.user1Rating && b.user1Rating > 0 ? b.user1Rating : null;
        if (rA === null && rB === null) return 0;
        if (rA === null) return 1;
        if (rB === null) return -1;
        return rA - rB;
      }

      if (sortBy === "user2_high") {
        const rA = a.user2Rating && a.user2Rating > 0 ? a.user2Rating : null;
        const rB = b.user2Rating && b.user2Rating > 0 ? b.user2Rating : null;
        if (rA === null && rB === null) return 0;
        if (rA === null) return 1;
        if (rB === null) return -1;
        return rB - rA;
      }

      if (sortBy === "user2_low") {
        const rA = a.user2Rating && a.user2Rating > 0 ? a.user2Rating : null;
        const rB = b.user2Rating && b.user2Rating > 0 ? b.user2Rating : null;
        if (rA === null && rB === null) return 0;
        if (rA === null) return 1;
        if (rB === null) return -1;
        return rA - rB;
      }

      // Default ("combined"): Highest combined average rating
      return b.averageRating - a.averageRating;
    });

    return sorted;
  };

  const filteredMovies = getFilteredMovies();
  const displayedMovies = filteredMovies.slice(0, visibleCount);
  const hasMore = visibleCount < filteredMovies.length;

  const sortGroups = getSortGroups(result.user1.displayName, result.user2.displayName);
  let currentSortConfig = sortGroups[0].options[0];
  for (const group of sortGroups) {
    const found = group.options.find((opt) => opt.id === sortBy);
    if (found) {
      currentSortConfig = found;
      break;
    }
  }

  return (
    <div className="min-h-screen bg-[#14181C] text-white p-4 md:p-8 select-none">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Header & Navigation */}
        <div className="flex flex-col md:flex-row items-center justify-between border-b border-[#2C3440] pb-6 gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <span className="w-3.5 h-3.5 rounded-full bg-[#FF8000]" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#00E054]" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#40BCF4]" />
            </div>
            <h1 className="text-2xl font-bold font-sans">Matchboxd</h1>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center space-x-2 bg-[#1B2228] hover:bg-[#242C34] text-[#9AB0C6] hover:text-white px-4 py-2 rounded-lg border border-[#2C3440] text-sm transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-[#00E054]" />
              <span>Share Match</span>
            </button>

            <button
              onClick={onReset}
              className="flex items-center space-x-2 bg-[#00E054] hover:bg-[#00c549] text-black font-semibold px-4 py-2 rounded-lg text-sm transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>New Match</span>
            </button>
          </div>
        </div>

        {/* Compatibility Score Banner / Carousel (Slider) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative bg-gradient-to-r from-[#1B2228] via-[#242C34] to-[#1B2228] border border-[#2C3440] rounded-2xl px-10 sm:px-14 md:px-18 py-4 sm:py-5 pb-9 sm:pb-10 shadow-2xl min-h-[270px] sm:min-h-[250px] md:min-h-0 md:h-[242px] flex flex-col justify-center select-none group/banner"
        >
          {/* Subtle Ambient Background Glow */}
          <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
            <div
              className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl transition-colors duration-300 ${
                bannerSlide === 0
                  ? "bg-gradient-to-br from-[#00E054]/5 via-[#40BCF4]/5 to-transparent"
                  : bannerSlide === 1
                  ? "bg-gradient-to-br from-[#FF8000]/10 via-[#FF8000]/5 to-transparent"
                  : "bg-gradient-to-br from-[#40BCF4]/10 via-[#40BCF4]/5 to-transparent"
              }`}
            />
          </div>

          {/* 3. KONTROLLER: Gezinme Okları (ChevronLeft & ChevronRight) */}
          <button
            type="button"
            onClick={() => setBannerSlide((prev) => (prev === 0 ? 2 : ((prev - 1) as 0 | 1 | 2)))}
            className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-[#14181C]/85 hover:bg-[#2C3440] text-[#9AB0C6] hover:text-white border border-[#2C3440] transition-all shadow-lg cursor-pointer"
            title="Previous slide"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            type="button"
            onClick={() => setBannerSlide((prev) => (prev === 2 ? 0 : ((prev + 1) as 0 | 1 | 2)))}
            className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-[#14181C]/85 hover:bg-[#2C3440] text-[#9AB0C6] hover:text-white border border-[#2C3440] transition-all shadow-lg cursor-pointer"
            title="Next slide"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Carousel Slides Container with AnimatePresence (Ortadaki daraltılmış alan) */}
          <div className="w-full max-w-[820px] mx-auto relative z-40 px-2 sm:px-4">
            <AnimatePresence mode="wait" initial={false}>
              {bannerSlide === 0 ? (
                /* 1. SLAYT (MEVCUT SCORE KARTI) */
                <motion.div
                  key="slide-compatibility"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="w-full flex flex-col md:flex-row items-center justify-between gap-6"
                >
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-xs font-bold tracking-widest text-[#9AB0C6] uppercase">
                      Compatibility Score
                    </span>
                    <div className="flex items-center justify-center md:justify-start space-x-3">
                      <span className="text-5xl md:text-6xl font-black text-white">
                        {result.scoreFormatted || `${result.matchPercentage}%`}
                      </span>
                      {result.matchPercentage === 0 || result.isGenreMatchFallback ? (
                        <span className="bg-[#FF8000]/20 border border-[#FF8000]/40 text-[#FF8000] text-xs font-bold px-3 py-1 rounded-full">
                          ☯️ Parallel Universes
                        </span>
                      ) : (
                        <span className="bg-[#00E054]/20 border border-[#00E054]/40 text-[#00E054] text-xs font-bold px-3 py-1 rounded-full">
                          Cinephile Match
                        </span>
                      )}
                    </div>
                    <p className="text-[#9AB0C6] text-sm max-w-xl">
                      Comparing <span className="text-white font-semibold">{result.user1.displayName}</span>{" "}
                      <span className="text-[#9AB0C6] text-xs font-medium">(@{result.user1.username})</span> and{" "}
                      <span className="text-white font-semibold">{result.user2.displayName}</span>{" "}
                      <span className="text-[#9AB0C6] text-xs font-medium">(@{result.user2.username})</span>.
                      {result.matchPercentage === 0 ? (
                        " No shared films found yet!"
                      ) : (
                        ` Calculated from ${result.sharedMovies.length} shared films.`
                      )}
                    </p>
                    {result.isGenreMatchFallback && (
                      <div className="mt-2 inline-flex items-center space-x-1.5 bg-[#FF8000]/15 border border-[#FF8000]/30 text-[#FF8000] text-xs px-3.5 py-1.5 rounded-lg font-medium">
                        <Flame className="w-3.5 h-3.5 text-[#FF8000]" />
                        <span>No shared films found; top recommendations from each other&apos;s profiles are shown below.</span>
                      </div>
                    )}
                  </div>

                  {/* User Avatars / Icons */}
                  <div className="flex items-center space-x-4 shrink-0">
                    {/* User 1 */}
                    <div className="text-center max-w-[110px] sm:max-w-[120px]">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#1B2228] border-2 border-[#00E054] overflow-hidden flex items-center justify-center font-black text-xl text-[#00E054] shadow-lg mx-auto">
                        <img
                          src={result.user1.avatarUrl || DEFAULT_AVATAR}
                          alt={result.user1.displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_AVATAR;
                          }}
                        />
                      </div>
                      <span className="text-xs text-white font-bold mt-1.5 block truncate max-w-[110px] sm:max-w-[120px]" title={result.user1.displayName}>
                        {result.user1.displayName}
                      </span>
                      <span className="text-[10px] text-[#9AB0C6] font-medium block truncate max-w-[110px] sm:max-w-[120px]">
                        @{result.user1.username}
                      </span>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-[#2C3440] flex items-center justify-center text-[#9AB0C6] font-bold text-xs border border-[#2C3440] shrink-0">
                      VS
                    </div>

                    {/* User 2 */}
                    <div className="text-center max-w-[110px] sm:max-w-[120px]">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#1B2228] border-2 border-[#40BCF4] overflow-hidden flex items-center justify-center font-black text-xl text-[#40BCF4] shadow-lg mx-auto">
                        <img
                          src={result.user2.avatarUrl || DEFAULT_AVATAR}
                          alt={result.user2.displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_AVATAR;
                          }}
                        />
                      </div>
                      <span className="text-xs text-white font-bold mt-1.5 block truncate max-w-[110px] sm:max-w-[120px]" title={result.user2.displayName}>
                        {result.user2.displayName}
                      </span>
                      <span className="text-[10px] text-[#9AB0C6] font-medium block truncate max-w-[110px] sm:max-w-[120px]">
                        @{result.user2.username}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : bannerSlide === 1 ? (
                /* 2. SLAYT (RATING GENEROSITY & CRITIC PERSONA) */
                <motion.div
                  key="slide-generosity"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="w-full flex flex-col justify-between space-y-4"
                >
                  {/* Başlık: RATING GENEROSITY (küçük gri etiket) */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-1.5 text-center sm:text-left">
                    <div>
                      <span className="text-xs font-bold tracking-widest text-[#9AB0C6] uppercase block">
                        Rating Generosity
                      </span>
                      <p className="text-xs text-[#9AB0C6] mt-0.5">
                        Rating generosity and critic personas across shared films
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-[#1B2228] border border-[#2C3440] text-[#9AB0C6] shrink-0">
                      {user1RatedShared.length > 0
                        ? `${user1RatedShared.length} Shared Ratings`
                        : "Overall Profile Average"}
                    </span>
                  </div>

                  {/* Kıyaslama Alanı: User 1 - Denge Barı - User 2 */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6 w-full">
                    {/* User 1 Sol Kanat */}
                    <div className="flex items-center space-x-3 justify-center md:justify-start">
                      <div className="relative shrink-0">
                        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#1B2228] border-2 border-[#00E054] overflow-hidden shadow-lg">
                          <img
                            src={result.user1.avatarUrl || DEFAULT_AVATAR}
                            alt={result.user1.displayName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_AVATAR;
                            }}
                          />
                        </div>
                        <span className="absolute -bottom-1 -right-1 text-sm bg-[#14181C] rounded-full p-0.5 shadow-md">
                          {persona1.emoji}
                        </span>
                      </div>
                      <div className="text-left space-y-1 min-w-0">
                        <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap block" title={result.user1.displayName}>
                          {result.user1.displayName}
                        </span>
                        <div className="whitespace-nowrap inline-flex items-center gap-1 text-sm sm:text-base font-black text-[#00E054] leading-tight">
                          <span>{user1DisplayAvg.toFixed(1)}</span>
                          <span className="text-xs sm:text-sm">★</span>
                        </div>
                        <div>
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${persona1.bgColor} ${persona1.borderColor} ${persona1.textColor}`}>
                            <span>{persona1.title}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Orta Progress / Kıyaslama Barı */}
                    <div className="w-full md:w-48 lg:w-52 flex flex-col items-center justify-center space-y-1.5 px-2">
                      <div className="flex justify-between w-full text-[10px] font-bold text-[#9AB0C6]">
                        <span className="text-[#00E054] font-semibold">{user1GenerosityPct}%</span>
                        <span className="text-[#9AB0C6] uppercase tracking-wider text-[9px]">Rating Balance</span>
                        <span className="text-[#40BCF4] font-semibold">{user2GenerosityPct}%</span>
                      </div>

                      {/* İki taraflı Bar */}
                      <div className="w-full h-2.5 bg-[#14181C] border border-[#2C3440] rounded-full overflow-hidden flex p-0.5 shadow-inner">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${user1GenerosityPct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-[#00E054]/70 to-[#00E054] rounded-l-full"
                        />
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${user2GenerosityPct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="h-full bg-gradient-to-l from-[#40BCF4]/70 to-[#40BCF4] rounded-r-full"
                        />
                      </div>

                      <span className="text-[11px] font-medium text-[#9AB0C6] text-center">
                        {generosityDiff < 0.1
                          ? "Balanced (Rating standards are very close)"
                          : user1DisplayAvg > user2DisplayAvg
                          ? `${result.user1.displayName} is +${generosityDiff.toFixed(1)} ★ more generous`
                          : `${result.user2.displayName} is +${generosityDiff.toFixed(1)} ★ more generous`}
                      </span>
                    </div>

                    {/* User 2 Sağ Kanat */}
                    <div className="flex items-center space-x-3 justify-center md:justify-end">
                      <div className="text-right space-y-1 min-w-0 order-1 md:order-1">
                        <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap block" title={result.user2.displayName}>
                          {result.user2.displayName}
                        </span>
                        <div className="flex justify-end">
                          <div className="whitespace-nowrap inline-flex items-center gap-1 text-sm sm:text-base font-black text-[#40BCF4] leading-tight">
                            <span>{user2DisplayAvg.toFixed(1)}</span>
                            <span className="text-xs sm:text-sm">★</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${persona2.bgColor} ${persona2.borderColor} ${persona2.textColor}`}>
                            <span>{persona2.title}</span>
                          </div>
                        </div>
                      </div>
                      <div className="relative shrink-0 order-2 md:order-2">
                        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#1B2228] border-2 border-[#40BCF4] overflow-hidden shadow-lg">
                          <img
                            src={result.user2.avatarUrl || DEFAULT_AVATAR}
                            alt={result.user2.displayName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_AVATAR;
                            }}
                          />
                        </div>
                        <span className="absolute -bottom-1 -right-1 text-sm bg-[#14181C] rounded-full p-0.5 shadow-md">
                          {persona2.emoji}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* [o1] 3. SLAYT (CINEMA SYNERGY: CAST & CREW) */
                <motion.div
                  key="slide-cinema-synergy"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="w-full flex flex-col justify-center space-y-1.5"
                >
                  {/* Başlık: CINEMA SYNERGY: CAST & CREW & Sağ Üst Rozet */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-1 text-center sm:text-left">
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-[#9AB0C6] uppercase block">
                        CINEMA SYNERGY: CAST &amp; CREW
                      </span>
                      <p className="text-[10px] sm:text-[11px] text-[#9AB0C6] mt-0.5">
                        Directors and actors where your ratings peak together
                      </p>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#1B2228] border border-[#2C3440] text-[#9AB0C6] shrink-0">
                      {cinemaSynergy.totalSharedFilms > 0
                        ? `${cinemaSynergy.totalSharedFilms} Shared Films`
                        : "No Shared Films"}
                    </span>
                  </div>

                  {/* İçerik Izgarası (2 Sütunlu Yapı: Yönetmen & Oyuncu) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 items-center w-full">
                    {/* Sol Blok: THE UNIFYING DIRECTOR */}
                    {cinemaSynergy.unifyingDirector ? (
                      <UnifyingPersonCard
                        person={cinemaSynergy.unifyingDirector}
                        role="director"
                      />
                    ) : (
                      <div className="bg-[#14181C]/90 border border-[#2C3440] rounded-xl py-1.5 px-3 sm:py-2 sm:px-3.5 flex flex-col justify-center space-y-0.5 sm:space-y-1 text-center sm:text-left transition-all shadow-md">
                        <div className="flex items-center justify-center sm:justify-start">
                          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8.5px] sm:text-[9.5px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 tracking-wider uppercase">
                            <span>🎬</span>
                            <span>THE UNIFYING DIRECTOR</span>
                          </div>
                        </div>

                        <div className="py-1 space-y-0.5">
                          <div className="text-xs sm:text-sm font-bold text-[#9AB0C6]">
                            Henüz Ortak Yönetmen Yok
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-[#9AB0C6]/70 truncate">
                            Güvenilir sinerji tespiti için en az 2 ortak filmli bir yönetmen gereklidir.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Sağ Blok: THE UNIFYING ACTOR */}
                    {cinemaSynergy.unifyingActor ? (
                      <UnifyingPersonCard
                        person={cinemaSynergy.unifyingActor}
                        role="actor"
                      />
                    ) : (
                      <div className="bg-[#14181C]/90 border border-[#2C3440] rounded-xl py-1.5 px-3 sm:py-2 sm:px-3.5 flex flex-col justify-center space-y-0.5 sm:space-y-1 text-center sm:text-left transition-all shadow-md">
                        <div className="flex items-center justify-center sm:justify-start">
                          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8.5px] sm:text-[9.5px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 tracking-wider uppercase">
                            <span>⭐</span>
                            <span>THE UNIFYING ACTOR</span>
                          </div>
                        </div>

                        <div className="py-1 space-y-0.5">
                          <div className="text-xs sm:text-sm font-bold text-[#9AB0C6]">
                            Henüz Ortak Oyuncu Yok
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-[#9AB0C6]/70 truncate">
                            Güvenilir sinerji tespiti için en az 2 ortak filmli bir oyuncu gereklidir.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 3. KONTROLLER: Aktif slaytı belirten 3 adet pagination noktası (dots ● ● ●) */}
          <div className="absolute bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setBannerSlide(0)}
              aria-label="Slide 1: Compatibility Score"
              className={`h-1.5 transition-all rounded-full cursor-pointer ${
                bannerSlide === 0
                  ? "w-6 bg-[#00E054] shadow-[0_0_8px_#00E054]"
                  : "w-1.5 bg-[#9AB0C6]/40 hover:bg-[#00E054]/60"
              }`}
            />
            <button
              type="button"
              onClick={() => setBannerSlide(1)}
              aria-label="Slide 2: Rating Generosity"
              className={`h-1.5 transition-all rounded-full cursor-pointer ${
                bannerSlide === 1
                  ? "w-6 bg-[#FF8000] shadow-[0_0_8px_#FF8000]"
                  : "w-1.5 bg-[#9AB0C6]/40 hover:bg-[#FF8000]/60"
              }`}
            />
            <button
              type="button"
              onClick={() => setBannerSlide(2)}
              aria-label="Slide 3: Cinema Synergy: Cast & Crew"
              className={`h-1.5 transition-all rounded-full cursor-pointer ${
                bannerSlide === 2
                  ? "w-6 bg-[#40BCF4] shadow-[0_0_10px_#40BCF4]"
                  : "w-1.5 bg-[#9AB0C6]/40 hover:bg-[#40BCF4]/60"
              }`}
            />
          </div>
        </div>

        {/* Spotlight Carousel Hero Card (Slide 0: Top Agreed, Slide 1: Hot Takes) */}
        {result.topMatch ? (
          <div
            onTouchStart={handleSpotlightTouchStart}
            onTouchMove={handleSpotlightTouchMove}
            onTouchEnd={handleSpotlightTouchEnd}
            className={`relative bg-gradient-to-r from-[#1B2228] via-[#242C34] to-[#1B2228] border ${
              spotlightSlide === 0
                ? "border-[#00E054]/40"
                : spotlightSlide === 1
                ? "border-[#FF8000]/40"
                : "border-[#40BCF4]/40"
            } rounded-2xl px-10 sm:px-14 md:px-16 py-6 sm:py-7 pb-9 sm:pb-9 shadow-xl overflow-hidden min-h-[380px] sm:min-h-0 sm:h-[250px] flex flex-col justify-center select-none group/spotlight transition-colors duration-300`}
          >
            {/* Ambient Background Glow */}
            <div
              className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
                spotlightSlide === 0
                  ? "bg-[#00E054]/5"
                  : spotlightSlide === 1
                  ? "bg-[#FF8000]/10"
                  : "bg-[#40BCF4]/10"
              }`}
            />

            {/* Gezinme Okları (ChevronLeft & ChevronRight) */}
            <button
              type="button"
              onClick={() => setSpotlightSlide((prev) => (prev === 0 ? 2 : ((prev - 1) as 0 | 1 | 2)))}
              className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-[#14181C]/85 hover:bg-[#2C3440] text-[#9AB0C6] hover:text-white border border-[#2C3440] transition-all shadow-lg cursor-pointer"
              title={
                spotlightSlide === 0
                  ? "Show Watchlist Roulette"
                  : spotlightSlide === 1
                  ? "Show Top Agreed"
                  : "Show Hot Takes"
              }
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              type="button"
              onClick={() => setSpotlightSlide((prev) => (prev === 2 ? 0 : ((prev + 1) as 0 | 1 | 2)))}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-[#14181C]/85 hover:bg-[#2C3440] text-[#9AB0C6] hover:text-white border border-[#2C3440] transition-all shadow-lg cursor-pointer"
              title={
                spotlightSlide === 0
                  ? "Show Hot Takes"
                  : spotlightSlide === 1
                  ? "Show Watchlist Roulette"
                  : "Show Top Agreed"
              }
              aria-label="Next slide"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Carousel Slides Container with AnimatePresence */}
            <div className="w-full relative z-10">
              <AnimatePresence mode="wait" initial={false}>
                {spotlightSlide === 0 ? (
                  /* 1. SLAYT (TOP AGREED / MUTUAL FAVORITES) */
                  <motion.div
                    key="spotlight-top-agreed"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.28, ease: "easeInOut" }}
                    className="w-full flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-8"
                  >
                    {/* Posters: Stacked Deck with Carousel when tied, or Single Poster */}
                    {isTied ? (
                      <div className="flex items-center shrink-0 space-x-1 sm:space-x-2">
                        {/* Left Arrow (Visible only if totalTied > 3) */}
                        {totalTied > 3 && (
                          <button
                            type="button"
                            onClick={() => setDeckPageIndex((prev) => Math.max(0, prev - 1))}
                            disabled={safePageIndex === 0}
                            title="Previous films"
                            className="p-1.5 rounded-full bg-[#2c3440]/80 hover:bg-[#445566] text-white transition-all shadow-md disabled:opacity-30 disabled:pointer-events-none cursor-pointer z-30 shrink-0"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        )}

                        {/* Stacked Cards Deck */}
                        <div className="relative flex items-center -space-x-16 sm:-space-x-14 shrink-0 group/deck py-3 pr-6 pl-2">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={safePageIndex}
                              initial={{ opacity: 0, x: 12 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -12 }}
                              transition={{ duration: 0.25 }}
                              className="flex items-center -space-x-16 sm:-space-x-14"
                            >
                              {currentDeck.map((movie, idx) => {
                                let baseStyle = "-rotate-6 -translate-y-1 z-10";
                                let hoverStyle = "group-hover/deck:-translate-x-3 group-hover/deck:-rotate-12";
                                if (idx === 1) {
                                  baseStyle = "rotate-6 translate-x-3 z-20";
                                  hoverStyle = "group-hover/deck:translate-x-5 group-hover/deck:rotate-6";
                                } else if (idx === 2) {
                                  baseStyle = "rotate-12 translate-x-6 z-30";
                                  hoverStyle = "group-hover/deck:translate-x-12 group-hover/deck:rotate-12";
                                }

                                return (
                                  <a
                                    key={movie.slug || movie.filmTitle + idx}
                                    href={getLetterboxdUrl(movie)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`${movie.filmTitle} (${movie.filmYear || ""}) - Open on Letterboxd`}
                                    className={`w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-[#14181C] border-2 border-[#14181c] shadow-2xl transition-all duration-300 ease-out cursor-pointer ${baseStyle} ${hoverStyle} hover:!rotate-0 hover:!scale-105 hover:!z-50 hover:border-[#00E054]`}
                                  >
                                    <PosterImage
                                      src={movie.posterUrl}
                                      alt={movie.filmTitle}
                                      className="w-full h-full object-cover"
                                    />
                                  </a>
                                );
                              })}
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        {/* Right Arrow (Visible only if totalTied > 3) */}
                        {totalTied > 3 && (
                          <button
                            type="button"
                            onClick={() => setDeckPageIndex((prev) => Math.min(maxDeckPage, prev + 1))}
                            disabled={safePageIndex >= maxDeckPage}
                            title="Next films"
                            className="p-1.5 rounded-full bg-[#2c3440]/80 hover:bg-[#445566] text-white transition-all shadow-md disabled:opacity-30 disabled:pointer-events-none cursor-pointer z-30 shrink-0"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <a
                        href={getLetterboxdUrl(result.topMatch)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-[#14181C] border-2 border-[#00E054]/60 shadow-2xl relative block hover:scale-105 transition-transform duration-300"
                      >
                        <PosterImage
                          src={result.topMatch.posterUrl}
                          alt={result.topMatch.filmTitle}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    )}

                    {/* Hero Movie Details - Spread Widely Across the Card */}
                    <div className="flex-1 text-center sm:text-left space-y-3 min-w-0">
                      {isTied ? (
                        <>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <span className="bg-[#00E054] text-black text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-sm shrink-0">
                              <Award className="w-3.5 h-3.5 fill-black" />
                              <span>Tied for Top Agreed</span>
                            </span>
                            <span className="text-xs sm:text-sm text-[#9AB0C6] font-medium">
                              {totalTied > 3
                                ? `(Showing ${startTiedNum}-${endTiedNum} of ${totalTied} Films)`
                                : `(${totalTied} Films)`}
                            </span>
                          </div>

                          <div className="flex flex-col items-center sm:items-start space-y-1.5 py-0.5">
                            {currentDeck.map((movie, idx) => (
                              <div
                                key={movie.slug || movie.filmTitle + idx}
                                className="flex items-start space-x-2 text-base sm:text-lg md:text-xl font-bold text-white leading-tight"
                              >
                                <span className="text-[#00E054] text-base sm:text-lg leading-none select-none mt-1 shrink-0">•</span>
                                <a
                                  href={getLetterboxdUrl(movie)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-[#00E054] transition-colors group/item inline leading-snug break-words"
                                >
                                  <span className="break-words">{movie.filmTitle}</span>
                                  <ExternalLink className="w-3.5 h-3.5 text-[#9AB0C6] group-hover/item:text-[#00E054] opacity-0 group-hover/item:opacity-100 transition-all inline-block ml-1 -translate-y-0.5 shrink-0" />
                                </a>
                              </div>
                            ))}
                          </div>

                          <p className="text-xs text-[#9AB0C6]/80 italic">
                            Hover over the deck to reveal individual posters.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <span className="bg-[#00E054] text-black text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-sm shrink-0">
                              <Award className="w-3.5 h-3.5 fill-black" />
                              <span>#1 Mutual Favorite</span>
                            </span>
                            <span className="text-xs sm:text-sm text-[#9AB0C6] font-medium">
                              (1 Film)
                            </span>
                          </div>

                          <div className="flex items-start justify-center sm:justify-start space-x-2 text-xl sm:text-2xl font-bold text-white leading-tight">
                            <span className="text-[#00E054] text-lg leading-none select-none mt-1 shrink-0">•</span>
                            <a
                              href={getLetterboxdUrl(result.topMatch)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[#00E054] transition-colors group/item inline leading-snug break-words"
                            >
                              <span className="break-words">{result.topMatch.filmTitle}</span>
                              <ExternalLink className="w-4 h-4 text-[#9AB0C6] group-hover/item:text-[#00E054] opacity-0 group-hover/item:opacity-100 transition-all inline-block ml-1.5 -translate-y-0.5 shrink-0" />
                            </a>
                          </div>

                          <p className="text-xs text-[#9AB0C6]/80 italic">
                            Hover over the deck to reveal individual posters.
                          </p>
                        </>
                      )}
                    </div>
                  </motion.div>
                ) : spotlightSlide === 1 ? (
                  /* 2. SLAYT (HOT TAKES / BIGGEST DISAGREEMENTS) */
                  <motion.div
                    key="spotlight-hot-takes"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28, ease: "easeInOut" }}
                    className="w-full flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-8"
                  >
                    {hotTakesTiedCandidates.length > 0 ? (
                      <>
                        {/* Posters: Stacked Deck when tied, or Single Poster */}
                        {isHotTakesTied ? (
                          <div className="flex items-center shrink-0 space-x-1 sm:space-x-2">
                            {/* Left Arrow (Visible only if totalHotTakesTied > 3) */}
                            {totalHotTakesTied > 3 && (
                              <button
                                type="button"
                                onClick={() => setHotTakesDeckPageIndex((prev) => Math.max(0, prev - 1))}
                                disabled={safeHotTakesPageIndex === 0}
                                title="Previous films"
                                className="p-1.5 rounded-full bg-[#2c3440]/80 hover:bg-[#445566] text-white transition-all shadow-md disabled:opacity-30 disabled:pointer-events-none cursor-pointer z-30 shrink-0"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                            )}

                            {/* Stacked Cards Deck */}
                            <div className="relative flex items-center -space-x-16 sm:-space-x-14 shrink-0 group/deck py-3 pr-6 pl-2">
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={safeHotTakesPageIndex}
                                  initial={{ opacity: 0, x: 12 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -12 }}
                                  transition={{ duration: 0.25 }}
                                  className="flex items-center -space-x-16 sm:-space-x-14"
                                >
                                  {currentHotTakesDeck.map((movie, idx) => {
                                    let baseStyle = "-rotate-6 -translate-y-1 z-10";
                                    let hoverStyle = "group-hover/deck:-translate-x-3 group-hover/deck:-rotate-12";
                                    if (idx === 1) {
                                      baseStyle = "rotate-6 translate-x-3 z-20";
                                      hoverStyle = "group-hover/deck:translate-x-5 group-hover/deck:rotate-6";
                                    } else if (idx === 2) {
                                      baseStyle = "rotate-12 translate-x-6 z-30";
                                      hoverStyle = "group-hover/deck:translate-x-12 group-hover/deck:rotate-12";
                                    }

                                    return (
                                      <a
                                        key={movie.slug || movie.filmTitle + idx}
                                        href={getLetterboxdUrl(movie)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`${movie.filmTitle} (${movie.filmYear || ""}) - Open on Letterboxd`}
                                        className={`w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-[#14181C] border-2 border-[#14181c] shadow-2xl transition-all duration-300 ease-out cursor-pointer ${baseStyle} ${hoverStyle} hover:!rotate-0 hover:!scale-105 hover:!z-50 hover:border-[#FF8000]`}
                                      >
                                        <PosterImage
                                          src={movie.posterUrl}
                                          alt={movie.filmTitle}
                                          className="w-full h-full object-cover"
                                        />
                                      </a>
                                    );
                                  })}
                                </motion.div>
                              </AnimatePresence>
                            </div>

                            {/* Right Arrow (Visible only if totalHotTakesTied > 3) */}
                            {totalHotTakesTied > 3 && (
                              <button
                                type="button"
                                onClick={() => setHotTakesDeckPageIndex((prev) => Math.min(maxHotTakesDeckPage, prev + 1))}
                                disabled={safeHotTakesPageIndex >= maxHotTakesDeckPage}
                                title="Next films"
                                className="p-1.5 rounded-full bg-[#2c3440]/80 hover:bg-[#445566] text-white transition-all shadow-md disabled:opacity-30 disabled:pointer-events-none cursor-pointer z-30 shrink-0"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <a
                            href={getLetterboxdUrl(currentHotTakesDeck[0])}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-[#14181C] border-2 border-[#FF8000]/60 shadow-2xl relative block hover:scale-105 transition-transform duration-300"
                          >
                            <PosterImage
                              src={currentHotTakesDeck[0]?.posterUrl}
                              alt={currentHotTakesDeck[0]?.filmTitle}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        )}

                        {/* Hot Takes Movie Details */}
                        <div className="flex-1 text-center sm:text-left space-y-3 min-w-0">
                          {isHotTakesTied ? (
                            <>
                              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                <span className="bg-[#FF8000] text-black text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-sm shrink-0">
                                  <Flame className="w-3.5 h-3.5 fill-black" />
                                  <span>Tied Hot Takes</span>
                                </span>
                                <span className="text-xs sm:text-sm text-[#9AB0C6] font-medium">
                                  {totalHotTakesTied > 3
                                    ? `(Showing ${startHotTakesTiedNum}-${endHotTakesTiedNum} of ${totalHotTakesTied} Films)`
                                    : `(${totalHotTakesTied} Films)`}
                                </span>
                              </div>

                              <div className="flex flex-col items-center sm:items-start space-y-1.5 py-0.5">
                                {currentHotTakesDeck.map((movie, idx) => (
                                  <div
                                    key={movie.slug || movie.filmTitle + idx}
                                    className="flex items-start space-x-2 text-base sm:text-lg md:text-xl font-bold text-white leading-tight"
                                  >
                                    <span className="text-[#FF8000] text-base sm:text-lg leading-none select-none mt-1 shrink-0">•</span>
                                    <a
                                      href={getLetterboxdUrl(movie)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:text-[#FF8000] transition-colors group/item inline leading-snug break-words"
                                    >
                                      <span className="break-words">{movie.filmTitle}</span>
                                      <ExternalLink className="w-3.5 h-3.5 text-[#9AB0C6] group-hover/item:text-[#FF8000] opacity-0 group-hover/item:opacity-100 transition-all inline-block ml-1 -translate-y-0.5 shrink-0" />
                                    </a>
                                  </div>
                                ))}
                              </div>

                              <p className="text-xs text-[#9AB0C6]/80 italic">
                                Hover over the deck to reveal individual posters.
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                <span className="bg-[#FF8000] text-black text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-sm shrink-0">
                                  <Flame className="w-3.5 h-3.5 fill-black" />
                                  <span>Hot Take</span>
                                </span>
                                <span className="text-xs sm:text-sm text-[#9AB0C6] font-medium">
                                  (1 Film)
                                </span>
                              </div>

                              <div className="flex items-start justify-center sm:justify-start space-x-2 text-xl sm:text-2xl font-bold text-white leading-tight">
                                <span className="text-[#FF8000] text-lg leading-none select-none mt-1 shrink-0">•</span>
                                <a
                                  href={getLetterboxdUrl(currentHotTakesDeck[0])}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-[#FF8000] transition-colors group/item inline leading-snug break-words"
                                >
                                  <span className="break-words">{currentHotTakesDeck[0]?.filmTitle}</span>
                                  <ExternalLink className="w-4 h-4 text-[#9AB0C6] group-hover/item:text-[#FF8000] opacity-0 group-hover/item:opacity-100 transition-all inline-block ml-1.5 -translate-y-0.5 shrink-0" />
                                </a>
                              </div>

                              <p className="text-xs text-[#9AB0C6]/80 italic">
                                Hover over the deck to reveal individual posters.
                              </p>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      /* Fallback when no rating disagreement exists */
                      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 text-center sm:text-left py-2">
                        <div className="w-20 h-20 shrink-0 rounded-2xl bg-[#14181C] border border-[#FF8000]/50 flex items-center justify-center text-4xl shadow-xl">
                          🤝
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-center sm:justify-start space-x-2">
                            <span className="bg-[#FF8000] text-black text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full">
                              NO POLARIZING TAKES
                            </span>
                          </div>
                          <h3 className="text-xl sm:text-2xl font-bold text-white">
                            Total Cinematic Harmony
                          </h3>
                          <p className="text-xs sm:text-sm text-[#9AB0C6]">
                            {result.user1.displayName} and {result.user2.displayName} rated their shared films with consistent scores. No major disagreements found!
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  /* 3. SLAYT (WATCHLIST ROULETTE - 60° DÖNEN SADE ALTIPATLAR ŞARJÖRÜ) */
                  <motion.div
                    key="spotlight-watchlist-roulette"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28, ease: "easeInOut" }}
                    className="w-full flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-6"
                  >
                    {isLoadingWatchlist && !currentRouletteMovie ? (
                      <div className="w-full py-8 flex flex-col items-center justify-center space-y-2">
                        <RefreshCw className="w-6 h-6 text-[#40BCF4] animate-spin" />
                        <p className="text-xs text-[#9AB0C6]">Loading Watchlist from Letterboxd...</p>
                      </div>
                    ) : currentRouletteMovie ? (
                      <>
                        {/* 6 Afişin Önceden Yüklenmesi (Preload Images) */}
                        <div className="hidden pointer-events-none" aria-hidden="true">
                          {rouletteRecommendations.map((m) => (
                            <img
                              key={`preload-${m.slug || m.filmTitle}`}
                              src={m.posterUrl}
                              alt=""
                              loading="eager"
                            />
                          ))}
                        </div>

                        {/* Sol: Film Afişi veya Başlangıç Hazır Kartı */}
                        <div className="relative shrink-0">
                          <AnimatePresence mode="wait">
                            {hasFired ? (
                              <motion.a
                                key={currentRouletteMovie.slug || currentRouletteMovie.filmTitle}
                                href={currentRouletteMovie.letterboxdUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${currentRouletteMovie.filmTitle} (${currentRouletteMovie.filmYear || ""}) - Open on Letterboxd`}
                                initial={{ opacity: 0, scale: 0.94, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: -4 }}
                                transition={{ duration: 0.22 }}
                                className="w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-[#14181C] border-2 border-[#40BCF4] shadow-[0_0_25px_rgba(64,188,244,0.35)] relative block hover:scale-105 transition-transform duration-300 cursor-pointer group/poster"
                              >
                                <PosterImage
                                  src={currentRouletteMovie.posterUrl}
                                  alt={currentRouletteMovie.filmTitle}
                                  className="w-full h-full object-cover group-hover/poster:brightness-110 transition-all"
                                />
                                <div className="absolute top-1.5 left-1.5 bg-[#14181C]/90 border border-[#40BCF4]/60 px-1.5 py-0.5 rounded text-[9px] font-black text-[#40BCF4] shadow">
                                  #{activeMovieIndex + 1}
                                </div>
                              </motion.a>
                            ) : (
                              <motion.div
                                key="roulette-ready-card"
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.94 }}
                                transition={{ duration: 0.22 }}
                                className="w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-[#14181C] border-2 border-dashed border-[#40BCF4]/60 shadow-[0_0_20px_rgba(64,188,244,0.2)] flex flex-col items-center justify-center p-2.5 text-center relative select-none"
                              >
                                <div className="w-11 h-11 rounded-full bg-[#40BCF4]/10 border border-[#40BCF4]/40 flex items-center justify-center mb-1.5 shadow-[0_0_12px_rgba(64,188,244,0.25)]">
                                  <Crosshair className="w-6 h-6 text-[#40BCF4] animate-pulse" />
                                </div>
                                <span className="text-[10px] font-black text-white uppercase tracking-wider">
                                  6 ROUNDS
                                </span>
                                <span className="text-[8.5px] text-[#40BCF4] font-bold tracking-widest mt-0.5 uppercase">
                                  LOADED
                                </span>
                                <div className="absolute top-1.5 left-1.5 bg-[#14181C]/90 border border-[#40BCF4]/50 px-1.5 py-0.5 rounded text-[8px] font-black text-[#40BCF4]">
                                  #1-6
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Orta: Film Bilgileri ve Öneri Nedeni veya Başlangıç Yönergesi */}
                        <div className="flex-1 text-center sm:text-left space-y-2.5 min-w-0">
                          {/* Üst Rozet & Sadece Kurşun Sayacı */}
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <span className="bg-[#40BCF4] text-black text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-sm shrink-0">
                              <Crosshair className="w-3.5 h-3.5 fill-black" />
                              <span>Watchlist Roulette</span>
                            </span>
                            <span className="text-xs sm:text-sm text-[#9AB0C6] font-medium">
                              ({bulletsRemaining > 0 ? `${bulletsRemaining} ${bulletsRemaining === 1 ? "bullet" : "bullets"} left` : "All 6 bullets spent"})
                            </span>
                          </div>

                          {/* Film Başlığı & Yılı veya Başlangıç Metni */}
                          <AnimatePresence mode="wait">
                            {hasFired ? (
                              <motion.div
                                key={currentRouletteMovie.slug || currentRouletteMovie.filmTitle}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-1.5"
                              >
                                <div className="flex items-start justify-center sm:justify-start space-x-2 text-xl sm:text-2xl font-bold text-white leading-tight">
                                  <span className="text-[#40BCF4] text-lg leading-none select-none mt-1 shrink-0">•</span>
                                  <a
                                    href={currentRouletteMovie.letterboxdUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-[#40BCF4] transition-colors group/item inline leading-snug break-words"
                                  >
                                    <span className="break-words">{currentRouletteMovie.filmTitle}</span>
                                    <ExternalLink className="w-4 h-4 text-[#9AB0C6] group-hover/item:text-[#40BCF4] opacity-0 group-hover/item:opacity-100 transition-all inline-block ml-1.5 -translate-y-0.5 shrink-0" />
                                  </a>
                                </div>

                                {/* Öneri Detayı: Önce Ortak Filmler (isMutual), Yoksa Bireysel Watchlist */}
                                {currentRouletteMovie.isMutual ? (
                                  <div className="inline-flex items-center space-x-2 bg-[#14181C] border border-[#00E054]/50 px-3 py-1.5 rounded-lg text-xs shadow-[0_0_15px_rgba(0,224,84,0.15)]">
                                    <div className="flex -space-x-1.5 shrink-0">
                                      {result.user1.avatarUrl && (
                                        <img
                                          src={result.user1.avatarUrl}
                                          alt={result.user1.displayName}
                                          className="w-4 h-4 rounded-full object-cover border border-[#00E054]"
                                        />
                                      )}
                                      {result.user2.avatarUrl && (
                                        <img
                                          src={result.user2.avatarUrl}
                                          alt={result.user2.displayName}
                                          className="w-4 h-4 rounded-full object-cover border border-[#00E054]"
                                        />
                                      )}
                                    </div>
                                    <span className="text-white font-bold">
                                      In Both of Your Watchlists{" "}
                                      <span className="text-[#00E054] font-normal">(Mutual)</span>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center space-x-2 bg-[#14181C] border border-[#2C3440] px-3 py-1.5 rounded-lg text-xs">
                                    {currentRouletteMovie.fromUserAvatar && (
                                      <img
                                        src={currentRouletteMovie.fromUserAvatar}
                                        alt={currentRouletteMovie.fromUser}
                                        className="w-4 h-4 rounded-full object-cover shrink-0"
                                      />
                                    )}
                                    <span className="text-[#9AB0C6]">
                                      From{" "}
                                      <a
                                        href={`https://letterboxd.com/${currentRouletteMovie.fromUser}/watchlist/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-white font-bold hover:text-[#40BCF4] transition-colors underline decoration-[#40BCF4]/40"
                                      >
                                        {currentRouletteMovie.fromUser}&apos;s Watchlist
                                      </a>
                                    </span>
                                  </div>
                                )}
                              </motion.div>
                            ) : (
                              <motion.div
                                key="roulette-instruction-intro"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-1"
                              >
                                <div className="text-xl sm:text-2xl font-bold text-white leading-tight">
                                  Watchlist Roulette is Ready
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <p className="text-xs text-[#9AB0C6]/80 italic">
                            {bulletsRemaining > 0
                              ? "Click the cylinder on the right to fire — one bullet disappears with each shot."
                              : "All 6 bullets spent! Cylinder empty."}
                          </p>
                        </div>

                        {/* Sağ: Sade Tasarımlı Altıpatlar Şarjörü (Ateş Efekti & Geri Tepme) */}
                        <div className="flex flex-col items-center justify-center shrink-0 space-y-1.5 ml-0 sm:ml-2 relative">
                          {/* Tetik / Ateş Patlaması Efekti (Mavi Işık / Electric Blue Flash) */}
                          <div className="relative flex items-center justify-center">
                            <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                              isFiring 
                                ? "bg-white shadow-[0_0_16px_#40BCF4,0_0_25px_#38BDF8]" 
                                : "bg-[#40BCF4] shadow-[0_0_8px_#40BCF4]"
                            }`} />
                            <AnimatePresence>
                              {isFiring && (
                                <motion.div
                                  initial={{ scale: 0.2, opacity: 1 }}
                                  animate={{ scale: [0.3, 2.5, 0], opacity: [1, 0.95, 0], y: -10 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.32, ease: "easeOut" }}
                                  className="absolute -top-3 w-14 h-14 pointer-events-none z-30 flex items-center justify-center"
                                >
                                  {/* Mavi Parlama Çemberi (Blue Muzzle Flash) */}
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-t from-[#0284C7] via-[#40BCF4] to-white blur-[2px] shadow-[0_0_32px_#40BCF4,0_0_16px_#38BDF8]" />
                                  {/* Mavi / Beyaz Ateş Kıvılcımları */}
                                  <motion.div
                                    initial={{ y: 0, opacity: 1 }}
                                    animate={{ y: -20, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="absolute w-2 h-2 rounded-full bg-white shadow-[0_0_12px_#FFFFFF,0_0_18px_#40BCF4]"
                                  />
                                  <motion.div
                                    initial={{ x: -2, y: 0, opacity: 1 }}
                                    animate={{ x: -14, y: -14, opacity: 0 }}
                                    transition={{ duration: 0.24 }}
                                    className="absolute w-1.5 h-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]"
                                  />
                                  <motion.div
                                    initial={{ x: 2, y: 0, opacity: 1 }}
                                    animate={{ x: 14, y: -14, opacity: 0 }}
                                    transition={{ duration: 0.24 }}
                                    className="absolute w-1.5 h-1.5 rounded-full bg-[#40BCF4] shadow-[0_0_8px_#40BCF4]"
                                  />
                                  <motion.div
                                    initial={{ x: -1, y: 0, opacity: 1 }}
                                    animate={{ x: -7, y: -18, opacity: 0 }}
                                    transition={{ duration: 0.22 }}
                                    className="absolute w-1 h-1 rounded-full bg-[#9DE4FF] shadow-[0_0_6px_#9DE4FF]"
                                  />
                                  <motion.div
                                    initial={{ x: 1, y: 0, opacity: 1 }}
                                    animate={{ x: 7, y: -18, opacity: 0 }}
                                    transition={{ duration: 0.22 }}
                                    className="absolute w-1 h-1 rounded-full bg-white shadow-[0_0_6px_#FFFFFF]"
                                  />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Dönen Minimalist Şarjör Butonu (Geri Tepme ile) */}
                          <motion.button
                            type="button"
                            onClick={handleSpinCylinder}
                            disabled={bulletsRemaining === 0}
                            animate={
                              isFiring
                                ? {
                                    y: [-5, 2, -1, 0],
                                    x: [0, -1.5, 1.5, 0],
                                    scale: [1, 1.08, 0.96, 1],
                                  }
                                : { y: 0, x: 0, scale: 1 }
                            }
                            transition={{ duration: 0.32, ease: "easeOut" }}
                            whileHover={bulletsRemaining > 0 ? { scale: 1.06 } : undefined}
                            whileTap={bulletsRemaining > 0 ? { scale: 0.94 } : undefined}
                            title={bulletsRemaining > 0 ? "Click to fire & spin" : "All 6 bullets spent"}
                            aria-label="Fire and spin revolver cylinder"
                            className={`relative p-1 rounded-full bg-[#14181C] border shadow-[0_4px_16px_rgba(0,0,0,0.6)] transition-all focus:outline-none ${
                              bulletsRemaining === 0
                                ? "border-[#2C3440] opacity-50 cursor-default"
                                : isFiring
                                ? "border-[#40BCF4] shadow-[0_0_26px_rgba(64,188,244,0.7)] cursor-pointer"
                                : "border-[#2C3440] hover:border-[#40BCF4]/60 cursor-pointer"
                            }`}
                          >
                            <motion.svg
                              animate={{ rotate: cylinderAngle }}
                              transition={{ type: "spring", stiffness: 220, damping: 20 }}
                              width="82"
                              height="82"
                              viewBox="-40 -40 80 80"
                              className="block"
                            >
                              {/* Sade Dış Silindir */}
                              <circle cx="0" cy="0" r="38" fill="#12161A" stroke="#252D37" strokeWidth="1.5" />
                              <circle cx="0" cy="0" r="33" fill="none" stroke="#1A2027" strokeWidth="1" strokeDasharray="2 3" />

                              {/* 6 Daire Kovan / Yuva */}
                              {[0, 1, 2, 3, 4, 5].map((k) => {
                                const angleDeg = -90 - k * 60;
                                const rad = (angleDeg * Math.PI) / 180;
                                const cx = 22 * Math.cos(rad);
                                const cy = 22 * Math.sin(rad);

                                // Her çevirmede bir tane mermi kaybolsun
                                const isSpent = k < spentBullets;
                                const isActive = k === spentBullets && bulletsRemaining > 0;

                                return (
                                  <g key={`chamber-${k}`}>
                                    {/* Boş Hazne Yuvası (Sade Daire) */}
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r="5"
                                      fill="#0A0D10"
                                      stroke={isActive ? "#40BCF4" : "#222B35"}
                                      strokeWidth="1"
                                    />

                                    {/* Mermi Kovanı: Daire şeklinde, daha küçük ve her çevirmede bir tane kaybolur */}
                                    <motion.circle
                                      cx={cx}
                                      cy={cy}
                                      r="3"
                                      initial={false}
                                      animate={{
                                        scale: isSpent ? 0 : 1,
                                        opacity: isSpent ? 0 : 1,
                                      }}
                                      transition={{ duration: 0.22, ease: "easeOut" }}
                                      fill={isActive ? (isFiring ? "#FFFFFF" : "#40BCF4") : "#8A99A8"}
                                      stroke={isActive ? (isFiring ? "#40BCF4" : "#FFFFFF") : "#566879"}
                                      strokeWidth="0.75"
                                    />

                                    {/* Aktif Mermi İçi Parlaması */}
                                    {isActive && (
                                      <circle cx={cx} cy={cy} r="1" fill={isFiring ? "#40BCF4" : "#FFFFFF"} />
                                    )}
                                  </g>
                                );
                              })}

                              {/* Sade Merkez Mili */}
                              <circle cx="0" cy="0" r="7" fill="#1A2129" stroke="#2C3440" strokeWidth="1" />
                              <circle cx="0" cy="0" r="2.5" fill="#40BCF4" />
                            </motion.svg>
                          </motion.button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 text-center sm:text-left py-2">
                        <div className="w-20 h-20 shrink-0 rounded-2xl bg-[#14181C] border border-[#40BCF4]/50 flex items-center justify-center text-4xl shadow-xl">
                          🎯
                        </div>
                        <div className="space-y-2">
                          <span className="bg-[#40BCF4] text-black text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full">
                            WATCHLIST ROULETTE
                          </span>
                          <h3 className="text-xl sm:text-2xl font-bold text-white">
                            No recommendations found
                          </h3>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pagination Dots (● ● ●) */}
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSpotlightSlide(0)}
                aria-label="Slide 1: Top Agreed"
                className={`h-1.5 transition-all rounded-full cursor-pointer ${
                  spotlightSlide === 0
                    ? "w-6 bg-[#00E054] shadow-[0_0_8px_#00E054]"
                    : "w-1.5 bg-[#9AB0C6]/40 hover:bg-[#9AB0C6]"
                }`}
              />
              <button
                type="button"
                onClick={() => setSpotlightSlide(1)}
                aria-label="Slide 2: Hot Takes"
                className={`h-1.5 transition-all rounded-full cursor-pointer ${
                  spotlightSlide === 1
                    ? "w-6 bg-[#FF8000] shadow-[0_0_8px_#FF8000]"
                    : "w-1.5 bg-[#9AB0C6]/40 hover:bg-[#9AB0C6]"
                }`}
              />
              <button
                type="button"
                onClick={() => setSpotlightSlide(2)}
                aria-label="Slide 3: Watchlist Roulette"
                className={`h-1.5 transition-all rounded-full cursor-pointer ${
                  spotlightSlide === 2
                    ? "w-6 bg-[#40BCF4] shadow-[0_0_8px_#40BCF4]"
                    : "w-1.5 bg-[#9AB0C6]/40 hover:bg-[#9AB0C6]"
                }`}
              />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-[#1B2228] via-[#242C34] to-[#1B2228] border border-[#FF8000]/40 rounded-2xl p-6 shadow-xl relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF8000]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 z-10 relative text-center sm:text-left">
              <div className="w-20 h-20 shrink-0 rounded-2xl bg-[#14181C] border border-[#FF8000]/50 flex items-center justify-center text-4xl shadow-xl">
                ☯️
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <span className="bg-[#FF8000] text-black text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full">
                    ☯️ PARALLEL UNIVERSES — NO SHARED FILMS
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-white">
                  Recommended Watchlist From Each Other&apos;s Profiles
                </h3>

                <p className="text-xs sm:text-sm text-[#9AB0C6] max-w-xl">
                  No shared films found. Below are top-rated recommendations from <span className="text-[#00E054] font-semibold">{result.user1.displayName}</span> and <span className="text-[#40BCF4] font-semibold">{result.user2.displayName}</span>&apos;s profiles.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Filter Tabs & Search / Sort Controls Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#2C3440] pb-3 gap-3">
          {/* Left: Original 3 Rounded-lg Tabs */}
          <div className="flex items-center space-x-2 overflow-x-auto py-1 shrink-0">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === "all"
                  ? "bg-[#2C3440] text-white"
                  : "text-[#9AB0C6] hover:text-white hover:bg-[#1B2228]"
              }`}
            >
              <Film className="w-4 h-4" />
              <span>All Shared ({result.sharedMovies.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("favorites")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === "favorites"
                  ? "bg-[#2C3440] text-[#00E054]"
                  : "text-[#9AB0C6] hover:text-white hover:bg-[#1B2228]"
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Mutual Favorites ({favoritesFiltered.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("hottakes")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === "hottakes"
                  ? "bg-[#2C3440] text-[#FF8000]"
                  : "text-[#9AB0C6] hover:text-white hover:bg-[#1B2228]"
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>Hot Takes ({hotTakesFiltered.length})</span>
            </button>
          </div>

          {/* Right Controls: Sort Dropdown (Available on all tabs) */}
          <div className="flex items-center space-x-2.5 w-full md:w-auto justify-end">
            {/* Sort Dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center space-x-1.5 text-xs font-semibold text-[#9AB0C6] hover:text-white transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-[#1B2228] border border-[#2C3440] hover:border-[#384454] shadow-sm"
              >
                <span className="text-[#9AB0C6] font-normal uppercase tracking-wider text-[11px]">Sort:</span>
                <span className="text-white font-bold">
                  {currentSortConfig.displayTitle}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#9AB0C6]" />
              </button>

              {isSortOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsSortOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-[#1F2730] border border-[#384454] rounded-xl shadow-2xl py-2 w-64 text-xs text-white max-h-96 overflow-y-auto">
                    {sortGroups.map((group, gIdx) => (
                      <div key={gIdx} className="mb-2 last:mb-0">
                        <div className="px-4 py-1 text-[11px] font-bold text-[#9AB0C6] tracking-wider uppercase border-b border-[#2C3440]/60 mb-1">
                          {group.category}
                        </div>
                        {group.options.map((opt) => {
                          const isSelected = opt.id === sortBy;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setSortBy(opt.id);
                                setIsSortOpen(false);
                              }}
                              className={`w-full text-left px-4 py-1.5 flex items-center space-x-2 transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-[#2C3440] text-white font-bold"
                                  : "text-[#9AB0C6] hover:bg-[#1B2228] hover:text-white"
                              }`}
                            >
                              <span className="w-4 flex items-center justify-center shrink-0">
                                {isSelected && <Check className="w-3.5 h-3.5 text-[#00E054]" />}
                              </span>
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Film Cards Grid */}
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {displayedMovies.map((movie) => {
              const letterboxdLink = getLetterboxdUrl(movie);

              return (
                <motion.a
                  key={movie.slug || movie.filmTitle}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  href={letterboxdLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${movie.filmTitle} on Letterboxd`}
                  className="bg-[#1B2228] border border-[#2C3440] rounded-xl p-4 flex space-x-4 hover:border-[#00E054]/60 hover:bg-[#242C34]/90 transition-all duration-200 group cursor-pointer shadow-md"
                >
                  {/* Poster Image */}
                  <div className="w-20 h-28 shrink-0 rounded-lg overflow-hidden bg-[#242C34] border border-[#2C3440] shadow-md relative">
                    <PosterImage
                      src={movie.posterUrl}
                      alt={movie.filmTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  {/* Movie Info & Side-by-side Star Ratings */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      {movie.isRecommendation && (
                        <div className="mb-1">
                          {movie.user1Rating !== null ? (
                            <span className="bg-[#00E054]/15 border border-[#00E054]/30 text-[#00E054] text-[9px] font-bold px-2 py-0.5 rounded-full inline-block truncate max-w-[160px]" title={result.user1.displayName}>
                              {result.user1.displayName}'s Favorite
                            </span>
                          ) : (
                            <span className="bg-[#40BCF4]/15 border border-[#40BCF4]/30 text-[#40BCF4] text-[9px] font-bold px-2 py-0.5 rounded-full inline-block truncate max-w-[160px]" title={result.user2.displayName}>
                              {result.user2.displayName}'s Favorite
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-start justify-between">
                        <h3 className="font-bold text-white text-base leading-snug group-hover:text-[#00E054] transition-colors line-clamp-2 break-words">
                          <span>{movie.filmTitle}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-[#9AB0C6] group-hover:text-[#00E054] opacity-0 group-hover:opacity-100 transition-opacity inline-block ml-1 shrink-0 -translate-y-0.5" />
                        </h3>
                      </div>
                      {(() => {
                        const subtitle = getMovieYearAndDirector(movie);
                        return subtitle ? (
                          <span
                            className="text-xs text-[#9AB0C6] font-normal truncate block max-w-full"
                            title={subtitle}
                          >
                            {subtitle}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    {/* Rating Comparison */}
                    <div className="bg-[#242C34]/80 rounded-lg p-2.5 border border-[#2C3440] grid grid-cols-2 gap-2 mt-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-[11px] text-white block font-bold truncate max-w-[120px]" title={result.user1.displayName}>
                          {result.user1.displayName}
                        </span>
                        <span className="text-[9px] text-[#9AB0C6] block font-medium truncate max-w-[120px] mb-0.5">
                          @{result.user1.username}
                        </span>
                        <LetterboxdStars rating={movie.user1Rating} color="#00E054" size="w-3.5 h-3.5" showScoreText />
                      </div>

                      <div className="space-y-0.5 border-l border-[#2C3440] pl-2.5 min-w-0">
                        <span className="text-[11px] text-white block font-bold truncate max-w-[120px]" title={result.user2.displayName}>
                          {result.user2.displayName}
                        </span>
                        <span className="text-[9px] text-[#9AB0C6] block font-medium truncate max-w-[120px] mb-0.5">
                          @{result.user2.username}
                        </span>
                        <LetterboxdStars rating={movie.user2Rating} color="#FF8000" size="w-3.5 h-3.5" showScoreText />
                      </div>
                    </div>
                  </div>
                </motion.a>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* Load More Pagination Optimization */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                setHasExpandedFilms(true);
                setShowScrollTop(true);
                setVisibleCount((prev) => prev + 24);
              }}
              className="bg-[#1B2228] hover:bg-[#242C34] text-[#9AB0C6] hover:text-white font-semibold text-xs px-6 py-2.5 rounded-lg border border-[#2C3440] hover:border-[#00E054]/50 transition-all shadow-md cursor-pointer flex items-center space-x-2"
            >
              <span>Show More Films ({filteredMovies.length - visibleCount} remaining)</span>
            </button>
          </div>
        )}

        {filteredMovies.length === 0 && (
          <div className="bg-[#1B2228] border border-[#2C3440] rounded-xl p-8 text-center text-[#9AB0C6]">
            <Film className="w-8 h-8 text-[#9AB0C6]/50 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">No films found</p>
            <p className="text-xs text-[#9AB0C6] mt-1">Try changing your search or sort criteria.</p>
          </div>
        )}
      </div>

      {/* Scroll to Top Floating Button (Visible once Show More Films is clicked) */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.7, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={handleScrollToTop}
            aria-label="Scroll to top"
            title="Scroll to top"
            className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-50 p-3 sm:p-3.5 rounded-full bg-[#1B2228]/95 hover:bg-[#00E054] text-[#9AB0C6] hover:text-black border border-[#2C3440] hover:border-[#00E054] backdrop-blur-md shadow-2xl transition-all duration-200 cursor-pointer group hover:scale-110 active:scale-95 hover:shadow-[0_0_20px_rgba(0,224,84,0.4)]"
          >
            <ArrowUp className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5 stroke-[2.5]" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* p1: Share Match Plaintext Viral Card Modal */}
      <ShareMatchModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        result={result}
        favoritesList={favoritesFiltered}
        hotTakesList={hotTakesFiltered}
      />
    </div>
  );
};

