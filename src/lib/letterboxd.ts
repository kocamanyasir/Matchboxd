import { UserProfile, LetterboxdItem, ComparisonResult, MatchedMovie, CompatibilityScoreResult, WatchlistItem, MIN_HOT_TAKE_DIFF } from "./types";
import { getMovieCredits, computeCinemaSynergy } from "./movie-credits";
import { XMLParser } from "fast-xml-parser";
// [b1] Önbellekleme ve eşzamanlılık yönetimi
import {
  b1GetUserCache,
  b1SetUserCache,
  b1GetComparisonCache,
  b1SetComparisonCache,
  b1DeleteUserCache,
} from "./b1-cache";
import {
  extractCleanUsername,
  slugifyLetterboxdTitle,
  normalizeTitle,
} from "./username-utils";
import {
  resolveBoxdItUrl,
  resolveUsernameAsync,
  validateLetterboxdUsername,
} from "./username-validator";

// [u1] Vercel-Ready Saf HTTP (Pure HTTP) Modu
// Letterboxd Cloudflare WAF, sayfa 2 ve sonrasındaki istekleri saf fetch ile çağıran istemcilere HTTP 403 (challenge) vermektedir.
// Bu sebeple Puppeteer + Stealth birincil ve eksiksiz kazıyıcı olarak kullanılır.
export const ENABLE_PURE_HTTP_U1 = false;

export {
  extractCleanUsername,
  slugifyLetterboxdTitle,
  normalizeTitle,
  resolveBoxdItUrl,
  resolveUsernameAsync,
  validateLetterboxdUsername,
};

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

