/**
 * ============================================================================
 * [b1] Matchboxd Önbellekleme (Cache) ve Sunucu Eşzamanlılık (Concurrency) Modülü
 * ============================================================================
 * Bu modül "b1" geliştirmesi kapsamında eklenmiştir.
 * "b1 iptal" komutu verildiğinde bu dosya ve ilgili referanslar kaldırılarak
 * sistem orijinal haline döndürülecektir.
 *
 * Sağlanan Yetenekler:
 * 1. In-Memory TTL Cache: Kullanıcı film arşivi ve profil bilgilerini saklar (15 dk).
 * 2. Comparison Result Cache: İkili eşleşme sonuçlarını saklar (10 dk).
 * 3. In-Flight Request Deduplication: Aynı profil için aynı anda gelen paralel
 *    isteklerde mükerrer tarayıcı başlatılmasını engelleyerek tek Promise paylaşır.
 * 4. Chromium Concurrency Limiter: Aynı anda sadece 1 adet Chromium sürecinin
 *    çalışmasına izin vererek sunucunun Out-of-Memory (OOM) çökmesini engeller.
 * ============================================================================
 */

import { ComparisonResult, UserProfile, LetterboxdItem } from "./types";

// [b1] Global açma/kapama anahtarı
export const ENABLE_B1_CACHE = true;

// Önbellek süreleri (milisaniye cinsinden)
export const B1_USER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 dakika
export const B1_COMPARISON_CACHE_TTL_MS = 10 * 60 * 1000; // 10 dakika

// Maksimum kayıt sınırı (Bellek sızıntısını önlemek için LRU mantığı)
const MAX_USER_CACHE_ENTRIES = 100;
const MAX_COMPARISON_CACHE_ENTRIES = 100;

export interface B1CachedUserData {
  films: LetterboxdItem[];
  profileDetails: { displayName: string; avatarUrl?: string };
  cachedAt: number;
}

interface B1CachedComparison {
  result: ComparisonResult;
  cachedAt: number;
}

// 1. In-Memory Depolar
const userCache = new Map<string, B1CachedUserData>();
const comparisonCache = new Map<string, B1CachedComparison>();

// 2. In-Flight İstek Tekilleştirme (Stampede Koruması)
const inFlightUserPromises = new Map<string, Promise<B1CachedUserData>>();

/**
 * Kullanıcı adını önbellek anahtarı için standartlaştırır
 */
function normalizeKey(username: string): string {
  return (username || "").trim().toLowerCase();
}

/**
 * İki kullanıcı için sıradan bağımsız ortak bir karşılaştırma anahtarı üretir
 * örn: "kullanici1:kullanici2" (alfabetik sıralı)
 */
export function getComparisonCacheKey(user1: string, user2: string): string {
  const [a, b] = [normalizeKey(user1), normalizeKey(user2)].sort();
  return `${a}__vs__${b}`;
}

// ============================================================================
// KULLANICI ÖNBELLEĞİ YÖNETİMİ
// ============================================================================

export function b1GetUserCache(username: string): B1CachedUserData | null {
  if (!ENABLE_B1_CACHE) return null;
  const key = normalizeKey(username);
  const entry = userCache.get(key);

  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > B1_USER_CACHE_TTL_MS) {
    userCache.delete(key);
    console.log(`[b1-cache] SÜRESİ DOLDU: @${key} verisi bellekten temizlendi.`);
    return null;
  }

  console.log(`[b1-cache] CACHE HIT (Profil): @${key} bellekten yüklendi. (${entry.films.length} film)`);
  return entry;
}

export function b1SetUserCache(
  username: string,
  data: { films: LetterboxdItem[]; profileDetails: { displayName: string; avatarUrl?: string } }
): void {
  if (!ENABLE_B1_CACHE) return;
  const key = normalizeKey(username);

  // Bellek taşmasını engelle: en eski kaydı sil
  if (userCache.size >= MAX_USER_CACHE_ENTRIES) {
    const oldestKey = userCache.keys().next().value;
    if (oldestKey) userCache.delete(oldestKey);
  }

  userCache.set(key, {
    films: data.films,
    profileDetails: data.profileDetails,
    cachedAt: Date.now(),
  });
  console.log(`[b1-cache] CACHE SET (Profil): @${key} hafızaya alındı. (${data.films.length} film)`);
}

// ============================================================================
// KARŞILAŞTIRMA (COMPARISON) ÖNBELLEĞİ YÖNETİMİ
// ============================================================================

export function b1GetComparisonCache(user1: string, user2: string): ComparisonResult | null {
  if (!ENABLE_B1_CACHE) return null;
  const key = getComparisonCacheKey(user1, user2);
  const entry = comparisonCache.get(key);

  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > B1_COMPARISON_CACHE_TTL_MS) {
    comparisonCache.delete(key);
    console.log(`[b1-cache] SÜRESİ DOLDU: ${key} karşılaştırması bellekten temizlendi.`);
    return null;
  }

  // Eğer önbellekteki sonucun cinemaSynergy verisi eksikse veya ortak filmlerin ekip/yönetmen bilgisi boşsa
  // eski/eksik önbelleği temizle ve taze analiz yapılmasını sağla
  if (
    !entry.result.cinemaSynergy ||
    entry.result.sharedMovies.some(
      (m) =>
        !m.cast ||
        m.cast.length === 0 ||
        !m.director ||
        !m.posterUrl ||
        m.posterUrl.includes("empty-poster")
    )
  ) {
    comparisonCache.delete(key);
    console.log(`[b1-cache] EKSİK/BOZUK VERİ: ${key} karşılaştırma önbelleği temizlendi, yeniden taranacak.`);
    return null;
  }

  console.log(`[b1-cache] CACHE HIT (Karşılaştırma): ${key} bellekten 0ms ile dönderildi!`);
  return entry.result;
}

