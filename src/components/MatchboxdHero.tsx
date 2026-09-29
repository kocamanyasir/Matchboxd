"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { extractCleanUsername } from "@/lib/username-utils";

const LOADING_QUOTES = [
  "Rewatching the opening scene...",
  "Comparing 5-star masterpieces...",
  "Checking who gave half a star to The Godfather...",
  "Consulting the Criterion closet...",
  "Hunting down the mutual hot takes...",
  "Arguing about Denis Villeneuve in the background...",
  "Checking if anyone logged Barbie and Oppenheimer on the same day...",
  "Checking who logged 100 films this month without sleeping...",
  "Searching for that one film you both rated 5 stars while crying...",
  "Analyzing why you rate everything either 5 stars or 1 star...",
  "Scanning for that one person whose Top 4 changes every 3 business days...",
  "Checking if 'Drive' or 'Blade Runner 2049' is currently your entire personality...",
  "Determining who actually understood the ending of Mulholland Drive...",
  "Ignoring the 1,400 unwatched movies sitting in both your watchlists...",
  "Checking who rated a movie half a star because the main character annoyed them...",
  "Arguing whether animation is cinema (spoiler: it is)...",
  "Comparing notes on which Gaspar Noé movie gave you a headache...",
  "Calculating the emotional damage caused by the box in 'Se7en'...",
  "Determining who was hurt more by the ending of 'La La Land'...",
  "Checking if anyone based their morning routine on Patrick Bateman...",
  "Counting how many feet close-ups you had to endure for Tarantino...",
  "Checking if you understood the timeline in 'Tenet' or just nodded along to the bass...",
  "Debating if 'No Country for Old Men' counts as a comedy because of Javier Bardem's haircut...",
  "Measuring collective emotional paralysis caused by Florence Pugh in 'Midsommar'...",
  "Checking who rewatches 'Gone Girl' when they are feeling slightly inconvenienced...",
  "Checking who wore a scorpion satin jacket unironically...",
  "Measuring heart rate during Jake Gyllenhaal's monologue in 'Nightcrawler'...",
  "Waiting for Stan Lee to walk across the screen...",
  "Looking for the red balloon in 'The Shining' hallway...",
  "Wiping blood off the steering wheel with a Pulp Fiction soundtrack playing...",
  "Checking if there was actually room for Jack on that floating door in 'Titanic'...",
  "Stepping onto the rooftop in 'The Matrix' to dodge a few bullets...",
];

interface MatchboxdHeroProps {
  onStartMatch: (user1: string, user2: string) => void;
  isLoading: boolean;
  error?: string | null;
  initialUser1?: string;
  initialUser2?: string;
}

type ValidationStatus = "idle" | "checking" | "valid" | "invalid";

