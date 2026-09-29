export interface LetterboxdItem {
  guid: string;
  title: string;
  filmTitle: string;
  filmYear?: number;
  memberRating?: number; // 0.5 to 5.0
  rewatch?: boolean;
  pubDate: string;
  link: string;
  posterUrl?: string;
  tmdbId?: number;
  slug?: string;
}

export interface UserProfile {
  username: string;
  displayName: string;
  avatarUrl?: string;
  ratingsCount: number;
  items: LetterboxdItem[];
}

export interface MatchedMovie {
  filmTitle: string;
  filmYear?: number;
  user1Rating: number | null;
  user2Rating: number | null;
  ratingDiff: number;
  averageRating: number;
  posterUrl: string;
  tmdbId?: number;
  slug?: string;
  letterboxdUrl?: string;
  backdropUrl?: string;
  overview?: string;
  isRecommendation?: boolean;
  director?: string;
  cast?: string[];
}

export interface PersonSynergy {
  name: string;
  role: "director" | "actor";
  averageRating: number;
  sharedFilmsCount: number;
  filmTitles: string[];
  isFallback?: boolean;
}

export interface CinemaSynergyResult {
  unifyingDirector: PersonSynergy | null;
  unifyingActor: PersonSynergy | null;
  totalSharedFilms: number;
  hasReliableDirector: boolean;
  hasReliableActor: boolean;
}

export interface CompatibilityScoreResult {
  score: number;
  scoreFormatted: string;
}

export interface WatchlistItem {
  filmTitle: string;
  filmYear?: number;
  posterUrl: string;
  slug?: string;
  letterboxdUrl: string;
  fromUser: string;
  fromUserAvatar?: string;
  targetUser?: string;
  isMutual?: boolean;
}

export interface ComparisonResult {
  user1: UserProfile;
  user2: UserProfile;
  matchPercentage: number;
  scoreFormatted?: string;
  sharedMovies: MatchedMovie[];
  topMatch: MatchedMovie | null;
  hotTakes: MatchedMovie[]; // Movies with biggest rating disagreement
  posters: string[]; // List of poster URLs for the orbit showreel
  isGenreMatchFallback?: boolean;
  watchlistRecommendations?: WatchlistItem[];
  cinemaSynergy?: CinemaSynergyResult;
}

export const MIN_HOT_TAKE_DIFF = 2; // Minimum rating difference (in stars) to qualify as a Hot Take