export function extractRatingFromHtml(html: string): number | undefined {
  if (!html) return undefined;

  // 1. rated-X class in Letterboxd HTML (where X is 1 to 10 half-stars)
  // e.g. class="rating rated-7", class="poster-viewingdata rated-8", class="rated-3"
  const ratedMatch = html.match(/\brated-(\d+)\b/i);
  if (ratedMatch && ratedMatch[1]) {
    const val = parseInt(ratedMatch[1], 10);
    if (val >= 1 && val <= 10) {
      return val / 2; // Always convert 1..10 half-stars to 0.5..5.0 float stars
    }
  }

  // 2. data-rating attribute (Letterboxd uses 1..10 half-star integer scale: data-rating="7" -> 3.5, data-rating="4" -> 2.0)
  const dataRatingMatch = html.match(/data-rating=["'](\d+(?:\.\d+)?)["']/i);
  if (dataRatingMatch && dataRatingMatch[1]) {
    const val = parseFloat(dataRatingMatch[1]);
    if (Number.isInteger(val) && val >= 1 && val <= 10) {
      return val / 2;
    } else if (val >= 0.5 && val <= 5) {
      return val;
    }
  }

  // 3. Unicode star parsing inside rating container (e.g. <span class="rating">★★★½</span>)
  const starSpanMatch = html.match(/<span[^>]*class=["'][^"']*rating[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (starSpanMatch && starSpanMatch[1]) {
    const starText = starSpanMatch[1];
    const fullStars = (starText.match(/★/g) || []).length;
    const halfStar = /½|&frac12;|\u00BD/.test(starText) ? 0.5 : 0;
    if (fullStars > 0 || halfStar > 0) {
      return fullStars + halfStar;
    }
  }

  // 4. Unicode star parsing in viewingdata paragraph
  const viewingDataMatch = html.match(/<p[^>]*class=["'][^"']*poster-viewingdata[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  if (viewingDataMatch && viewingDataMatch[1]) {
    const text = viewingDataMatch[1];
    const fullStars = (text.match(/★/g) || []).length;
    const halfStar = /½|&frac12;|\u00BD/.test(text) ? 0.5 : 0;
    if (fullStars > 0 || halfStar > 0) {
      return fullStars + halfStar;
    }
  }

  // 5. Fallback: Any unicode stars in the html snippet
  const fullStars = (html.match(/★/g) || []).length;
  const halfStar = /½|&frac12;|\u00BD/.test(html) ? 0.5 : 0;
  if (fullStars > 0 || halfStar > 0) {
    const total = fullStars + halfStar;
    if (total <= 5) return total;
  }

  return undefined;
}

export function extractAttr(html: string, attrName: string): string {
  if (!html || !attrName) return "";

  const doubleRegex = new RegExp(`(?:\\b${attrName}\\b)\\s*=\\s*"([^"]*)"`, "i");
  const doubleMatch = html.match(doubleRegex);
  if (doubleMatch && doubleMatch[1] !== undefined) {
    return doubleMatch[1];
  }

  const singleRegex = new RegExp(`(?:\\b${attrName}\\b)\\s*=\\s*'([^']*)'`, "i");
  const singleMatch = html.match(singleRegex);
  if (singleMatch && singleMatch[1] !== undefined) {
    return singleMatch[1];
  }

  const unquotedRegex = new RegExp(`(?:\\b${attrName}\\b)\\s*=\\s*([^\\s>]+)`, "i");
  const unquotedMatch = html.match(unquotedRegex);
  if (unquotedMatch && unquotedMatch[1] !== undefined) {
    return unquotedMatch[1];
  }

  return "";
}

export function extractImgAlt(html: string): string {
  if (!html) return "";
  const imgMatch = html.match(/<img\s+[^>]*>/i);
  if (!imgMatch) return "";
  return extractAttr(imgMatch[0], "alt");
}

export const LETTERBOXD_DEFAULT_POSTER =
  "https://s.ltrbxd.com/static/images/empty-poster-500x750.png";

export function formatLetterboxdPosterUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  let url = decodeHtmlEntities(rawUrl.trim());
  if (url.startsWith("//")) {
    url = "https:" + url;
  }
  if (url.includes("a.ltrbxd.com/resized/")) {
    url = url.replace(/-\d+-\d+-\d+-\d+-crop\./, "-0-500-0-750-crop.");
  }
  return url;
}

export function extractImgSrc(html: string): string {
  if (!html) return "";
  const imgMatch = html.match(/<img\s+[^>]*>/i);
  const imgTag = imgMatch ? imgMatch[0] : "";

  const candidates: (string | undefined)[] = [];

  if (imgTag) {
    // Collect candidate attributes from <img> tag (priority: data-original, data-src, data-image, src)
    candidates.push(
      extractAttr(imgTag, "data-original"),
      extractAttr(imgTag, "data-src"),
      extractAttr(imgTag, "data-image"),
      extractAttr(imgTag, "src")
    );

    const srcset = extractAttr(imgTag, "srcset");
    if (srcset) {
      const firstSrc = srcset.split(",")[0]?.trim().split(" ")[0];
      if (firstSrc) candidates.push(firstSrc);
    }
  }

  // Also check container attributes (e.g. data-poster-url or data-image on container)
  const containerPoster =
    extractAttr(html, "data-poster-url") ||
    extractAttr(html, "data-image") ||
    extractAttr(html, "data-original");
  if (containerPoster) candidates.push(containerPoster);

  // Return the first candidate that is not an empty/spacer placeholder or avatar
  for (const c of candidates) {
    if (
      c &&
      typeof c === "string" &&
      c.trim() !== "" &&
      !c.includes("spacer.gif") &&
      !c.includes("transparent.gif") &&
      !c.includes("empty-poster") &&
      !c.includes("/avatar/") &&
      !c.startsWith("data:image/gif")
    ) {
      return c.trim();
    }
  }

  return "";
}

export function parseFilmsFromHtml(html: string): LetterboxdItem[] {
  const items: LetterboxdItem[] = [];

  // Match complete <li> poster items so poster-viewingdata containing rating is captured
  const liMatches = Array.from(
    html.matchAll(
      /<li[^>]*class=["'][^"']*(?:griditem|grid-item|poster-container|film-poster|poster)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
    )
  );

  for (const match of liMatches) {
    const liHtml = match[1];

    const filmNameAttr =
      extractAttr(liHtml, "data-film-name") ||
      extractAttr(liHtml, "data-item-name") ||
      extractAttr(liHtml, "data-name") ||
      extractAttr(liHtml, "data-title") ||
      extractAttr(liHtml, "data-original-title");

    const slugAttr =
      extractAttr(liHtml, "data-film-slug") ||
      extractAttr(liHtml, "data-item-slug") ||
      extractAttr(liHtml, "data-slug");

    const targetLinkAttr =
      extractAttr(liHtml, "data-target-link") ||
      extractAttr(liHtml, "data-item-link");

    const hrefMatch = liHtml.match(/href=["'](\/film\/[^"']+\/)["']/i);
    const imgAlt = extractImgAlt(liHtml);
    const rawImgSrc = extractImgSrc(liHtml);

    const yearAttr =
      extractAttr(liHtml, "data-film-release-year") ||
      extractAttr(liHtml, "data-release-year") ||
      extractAttr(liHtml, "data-year");

    if (filmNameAttr || slugAttr || targetLinkAttr || hrefMatch || imgAlt) {
      const rawName = filmNameAttr || imgAlt;
      const fullName = decodeHtmlEntities(rawName);

      let filmTitle = fullName;

      // Clean up common "Poster for X" alt attribute patterns
      if (filmTitle) {
        filmTitle = filmTitle
          .replace(/^(poster for|a poster for)\s+/i, "")
          .replace(/\s+poster$/i, "")
          .trim();
      }

      let filmYear: number | undefined = undefined;
      if (yearAttr && /^\d{4}$/.test(yearAttr)) {
        filmYear = Number(yearAttr);
      } else {
        const yearInTitle = (fullName || filmTitle).match(/\((\d{4})\)$/);
        if (yearInTitle) {
          filmYear = Number(yearInTitle[1]);
        }
      }

      if (filmTitle) {
        filmTitle = filmTitle.replace(/\s*\(\d{4}\)$/, "").trim();
      }

      let extractedSlug = slugAttr ? slugAttr.trim().toLowerCase() : "";
      const targetLink = targetLinkAttr || (hrefMatch ? hrefMatch[1] : "");

      // Canonical link içerisindeki slug (örn: /film/whiplash-2014/), yıl eki ile isim benzerliğini çözer
      if (targetLink && targetLink.includes("/film/")) {
        const m = targetLink.match(/\/film\/([^\/]+)\//);
        if (m && m[1]) {
          const canonicalLinkSlug = m[1].trim().toLowerCase();
          if (!extractedSlug || (canonicalLinkSlug.endsWith(`-${filmYear}`) && !extractedSlug.endsWith(`-${filmYear}`))) {
            extractedSlug = canonicalLinkSlug;
          }
        }
      }

      if (!filmYear && extractedSlug) {
        const sm = extractedSlug.match(/-(\d{4})$/);
        if (sm) {
          filmYear = Number(sm[1]);
        }
      }

      // 1. BENZERSİZ KİMLİK: Letterboxd slug zorunlu
      if (!extractedSlug) continue;
      const slug = extractedSlug;

      const memberRating = extractRatingFromHtml(liHtml);
      const link = targetLink
        ? (targetLink.startsWith("http") ? targetLink : `https://letterboxd.com${targetLink.startsWith("/") ? "" : "/"}${targetLink}`)
        : `https://letterboxd.com/film/${slug}/`;

      // 2. AFİŞ VE 3. YEDEKLEME (FALLBACK)
      let posterUrl: string = LETTERBOXD_DEFAULT_POSTER;
      if (rawImgSrc) {
        const formatted = formatLetterboxdPosterUrl(rawImgSrc);
        if (formatted && !formatted.includes("avatar") && !formatted.includes("spacer") && !formatted.includes("empty-poster")) {
          posterUrl = formatted;
        }
      }

      // Letterboxd React LazyPoster akıllı çözümleyici:
      // Eğer rawImgSrc empty-poster ise veya afiş bulunamadıysa, Letterboxd UID'sinden doğrudan yüksek çözünürlüklü CDN URL'i üret
      if (posterUrl === LETTERBOXD_DEFAULT_POSTER || !posterUrl) {
        const posteredAttr =
          extractAttr(liHtml, "data-postered-identifier") ||
          extractAttr(liHtml, "data-resolvable-poster-path") ||
          liHtml;

        let filmId = "";
        const uidMatch =
          posteredAttr.match(/"uid":\s*"film:(\d+)"/i) ||
          posteredAttr.match(/&quot;uid&quot;:&quot;film:(\d+)&quot;/i) ||
          liHtml.match(/data-item-uid=["']film:(\d+)["']/i) ||
          liHtml.match(/data-film-id=["'](\d+)["']/i);
        if (uidMatch) filmId = uidMatch[1];

        let cacheKey = "";
        const keyMatch =
          posteredAttr.match(/"cacheBustingKey":\s*"([^"]+)"/i) ||
          posteredAttr.match(/&quot;cacheBustingKey&quot;:&quot;([^&]+)&quot;/i);
        if (keyMatch) cacheKey = keyMatch[1];

        if (filmId && slug) {
          const pathParts = filmId.split("").join("/");
          posterUrl = `https://a.ltrbxd.com/resized/film-poster/${pathParts}/${filmId}-${slug}-0-500-0-750-crop.jpg${
            cacheKey ? `?v=${cacheKey}` : ""
          }`;
        }
      }

      items.push({
        guid: `letterboxd-${slug}`,
        title: filmTitle || fullName,
        filmTitle: filmTitle || fullName,
        filmYear,
        memberRating,
        pubDate: new Date().toISOString(),
        link,
        slug,
        posterUrl,
      });
    }
  }

  return items;
}

export async function fetchRssItems(cleanUsername: string): Promise<LetterboxdItem[]> {
  try {
    const res = await fetch(`https://letterboxd.com/${cleanUsername}/rss/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const xmlText = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonObj = parser.parse(xmlText);

    const itemsRaw = jsonObj?.rss?.channel?.item;
    if (!itemsRaw) return [];
    const itemArray = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];

    const result: LetterboxdItem[] = [];
    for (const item of itemArray) {
      const link = item.link || "";
      const guid = String(item.guid || "");

      // 1. NON-MOVIE FILTER: Letterboxd listeleri, günlük yazıları veya film olmayan öğeleri engelle
      if (
        link.includes("/list/") ||
        guid.includes("list") ||
        (!item["letterboxd:filmTitle"] && !link.includes("/film/"))
      ) {
        continue;
      }

      let rawTitle = decodeHtmlEntities(
        item["letterboxd:filmTitle"] || item.title || ""
      );

      // Clean title from RSS: remove rating text and year
      let filmTitle = rawTitle
        .replace(/\s*-\s*[★½]+.*$/, "")
        .replace(/\s*-\s*\d+(\.\d+)?\/\d+.*$/, "")
        .replace(/,\s*\d{4}\s*$/, "")
        .replace(/\s*\(\d{4}\)\s*$/, "")
        .trim();

      const filmYear = item["letterboxd:filmYear"]
        ? Number(item["letterboxd:filmYear"])
        : undefined;
      const memberRating = item["letterboxd:memberRating"]
        ? Number(item["letterboxd:memberRating"])
        : undefined;

      let posterUrl: string | undefined = undefined;
      const description = item.description || "";
      if (description) {
        const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
          const formatted = formatLetterboxdPosterUrl(imgMatch[1]);
          if (formatted && !formatted.includes("avatar") && !formatted.includes("spacer")) {
            posterUrl = formatted;
          }
        }
      }
      if (!posterUrl) {
        posterUrl = LETTERBOXD_DEFAULT_POSTER;
      }

      let slug = "";
      if (link) {
        const m = link.match(/\/film\/([^\/]+)\//);
        if (m) slug = m[1].trim().toLowerCase();
      }
      if (!slug) slug = slugifyLetterboxdTitle(filmTitle, filmYear);

      if (filmTitle) {
        result.push({
          guid: item.guid || slug || Math.random().toString(),
          title: filmTitle,
          filmTitle,
          filmYear,
          memberRating,
          pubDate: item.pubDate || new Date().toISOString(),
          link: link || `https://letterboxd.com/film/${slug}/`,
          slug,
          posterUrl,
        });
      }
    }
    return result;
  } catch (err) {
    return [];
  }
}

export function parseProfileDetailsFromHtml(
  html: string,
  username: string
): { displayName: string; avatarUrl?: string } {
  let displayName = "";
  let avatarUrl: string | undefined = undefined;

  if (html) {
    // 1. Display Name from h1 or profile-name or title tags
    const h1Match = html.match(/<h1[^>]*class=["'][^"']*(?:title-1|profile-name|name)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      const cleanH1 = decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, "").trim());
      if (
        cleanH1 &&
        !cleanH1.toLowerCase().includes("letterboxd") &&
        !cleanH1.toLowerCase().startsWith("films by")
      ) {
        displayName = cleanH1;
      }
    }

    if (!displayName) {
      const profileNameMatch = html.match(/class=["'][^"']*(?:profile-name|display-name)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|h1|h2|p)>/i);
      if (profileNameMatch && profileNameMatch[1]) {
        const cleanName = decodeHtmlEntities(profileNameMatch[1].replace(/<[^>]+>/g, "").trim());
        if (cleanName && !cleanName.toLowerCase().includes("letterboxd")) {
          displayName = cleanName;
        }
      }
    }

    if (!displayName) {
      const ogTitleMatch =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*property=["']og:title["']/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        const titleContent = decodeHtmlEntities(ogTitleMatch[1]);
        const cleanTitle = titleContent
          .replace(/’s\s+(?:profile|films|diary|watchlist|reviews|activity)[\s\S]*/i, "")
          .replace(/'s\s+(?:profile|films|diary|watchlist|reviews|activity)[\s\S]*/i, "")
          .replace(/^films\s+logged\s+by\s+/i, "")
          .replace(/^films\s+watched\s+by\s+/i, "")
          .replace(/\s*•\s*Letterboxd.*/i, "")
          .trim();
        if (cleanTitle && !cleanTitle.toLowerCase().includes("letterboxd")) {
          displayName = cleanTitle;
        }
      }
    }

    // 2. Avatar URL extraction from Letterboxd CDN
    const ltrbxdAvatarMatch = html.match(/(https?:\/\/[as]\.ltrbxd\.com\/(?:resized\/)?avatar\/[^\s"'>]+)/i);
    if (ltrbxdAvatarMatch && ltrbxdAvatarMatch[1]) {
      avatarUrl = decodeHtmlEntities(ltrbxdAvatarMatch[1]);
    }

    if (!avatarUrl) {
      const ogImgMatch =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*property=["']og:image["']/i) ||
        html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']twitter:image["']/i);
      if (ogImgMatch && ogImgMatch[1]) {
        const imgUrl = decodeHtmlEntities(ogImgMatch[1]);
        if (
          !imgUrl.includes("letterboxd-logo") &&
          !imgUrl.includes("default-avatar") &&
          !imgUrl.includes("default-share") &&
          !imgUrl.includes("avatar220") &&
          !imgUrl.includes("avatar80")
        ) {
          avatarUrl = imgUrl;
        }
      }
    }

    if (!avatarUrl) {
      const avatarImgMatch = html.match(/<div[^>]*class=["'][^"']*profile-avatar[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
      if (avatarImgMatch && avatarImgMatch[1]) {
        const src = decodeHtmlEntities(avatarImgMatch[1]);
        if (!src.includes("avatar220") && !src.includes("avatar80") && !src.includes("empty")) {
          avatarUrl = src;
        }
      }
    }
  }

  if (!displayName || displayName.trim() === "") {
    displayName = username;
  }

  if (!avatarUrl) {
    avatarUrl = LETTERBOXD_DEFAULT_AVATAR;
  }

  return { displayName, avatarUrl };
}

export const DEFAULT_AVATAR = "/empty-avatar.webp";
export const LETTERBOXD_DEFAULT_AVATAR = DEFAULT_AVATAR;

export async function fetchLetterboxdAvatar(cleanUsername: string): Promise<string> {
  try {
    const res = await fetch(`https://letterboxd.com/${cleanUsername}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/(https?:\/\/[as]\.ltrbxd\.com\/(?:resized\/)?avatar\/[^\s"'>]+)/i);
      if (match && match[1]) {
        const found = decodeHtmlEntities(match[1]);
        if (!found.includes("avatar-0-80") && !found.includes("default")) {
          return found;
        }
      }
      const ogImgMatch =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*property=["']og:image["']/i);
      if (ogImgMatch && ogImgMatch[1]) {
        const imgUrl = decodeHtmlEntities(ogImgMatch[1]);
        if (
          !imgUrl.includes("letterboxd-logo") &&
          !imgUrl.includes("default-avatar") &&
          !imgUrl.includes("default-share") &&
          !imgUrl.includes("avatar220") &&
          !imgUrl.includes("avatar80")
        ) {
          return imgUrl;
        }
      }
    }
  } catch (err) {
    // Fallback
  }

  return LETTERBOXD_DEFAULT_AVATAR;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseTotalFilmsCount(html: string, username: string): number | null {
  const cleanUser = username.toLowerCase();

  // Pattern 0: Tooltip or data-original-title / title (modern Letterboxd: data-original-title="349&nbsp;films")
  const p0 = /(?:data-original-title|title)=["']([0-9,]+)&nbsp;films["']/i;
  const m0 = html.match(p0);
  if (m0 && m0[1]) {
    const num = parseInt(m0[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 0b: Any &nbsp;films
  const p0b = /([0-9,]+)&nbsp;films/i;
  const m0b = html.match(p0b);
  if (m0b && m0b[1]) {
    const num = parseInt(m0b[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 1: Link with href containing /username/films/ and span.count
  const p1 = new RegExp(
    `href=["'][^"']*\\/${cleanUser}\\/films\\/["'][^>]*>[\\s\\S]*?<span[^>]*class=["'][^"']*count[^"']*["'][^>]*>([\\d,\\.\\s]+)<\\/span>`,
    "i"
  );
  const m1 = html.match(p1);
  if (m1 && m1[1]) {
    const num = parseInt(m1[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 2: Any link to /films/ with span.count
  const p2 = /href=["'][^"']*\/(?:films|films\/page\/\d+)\/["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*count[^"']*["'][^>]*>([\d,\.\s]+)<\/span>/i;
  const m2 = html.match(p2);
  if (m2 && m2[1]) {
    const num = parseInt(m2[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 3: Films heading span.count
  const p3 = /Films<\/a>\s*<span[^>]*class=["'][^"']*count[^"']*["'][^>]*>([\d,\.\s]+)<\/span>/i;
  const m3 = html.match(p3);
  if (m3 && m3[1]) {
    const num = parseInt(m3[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 4: Profile stats definition "films"
  const p4 = /<span[^>]*class=["'][^"']*value[^"']*["'][^>]*>([\d,\.\s]+)<\/span>\s*<span[^>]*class=["'][^"']*definition[^"']*["'][^>]*>films<\/span>/i;
  const m4 = html.match(p4);
  if (m4 && m4[1]) {
    const num = parseInt(m4[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 5: "X films"
  const p5 = /([\d,]+)\s+films/i;
  const m5 = html.match(p5);
  if (m5 && m5[1]) {
    const num = parseInt(m5[1].replace(/[^\d]/g, ""), 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Pattern 6: Direct pagination link count (max page * 72)
  const pageMatches = Array.from(html.matchAll(/\/films\/page\/(\d+)\//gi));
  if (pageMatches.length > 0) {
    const pageNums = pageMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
    if (pageNums.length > 0) {
      return Math.max(...pageNums) * 72;
    }
  }

  return null;
}

export async function fetchUserFilms(
  username: string,
  maxPagesCap: number = 100
): Promise<{ films: LetterboxdItem[]; profileDetails: { displayName: string; avatarUrl?: string } }> {
  const startTime = Date.now();
  const cleanUsername = await resolveUsernameAsync(username);
  const allUserMovies: LetterboxdItem[] = [];
  const seenKeys = new Set<string>();
  let profileDetails: { displayName: string; avatarUrl?: string } = {
    displayName: cleanUsername,
    avatarUrl: undefined,
  };

  const addItem = (item: LetterboxdItem) => {
    const key = item.slug ? item.slug.toLowerCase().trim() : "";
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    allUserMovies.push(item);
  };

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://letterboxd.com/",
  };

  let totalFilms = 72;
  let pagesToFetch = 1;

  for (let page = 1; page <= pagesToFetch; page++) {
    if (page > 1) {
      await sleep(400);
    }

    const pageUrl =
      page === 1
        ? `https://letterboxd.com/${cleanUsername}/films/`
        : `https://letterboxd.com/${cleanUsername}/films/page/${page}/`;

    try {
      const res = await fetch(pageUrl, { headers, next: { revalidate: 300 } });
      if (!res.ok) {
        if (page === 1) {
          throw new Error(`@${cleanUsername} filmleri Letterboxd'den alınamadı (HTTP ${res.status}).`);
        }
        continue;
      }

      const html = await res.text();

      if (page === 1) {
        const parsedCount = parseTotalFilmsCount(html, cleanUsername);
        totalFilms = parsedCount || 72;
        const totalPages = Math.ceil(totalFilms / 72);
        pagesToFetch = Math.min(totalPages, maxPagesCap);
        profileDetails = parseProfileDetailsFromHtml(html, cleanUsername);
      }

      const items = parseFilmsFromHtml(html);

      if (items.length === 0 && page > 1) {
        break;
      }

      items.forEach(addItem);
    } catch (err: any) {
      console.warn(`[@${cleanUsername}] Error fetching page ${page}:`, err);
      if (page === 1) {
        throw new Error(`@${cleanUsername} filmleri yüklenirken bağlantı hatası oluştu: ${err.message || "Sayfa 1 alınamadı."}`);
      }
    }
  }

  // Merging RSS feed items for latest high fidelity ratings
  try {
    const rssItems = await fetchRssItems(cleanUsername);
    rssItems.forEach((rssItem) => {
      const key = rssItem.slug ? rssItem.slug.toLowerCase().trim() : "";
      if (!key) return;
      if (!seenKeys.has(key)) {
        addItem(rssItem);
      } else {
        const existing = allUserMovies.find(
          (i) => (i.slug ? i.slug.toLowerCase().trim() : "") === key
        );
        if (existing) {
          if (rssItem.memberRating !== undefined) {
            existing.memberRating = rssItem.memberRating;
          }
          if ((!existing.posterUrl || existing.posterUrl.includes("empty-poster")) && rssItem.posterUrl && !rssItem.posterUrl.includes("empty-poster")) {
            existing.posterUrl = rssItem.posterUrl;
          }
        }
      }
    });
  } catch (rssErr) {
    // Silent fallback
  }

  // Enrich ratings from user's ratings endpoint
  try {
    const ratingsRes = await fetch(`https://letterboxd.com/${cleanUsername}/films/ratings/`, {
      headers,
      next: { revalidate: 300 },
    });
    if (ratingsRes.ok) {
      const ratingsHtml = await ratingsRes.text();
      const ratedItems = parseFilmsFromHtml(ratingsHtml);
      ratedItems.forEach((rItem) => {
        const key = rItem.slug ? rItem.slug.toLowerCase().trim() : "";
        if (!key) return;
        const existing = allUserMovies.find(
          (i) => (i.slug ? i.slug.toLowerCase().trim() : "") === key
        );
        if (existing) {
          if (rItem.memberRating !== undefined) {
            existing.memberRating = rItem.memberRating;
          }
          if ((!existing.posterUrl || existing.posterUrl.includes("empty-poster")) && rItem.posterUrl && !rItem.posterUrl.includes("empty-poster")) {
            existing.posterUrl = rItem.posterUrl;
          }
        } else if (!seenKeys.has(key)) {
          addItem(rItem);
        }
      });
    }
  } catch (ratingsErr) {
    // Silent fallback
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[@${cleanUsername}] Tekilleştirilmiş Net Film Sayısı: ${allUserMovies.length} (Geçen süre : ${elapsed}s)`
  );
  return { films: allUserMovies, profileDetails };
}

export async function fetchLetterboxdProfile(
  username: string,
  maxPages: number = 100,
  signal?: AbortSignal
): Promise<UserProfile> {
  const cleanUsername = await resolveUsernameAsync(username);

  // [b1] Kullanıcı profil önbelleği kontrolü
  const cachedUserData = b1GetUserCache(cleanUsername);
  if (cachedUserData) {
    return {
      username: cleanUsername,
      displayName: cachedUserData.profileDetails?.displayName || cleanUsername,
      avatarUrl: cachedUserData.profileDetails?.avatarUrl || LETTERBOXD_DEFAULT_AVATAR,
      ratingsCount: cachedUserData.films.length,
      items: cachedUserData.films,
    };
  }

  // [u1] Saf HTTP Modu: Puppeteer yerine doğrudan optimize edilmiş fetchUserFilms çalıştırılır
  const getFilmsData = async () => {
    if (!ENABLE_PURE_HTTP_U1 && typeof window === "undefined") {
      try {
        const { fetchUserFilmsWithBrowser } = await import("./puppeteer-scraper");
        return await fetchUserFilmsWithBrowser(cleanUsername, maxPages, signal);
      } catch (e) {
        return await fetchUserFilms(cleanUsername, maxPages);
      }
    }
    return await fetchUserFilms(cleanUsername, maxPages);
  };

  const [avatarUrlFromMicro, filmsData] = await Promise.all([
    fetchLetterboxdAvatar(cleanUsername),
    getFilmsData(),
  ]);

  const { films: allUserMovies, profileDetails } = filmsData;

  if (allUserMovies.length === 0) {
    const validation = await validateLetterboxdUsername(cleanUsername);
    if (!validation.valid) {
      throw new Error(`No Letterboxd profile found for @${cleanUsername}.`);
    }
  }

  const avatarUrl =
    (profileDetails.avatarUrl && !profileDetails.avatarUrl.includes("ui-avatars.com") ? profileDetails.avatarUrl : null) ||
    (avatarUrlFromMicro && !avatarUrlFromMicro.includes("ui-avatars.com") ? avatarUrlFromMicro : null) ||
    LETTERBOXD_DEFAULT_AVATAR;
  const displayName = profileDetails.displayName || cleanUsername;

  // [b1] Kullanıcı verisini önbelleğe kaydet
  b1SetUserCache(cleanUsername, {
    films: allUserMovies,
    profileDetails: {
      displayName,
      avatarUrl,
    },
  });

  return {
    username: cleanUsername,
    displayName,
    avatarUrl,
    ratingsCount: allUserMovies.length,
    items: allUserMovies,
  };
}

/**
 * Watchlist HTML sayfasından film öğelerini ayıklar
 */
function parseWatchlistHtml(
  html: string,
  cleanUsername: string,
  seenSlugs: Set<string>
): WatchlistItem[] {
  const items: WatchlistItem[] = [];
  const liMatches = Array.from(
    html.matchAll(
      /<li[^>]*class=["'][^"']*(?:griditem|poster-container)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
    )
  );

  for (const match of liMatches) {
    const liHtml = match[1];
    let slug =
      extractAttr(liHtml, "data-item-slug") ||
      extractAttr(liHtml, "data-film-slug") ||
      extractAttr(liHtml, "data-slug");

    if (!slug) {
      const linkMatch =
        liHtml.match(/data-target-link=["']\/film\/([^\/]+)\/["']/i) ||
        liHtml.match(/href=["']\/film\/([^\/]+)\/["']/i);
      if (linkMatch) slug = linkMatch[1];
    }

    if (!slug) continue;
    const cleanSlug = slug.toLowerCase().trim();
    if (seenSlugs.has(cleanSlug)) continue;
    seenSlugs.add(cleanSlug);

    const fullName =
      extractAttr(liHtml, "data-item-full-display-name") ||
      extractAttr(liHtml, "data-item-name") ||
      extractAttr(liHtml, "data-film-name") ||
      "";

    let filmTitle = decodeHtmlEntities(fullName);
    let filmYear: number | undefined = undefined;

    const yearInTitle = filmTitle.match(/\((\d{4})\)$/);
    if (yearInTitle) {
      filmYear = parseInt(yearInTitle[1], 10);
      filmTitle = filmTitle.replace(/\s*\(\d{4}\)$/, "").trim();
    } else {
      const yearAttr =
        extractAttr(liHtml, "data-film-release-year") ||
        extractAttr(liHtml, "data-release-year") ||
        extractAttr(liHtml, "data-year");
      if (yearAttr && /^\d{4}$/.test(yearAttr)) {
        filmYear = parseInt(yearAttr, 10);
      }
    }

    if (!filmTitle) {
      const alt = extractImgAlt(liHtml);
      if (alt) filmTitle = decodeHtmlEntities(alt);
    }

    // Poster URL extraction
    let posterUrl = "";
    const rawImgSrc = extractImgSrc(liHtml);
    if (rawImgSrc && !rawImgSrc.includes("empty-poster") && !rawImgSrc.includes("spacer")) {
      posterUrl = formatLetterboxdPosterUrl(rawImgSrc);
    }

    if (!posterUrl) {
      // Letterboxd LazyPoster UID resolver
      const uidMatch =
        liHtml.match(/uid&quot;:&quot;film:(\d+)&quot;/i) ||
        liHtml.match(/"uid":\s*"film:(\d+)"/i);
      if (uidMatch) {
        const filmId = uidMatch[1];
        const pathParts = filmId.split("").join("/");
        const cacheMatch =
          liHtml.match(/cacheBustingKey&quot;:&quot;([^&"]+)&quot;/i) ||
          liHtml.match(/"cacheBustingKey":\s*"([^"]+)"/i);
        const cacheKey = cacheMatch ? cacheMatch[1] : "";
        posterUrl = `https://a.ltrbxd.com/resized/film-poster/${pathParts}/${filmId}-${cleanSlug}-0-500-0-750-crop.jpg${
          cacheKey ? `?v=${cacheKey}` : ""
        }`;
      }
    }

    if (!posterUrl) {
      posterUrl = LETTERBOXD_DEFAULT_POSTER;
    }

    items.push({
      filmTitle: filmTitle || cleanSlug,
      filmYear,
      slug: cleanSlug,
      posterUrl,
      letterboxdUrl: `https://letterboxd.com/film/${cleanSlug}/`,
      fromUser: cleanUsername,
    });
  }

  return items;
}

/**
 * Letterboxd kullanıcısının izleme listesini (Watchlist) çeker:
 * https://letterboxd.com/<username>/watchlist/
 * Varsa 2. sayfayı da alarak rastgele öneri havuzunu zenginleştirir.
 */
export async function fetchUserWatchlist(username: string): Promise<WatchlistItem[]> {
  try {
    const cleanUsername = await resolveUsernameAsync(username);
    const url = `https://letterboxd.com/${cleanUsername}/watchlist/`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      console.warn(`[watchlist] Failed to fetch watchlist for ${cleanUsername}: ${res.status}`);
      return [];
    }

    const html = await res.text();
    const seenSlugs = new Set<string>();
    const items = parseWatchlistHtml(html, cleanUsername, seenSlugs);

    // Eğer 2. ve 3. sayfalar varsa, aday havuzunu genişletmek için çek
    for (let page = 2; page <= 3; page++) {
      if (html.includes(`/watchlist/page/${page}/`) || (page === 2 && html.includes("paginate-next"))) {
        try {
          const pageRes = await fetch(`https://letterboxd.com/${cleanUsername}/watchlist/page/${page}/`, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });
          if (pageRes.ok) {
            const pageHtml = await pageRes.text();
            const pageItems = parseWatchlistHtml(pageHtml, cleanUsername, seenSlugs);
            items.push(...pageItems);
            if (!pageHtml.includes(`/watchlist/page/${page + 1}/`) && !pageHtml.includes("paginate-next")) {
              break;
            }
          }
        } catch {
          break;
        }
      } else {
        break;
      }
    }

    return items;
  } catch (err) {
    console.warn(`[watchlist] Error fetching watchlist for ${username}:`, err);
    return [];
  }
}

/**
 * Letterboxd film sayfasından resmi dikey yüksek çözünürlüklü orijinal afiş URL'sini çeker.
 * Letterboxd'nin JSON-LD şemasında her film için daima dikey orijinal afiş (0-600-0-900) bulunur.
 */
export async function fetchFilmRealPoster(slug: string): Promise<string | null> {
  try {
    const cleanSlug = slug.toLowerCase().trim();
    const res = await fetch(`https://letterboxd.com/film/${cleanSlug}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. JSON-LD Schema (Letterboxd'nin resmi Movie şeması her zaman gerçek dikey 2:3 orijinal afişi içerir)
    const jsonLdMatch = html.match(
      /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i
    );
    if (jsonLdMatch) {
      try {
        const cleanJson = jsonLdMatch[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (
          parsed &&
          typeof parsed.image === "string" &&
          parsed.image.startsWith("http") &&
          !parsed.image.includes("default-share") &&
          !parsed.image.includes("empty-poster")
        ) {
          return parsed.image;
        }
      } catch {
        // Fallback'lere geç
      }
    }

    // 2. Doğrudan dikey film-poster veya sm/upload CDN linki (0-600-0-900 veya 0-500-0-750)
    const posterMatch = html.match(
      /https?:\/\/a\.ltrbxd\.com\/resized\/(?:film-poster|sm\/upload)\/[0-9a-zA-Z\/_-]+-0-\d+-0-\d+-crop\.jpg[^\s"']*/i
    );
    if (posterMatch) {
      return posterMatch[0];
    }

    // 3. Herhangi bir film-poster veya sm/upload CDN linki
    const anyPosterMatch = html.match(
      /https?:\/\/a\.ltrbxd\.com\/resized\/(?:film-poster|sm\/upload)\/[^\s"']+-crop\.jpg[^\s"']*/i
    );
    if (anyPosterMatch) {
      return anyPosterMatch[0].replace(/-\d+-\d+-\d+-\d+-crop\./, "-0-500-0-750-crop.");
    }

    // 4. data-poster-url veya poster sarmalayıcısı
    const dataPosterMatch = html.match(/data-poster-url=["']([^"']+)["']/i);
    if (dataPosterMatch && dataPosterMatch[1]) {
      return formatLetterboxdPosterUrl(dataPosterMatch[1]);
    }

    // 5. OpenGraph görseli (SADECE dikey afiş ise; yatay backdrop'lar ASLA alınmaz)
    const ogMatch = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    );
    if (
      ogMatch &&
      ogMatch[1] &&
      !ogMatch[1].includes("default-share") &&
      !ogMatch[1].includes("backdrop") &&
      !ogMatch[1].includes("1200-1200-675-675")
    ) {
      return ogMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fisher-Yates algoritması ile diziyi rastgele karıştırır
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Her iki kullanıcının watchlist'inden önce ortak filmleri (mutual),
 * ardından ilk sıradaki filmler yerine kalan filmlerden RANDOM (rastgele) filmler alarak
 * en fazla 6 filmlik öneri listesi oluşturur.
 * Seçilen 6 filmin afişleri paralel olarak doğrulanır ve önceden yüklemeye hazır hale getirilir.
 */
export async function buildWatchlistRecommendations(
  user1Watchlist: WatchlistItem[],
  user2Watchlist: WatchlistItem[],
  user1Name: string,
  user2Name: string,
  user1Avatar?: string,
  user2Avatar?: string,
  user1Watched?: LetterboxdItem[],
  user2Watched?: LetterboxdItem[]
): Promise<WatchlistItem[]> {
  // 0. İki taraftan herhangi birinin izlediği filmleri tespit etmek için Set oluştur
  const watchedSlugs = new Set<string>();
  const watchedTitles = new Set<string>();

  const registerWatched = (items?: LetterboxdItem[]) => {
    if (!items) return;
    for (const item of items) {
      if (item.slug) {
        watchedSlugs.add(item.slug.toLowerCase().trim());
      }
      const rawTitle = item.filmTitle || item.title || "";
      if (rawTitle) {
        watchedTitles.add(normalizeTitle(rawTitle));
      }
      if (item.link) {
        const m = item.link.match(/\/film\/([^\/]+)\//i);
        if (m && m[1]) {
          watchedSlugs.add(m[1].toLowerCase().trim());
        }
      }
    }
  };

  registerWatched(user1Watched);
  registerWatched(user2Watched);

  const isWatchedByEither = (item: WatchlistItem): boolean => {
    const s = (item.slug || "").toLowerCase().trim();
    if (s && watchedSlugs.has(s)) return true;
    const t = normalizeTitle(item.filmTitle || "");
    if (t && watchedTitles.has(t)) return true;
    if (item.letterboxdUrl) {
      const m = item.letterboxdUrl.match(/\/film\/([^\/]+)\//i);
      if (m && m[1] && watchedSlugs.has(m[1].toLowerCase().trim())) return true;
    }
    return false;
  };

  // İki kullanıcının da HENÜZ İZLEMEDİĞİ watchlist filmlerini filtrele
  const cleanUser1Watchlist = user1Watchlist.filter((item) => !isWatchedByEither(item));
  const cleanUser2Watchlist = user2Watchlist.filter((item) => !isWatchedByEither(item));

  const user2Map = new Map<string, WatchlistItem>();
  for (const item of cleanUser2Watchlist) {
    if (item.slug) user2Map.set(item.slug.toLowerCase().trim(), item);
  }

  const mutualList: WatchlistItem[] = [];
  const seenSlugs = new Set<string>();

  // 1. Önce her iki kullanıcının da watchlist'inde yer alan ve ikisinin de İZLEMEDİĞİ ortak filmler
  for (const item of cleanUser1Watchlist) {
    const slug = (item.slug || "").toLowerCase().trim();
    if (slug && user2Map.has(slug)) {
      mutualList.push({
        ...item,
        isMutual: true,
        fromUser: "Both",
        targetUser: "Watch Together",
      });
      seenSlugs.add(slug);
    }
  }

  // Ortak filmler her zaman en başta yer alır (varsa en fazla 6)
  const recs: WatchlistItem[] = [...mutualList.slice(0, 6)];

  // 2. Ortak filmler 6'dan azsa, ilk filmler yerine kalan filmlerden RANDOM (rastgele) seçilir
  if (recs.length < 6) {
    const u1Remaining = shuffleArray(
      cleanUser1Watchlist.filter((i) => !seenSlugs.has((i.slug || "").toLowerCase().trim()))
    );
    const u2Remaining = shuffleArray(
      cleanUser2Watchlist.filter((i) => !seenSlugs.has((i.slug || "").toLowerCase().trim()))
    );

    let idx1 = 0;
    let idx2 = 0;
    while (recs.length < 6 && (idx1 < u1Remaining.length || idx2 < u2Remaining.length)) {
      if (idx1 < u1Remaining.length && recs.length < 6) {
        const item = u1Remaining[idx1++];
        recs.push({
          ...item,
          isMutual: false,
          fromUser: user1Name,
          fromUserAvatar: user1Avatar,
          targetUser: user2Name,
        });
      }
      if (idx2 < u2Remaining.length && recs.length < 6) {
        const item = u2Remaining[idx2++];
        recs.push({
          ...item,
          isMutual: false,
          fromUser: user2Name,
          fromUserAvatar: user2Avatar,
          targetUser: user1Name,
        });
      }
    }
  }

  // 3. Önceden seçilen 6 filmin afişlerini paralel olarak doğrula/çözümle
  const top6 = recs.slice(0, 6);
  await Promise.all(
    top6.map(async (item) => {
      if (item.slug) {
        const realPoster = await fetchFilmRealPoster(item.slug);
        if (realPoster) {
          item.posterUrl = realPoster;
        }
      }
    })
  );

  return top6;
}

export const getLetterboxdUrl = (movie: any): string => {
  if (!movie) return "https://letterboxd.com/";
  if (movie.letterboxdUrl) return movie.letterboxdUrl;
  if (movie.slug) return `https://letterboxd.com/film/${movie.slug}/`;

  // Slug yoksa title'dan otomatik üret:
  const rawTitle = movie.filmTitle || movie.title || "";
  const cleanSlug = rawTitle
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `https://letterboxd.com/film/${cleanSlug}/`;
};

/**
 * Returns the Letterboxd profile URL for a director or actor
 * e.g. https://letterboxd.com/actor/brad-pitt/
 * e.g. https://letterboxd.com/director/denis-villeneuve/
 */
export const getPersonLetterboxdUrl = (name: string, role: "director" | "actor"): string => {
  if (!name) return "https://letterboxd.com/";
  const cleanSlug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `https://letterboxd.com/${role}/${cleanSlug}/`;
};

/**
 * Calculates compatibility score between two users:
 * Weighted Model: 40% Catalog Overlap + 60% Rating Affinity
 *
 * 1. Catalog Score = min(100, (ortakFilm / min(FilmA, FilmB)) * 100)
 * 2. Rating Affinity = Average of (1 - |r1 - r2| / 4.5) * 100 for all movies both users rated.
 *    If no shared movies have mutual ratings, default neutral score is 75%.
 * 3. Final Score = round((Catalog Score * 0.40) + (Rating Affinity * 0.60))
 *
 * (Not: "klm iptal" denirse eski sade formüle geri dönülecek şekilde yedeklenmiştir)
 */
export function calculateCompatibilityScore(
  ortakFilm: number,
  filmA: number,
  filmB: number,
  sharedMovies?: MatchedMovie[]
): CompatibilityScoreResult {
  if (ortakFilm <= 0 || filmA <= 0 || filmB <= 0) {
    return {
      score: 0,
      scoreFormatted: "0%",
    };
  }

  const minFilms = Math.min(filmA, filmB);
  if (minFilms <= 0) {
    return {
      score: 0,
      scoreFormatted: "0%",
    };
  }

  // 1. Katalog Örtüşmesi (Hacim): %40 Ağırlık
  const rawCatalogScore = (ortakFilm / minFilms) * 100;
  const catalogScore = Math.min(100, Math.max(0, rawCatalogScore));

  // 2. Puan Uyumu (Beğeni Benzerliği): %60 Ağırlık
  // Letterboxd'de maksimum puan farkı 4.5 olabilir (5.0 vs 0.5).
  // Fark 0 ise uyum %100, fark 4.5 ise uyum %0.
  let ratingAffinityScore = 75; // Varsayılan nötr (%75) puan uyumu (yalnızca izlendi işaretleyip puan vermeyenler için)

  if (sharedMovies && sharedMovies.length > 0) {
    const ratedSharedMovies = sharedMovies.filter(
      (m) =>
        m.user1Rating !== null &&
        m.user1Rating !== undefined &&
        m.user2Rating !== null &&
        m.user2Rating !== undefined &&
        !isNaN(Number(m.user1Rating)) &&
        !isNaN(Number(m.user2Rating))
    );

    if (ratedSharedMovies.length > 0) {
      const totalAffinity = ratedSharedMovies.reduce((acc, m) => {
        const r1 = Number(m.user1Rating);
        const r2 = Number(m.user2Rating);
        const diff = Math.abs(r1 - r2);
        const movieAffinity = Math.max(0, Math.min(100, (1 - diff / 4.5) * 100));
        return acc + movieAffinity;
      }, 0);

      ratingAffinityScore = totalAffinity / ratedSharedMovies.length;
    }
  }

  // 3. Nihai Skor: %40 Katalog + %60 Puan Uyumu
  const finalScore = Math.round(
    Math.min(100, Math.max(0, catalogScore * 0.4 + ratingAffinityScore * 0.6))
  );

  return {
    score: finalScore,
    scoreFormatted: `${finalScore}%`,
  };
}

// ============================================================================
// ============================================================================
// KANONİK AFİŞ VE EKİP (CAST/DIRECTOR) ÇÖZÜMLEME MOTORU
// ============================================================================
export interface LetterboxdFilmMetadata {
  posterUrl?: string;
  director?: string;
  cast: string[];
  filmYear?: number;
  filmTitle?: string;
}

const filmDetailsCache = new Map<string, LetterboxdFilmMetadata>();
const canonicalPosterCache = new Map<string, string>();

/**
 * Letterboxd film sayfasından resmi, en güncel JSON-LD verisini çeker.
 * İsim benzerliğinden doğabilecek yanlış film/afiş eşleşmesini engellemek için
 * yıl doğrulaması (year validation) yapar.
 */
export async function resolveLetterboxdDetails(
  slug: string,
  filmYear?: number
): Promise<LetterboxdFilmMetadata | null> {
  if (!slug) return null;
  const cleanSlug = slug.trim().toLowerCase();

  let targetYear = filmYear;
  const slugYearMatch = cleanSlug.match(/-(\d{4})$/);
  if (!targetYear && slugYearMatch) {
    targetYear = parseInt(slugYearMatch[1], 10);
  }

  const cacheKey = targetYear ? `${cleanSlug}:${targetYear}` : cleanSlug;
  if (filmDetailsCache.has(cacheKey)) {
    return filmDetailsCache.get(cacheKey)!;
  }

  const urlsToTry: string[] = [];
  urlsToTry.push(`https://letterboxd.com/film/${cleanSlug}/`);
  if (targetYear && !cleanSlug.endsWith(`-${targetYear}`)) {
    urlsToTry.push(`https://letterboxd.com/film/${cleanSlug}-${targetYear}/`);
  }
  const slugNoYear = cleanSlug.replace(/-\d{4}$/, "");
  if (slugNoYear !== cleanSlug) {
    urlsToTry.push(`https://letterboxd.com/film/${slugNoYear}/`);
  }

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) continue;

      const html = await res.text();

      // Sayfadaki yapım yılını tespit et (isim benzerliği doğrulaması için)
      let pageYear: number | undefined = undefined;
      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
      const twitterTitleMatch = html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);
      const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
      const fullTitle = ogTitleMatch?.[1] || twitterTitleMatch?.[1] || titleTagMatch?.[1] || "";
      const titleYearMatch = fullTitle.match(/\((\d{4})\)/);
      if (titleYearMatch) {
        pageYear = parseInt(titleYearMatch[1], 10);
      } else {
        const releaseYearMatch =
          html.match(/href=["']\/films\/year\/(\d{4})\/["']/i) ||
          html.match(/data-release-year=["'](\d{4})["']/i) ||
          html.match(/class=["']releaseyear["'][^>]*>[\s\S]*?(\d{4})/i);
        if (releaseYearMatch) {
          pageYear = parseInt(releaseYearMatch[1], 10);
        }
      }

      // İSİM BENZERLİĞİ DENETİMİ:
      // Eğer hedeflenen yıl belli ve sayfadaki yıl tespit edildiyse, fark 1 yıldan fazlaysa
      // bu aynı adlı başka bir yapımdır (remake/orijinal). Bu sayfayı reddet!
      if (targetYear && pageYear) {
        if (Math.abs(pageYear - targetYear) > 1) {
          continue;
        }
      }

      let posterUrl: string | undefined = undefined;
      let director: string | undefined = undefined;
      let cast: string[] = [];

      // 1. JSON-LD içinden resmi afiş, yönetmen ve oyuncu kadrosunu al
      const jsonLdMatch = html.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch && jsonLdMatch[1]) {
        try {
          const clean = jsonLdMatch[1].replace(/\/\* <\!\[CDATA\[ \*\/|\/\* \]\]> \*\//g, "").trim();
          const data = JSON.parse(clean);
          if (data && typeof data.image === "string" && data.image.includes("a.ltrbxd.com")) {
            posterUrl = data.image;
          }
          if (data && data.director) {
            if (Array.isArray(data.director)) {
              director = data.director.map((d: any) => (typeof d === "string" ? d : d?.name)).filter(Boolean).join(" & ");
            } else {
              director = typeof data.director === "string" ? data.director : data.director.name;
            }
          }
          if (data && data.actor && Array.isArray(data.actor)) {
            cast = data.actor.map((a: any) => (typeof a === "string" ? a : a?.name)).filter(Boolean);
          }
        } catch (e) {}
      }

      // 2. HTML Meta Fallback (Letterboxd <meta name="twitter:data1" content="Director Name">)
      if (!director) {
        const twitterDir = html.match(/<meta\s+name=["']twitter:data1["']\s+content=["']([^"']+)["']/i);
        if (twitterDir && twitterDir[1] && !twitterDir[1].includes("http")) {
          director = decodeHtmlEntities(twitterDir[1].trim());
        }
      }

      // 3. HTML /director/ link fallback
      if (!director) {
        const dirMatch = html.match(/href=["']\/director\/[^"']+\/["'][^>]*>([^<]+)<\/a>/i);
        if (dirMatch && dirMatch[1]) {
          const name = decodeHtmlEntities(dirMatch[1].trim());
          if (name && name !== "…" && !name.includes("More")) {
            director = name;
          }
        }
      }

      // 4. OpenGraph og:image kontrolü (16:9 yatay backdrop görseli olmamasını sağla)
      if (!posterUrl) {
        const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (
          ogMatch &&
          ogMatch[1] &&
          ogMatch[1].includes("a.ltrbxd.com") &&
          !ogMatch[1].includes("empty-poster") &&
          !ogMatch[1].includes("-1200-1200-675-675-")
        ) {
          posterUrl = ogMatch[1];
        }
      }

      if (posterUrl || director || cast.length > 0) {
        const details: LetterboxdFilmMetadata = {
          posterUrl,
          director,
          cast,
          filmYear: pageYear || targetYear,
          filmTitle: fullTitle ? fullTitle.replace(/\s*\(\d{4}\)$/, "").trim() : undefined,
        };
        filmDetailsCache.set(cacheKey, details);
        if (cleanSlug === cacheKey || !targetYear) {
          filmDetailsCache.set(cleanSlug, details);
        }
        if (posterUrl) {
          canonicalPosterCache.set(cacheKey, posterUrl);
          if (cleanSlug === cacheKey || !targetYear) {
            canonicalPosterCache.set(cleanSlug, posterUrl);
          }
        }
        return details;
      }
    } catch (e) {
      // Hata durumunda diğer URL'i dene
    }
  }

  return null;
}

/**
 * Geriye dönük uyumluluk: Resmi en güncel afişi çeker.
 */
export async function resolveCanonicalLetterboxdPoster(slug: string): Promise<string | null> {
  const details = await resolveLetterboxdDetails(slug);
  return details?.posterUrl || null;
}

/**
 * Karşılaştırma sonuçlarındaki filmlerin afişlerini ve ekip (cast/director) bilgilerini denetler.
 * Eksik afişleri veya veritabanında yer almayan filmlerin yönetmen ve oyuncu kadrosunu
 * dinamik olarak Letterboxd resmi JSON-LD kaynağından günceller.
 */
export async function ensureAuthenticPosters(movies: MatchedMovie[]): Promise<void> {
  // 1. Önce yerel veritabanında bilinen filmlerin ekip bilgilerini filme doğrudan aktar
  for (const movie of movies) {
    if (!movie.filmYear && movie.slug) {
      const sm = movie.slug.match(/-(\d{4})$/);
      if (sm) movie.filmYear = parseInt(sm[1], 10);
    }
    const local = getMovieCredits(movie);
    if (local.cast && local.cast.length > 0 && (!movie.cast || movie.cast.length === 0)) {
      movie.cast = local.cast;
    }
    if (local.director && !movie.director) {
      movie.director = local.director;
    }
  }

  const isCorruptPoster = (url?: string) =>
    !url ||
    url === LETTERBOXD_DEFAULT_POSTER ||
    url.includes("empty-poster") ||
    url.includes("spacer") ||
    url.includes("transparent.gif") ||
    url.startsWith("data:") ||
    url.includes("alternative-poster");

  // 2. Afişi eksik/bozuk olan veya henüz oyuncu kadrosu ya da yönetmeni bulunamamış filmleri tespit et
  const needsResolution = movies.filter((m) => {
    const hasCorrupt = isCorruptPoster(m.posterUrl);
    const needsCredits = (!m.cast || m.cast.length === 0) || !m.director;
    return hasCorrupt || needsCredits;
  });

  if (needsResolution.length > 0) {
    const batchSize = 8;
    for (let i = 0; i < needsResolution.length; i += batchSize) {
      const batch = needsResolution.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (movie) => {
          if (!movie.slug) return;
          const details = await resolveLetterboxdDetails(movie.slug, movie.filmYear);
          if (details) {
            // ÖNEMLİ: Yalnızca mevcut afiş gerçekten eksik/bozuksa yeni afişi ata!
            // Kullanıcının profilinden gelen çalışan ve geçerli afişi ASLA isim benzerliğiyle bozma!
            if (details.posterUrl && isCorruptPoster(movie.posterUrl)) {
              movie.posterUrl = details.posterUrl;
            }
            if (details.director) {
              movie.director = details.director;
            }
            if (details.cast && details.cast.length > 0) {
              movie.cast = details.cast;
            }
            if (!movie.filmYear && details.filmYear) {
              movie.filmYear = details.filmYear;
            }
          }
        })
      );
    }
  }

  // 3. Son denetim: Eğer hala kadrosu veya yönetmeni boş olan varsa başlık normalizasyonuyla yerel veritabanından çek
  for (const movie of movies) {
    const fallback = getMovieCredits(movie);
    if (!movie.cast || movie.cast.length === 0) {
      if (fallback.cast && fallback.cast.length > 0) {
        movie.cast = fallback.cast;
      }
    }
    if (!movie.director && fallback.director) {
      movie.director = fallback.director;
    }
  }
}

export async function compareUserProfiles(
  user1Name: string,
  user2Name: string,
  options?: { maxPages?: number; signal?: AbortSignal }
): Promise<ComparisonResult> {
  const cleanUser1 = await resolveUsernameAsync(user1Name);
  const cleanUser2 = await resolveUsernameAsync(user2Name);
  const maxPages = options?.maxPages ?? 100;
  const signal = options?.signal;

  // [b1] 1. İkili Karşılaştırma Önbelleği (Comparison Cache) Kontrolü (10 dk)
  const cachedComparison = b1GetComparisonCache(cleanUser1, cleanUser2);
  if (cachedComparison) {
    const hasCorruptOrAltPosters = cachedComparison.sharedMovies.some(
      (m) =>
        (m.posterUrl && m.posterUrl.includes("a.ltrbxd.com") && !m.posterUrl.includes("?v=")) ||
        (m.posterUrl && m.posterUrl.includes("alternative-poster"))
    );
    if (!hasCorruptOrAltPosters) {
      return cachedComparison;
    }
    console.log(`[b1-cache] Eski formatlı veya alternatif afiş tespit edildi, ikili önbellek yenileniyor...`);
  }

  let profile1: UserProfile;
  let profile2: UserProfile;

  // [b1] 2. Bireysel Profil Önbelleği (User Cache) Kontrolü (15 dk)
  let cachedUser1 = b1GetUserCache(cleanUser1);
  let cachedUser2 = b1GetUserCache(cleanUser2);

  const hasCorruptUserPosters = (cached: any) =>
    Boolean(
      cached?.films?.some(
        (f: any) => f.posterUrl && f.posterUrl.includes("a.ltrbxd.com") && !f.posterUrl.includes("?v=")
      )
    );

  if (hasCorruptUserPosters(cachedUser1)) {
    console.log(`[b1-cache] @${cleanUser1} için eski afişler tespit edildi, önbellek siliniyor.`);
    b1DeleteUserCache(cleanUser1);
    cachedUser1 = null;
  }
  if (hasCorruptUserPosters(cachedUser2)) {
    console.log(`[b1-cache] @${cleanUser2} için eski afişler tespit edildi, önbellek siliniyor.`);
    b1DeleteUserCache(cleanUser2);
    cachedUser2 = null;
  }

  if (cachedUser1 && cachedUser2) {
    console.log(`[b1-cache] HER İKİ KULLANICI ÖNBELLEKTE: @${cleanUser1} ve @${cleanUser2} için Chromium açılmadan bellekten analiz yapılıyor.`);
    profile1 = {
      username: cleanUser1,
      displayName: cachedUser1.profileDetails?.displayName || cleanUser1,
      avatarUrl: cachedUser1.profileDetails?.avatarUrl || LETTERBOXD_DEFAULT_AVATAR,
      ratingsCount: cachedUser1.films.length,
      items: cachedUser1.films,
    };
    profile2 = {
      username: cleanUser2,
      displayName: cachedUser2.profileDetails?.displayName || cleanUser2,
      avatarUrl: cachedUser2.profileDetails?.avatarUrl || LETTERBOXD_DEFAULT_AVATAR,
      ratingsCount: cachedUser2.films.length,
      items: cachedUser2.films,
    };
  } else if (cachedUser1) {
    console.log(`[b1-cache] KISMİ ÖNBELLEK: @${cleanUser1} önbellekten alındı, yalnızca @${cleanUser2} çekiliyor.`);
    profile1 = {
      username: cleanUser1,
      displayName: cachedUser1.profileDetails?.displayName || cleanUser1,
      avatarUrl: cachedUser1.profileDetails?.avatarUrl || LETTERBOXD_DEFAULT_AVATAR,
      ratingsCount: cachedUser1.films.length,
      items: cachedUser1.films,
    };
    profile2 = await fetchLetterboxdProfile(user2Name, maxPages, signal);
  } else if (cachedUser2) {
    console.log(`[b1-cache] KISMİ ÖNBELLEK: @${cleanUser2} önbellekten alındı, yalnızca @${cleanUser1} çekiliyor.`);
    profile2 = {
      username: cleanUser2,
      displayName: cachedUser2.profileDetails?.displayName || cleanUser2,
      avatarUrl: cachedUser2.profileDetails?.avatarUrl || LETTERBOXD_DEFAULT_AVATAR,
      ratingsCount: cachedUser2.films.length,
      items: cachedUser2.films,
    };
    profile1 = await fetchLetterboxdProfile(user1Name, maxPages, signal);
  } else if (ENABLE_PURE_HTTP_U1) {
    // [u1] Vercel-Ready Saf HTTP Modu:
    // Chromium/Puppeteer başlatmadan iki kullanıcıyı doğrudan paralel HTTP fetch ile 1-2 saniyede çeker.
    console.log(`[u1] Saf HTTP modu devrede: @${cleanUser1} ve @${cleanUser2} paralel olarak çekiliyor.`);
    const [p1, p2] = await Promise.all([
      fetchLetterboxdProfile(user1Name, maxPages, signal),
      fetchLetterboxdProfile(user2Name, maxPages, signal),
    ]);
    profile1 = p1;
    profile2 = p2;
  } else if (typeof window === "undefined") {
    try {
      // 1. TEK TARAYICI ÖRNEĞİ, ÇİFT SEKME (DUAL TABS / PROMISE.ALL)
      const { scrapeDualUsersWithBrowser } = await import("./puppeteer-scraper");

      const [avatar1Promise, avatar2Promise, dualScraped] = await Promise.all([
        fetchLetterboxdAvatar(cleanUser1).catch(() => null),
        fetchLetterboxdAvatar(cleanUser2).catch(() => null),
        scrapeDualUsersWithBrowser(cleanUser1, cleanUser2, maxPages, signal),
      ]);

      const { user1Data, user2Data } = dualScraped;

      // 0 film durumunda profil varlığı denetimi
      if (user1Data.films.length === 0) {
        const validation = await validateLetterboxdUsername(cleanUser1);
        if (!validation.valid) {
          throw new Error(`@${cleanUser1} için geçerli bir Letterboxd profili bulunamadı.`);
        }
      }
      if (user2Data.films.length === 0) {
        const validation = await validateLetterboxdUsername(cleanUser2);
        if (!validation.valid) {
          throw new Error(`@${cleanUser2} için geçerli bir Letterboxd profili bulunamadı.`);
        }
      }

      const isValidAvatar = (url?: string | null) =>
        Boolean(
          url &&
          !url.includes("ui-avatars.com") &&
          !url.includes("default-share") &&
          !url.includes("avatar-0-80") &&
          !url.includes("letterboxd-logo")
        );

      profile1 = {
        username: cleanUser1,
        displayName: user1Data.profileDetails?.displayName || cleanUser1,
        avatarUrl:
          (isValidAvatar(user1Data.profileDetails?.avatarUrl) ? user1Data.profileDetails.avatarUrl : null) ||
          (isValidAvatar(avatar1Promise) ? avatar1Promise : null) ||
          LETTERBOXD_DEFAULT_AVATAR,
        ratingsCount: user1Data.films.length,
        items: user1Data.films,
      };

      profile2 = {
        username: cleanUser2,
        displayName: user2Data.profileDetails?.displayName || cleanUser2,
        avatarUrl:
          (isValidAvatar(user2Data.profileDetails?.avatarUrl) ? user2Data.profileDetails.avatarUrl : null) ||
          (isValidAvatar(avatar2Promise) ? avatar2Promise : null) ||
          LETTERBOXD_DEFAULT_AVATAR,
        ratingsCount: user2Data.films.length,
        items: user2Data.films,
      };

      // [b1] Kazınan verileri kullanıcı önbelleğine kaydet
      b1SetUserCache(cleanUser1, {
        films: user1Data.films,
        profileDetails: {
          displayName: profile1.displayName,
          avatarUrl: profile1.avatarUrl,
        },
      });
      b1SetUserCache(cleanUser2, {
        films: user2Data.films,
        profileDetails: {
          displayName: profile2.displayName,
          avatarUrl: profile2.avatarUrl,
        },
      });
    } catch (dualErr: any) {
      if (
        dualErr.message &&
        (dualErr.message.includes("gizli") ||
          dualErr.message.includes("bulunamadı") ||
          dualErr.message.includes("404") ||
          dualErr.message.includes("Page not found") ||
          dualErr.message.includes("Aborted") ||
          dualErr.message.includes("iptal edildi") ||
          dualErr.message.includes("yoğun"))
      ) {
        throw dualErr;
      }
      console.warn("Çift sekme tarayıcı kazıma hatası, standart fallback'e geçiliyor:", dualErr);
      const [p1, p2] = await Promise.all([
        fetchLetterboxdProfile(user1Name, maxPages, signal),
        fetchLetterboxdProfile(user2Name, maxPages, signal),
      ]);
      profile1 = p1;
      profile2 = p2;
    }
  } else {
    const [p1, p2] = await Promise.all([
      fetchLetterboxdProfile(user1Name, maxPages, signal),
      fetchLetterboxdProfile(user2Name, maxPages, signal),
    ]);
    profile1 = p1;
    profile2 = p2;
  }

  // Index User 2 archive items strictly by unique Letterboxd slug (PRIMARY KEY)
  const user2Map = new Map<string, LetterboxdItem>();

  profile2.items.forEach((item) => {
    const slugKey = item.slug ? item.slug.toLowerCase().trim() : "";
    if (slugKey) {
      user2Map.set(slugKey, item);
    }
  });

  const sharedMovies: MatchedMovie[] = [];
  const seenSlugs = new Set<string>();

  for (const item1 of profile1.items) {
    const slug1 = item1.slug ? item1.slug.toLowerCase().trim() : "";
    if (!slug1 || seenSlugs.has(slug1)) continue;

    // Direct O(1) matching: user1Film.slug === user2Film.slug
    const item2 = user2Map.get(slug1);

    // KESİN KESİŞİM (STRICT INTERSECTION ONLY): Only include if ALSO present in user 2's archive via slug
    if (item2) {
      seenSlugs.add(slug1);

      const r1 = item1.memberRating !== undefined && item1.memberRating !== null ? Number(item1.memberRating) : null;
      const r2 = item2.memberRating !== undefined && item2.memberRating !== null ? Number(item2.memberRating) : null;

      const hasBothRatings = r1 !== null && r2 !== null && !isNaN(r1) && !isNaN(r2);
      const diff = hasBothRatings ? Math.round(Math.abs(r1 - r2) * 10) / 10 : 0;
      const avg = hasBothRatings
        ? Math.round(((r1 + r2) / 2) * 10) / 10
        : r1 !== null && !isNaN(r1)
          ? r1
          : r2 !== null && !isNaN(r2)
            ? r2
            : 0;

      // Afiş önceliklendirme: Version hash (?v=) içeren çalışan CDN linki > Herhangi geçerli link > Default poster
      const hasVersion = (url?: string) => Boolean(url && url.includes("?v="));
      const isRealPoster = (url?: string) =>
        Boolean(
          url &&
          !url.startsWith("data:") &&
          !url.includes("empty-poster") &&
          !url.includes("spacer.gif") &&
          !url.includes("transparent.gif") &&
          url !== LETTERBOXD_DEFAULT_POSTER
        );

      // Poster önceliği: Resmi afiş (a.ltrbxd.com ile ?v= versiyon hash'i), kullanıcının seçtiği /alternative-poster/'a tercih edilir
      const isOfficialPoster = (url?: string) =>
        Boolean(
          url &&
          url.includes("a.ltrbxd.com") &&
          !url.includes("alternative-poster") &&
          !url.includes("empty-poster") &&
          !url.includes("spacer") &&
          hasVersion(url)
        );

      let posterUrl = LETTERBOXD_DEFAULT_POSTER;
      if (isOfficialPoster(item1.posterUrl)) {
        posterUrl = item1.posterUrl!;
      } else if (isOfficialPoster(item2.posterUrl)) {
        posterUrl = item2.posterUrl!;
      } else if (hasVersion(item1.posterUrl) && !item1.posterUrl?.includes("alternative-poster")) {
        posterUrl = item1.posterUrl!;
      } else if (hasVersion(item2.posterUrl) && !item2.posterUrl?.includes("alternative-poster")) {
        posterUrl = item2.posterUrl!;
      } else if (hasVersion(item1.posterUrl)) {
        posterUrl = item1.posterUrl!;
      } else if (hasVersion(item2.posterUrl)) {
        posterUrl = item2.posterUrl!;
      } else if (isRealPoster(item1.posterUrl)) {
        posterUrl = item1.posterUrl!;
      } else if (isRealPoster(item2.posterUrl)) {
        posterUrl = item2.posterUrl!;
      }

      const filmSlug = slug1;
      const letterboxdUrl =
        item1.link || item2.link || `https://letterboxd.com/film/${filmSlug}/`;

      let filmYear = item1.filmYear || item2.filmYear;
      if (!filmYear && filmSlug) {
        const ym = filmSlug.match(/-(\d{4})$/);
        if (ym) filmYear = parseInt(ym[1], 10);
      }

      sharedMovies.push({
        filmTitle: item1.filmTitle,
        filmYear,
        user1Rating: r1,
        user2Rating: r2,
        ratingDiff: diff,
        averageRating: avg,
        posterUrl,
        slug: filmSlug,
        letterboxdUrl,
      });
    }
  }

  console.log(
    `[@${profile1.username}] Toplam: ${profile1.items.length} | [@${profile2.username}] Toplam: ${profile2.items.length} | KESİN ORTAK: ${sharedMovies.length}`
  );

  // Sort by highest combined rating score
  sharedMovies.sort((a, b) => {
    const bothA = a.user1Rating !== null && a.user2Rating !== null;
    const bothB = b.user1Rating !== null && b.user2Rating !== null;
    if (bothA && !bothB) return -1;
    if (!bothA && bothB) return 1;

    if (bothA && bothB) {
      const avgA = (Number(a.user1Rating) + Number(a.user2Rating)) / 2;
      const avgB = (Number(b.user1Rating) + Number(b.user2Rating)) / 2;
      if (avgB !== avgA) return avgB - avgA;
      const diffA = Math.abs(Number(a.user1Rating) - Number(a.user2Rating));
      const diffB = Math.abs(Number(b.user1Rating) - Number(b.user2Rating));
      if (diffA !== diffB) return diffA - diffB;
      return (b.filmYear || 0) - (a.filmYear || 0);
    }

    return b.averageRating - a.averageRating;
  });

  // 3. AFİŞ DOĞRULAMA VE EN GÜNCEL KANONİK AFİŞLERİ GARANTİLEME
  await ensureAuthenticPosters(sharedMovies);

  // Calculate compatibility score with weighted model: 40% Catalog Overlap + 60% Rating Affinity
  const filmA = profile1.items.length;
  const filmB = profile2.items.length;
  const ortakFilm = sharedMovies.length;

  const { score: matchPercentage, scoreFormatted } = calculateCompatibilityScore(
    ortakFilm,
    filmA,
    filmB,
    sharedMovies
  );

  let finalSharedMovies = sharedMovies;
  let posters = sharedMovies.map((m) => m.posterUrl).filter(Boolean);
  let isGenreMatchFallback = false;

  if (sharedMovies.length === 0) {
    // 0 Shared Movies -> Zıt Kutuplar Mode (%0 Kesişim)
    isGenreMatchFallback = true;

    // Extract top rated unshared movies from profile1 and profile2 for recommendations
    const user1Only = profile1.items
      .filter((i) => !user2Map.has(i.slug ? i.slug.toLowerCase().trim() : ""))
      .sort((a, b) => (b.memberRating ?? 3) - (a.memberRating ?? 3))
      .slice(0, 8);

    const user1Slugs = new Set(
      profile1.items.map((i) => (i.slug ? i.slug.toLowerCase().trim() : "")).filter(Boolean)
    );

    const user2Only = profile2.items
      .filter((i) => !user1Slugs.has(i.slug ? i.slug.toLowerCase().trim() : ""))
      .sort((a, b) => (b.memberRating ?? 3) - (a.memberRating ?? 3))
      .slice(0, 8);

    const recommendations: MatchedMovie[] = [];

    const isReal = (url?: string) =>
      Boolean(url && !url.includes("empty-poster") && !url.includes("spacer"));

    user1Only.forEach((item1) => {
      const filmSlug = item1.slug ? item1.slug.toLowerCase().trim() : "";
      if (!filmSlug) return;
      const posterUrl = isReal(item1.posterUrl) ? item1.posterUrl! : LETTERBOXD_DEFAULT_POSTER;
      recommendations.push({
        filmTitle: item1.filmTitle,
        filmYear: item1.filmYear,
        user1Rating: item1.memberRating ?? null,
        user2Rating: null,
        ratingDiff: 0,
        averageRating: item1.memberRating ?? 4.0,
        posterUrl,
        slug: filmSlug,
        letterboxdUrl: item1.link || `https://letterboxd.com/film/${filmSlug}/`,
        isRecommendation: true,
      });
    });

    user2Only.forEach((item2) => {
      const filmSlug = item2.slug ? item2.slug.toLowerCase().trim() : "";
      if (!filmSlug) return;
      const posterUrl = isReal(item2.posterUrl) ? item2.posterUrl! : LETTERBOXD_DEFAULT_POSTER;
      recommendations.push({
        filmTitle: item2.filmTitle,
        filmYear: item2.filmYear,
        user1Rating: null,
        user2Rating: item2.memberRating ?? null,
        ratingDiff: 0,
        averageRating: item2.memberRating ?? 4.0,
        posterUrl,
        slug: filmSlug,
        letterboxdUrl: item2.link || `https://letterboxd.com/film/${filmSlug}/`,
        isRecommendation: true,
      });
    });

    await ensureAuthenticPosters(recommendations);
    finalSharedMovies = recommendations;
    posters = recommendations.map((m) => m.posterUrl).filter(Boolean);
  }

  // Hot takes: both users rated & rating difference >= MIN_HOT_TAKE_DIFF stars
  const hotTakes = [...sharedMovies]
    .filter((m) => m.user1Rating !== null && m.user2Rating !== null && m.ratingDiff >= MIN_HOT_TAKE_DIFF)
    .sort((a, b) => b.ratingDiff - a.ratingDiff);

  // KURAL 1: GEÇERLİ PUAN KONTROLÜ (Hem kullanıcı 1 hem de kullanıcı 2 geçerli sayısal puan vermiş olmalı)
  const bothRatedShared = sharedMovies.filter(
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

  let topMatch: MatchedMovie | null = null;

  if (bothRatedShared.length > 0) {
    const sortedCandidates = [...bothRatedShared].sort((a, b) => {
      const r1A = Number(a.user1Rating);
      const r2A = Number(a.user2Rating);
      const avgA = (r1A + r2A) / 2;
      const diffA = Math.abs(r1A - r2A);

      const r1B = Number(b.user1Rating);
      const r2B = Number(b.user2Rating);
      const avgB = (r1B + r2B) / 2;
      const diffB = Math.abs(r1B - r2B);

      // KURAL 1: En Yüksek Ortalama Puan (avgScore)
      if (avgB !== avgA) {
        return avgB - avgA;
      }

      // KURAL 2: Tie-Breaker 1 - En Küçük Puan Farkı (En çok anlaşılan)
      if (diffA !== diffB) {
        return diffA - diffB;
      }

      // KURAL 3: Tie-Breaker 2 - Çıkış Yılı (Yeni olan önce)
      const yearA = a.filmYear || 0;
      const yearB = b.filmYear || 0;
      if (yearB !== yearA) {
        return yearB - yearA;
      }

      // KURAL 4: Tie-Breaker 3 - Alfabetik Film İsmi
      return a.filmTitle.localeCompare(b.filmTitle, "tr");
    });

    topMatch = sortedCandidates[0];
  } else if (sharedMovies.length > 0) {
    const singleRatedCandidates = sharedMovies.filter(
      (m) => (m.user1Rating !== null && m.user1Rating > 0) || (m.user2Rating !== null && m.user2Rating > 0)
    );
    if (singleRatedCandidates.length > 0) {
      topMatch = [...singleRatedCandidates].sort((a, b) => b.averageRating - a.averageRating)[0];
    } else {
      topMatch = sharedMovies[0] || null;
    }
  }

  // Watchlist Roulette: Her iki kullanıcının letterboxd.com/<user>/watchlist/ sayfasından filmler çekilir
  let watchlistRecommendations: WatchlistItem[] = [];
  try {
    const [w1, w2] = await Promise.all([
      fetchUserWatchlist(cleanUser1).catch(() => []),
      fetchUserWatchlist(cleanUser2).catch(() => []),
    ]);

    watchlistRecommendations = await buildWatchlistRecommendations(
      w1,
      w2,
      profile1.displayName || cleanUser1,
      profile2.displayName || cleanUser2,
      profile1.avatarUrl,
      profile2.avatarUrl,
      profile1.items,
      profile2.items
    );
  } catch (wErr) {
    console.warn("Watchlist fetch error in compareUserProfiles:", wErr);
  }

  const cinemaSynergy = computeCinemaSynergy(finalSharedMovies);

  const comparisonResult: ComparisonResult = {
    user1: profile1,
    user2: profile2,
    matchPercentage,
    scoreFormatted,
    sharedMovies: finalSharedMovies,
    topMatch,
    hotTakes,
    posters,
    isGenreMatchFallback,
    watchlistRecommendations,
    cinemaSynergy,
  };

  // [b1] Karşılaştırma sonucunu önbelleğe kaydet (10 dakika)
  b1SetComparisonCache(cleanUser1, cleanUser2, comparisonResult);

  return comparisonResult;
}
