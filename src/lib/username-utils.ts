export function extractCleanUsername(input: string): string {
  if (!input) return "";
  let clean = input.trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Ignore decode error
  }

  // If input is a short link like boxd.it/xxxx or https://boxd.it/xxxx, return it as-is for async resolver
  if (clean.includes("boxd.it")) {
    return clean;
  }

  // Handle full URL inputs: e.g. https://letterboxd.com/username/ or letterboxd.com/username/films/
  if (clean.includes("letterboxd.com/")) {
    const match = clean.match(/letterboxd\.com\/([a-zA-Z0-9_-]{2,30})/i);
    if (match && match[1]) {
      const captured = match[1].toLowerCase();
      const reserved = [
        "film", "films", "members", "journal", "activity", "list",
        "lists", "search", "actor", "director", "writer", "producer",
        "studio", "crew", "tag", "year", "genre"
      ];
      if (!reserved.includes(captured)) {
        return captured;
      }
    }
  }

  return clean
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "")
    .split("/")[0]
    .trim();
}

export function slugifyLetterboxdTitle(title: string, year?: number): string {
  if (!title) return "";
  const cleaned = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned;
}

export function normalizeTitle(title: string): string {
  if (!title) return "";
  return String(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}