export const MatchboxdHero: React.FC<MatchboxdHeroProps> = ({
  onStartMatch,
  isLoading,
  error,
  initialUser1,
  initialUser2,
}) => {
  const [username1, setUsername1] = useState(initialUser1 || "yasirkocaman");
  const [status1, setStatus1] = useState<ValidationStatus>("valid");
  const [error1, setError1] = useState<string | null>(null);

  const [username2, setUsername2] = useState(initialUser2 || "ssudergull");
  const [status2, setStatus2] = useState<ValidationStatus>("valid");
  const [error2, setError2] = useState<string | null>(null);

  useEffect(() => {
    if (initialUser1) setUsername1(initialUser1);
    if (initialUser2) setUsername2(initialUser2);
  }, [initialUser1, initialUser2]);

  const timer1Ref = useRef<NodeJS.Timeout | null>(null);
  const timer2Ref = useRef<NodeJS.Timeout | null>(null);

  const [loadingQuote, setLoadingQuote] = useState("Analyzing profiles & matching films...");

  useEffect(() => {
    if (!isLoading) {
      setLoadingQuote("Analyzing profiles & matching films...");
      return;
    }

    setLoadingQuote("Analyzing profiles & matching films...");

    const interval = setInterval(() => {
      setLoadingQuote((prev) => {
        const remaining = LOADING_QUOTES.filter((q) => q !== prev);
        const nextIndex = Math.floor(Math.random() * remaining.length);
        return remaining[nextIndex];
      });
    }, 2600);

    return () => clearInterval(interval);
  }, [isLoading]);

  const validateUser = async (
    rawInput: string,
    setStatus: (s: ValidationStatus) => void,
    setErrorMsg: (e: string | null) => void,
    setUsernameState?: (u: string) => void
  ) => {
    let clean = rawInput.trim();
    if (!clean.includes("boxd.it")) {
      clean = extractCleanUsername(rawInput);
    }
    if (!clean) {
      setStatus("idle");
      setErrorMsg(null);
      return;
    }

    setStatus("checking");
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/validate-username?username=${encodeURIComponent(clean)}`);
      const data = await res.json();

      if (data.valid) {
        setStatus("valid");
        setErrorMsg(null);
        if (data.username && setUsernameState) {
          setUsernameState(data.username);
        }
      } else {
        setStatus("invalid");
        setErrorMsg(data.error || `No Letterboxd profile found for @${clean}.`);
      }
    } catch {
      // In case of transient network error
      setStatus("valid");
      setErrorMsg(null);
    }
  };

  useEffect(() => {
    validateUser("yasirkocaman", setStatus1, setError1, setUsername1);
    validateUser("ssudergull", setStatus2, setError2, setUsername2);
  }, []);

  // Debounced input handlers with auto URL handle extraction
  const handleUsername1Change = (val: string) => {
    let clean = val;
    if (!val.includes("boxd.it") && (val.includes("letterboxd.com/") || val.startsWith("@") || val.startsWith("http"))) {
      clean = extractCleanUsername(val);
    }
    setUsername1(clean);
    setStatus1("idle");
    setError1(null);

    if (timer1Ref.current) clearTimeout(timer1Ref.current);
    if (clean.trim()) {
      timer1Ref.current = setTimeout(() => {
        validateUser(clean, setStatus1, setError1, setUsername1);
      }, 500);
    }
  };

  const handleUsername2Change = (val: string) => {
    let clean = val;
    if (!val.includes("boxd.it") && (val.includes("letterboxd.com/") || val.startsWith("@") || val.startsWith("http"))) {
      clean = extractCleanUsername(val);
    }
    setUsername2(clean);
    setStatus2("idle");
    setError2(null);

    if (timer2Ref.current) clearTimeout(timer2Ref.current);
    if (clean.trim()) {
      timer2Ref.current = setTimeout(() => {
        validateUser(clean, setStatus2, setError2, setUsername2);
      }, 500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean1 = username1.trim();
    const clean2 = username2.trim();
    if (!clean1 || !clean2) return;
    if (status1 === "invalid" || status2 === "invalid" || status1 === "checking" || status2 === "checking") {
      return;
    }
    onStartMatch(clean1, clean2);
  };

  const isFormDisabled =
    isLoading ||
    !username1.trim() ||
    !username2.trim() ||
    status1 === "invalid" ||
    status2 === "invalid" ||
    status1 === "checking" ||
    status2 === "checking";

  return (
    <div className="relative min-h-screen w-full bg-[#14181C] text-white flex flex-col justify-between items-center px-4 py-8 select-none">
      {/* Cinematic Ambient Glow Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-[#FF8000]/10 via-[#00E054]/10 to-[#40BCF4]/10 rounded-full blur-[140px] opacity-40 animate-pulse-glow" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 my-auto w-full max-w-md flex flex-col items-center">
        {/* Letterboxd 3-Dots Logo & Matchboxd Title */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="flex items-center space-x-1.5">
            <span className="w-4 h-4 rounded-full bg-[#FF8000] shadow-[0_0_10px_rgba(255,128,0,0.5)]" />
            <span className="w-4 h-4 rounded-full bg-[#00E054] shadow-[0_0_10px_rgba(0,224,84,0.5)]" />
            <span className="w-4 h-4 rounded-full bg-[#40BCF4] shadow-[0_0_10px_rgba(64,188,244,0.5)]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white font-sans">
            Matchboxd
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-[#9AB0C6] text-center text-sm md:text-base mb-8 font-medium">
          Compare your Letterboxd film taste with friends!
        </p>

        {/* Input Card Container */}
        <div className="w-full bg-[#1B2228]/80 backdrop-blur-md border border-[#2C3440] rounded-xl p-6 shadow-2xl space-y-5">
          {error && (
            <div className="flex items-center space-x-2 bg-red-900/30 border border-red-500/40 text-red-200 text-xs rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#00E054] animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-3.5 h-3.5 rounded-full bg-[#FF8000] animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-3.5 h-3.5 rounded-full bg-[#40BCF4] animate-bounce"></span>
              </div>
              <div className="min-h-[3.75rem] flex items-center justify-center px-4 text-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={loadingQuote}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35 }}
                    className="text-[#9AB0C6] text-sm font-medium tracking-wide text-center leading-relaxed max-w-sm sm:max-w-md pb-1"
                  >
                    {loadingQuote}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* First Username */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#9AB0C6] tracking-wide">
                  First Profile
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={username1}
                    placeholder="Enter username, profile URL or boxd.it link..."
                    onChange={(e) => handleUsername1Change(e.target.value)}
                    onBlur={() => username1.trim() && validateUser(username1, setStatus1, setError1, setUsername1)}
                    required
                    className={`w-full bg-[#242C34] text-white text-sm rounded-lg pl-4 pr-10 py-3 border transition-all focus:outline-none ${
                      status1 === "invalid"
                        ? "border-red-500/80 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        : status1 === "valid"
                        ? "border-[#00E054] focus:border-[#00E054] focus:ring-1 focus:ring-[#00E054]"
                        : "border-[#2C3440] focus:border-[#00E054] focus:ring-1 focus:ring-[#00E054]"
                    }`}
                  />
                  <div className="absolute right-3 flex items-center">
                    {status1 === "checking" && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#9AB0C6] pointer-events-none" />
                    )}
                    {status1 === "valid" && (
                      <div className="relative group cursor-pointer flex items-center" title="Profile verified!">
                        <CheckCircle2 className="w-4 h-4 text-[#00E054]" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex items-center space-x-1 bg-[#14181C] border border-[#00E054]/50 text-[#00E054] text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap z-30 animate-fadeIn pointer-events-none">
                          <span>Profile verified!</span>
                        </div>
                      </div>
                    )}
                    {status1 === "invalid" && (
                      <AlertCircle className="w-4 h-4 text-red-400 pointer-events-none" />
                    )}
                  </div>
                </div>
                {status1 === "invalid" && error1 && (
                  <p className="text-xs text-red-400 font-medium mt-1.5 flex items-center space-x-1 animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error1}</span>
                  </p>
                )}
              </div>

              {/* Second Username */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#9AB0C6] tracking-wide">
                  Second Profile
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={username2}
                    placeholder="Enter username, profile URL or boxd.it link..."
                    onChange={(e) => handleUsername2Change(e.target.value)}
                    onBlur={() => username2.trim() && validateUser(username2, setStatus2, setError2, setUsername2)}
                    required
                    className={`w-full bg-[#242C34] text-white text-sm rounded-lg pl-4 pr-10 py-3 border transition-all focus:outline-none ${
                      status2 === "invalid"
                        ? "border-red-500/80 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        : status2 === "valid"
                        ? "border-[#00E054] focus:border-[#00E054] focus:ring-1 focus:ring-[#00E054]"
                        : "border-[#2C3440] focus:border-[#00E054] focus:ring-1 focus:ring-[#00E054]"
                    }`}
                  />
                  <div className="absolute right-3 flex items-center">
                    {status2 === "checking" && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#9AB0C6] pointer-events-none" />
                    )}
                    {status2 === "valid" && (
                      <div className="relative group cursor-pointer flex items-center" title="Profile verified!">
                        <CheckCircle2 className="w-4 h-4 text-[#00E054]" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex items-center space-x-1 bg-[#14181C] border border-[#00E054]/50 text-[#00E054] text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap z-30 animate-fadeIn pointer-events-none">
                          <span>Profile verified!</span>
                        </div>
                      </div>
                    )}
                    {status2 === "invalid" && (
                      <AlertCircle className="w-4 h-4 text-red-400 pointer-events-none" />
                    )}
                  </div>
                </div>
                {status2 === "invalid" && error2 && (
                  <p className="text-xs text-red-400 font-medium mt-1.5 flex items-center space-x-1 animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error2}</span>
                  </p>
                )}
              </div>

              {/* Subtext info guide */}
              <p className="text-[11px] text-[#9AB0C6]/80 font-normal text-center pt-1 italic">
                You can paste a Letterboxd handle (@username), profile URL, or boxd.it link.
              </p>

              {/* Match Button */}
              <button
                type="submit"
                disabled={isFormDisabled}
                className="w-full bg-[#2C3440] hover:bg-[#00E054] hover:text-black text-[#9AB0C6] hover:font-bold text-sm font-medium py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed group shadow-md"
              >
                <span>Compare Profiles</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Mandatory Footer Disclaimer */}
      <footer className="relative z-10 text-[#9AB0C6]/60 text-xs text-center mt-6">
        Not affiliated with or endorsed by Letterboxd Limited.
      </footer>
    </div>
  );
};
