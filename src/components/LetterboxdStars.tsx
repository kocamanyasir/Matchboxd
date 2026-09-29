"use client";

import React from "react";

interface LetterboxdStarsProps {
  rating?: number | null; // Rating out of 5 (e.g. 4.5, 3.0, 5.0) or null/undefined if unrated
  color?: string; // Star fill color (default #00E054)
  size?: string;  // Icon size class (default "w-4 h-4")
  showScoreText?: boolean;
}

export const LetterboxdStars: React.FC<LetterboxdStarsProps> = ({
  rating,
  color = "#00E054",
  size = "w-4 h-4",
  showScoreText = false,
}) => {
  const componentId = React.useId();

  if (rating === null || rating === undefined || rating <= 0) {
    return (
      <span className="text-xs text-[#9AB0C6] font-medium select-none italic opacity-80">
        Unrated
      </span>
    );
  }

  const clampedRating = Math.max(0, Math.min(5, rating));
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex items-center space-x-1">
      {stars.map((starIndex) => {
        const diff = clampedRating - (starIndex - 1);
        let starType: "full" | "half" | "empty" = "empty";

        if (diff >= 0.75) {
          starType = "full";
        } else if (diff >= 0.25) {
          starType = "half";
        }

        const uniqueId = `lb-star-${componentId.replace(/:/g, "")}-${starIndex}`;

        return (
          <div key={starIndex} className="relative inline-flex items-center justify-center">
            {starType === "full" && (
              <svg viewBox="0 0 24 24" className={`${size}`} fill={color}>
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            )}

            {starType === "half" && (
              <svg viewBox="0 0 24 24" className={`${size}`}>
                <defs>
                  <linearGradient id={uniqueId}>
                    <stop offset="50%" stopColor={color} />
                    <stop offset="50%" stopColor="#2C3440" />
                  </linearGradient>
                </defs>
                <path
                  fill={`url(#${uniqueId})`}
                  d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                />
              </svg>
            )}

            {starType === "empty" && (
              <svg viewBox="0 0 24 24" className={`${size}`} fill="#2C3440">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            )}
          </div>
        );
      })}

      {showScoreText && (
        <span className="ml-1.5 text-xs font-bold text-white">
          {clampedRating.toFixed(1)}
        </span>
      )}
    </div>
  );
};
