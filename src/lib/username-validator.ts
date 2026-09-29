import { extractCleanUsername } from "./username-utils";

export async function resolveBoxdItUrl(shortUrl: string): Promise<string | null> {
  try {
    let target = shortUrl.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `https://${target}`;
    }

    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const tryResolve = async (method: "GET" | "HEAD") => {
      const res = await fetch(target, {
        method,
        redirect: "follow",
        headers: { "User-Agent": userAgent },
      });
      const finalUrl = res.url || "";
      if (finalUrl.includes("letterboxd.com/")) {
        const match = finalUrl.match(/letterboxd\.com\/([a-zA-Z0-9_-]{2,30})/i);
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
      return null;
    };

    try {
      const resolved = await tryResolve("GET");
      if (resolved) return resolved;
    } catch {
      try {
        const resolved = await tryResolve("HEAD");
        if (resolved) return resolved;
      } catch {
        // ignore
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

export async function resolveUsernameAsync(input: string): Promise<string> {
  if (!input) return "";
  const cleanInput = input.trim();

  // Step 1 (boxd.it check):
  if (cleanInput.includes("boxd.it")) {
    const resolvedBoxdIt = await resolveBoxdItUrl(cleanInput);
    if (resolvedBoxdIt) {
      return resolvedBoxdIt;
    }
  }

  // Step 2 & 3: Standard link or handle clean
  return extractCleanUsername(cleanInput);
}

export async function validateLetterboxdUsername(username: string): Promise<{
  valid: boolean;
  username: string;
  error?: string;
}> {
  if (!username) {
    return { valid: false, username: "", error: "Username cannot be empty." };
  }

  const cleanUsername = await resolveUsernameAsync(username);

  if (!cleanUsername) {
    return { valid: false, username: "", error: "Username cannot be empty." };
  }

  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(cleanUsername)) {
    return {
      valid: false,
      username: cleanUsername,
      error: `Cannot search by display name ("${cleanUsername}"). Please enter the username handle from the profile URL or paste the profile link.`,
    };
  }

  try {
    const res = await fetch(`https://letterboxd.com/${cleanUsername}/films/`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 },
    });

    if (res.status === 404) {
      return {
        valid: false,
        username: cleanUsername,
        error: `No Letterboxd profile found for @${cleanUsername}.`,
      };
    }

    return { valid: true, username: cleanUsername };
  } catch (err) {
    return { valid: true, username: cleanUsername };
  }
}
