// ===========================================================================
// YouTube helpers — robust video-ID extraction + thumbnail URL builder.
//
// getYouTubeId(url) returns the canonical 11-char video id, or null.
// Handles all common shapes:
//   https://www.youtube.com/watch?v=ID
//   https://youtu.be/ID
//   https://www.youtube.com/embed/ID
//   https://www.youtube.com/shorts/ID
//   https://www.youtube.com/live/ID  and  /v/ID
//   ...with any extra query params (&t=, ?si=, ?feature=, etc.)
//   youtube-nocookie.com variants, and a bare 11-char id.
// ===========================================================================

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function clean(id) {
  return id && ID_RE.test(id) ? id : null;
}

export function getYouTubeId(url) {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;

  // 1) Proper URL parsing (most reliable; query params handled for free).
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return clean(u.pathname.split("/").filter(Boolean)[0]);
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v) return clean(v);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["embed", "shorts", "v", "live"].includes(parts[0])) {
        return clean(parts[1]);
      }
    }
  } catch {
    /* not a parseable URL — fall through to regex */
  }

  // 2) Regex fallback for odd / partial strings. Only path-style YouTube
  //    markers — NOT a bare "v=", which would wrongly match non-YouTube URLs
  //    (genuine youtube.com/watch?v= is already handled by the URL parser above).
  const m = s.match(/(?:\/embed\/|\/shorts\/|\/live\/|\/v\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return clean(m[1]);

  // 3) A bare id passed directly.
  return clean(s);
}

// Build a YouTube thumbnail URL for a given id and quality.
// hqdefault (480x360) is almost always present; maxresdefault may be missing.
export function youtubeThumb(id, quality = "hqdefault") {
  return `https://img.youtube.com/vi/${id}/${quality}.jpg`;
}
