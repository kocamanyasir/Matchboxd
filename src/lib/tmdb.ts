/**
 * ============================================================================
 * [ş1] TMDb Bağımlılığını Kaldırma ve Yerel Poster Sağlayıcı Modülü
 * ============================================================================
 * Bu düzenleme "ş1" geliştirmesi kapsamında yapılmıştır.
 * "ş1 iptal" dendiğinde bu dosya açık anahtarlı orijinal haline geri döndürülecektir.
 *
 * Sağlanan İyileştirmeler:
 * 1. Sabit/açık API anahtarı ("802b2c4b88...") koddan kaldırıldı.
 * 2. Dış TMDb API bağımlılığı kapatıldı; sistem Letterboxd CDN afişlerini birincil
 *    olarak kullanır, eksik afişlerde yerel dinamik SVG afiş üretilir.
 * 3. Ağ gecikmesi, harici rate-limit ve kota aşımı riskleri tamamen sıfırlandı.
 * ============================================================================
 */

// [ş1] Harici TMDb çağrılarını devre dışı bırakan anahtar
export const ENABLE_TMDB_FETCH = false;

// [ş1] Güvenlik: Açık API anahtarı kaldırıldı, yalnızca varsa ortam değişkeninden okunur
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

function encodeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * [ş1] Yerel ve bağımsız SVG afiş üreticisi.
 * Dış bir API'ye ihtiyaç duymadan Letterboxd temasına uygun yüksek kaliteli afiş üretir.
 */
