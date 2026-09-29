import { LetterboxdItem } from "./types";
// [b1] Eşzamanlılık ve bellek yönetimi kuyruğu
import { b1WithBrowserLock } from "./b1-cache";
import {
  resolveUsernameAsync,
  parseProfileDetailsFromHtml,
  parseFilmsFromHtml,
  fetchUserFilms,
  fetchRssItems,
  parseTotalFilmsCount,
  LETTERBOXD_DEFAULT_POSTER,
} from "./letterboxd";

interface ScrapedFilm {
  slug: string;
  name: string;
  poster: string;
  rating: number;
  year?: number;
}

export const DEFAULT_MAX_SCRAPE_PAGES = 100;

export interface UserFilmsScrapeResult {
  films: LetterboxdItem[];
  profileDetails: { displayName: string; avatarUrl?: string };
}

/**
 * Verilen browser instance'ı üzerinde tek bir sayfa (sekme) açarak
 * kullanıcının Letterboxd filmlerini ve profil detaylarını kazır.
 * Sekme iş bitiminde 'finally' bloğu ile derhal kapatılır.
 */
export async function scrapeUserProfileAndFilms(
  browser: any,
  username: string,
  maxPagesCap: number = DEFAULT_MAX_SCRAPE_PAGES,
  signal?: AbortSignal
): Promise<UserFilmsScrapeResult> {
  if (signal?.aborted) {
    throw new Error("İstek iptal edildi (Aborted).");
  }

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

  if (typeof window !== "undefined") {
    return fetchUserFilms(cleanUsername, maxPagesCap);
  }

  // Her kullanıcı için izole yeni bir sekme aç
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });

    // Bot korumasını önlemek ve sekmelerin aynı anda Letterboxd'a çarpmasını engellemek için ufak başlangıç jitter'ı
    const initialJitter = Math.floor(50 + Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, initialJitter));

    let pagesToFetch = maxPagesCap;

    for (let pageNum = 1; pageNum <= pagesToFetch; pageNum++) {
      if (signal?.aborted) {
        throw new Error("İstek iptal edildi (Aborted).");
      }

      const pageUrl =
        pageNum === 1
          ? `https://letterboxd.com/${cleanUsername}/films/`
          : `https://letterboxd.com/${cleanUsername}/films/page/${pageNum}/`;

      try {
        // 1. NAVİGASYON VE BEKLEME (domcontentloaded + 15s timeout)
        const response = await page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        const status = response ? response.status() : 200;
        if (status === 404) {
          throw new Error(`@${cleanUsername} profili bulunamadı (404).`);
        }

        // DOM'daki film listesinin render olması için ufak bir bekleme:
        await page.waitForSelector(".poster-list, ul.poster-list, body", { timeout: 5000 }).catch(() => {});

        let html = await page.content();

        // Profil gizlilik veya yokluk denetimi
        if (
          html.includes("This profile is private") ||
          html.includes("This member’s profile is private") ||
          html.includes("This member's profile is private") ||
          html.includes("profile-message-private")
        ) {
          throw new Error(`@${cleanUsername} profili gizlidir.`);
        }

        if (
          html.includes("Page not found") &&
          (html.includes("Sorry, we can’t find the page") || html.includes("Sorry, we can't find the page"))
        ) {
          throw new Error(`@${cleanUsername} profili bulunamadı.`);
        }

        if (pageNum === 1) {
          profileDetails = parseProfileDetailsFromHtml(html, cleanUsername);
          const parsedCount = parseTotalFilmsCount(html, cleanUsername);
          if (parsedCount && parsedCount > 0) {
            const calculatedPages = Math.ceil(parsedCount / 72);
            pagesToFetch = Math.min(calculatedPages, maxPagesCap);
            console.log(
              `[@${cleanUsername}] Toplam ${parsedCount} film bulundu. Hedef sayfa sayısı: ${pagesToFetch}`
            );
          } else {
            // Yedek: Sayfalama linklerinden son sayfayı al
            const pageMatches = Array.from(html.matchAll(/\/films\/page\/(\d+)\//gi));
            const pageNums = pageMatches.map((m: any) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
            if (pageNums.length > 0) {
              const maxFoundPage = Math.max(...pageNums);
              pagesToFetch = Math.min(maxFoundPage, maxPagesCap);
              console.log(
                `[@${cleanUsername}] Sayfalamadan toplam ${pagesToFetch} sayfa tespit edildi.`
              );
            } else {
              pagesToFetch = 1;
            }
          }
        }

        // Letterboxd React LazyPoster IntersectionObserver tetiklemesi ve tüm afişlerin yüklenmesini bekleme
        await page.evaluate(async () => {
          const totalHeight = document.body.scrollHeight;
          for (let y = 0; y < totalHeight; y += 500) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 20));
          }
          window.scrollTo(0, totalHeight);

          // LazyPoster görsellerinin DOM'a dolmasını bekle (en fazla 1.2 sn)
          const start = Date.now();
          while (Date.now() - start < 1200) {
            const emptyImgs = Array.from(document.querySelectorAll("li.griditem img, .poster-list img")).filter(
              (img: any) => !img.src || img.src.includes("empty-poster")
            );
            if (emptyImgs.length === 0) break;
            await new Promise((r) => setTimeout(r, 40));
          }
        }).catch(() => {});

        // 2. FİLM ÇEKME SEÇİCİLERİ: li.griditem, ul.poster-list > li, li.poster-container
        const films: ScrapedFilm[] = await page.evaluate((defaultPoster: string) => {
          let items = Array.from(document.querySelectorAll("li.griditem, ul.poster-list > li, li.poster-container"));
          if (items.length === 0) {
            items = Array.from(document.querySelectorAll("div.film-poster"));
          }

          return items
            .map((el) => {
              const reactComp = el.querySelector(".react-component") || el;
              const posterDiv = el.classList.contains("film-poster")
                ? el
                : (el.querySelector(".film-poster") || reactComp);
              const img = el.querySelector("img");

              // 1. BENZERSİZ KİMLİK (PRIMARY KEY): canonical link / data-film-slug / data-item-slug
              const slug =
                el.querySelector("a")?.getAttribute("href")?.match(/\/film\/([^\/]+)\//)?.[1] ||
                posterDiv.getAttribute("data-target-link")?.match(/\/film\/([^\/]+)\//)?.[1] ||
                reactComp.getAttribute("data-item-slug") ||
                reactComp.getAttribute("data-film-slug") ||
                posterDiv.getAttribute("data-film-slug") ||
                posterDiv.getAttribute("data-item-slug") ||
                el.getAttribute("data-film-slug") ||
                el.getAttribute("data-item-slug") ||
                "";

              const name =
                reactComp.getAttribute("data-item-full-display-name") ||
                reactComp.getAttribute("data-item-name") ||
                img?.getAttribute("alt") ||
                posterDiv.getAttribute("data-film-name") ||
                posterDiv.getAttribute("data-item-name") ||
                "";

              // Yayın Yılı (Year): data-film-release-year veya başlık / slug içindeki yıl
              const yearAttr =
                reactComp.getAttribute("data-film-release-year") ||
                reactComp.getAttribute("data-release-year") ||
                reactComp.getAttribute("data-item-release-year") ||
                posterDiv.getAttribute("data-film-release-year") ||
                posterDiv.getAttribute("data-release-year") ||
                el.getAttribute("data-film-release-year") ||
                el.getAttribute("data-release-year") ||
                el.getAttribute("data-year") ||
                "";

              let year: number | undefined = undefined;
              if (/^\d{4}$/.test(yearAttr)) {
                year = parseInt(yearAttr, 10);
              } else {
                const nameYearMatch = name.match(/\((\d{4})\)/);
                if (nameYearMatch) {
                  year = parseInt(nameYearMatch[1], 10);
                } else {
                  const slugYearMatch = slug.match(/-(\d{4})$/);
                  if (slugYearMatch) {
                    year = parseInt(slugYearMatch[1], 10);
                  }
                }
              }

              // 2. AFİŞİ DOĞRUDAN DOM'DAN AL (Öncelik: srcset -> data-src -> src):
              const candidateSources = [
                (img?.getAttribute("srcset") || img?.srcset)?.split(",")[0]?.trim().split(" ")[0]?.trim(),
                img?.getAttribute("data-original"),
                img?.getAttribute("data-src"),
                img?.getAttribute("src"),
              ];

              let posterUrl: string | null = null;
              for (const c of candidateSources) {
                if (
                  c &&
                  !c.includes("empty-poster") &&
                  !c.includes("spacer.gif") &&
                  !c.includes("transparent.gif") &&
                  !c.includes("/avatar/") &&
                  !c.startsWith("data:image")
                ) {
                  posterUrl = c.trim();
                  break;
                }
              }

              if (posterUrl && posterUrl.startsWith("//")) {
                posterUrl = "https:" + posterUrl;
              }

              // Letterboxd resized URL kalitesini 500x750'ye yükselt
              if (posterUrl && posterUrl.includes("a.ltrbxd.com/resized/")) {
                posterUrl = posterUrl.replace(/-\d+-\d+-\d+-\d+-crop\./, "-0-500-0-750-crop.");
              }

              // Letterboxd React LazyPoster Akıllı Çözümleyici (Fallback):
              // Modern Letterboxd'de afişler lazy-loaded olup 'empty-poster' görünür.
              if (!posterUrl && slug) {
                const posteredAttr =
                  reactComp.getAttribute("data-postered-identifier") ||
                  reactComp.getAttribute("data-resolvable-poster-path") ||
                  posterDiv.getAttribute("data-postered-identifier") ||
                  posterDiv.getAttribute("data-resolvable-poster-path") ||
                  "";
                let filmId = "";
                const uidMatch =
                  posteredAttr.match(/"uid":\s*"film:(\d+)"/i) ||
                  posteredAttr.match(/&quot;uid&quot;:&quot;film:(\d+)&quot;/i);
                if (uidMatch) {
                  filmId = uidMatch[1];
                } else {
                  const rawUid =
                    reactComp.getAttribute("data-item-uid") ||
                    el.querySelector(".poster-viewingdata")?.getAttribute("data-item-uid") ||
                    posterDiv.getAttribute("data-item-uid") ||
                    posterDiv.getAttribute("data-film-id") ||
                    el.getAttribute("data-film-id") ||
                    el.getAttribute("data-item-uid") ||
                    "";
                  filmId = rawUid.replace(/^film:/i, "").trim();
                }

                // cacheBustingKey kontrolü (?v=key)
                let cacheKey = "";
                const keyMatch =
                  posteredAttr.match(/"cacheBustingKey":\s*"([^"]+)"/i) ||
                  posteredAttr.match(/&quot;cacheBustingKey&quot;:&quot;([^&]+)&quot;/i);
                if (keyMatch) {
                  cacheKey = keyMatch[1];
                }

                if (filmId) {
                  const pathParts = filmId.split("").join("/");
                  posterUrl = `https://a.ltrbxd.com/resized/film-poster/${pathParts}/${filmId}-${slug}-0-500-0-750-crop.jpg${
                    cacheKey ? `?v=${cacheKey}` : ""
                  }`;
                }
              }

              // 3. YEDEKLEME (FALLBACK): DOM'dan afiş linki gelmezse Letterboxd varsayılan afişi
              const finalPoster = posterUrl || defaultPoster;

              // Puan Ayıklama: Dış li içerisindeki .rating veya [class*="rated-"] veya poster-viewingdata
              const ratingEl = el.querySelector('.rating, [class*="rated-"], .poster-viewingdata');
              let rating = 0;
              if (ratingEl) {
                const match =
                  ratingEl.className.match(/rated-(\d+)/) ||
                  ratingEl.querySelector('[class*="rated-"]')?.className.match(/rated-(\d+)/);
                if (match) {
                  rating = parseInt(match[1], 10) / 2; // örn: rated-8 -> 4 yıldız
                } else {
                  const starText = ratingEl.textContent || "";
                  const fullStars = (starText.match(/★/g) || []).length;
                  const halfStar = /½/.test(starText) ? 0.5 : 0;
                  if (fullStars > 0 || halfStar > 0) {
                    rating = fullStars + halfStar;
                  }
                }
              }

              return { slug: slug.trim().toLowerCase(), name, poster: finalPoster, rating, year };
            })
            .filter((f) => Boolean(f.slug));
        }, LETTERBOXD_DEFAULT_POSTER);

        console.log(`[@${cleanUsername}] Sayfa ${pageNum}: ${films.length} film okundu.`);

        // 3. EĞER SAYFADA FİLM YOKSA ÇIKIŞ YAP
        if (films.length === 0) {
          if (pageNum === 1 && (!profileDetails.displayName || profileDetails.displayName === cleanUsername)) {
            console.log(`[@${cleanUsername}] İlk sayfada hiç film bulunamadı.`);
          }
          break;
        }

        films.forEach((f) => {
          let filmTitle = f.name
            .replace(/^(poster for|a poster for)\s+/i, "")
            .replace(/\s+poster$/i, "")
            .trim();

          let filmYear: number | undefined = f.year;
          const yearMatch = filmTitle.match(/\((\d{4})\)$/);
          if (yearMatch) {
            filmYear = filmYear || parseInt(yearMatch[1], 10);
            filmTitle = filmTitle.replace(/\s*\(\d{4}\)$/, "").trim();
          }
          if (!filmYear && f.slug) {
            const sm = f.slug.match(/-(\d{4})$/);
            if (sm) {
              filmYear = parseInt(sm[1], 10);
            }
          }

          addItem({
            guid: `letterboxd-${f.slug}`,
            title: f.name,
            filmTitle: filmTitle || f.slug,
            filmYear,
            slug: f.slug,
            link: `https://letterboxd.com/film/${f.slug}/`,
            posterUrl: f.poster || undefined,
            memberRating: f.rating > 0 ? f.rating : undefined,
            pubDate: new Date().toISOString(),
          });
        });

        // Son sayfaya ulaşıldıysa döngüyü sonlandır
        const hasNextPage =
          html.includes('class="next"') ||
          html.includes('rel="next"') ||
          html.includes(`/films/page/${pageNum + 1}/`);
        if (!hasNextPage && pageNum > 1) {
          break;
        }

        // Sayfa geçişleri arasına 250-400ms rastgele jitter ekle
        if (pageNum < pagesToFetch) {
          const jitter = Math.floor(250 + Math.random() * 150); // 250-400ms
          await new Promise((resolve) => setTimeout(resolve, jitter));
        }
      } catch (err: any) {
        // Eğer profil bulunamadı ya da gizli hatası fırlatıldıysa döngüyü kırıp yukarı ilet
        if (err.message && (err.message.includes("gizlidir") || err.message.includes("bulunamadı"))) {
          throw err;
        }
        console.warn(`[@${cleanUsername}] Stealth browser sayfa ${pageNum} hatası:`, err);
        if (pageNum === 1) {
          throw new Error(`@${cleanUsername} filmleri yüklenirken bağlantı hatası oluştu: ${err.message || "Sayfa 1 yüklenemedi."}`);
        }
      }
    }
  } finally {
    // SEKME VE YÜK YÖNETİMİ: İş bittiğinde sekme derhal kapatılır
    await page.close().catch(() => {});
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
          if (
            (!existing.posterUrl || existing.posterUrl.includes("empty-poster")) &&
            rssItem.posterUrl &&
            !rssItem.posterUrl.includes("empty-poster")
          ) {
            existing.posterUrl = rssItem.posterUrl;
          }
        }
      }
    });
  } catch {
    // RSS fallback
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[@${cleanUsername}] Tekilleştirilmiş Net Film Sayısı: ${allUserMovies.length} (Geçen süre : ${elapsed}s)`
  );
  return { films: allUserMovies, profileDetails };
}

/**
 * TEK TARAYICI ÖRNEĞİ, ÇİFT SEKME (DUAL TABS / PROMISE.ALL)
 * Tek bir Chromium browser örneği başlatır ve iki kullanıcıyı eş zamanlı sekmelerde kazır.
 * Hata izolasyonu sağlayarak kullanıcı hatalarını tespit eder.
 */
export async function scrapeDualUsersWithBrowser(
  user1: string,
  user2: string,
  maxPagesCap: number = DEFAULT_MAX_SCRAPE_PAGES,
  signal?: AbortSignal
): Promise<{ user1Data: UserFilmsScrapeResult; user2Data: UserFilmsScrapeResult }> {
  // [b1] Chromium süreçlerinin eşzamanlı olarak açılarak RAM tüketmesini ve OOM çökmesini engellemek için tekli kuyruk kilidi
  return b1WithBrowserLock(
    async () => {
      if (signal?.aborted) {
        throw new Error("İstek iptal edildi (Aborted).");
      }

      const puppeteerExtra = (await import("puppeteer-extra")).default;
      const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
      puppeteerExtra.use(StealthPlugin());

      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

      const browser = await puppeteerExtra.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
      });

      try {
        // İki kullanıcıyı aynı browser altında ayrı sekmelerde paralel çalıştır ve hataları izole et
        const [res1, res2] = await Promise.allSettled([
          scrapeUserProfileAndFilms(browser, user1, maxPagesCap, signal),
          scrapeUserProfileAndFilms(browser, user2, maxPagesCap, signal),
        ]);

        const error1 = res1.status === "rejected" ? res1.reason?.message || `@${user1} verileri alınamadı.` : null;
        const error2 = res2.status === "rejected" ? res2.reason?.message || `@${user2} verileri alınamadı.` : null;

        if (error1 && error2) {
          throw new Error(`${error1} Ayrıca ${error2}`);
        }
        if (error1) {
          throw new Error(error1);
        }
        if (error2) {
          throw new Error(error2);
        }

        return {
          user1Data: (res1 as PromiseFulfilledResult<UserFilmsScrapeResult>).value,
          user2Data: (res2 as PromiseFulfilledResult<UserFilmsScrapeResult>).value,
        };
      } finally {
        // Tarayıcıyı mutlaka kapat
        if (browser) {
          await browser.close().catch(() => { });
        }
      }
    },
    { signal, timeoutMs: 120000 }
  );
}

/**
 * Geriye dönük uyumluluk için tek kullanıcı çekme fonksiyonu
 */
export async function fetchUserFilmsWithBrowser(
  username: string,
  maxPagesCap: number = DEFAULT_MAX_SCRAPE_PAGES,
  signal?: AbortSignal
): Promise<UserFilmsScrapeResult> {
  // [b1] Chromium tekil oturum kilidi
  return b1WithBrowserLock(
    async () => {
      if (signal?.aborted) {
        throw new Error("İstek iptal edildi (Aborted).");
      }

      const puppeteerExtra = (await import("puppeteer-extra")).default;
      const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
      puppeteerExtra.use(StealthPlugin());

      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

      const browser = await puppeteerExtra.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
      });

      try {
        return await scrapeUserProfileAndFilms(browser, username, maxPagesCap, signal);
      } finally {
        if (browser) {
          await browser.close().catch(() => { });
        }
      }
    },
    { signal, timeoutMs: 120000 }
  );
}
