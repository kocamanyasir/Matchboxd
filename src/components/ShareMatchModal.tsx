"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Trophy, Link2, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ComparisonResult, MatchedMovie, MIN_HOT_TAKE_DIFF } from "@/lib/types";
import { formatMovieYearAndDirector } from "@/lib/movie-credits";
import html2canvas from "html2canvas";

interface ShareMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ComparisonResult;
  favoritesList: MatchedMovie[];
  hotTakesList: MatchedMovie[];
}

function getStarString(rating: number | null): string {
  if (rating === null || rating === undefined || isNaN(rating) || rating <= 0) return "Not Rated";
  const safeRating = Math.max(0, Math.min(5, rating));
  const fullStars = Math.floor(safeRating);
  const hasHalf = safeRating % 1 >= 0.5;
  let stars = "★".repeat(Math.max(0, Math.min(5, fullStars)));
  if (hasHalf && fullStars < 5) stars += "½";
  while (stars.length < 5) {
    stars += "☆";
  }
  return `${stars} ${safeRating.toFixed(1)}`;
}

const DEFAULT_AVATAR = "/empty-avatar.webp";

// Proxy Letterboxd images via wsrv.nl to guarantee Access-Control-Allow-Origin: * for canvas exports
function getCORSFriendlyUrl(url: string | undefined): string {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith("/")) return url;
  if (url.includes("ltrbxd.com")) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&default=${encodeURIComponent(DEFAULT_AVATAR)}`;
  }
  return url;
}

export const ShareMatchModal: React.FC<ShareMatchModalProps> = ({
  isOpen,
  onClose,
  result,
  favoritesList,
  hotTakesList,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setCopied(true);
    showToast("Bağlantı panoya kopyalandı!");
    setTimeout(() => setCopied(false), 2500);
  };

  // Safe public URL for Twitter/X sharing (X web intent rejects localhost URLs)
  const xShareUrl = useMemo(() => {
    const score = result.scoreFormatted || `${result.matchPercentage}%`;
    const text = `Matchboxd: @${result.user1.username} & @${result.user2.username} had a ${score} movie taste match! 🎬🍿 Check out our comparison:`;
    const shareUrl =
      typeof window !== "undefined" &&
      !window.location.hostname.includes("localhost") &&
      !window.location.hostname.includes("127.0.0.1")
        ? window.location.href
        : `https://matchboxd.com.tr/?user1=${encodeURIComponent(result.user1.username)}&user2=${encodeURIComponent(result.user2.username)}`;
    return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
  }, [result]);

  const handleShareInstagram = async () => {
    if (isGeneratingStory) return;
    setIsGeneratingStory(true);

    try {
      if (!cardRef.current) {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
        return;
      }

      // Generate 2x crisp image without canvas taint
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#0A0D10",
        logging: false,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );

      if (!blob) {
        showToast("Görsel oluşturulamadı. Lütfen tekrar deneyin.");
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
        return;
      }

      const fileName = `matchboxd-${result.user1.username}-vs-${result.user2.username}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const isMobile =
        typeof navigator !== "undefined" &&
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      // Mobile (iOS / Android): Web Share API directly transfers photo card into Instagram Stories
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Matchboxd Match",
            text: `Matchboxd: @${result.user1.username} vs @${result.user2.username}`,
          });
          showToast("Instagram Hikayeleri ile paylaşıldı!");
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") {
            return;
          }
        }
      }

      // Always download the card image immediately for user
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      // Copy image to clipboard if supported by browser
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        } catch (e) {
          // Clipboard write not permitted in some browsers
        }
      }

      // Open Instagram Story Camera (mobile) or Instagram Web (desktop)
      if (isMobile) {
        window.location.href = "instagram://story-camera";
        showToast("Fotoğraf kartı indirildi! Instagram Hikaye kamerası açılıyor...");
      } else {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
        showToast("Fotoğraf kartı indirildi! Instagram'da hikayene ekleyebilirsin.");
      }
    } catch (err) {
      console.error("Instagram Story share error:", err);
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      showToast("Instagram açılıyor...");
    } finally {
      setIsGeneratingStory(false);
    }
  };
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Selected films: top mutual favorite and top hot take
  const selectedFavorite: MatchedMovie | null = useMemo(() => {
    if (favoritesList && favoritesList.length > 0) {
      return favoritesList[0];
    }
    return result.topMatch || (result.sharedMovies[0] ?? null);
  }, [favoritesList, result]);

  const selectedHotTake: MatchedMovie | null = useMemo(() => {
    if (hotTakesList && hotTakesList.length > 0) {
      return hotTakesList[0];
    }
    // Fallback: highest rating diff among rated shared movies (must meet MIN_HOT_TAKE_DIFF)
    const sortedByDiff = [...result.sharedMovies]
      .filter((m) => m.user1Rating !== null && m.user2Rating !== null && m.ratingDiff >= MIN_HOT_TAKE_DIFF)
      .sort((a, b) => b.ratingDiff - a.ratingDiff);
    return sortedByDiff[0] || null;
  }, [hotTakesList, result]);

  const scoreBadge =
    result.matchPercentage === 0 || result.isGenreMatchFallback
      ? "Parallel Universes"
      : "Cinephile Match";

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        {/* Backdrop (Clicking outside closes modal) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        />

        {/* Modal Dialog Content (Card + External Share Action Row) */}
        <div
          className="relative z-10 flex flex-col items-center w-full max-w-xl my-auto py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Terminal Card */}
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative bg-[#0A0D10] border border-[#2C3440] rounded-2xl w-full p-4 sm:p-6 font-mono text-white select-text shadow-2xl overflow-hidden"
          >
          {/* Top ambient glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#00E054]/5 rounded-full blur-2xl pointer-events-none" />

          {/* Terminal Card Header */}
          <div className="flex justify-between items-center text-xs text-[#9AB0C6] pb-3 border-b border-[#2C3440]/80">
            <span className="font-black text-white tracking-wider">MATCHBOXD</span>
            <span className="text-[11px] text-[#9AB0C6]">letterboxd.com</span>
          </div>

          {/* Avatars Area */}
          <div className="py-4 flex items-center justify-center space-x-6 sm:space-x-8">
            {/* User 1 */}
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-[#00E054] overflow-hidden bg-[#1B2228] mx-auto shadow-md">
                <img
                  src={getCORSFriendlyUrl(result.user1.avatarUrl || DEFAULT_AVATAR)}
                  alt={result.user1.displayName}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_AVATAR;
                  }}
                />
              </div>
              <span className="text-xs text-[#9AB0C6] block mt-1.5 font-medium">
                @{result.user1.username}
              </span>
            </div>

            <div className="text-xs font-black text-[#9AB0C6] bg-[#1B2228] px-2.5 py-1 rounded border border-[#2C3440]">
              VS
            </div>

            {/* User 2 */}
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-[#40BCF4] overflow-hidden bg-[#1B2228] mx-auto shadow-md">
                <img
                  src={getCORSFriendlyUrl(result.user2.avatarUrl || DEFAULT_AVATAR)}
                  alt={result.user2.displayName}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_AVATAR;
                  }}
                />
              </div>
              <span className="text-xs text-[#9AB0C6] block mt-1.5 font-medium">
                @{result.user2.username}
              </span>
            </div>
          </div>

          {/* Neon Score & Badge */}
          <div className="text-center pb-4 border-b border-[#2C3440]/80 space-y-1.5">
            <div className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              {result.scoreFormatted || `${result.matchPercentage}%`}
            </div>
            <div>
              <span className="inline-block px-3 py-0.5 rounded-full text-xs font-bold border border-[#00E054]/40 bg-[#00E054]/10 text-[#00E054]">
                [ {scoreBadge} ]
              </span>
            </div>
            <div className="text-xs text-[#9AB0C6] pt-1.5 sm:pt-2">
              &quot;{result.sharedMovies.length} Shared Films Tested&quot;
            </div>
          </div>

              {/* MUTUAL FAVORITE SECTION */}
              <div className="py-4 border-b border-[#2C3440]/80 space-y-2">
                <div className="text-xs font-bold text-[#00E054] tracking-wider uppercase flex items-center space-x-1.5">
                  <Trophy className="w-3.5 h-3.5 shrink-0" />
                  <span>MUTUAL FAVORITES</span>
                </div>

                {selectedFavorite ? (
                  <div className="border border-[#2C3440] rounded-lg p-3 bg-[#12161B] flex items-center space-x-3">
                    {/* Poster Thumbnail */}
                    <div className="w-12 h-16 sm:w-14 sm:h-20 shrink-0 rounded bg-[#1B2228] border border-[#2C3440] overflow-hidden relative">
                      {selectedFavorite.posterUrl ? (
                        <img
                          src={getCORSFriendlyUrl(selectedFavorite.posterUrl)}
                          alt={selectedFavorite.filmTitle}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-[#9AB0C6] p-1 text-center">
                          POSTER
                        </div>
                      )}
                    </div>

                    {/* Movie Info & Ratings - Full usernames, no truncation */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-bold text-white text-xs sm:text-sm truncate">
                        {selectedFavorite.filmTitle}{" "}
                        {(() => {
                          const info = formatMovieYearAndDirector(selectedFavorite);
                          return info ? (
                            <span className="text-[#9AB0C6] font-normal">
                              ({info})
                            </span>
                          ) : null;
                        })()}
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[#9AB0C6] whitespace-nowrap">
                            {result.user1.displayName}:
                          </span>
                          <span className="text-[#00E054] font-bold shrink-0">
                            {getStarString(selectedFavorite.user1Rating)}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[#9AB0C6] whitespace-nowrap">
                            {result.user2.displayName}:
                          </span>
                          <span className="text-[#00E054] font-bold shrink-0">
                            {getStarString(selectedFavorite.user2Rating)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#9AB0C6] italic">No mutual favorites found.</div>
                )}
              </div>

              {/* HOT TAKE (BIGGEST CLASH) SECTION */}
              <div className="py-4 border-b border-[#2C3440]/80 space-y-2">
                <div className="text-xs font-bold text-[#FF8000] tracking-wider uppercase flex items-center space-x-1.5">
                  <span>🔥</span>
                  <span>HOT TAKE (BIGGEST CLASH)</span>
                </div>

                {selectedHotTake ? (
                  <div className="border border-[#2C3440] rounded-lg p-3 bg-[#12161B] flex items-center space-x-3">
                    {/* Poster Thumbnail */}
                    <div className="w-12 h-16 sm:w-14 sm:h-20 shrink-0 rounded bg-[#1B2228] border border-[#2C3440] overflow-hidden relative">
                      {selectedHotTake.posterUrl ? (
                        <img
                          src={getCORSFriendlyUrl(selectedHotTake.posterUrl)}
                          alt={selectedHotTake.filmTitle}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-[#9AB0C6] p-1 text-center">
                          POSTER
                        </div>
                      )}
                    </div>

                    {/* Movie Info & Ratings - Full usernames, no truncation */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-bold text-white text-xs sm:text-sm truncate">
                        {selectedHotTake.filmTitle}{" "}
                        {(() => {
                          const info = formatMovieYearAndDirector(selectedHotTake);
                          return info ? (
                            <span className="text-[#9AB0C6] font-normal">
                              ({info})
                            </span>
                          ) : null;
                        })()}
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[#9AB0C6] whitespace-nowrap">
                            {result.user1.displayName}:
                          </span>
                          <span className="text-[#FF8000] font-bold shrink-0">
                            {getStarString(selectedHotTake.user1Rating)}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[#9AB0C6] whitespace-nowrap">
                            {result.user2.displayName}:
                          </span>
                          <span className="text-[#FF8000] font-bold shrink-0">
                            {getStarString(selectedHotTake.user2Rating)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#9AB0C6] italic">No major rating disagreements.</div>
                )}
              </div>

          {/* CTA Footer */}
          <div className="pt-4 text-center text-xs text-[#9AB0C6]">
            Compare your taste at : <span className="text-white font-bold">Matchboxd.com.tr</span>
          </div>
        </motion.div>

        {/* Share Actions Box (Container) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.24, delay: 0.05 }}
          className="w-full bg-[#12161B] border border-[#2C3440] rounded-2xl p-4 sm:p-5 shadow-2xl mt-4 select-none"
        >
          {/* Toast Notice */}
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-center text-xs text-[#00E054] font-medium mb-3 bg-[#00E054]/10 border border-[#00E054]/30 py-1.5 px-3 rounded-lg"
            >
              {toastMessage}
            </motion.div>
          )}

          <div className="flex items-start justify-center space-x-8 sm:space-x-12">
            {/* Bağlantıyı Kopyala */}
            <div className="flex flex-col items-center group">
              <button
                type="button"
                onClick={handleCopyLink}
                title="Bağlantıyı Kopyala"
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl hover:scale-105 active:scale-95 cursor-pointer ${
                  copied
                    ? "bg-[#00E054]/20 border-2 border-[#00E054]"
                    : "bg-[#20272F] hover:bg-[#2B3540] border border-[#354150] hover:border-[#4B5B6E]"
                }`}
              >
                {copied ? (
                  <Check className="w-6 h-6 text-[#00E054]" />
                ) : (
                  <Link2 className="w-6 h-6 text-white" />
                )}
              </button>
              <span className="text-[11px] sm:text-xs text-[#9AB0C6] group-hover:text-white mt-2 font-medium tracking-tight text-center max-w-[80px] leading-tight">
                {copied ? "Kopyalandı!" : "Bağlantıyı kopyala"}
              </span>
            </div>

            {/* Instagram */}
            <div className="flex flex-col items-center group">
              <button
                type="button"
                onClick={handleShareInstagram}
                disabled={isGeneratingStory}
                title="Instagram Hikayesinde Paylaş"
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white transition-all duration-200 shadow-xl hover:scale-105 active:scale-95 cursor-pointer hover:shadow-[0_0_22px_rgba(220,39,67,0.5)] ${
                  isGeneratingStory ? "opacity-75 animate-pulse" : ""
                }`}
              >
                {isGeneratingStory ? (
                  <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 text-white animate-spin" />
                ) : (
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                )}
              </button>
              <span className="text-[11px] sm:text-xs text-[#9AB0C6] group-hover:text-white mt-2 font-medium tracking-tight text-center max-w-[80px] leading-tight">
                {isGeneratingStory ? "Hazırlanıyor..." : "Instagram"}
              </span>
            </div>

            {/* X (Twitter) */}
            <div className="flex flex-col items-center group">
              <a
                href={xShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="X'te Paylaş"
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black hover:bg-[#111111] border border-[#354150] hover:border-white/50 flex items-center justify-center text-white transition-all duration-200 shadow-xl hover:scale-105 active:scale-95 cursor-pointer"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <span className="text-[11px] sm:text-xs text-[#9AB0C6] group-hover:text-white mt-2 font-medium tracking-tight text-center max-w-[80px] leading-tight">
                X
              </span>
            </div>
          </div>
        </motion.div>
      </div>
      </div>
    </AnimatePresence>
  );
};