export function generateFallbackPosterDataUri(title: string, year?: number): string {
  const displayTitle = title.length > 28 ? title.slice(0, 25) + "..." : title;
  const yearText = year ? `(${year})` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#242C34"/>
        <stop offset="100%" stop-color="#14181C"/>
      </linearGradient>
    </defs>
    <rect width="500" height="750" fill="url(#g)"/>
    <rect x="20" y="20" width="460" height="710" rx="16" fill="none" stroke="#2C3440" stroke-width="4"/>
    <circle cx="250" cy="300" r="60" fill="#1B2228" stroke="#00E054" stroke-width="4"/>
    <polygon points="240,280 270,300 240,320" fill="#00E054"/>
    <text x="250" y="440" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${encodeXml(displayTitle)}</text>
    <text x="250" y="485" font-family="sans-serif" font-size="20" fill="#9AB0C6" text-anchor="middle">${yearText}</text>
    <text x="250" y="670" font-family="sans-serif" font-size="16" font-weight="bold" fill="#00E054" text-anchor="middle">MATCHBOXD</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeForComparison(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(poster for|a poster for)\s+/i, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeForComparison(title1);
  const norm2 = normalizeForComparison(title2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 100;

  if (norm1.startsWith(norm2) || norm2.startsWith(norm1)) return 80;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 65;

  const words1 = new Set(norm1.split(" ").filter((w) => w.length > 1));
  const words2 = new Set(norm2.split(" ").filter((w) => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  let common = 0;
  words1.forEach((w) => {
    if (words2.has(w)) common++;
  });

  const overlapRatio = common / Math.max(words1.size, words2.size);
  return Math.round(overlapRatio * 50);
}

function scoreTmdbMovie(item: any, searchTitle: string, searchYear?: number): number {
  if (!item || !item.poster_path) return -100;

  let score = 0;

  const titleScore = Math.max(
    calculateTitleSimilarity(searchTitle, item.title || ""),
    calculateTitleSimilarity(searchTitle, item.original_title || "")
  );
  score += titleScore;

  if (searchYear) {
    const releaseYearStr = item.release_date ? item.release_date.slice(0, 4) : "";
    const releaseYear = releaseYearStr ? parseInt(releaseYearStr, 10) : undefined;

    if (releaseYear && !isNaN(releaseYear)) {
      const yearDiff = Math.abs(releaseYear - searchYear);
      if (yearDiff === 0) {
        score += 50;
      } else if (yearDiff === 1) {
        score += 30;
      } else if (yearDiff === 2) {
        score += 10;
      } else {
        score -= 40;
      }
    }
  }

  if (item.popularity && typeof item.popularity === "number") {
    score += Math.min(item.popularity, 25);
  }

  if (item.adult) score -= 50;

  return score;
}

async function fetchTmdbJson(url: string, retries = 2): Promise<any | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Matchboxd/1.0",
        },
        next: { revalidate: 86400 },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (i === retries) {
        console.warn("TMDb fetch attempt failed:", err);
        return null;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return null;
}

/**
 * [ş1] Film afişini çözen ana fonksiyon.
 * 1. Birincil öncelik: Letterboxd CDN afişi
 * 2. İkincil öncelik: Yerel SVG afiş (TMDb sorgusu atılmadan anında üretilir)
 */
export async function fetchTmdbPoster(
  title: string,
  year?: number,
  directPosterUrl?: string
): Promise<string> {
  let cleanedDirectPoster = directPosterUrl;
  if (cleanedDirectPoster && cleanedDirectPoster.includes("a.ltrbxd.com/resized/")) {
    cleanedDirectPoster = cleanedDirectPoster.replace(
      /-\d+-\d+-\d+-\d+-crop\./,
      "-0-500-0-750-crop."
    );
  }

  const isInvalidPoster = (u?: string) =>
    !u ||
    u.includes("empty-poster") ||
    u.includes("spacer.gif") ||
    u.includes("transparent.gif") ||
    u.startsWith("data:");

  if (cleanedDirectPoster && isInvalidPoster(cleanedDirectPoster)) {
    cleanedDirectPoster = undefined;
  }

  // 1. ÖNCELİK: Letterboxd doğrudan afişi mevcutsa hemen dön
  if (cleanedDirectPoster) {
    return cleanedDirectPoster;
  }

  // [ş1] 2. ÖNCELİK: Dış TMDb sorguları devre dışı bırakıldıysa doğrudan yerel SVG üret
  if (!ENABLE_TMDB_FETCH || !TMDB_API_KEY) {
    return generateFallbackPosterDataUri(title || "Movie", year);
  }

  if (!title) {
    return generateFallbackPosterDataUri("Movie", year);
  }

  const cleanTitle = title
    .replace(/^(poster for|a poster for)\s+/i, "")
    .replace(/\s*\(\d{4}\)\s*/g, "")
    .replace(/['’]/g, "")
    .replace(/[:&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanTitle) {
    return generateFallbackPosterDataUri(title, year);
  }

  // İsteğe bağlı fallback: yalnızca ENABLE_TMDB_FETCH = true ve geçerli bir anahtar varsa çalışır
  try {
    const yearParam = year ? `&year=${year}` : "";
    const primaryUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
      cleanTitle
    )}${yearParam}&language=en-US`;

    const dataPrimary = await fetchTmdbJson(primaryUrl);

    let candidates: any[] = [];
    if (dataPrimary && Array.isArray(dataPrimary.results)) {
      candidates.push(...dataPrimary.results);
    }

    if (candidates.length === 0 || candidates.every((c) => !c.poster_path)) {
      const fallbackUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
        cleanTitle
      )}&language=en-US`;
      const dataFallback = await fetchTmdbJson(fallbackUrl);
      if (dataFallback && Array.isArray(dataFallback.results)) {
        candidates.push(...dataFallback.results);
      }
    }

    let bestResult: any = null;
    let bestScore = -Infinity;

    for (const item of candidates) {
      if (!item.poster_path) continue;
      const score = scoreTmdbMovie(item, cleanTitle, year);
      if (score > bestScore) {
        bestScore = score;
        bestResult = item;
      }
    }

    if (bestResult && bestResult.poster_path && bestScore >= 30) {
      const posterUrl = `https://image.tmdb.org/t/p/w500${bestResult.poster_path}`;
      return posterUrl;
    }
  } catch (err) {
    console.warn("TMDB API fetch error:", err);
  }

  return generateFallbackPosterDataUri(title, year);
}