export function b1SetComparisonCache(user1: string, user2: string, result: ComparisonResult): void {
  if (!ENABLE_B1_CACHE) return;
  const key = getComparisonCacheKey(user1, user2);

  if (comparisonCache.size >= MAX_COMPARISON_CACHE_ENTRIES) {
    const oldestKey = comparisonCache.keys().next().value;
    if (oldestKey) comparisonCache.delete(oldestKey);
  }

  comparisonCache.set(key, {
    result,
    cachedAt: Date.now(),
  });
  console.log(`[b1-cache] CACHE SET (Karşılaştırma): ${key} hafızaya alındı.`);
}

export function b1DeleteUserCache(username: string): void {
  const key = normalizeKey(username);
  userCache.delete(key);
}

// ============================================================================
// IN-FLIGHT PROMISE DEDUPLICATION (Aynı anda gelen istekleri birleştirme)
// ============================================================================

export async function b1WithUserDeduplication(
  username: string,
  fetchFn: () => Promise<{ films: LetterboxdItem[]; profileDetails: { displayName: string; avatarUrl?: string } }>
): Promise<B1CachedUserData> {
  const key = normalizeKey(username);

  // 1. Önce önbellek kontrolü
  const cached = b1GetUserCache(key);
  if (cached) return cached;

  // 2. Halihazırda devam eden bir istek var mı?
  const inFlight = inFlightUserPromises.get(key);
  if (inFlight) {
    console.log(`[b1-cache] DEDUPLICATION: @${key} için devam eden istek paylaşıldı (mükerrer kazıma engellendi).`);
    return inFlight;
  }

  // 3. Yeni isteği başlat ve haritaya kaydet
  const promise = (async () => {
    try {
      const data = await fetchFn();
      b1SetUserCache(key, data);
      return {
        films: data.films,
        profileDetails: data.profileDetails,
        cachedAt: Date.now(),
      };
    } finally {
      inFlightUserPromises.delete(key);
    }
  })();

  inFlightUserPromises.set(key, promise);
  return promise;
}

// ============================================================================
// CHROMIUM EŞZAMANLILIK LİMİTÖRÜ (CONCURRENCY LIMITER / MUTEX)
// ============================================================================

export interface B1QueueOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type Task<T> = () => Promise<T>;

class B1ConcurrencyQueue {
  private maxConcurrency: number;
  private running: number = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency: number = 1) {
    this.maxConcurrency = maxConcurrency;
  }

  public async acquire(options?: B1QueueOptions): Promise<() => void> {
    const signal = options?.signal;
    const timeoutMs = options?.timeoutMs ?? 120000; // 120 saniye kuyruk bekleme süresi

    if (signal?.aborted) {
      throw new Error("İstek iptal edildi (Aborted).");
    }

    if (this.running < this.maxConcurrency) {
      this.running++;
      return () => this.release();
    }

    console.log(
      `[b1-cache] KUYRUK: Chromium kapasitesi dolu (aktif: ${this.running}, sırada bekleyen: ${this.queue.length + 1}). İstek sıraya alındı.`
    );

    let timer: NodeJS.Timeout | null = null;
    let onAbort: (() => void) | null = null;

    try {
      await new Promise<void>((resolve, reject) => {
        let isDone = false;

        const cleanup = () => {
          isDone = true;
          if (timer) clearTimeout(timer);
          if (signal && onAbort) {
            signal.removeEventListener("abort", onAbort);
          }
          const idx = this.queue.indexOf(resume);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
        };

        const resume = () => {
          if (isDone) return;
          cleanup();
          resolve();
        };

        this.queue.push(resume);

        if (signal) {
          onAbort = () => {
            cleanup();
            reject(new Error("İstek iptal edildi (Aborted)."));
          };
          signal.addEventListener("abort", onAbort);
        }

        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            cleanup();
            reject(
              new Error(
                "Sunucu şu an çok yoğun. Lütfen birkaç saniye sonra tekrar deneyin."
              )
            );
          }, timeoutMs);
        }
      });

      this.running++;
      return () => this.release();
    } catch (err) {
      throw err;
    }
  }

  private release(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  public async run<T>(fn: Task<T>, options?: B1QueueOptions): Promise<T> {
    const release = await this.acquire(options);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

// Sunucunun RAM kapasitesini korumak için aynı anda en fazla 1 Chromium oturumuna izin verilir.
export const b1BrowserQueue = new B1ConcurrencyQueue(1);

/**
 * Tarayıcı (Puppeteer) işlemini tekli kuyruk kilidi altında çalıştırır.
 */
export async function b1WithBrowserLock<T>(
  fn: Task<T>,
  options?: B1QueueOptions
): Promise<T> {
  if (!ENABLE_B1_CACHE) {
    return fn();
  }
  return b1BrowserQueue.run(fn, options);
}

// ============================================================================
// YARDIMCI / TEMİZLEME FONKSİYONLARI (İhtiyaç halinde veya test amaçlı)
// ============================================================================

export function b1ClearAllCache(): void {
  userCache.clear();
  comparisonCache.clear();
  inFlightUserPromises.clear();
  console.log("[b1-cache] Tüm önbellek temizlendi.");
}

export function b1GetCacheStats() {
  return {
    userCacheSize: userCache.size,
    comparisonCacheSize: comparisonCache.size,
    inFlightCount: inFlightUserPromises.size,
  };
}
