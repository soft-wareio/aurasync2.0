import express from "express";
import ytdl from "@distube/ytdl-core";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import YTMusic from "ytmusic-api";

const router = express.Router();
router.use(cors());

let ytmusicInstance: any = null;
async function getYTMusic() {
  if (!ytmusicInstance) {
    ytmusicInstance = new YTMusic();
    await ytmusicInstance.initialize();
  }
  return ytmusicInstance;
}

// Search YouTube Music for 100% official studio original tracks
async function searchYTMusic(query: string): Promise<any[]> {
  try {
    const api = await getYTMusic();
    const results = await api.searchSongs(query);
    return results.map((song: any) => {
      let thumbnail = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500";
      if (Array.isArray(song.thumbnails) && song.thumbnails.length > 0) {
        const sorted = [...song.thumbnails].sort((a: any, b: any) => b.width - a.width);
        const originalUrl = sorted[0].url || "";
        if (originalUrl) {
          thumbnail = originalUrl
            .replace(/s\d+-c-rj/, "s500-c-rj")
            .replace(/w\d+-h\d+/, "w500-h500");
          if (!thumbnail.includes("=w500-h500") && thumbnail.includes("=w") && thumbnail.includes("-h")) {
            thumbnail = thumbnail.replace(/=w\d+-h\d+-[a-zA-Z0-9_-]+/, "=w500-h500-l90-rj");
          }
          if (!thumbnail.includes("=")) {
            thumbnail = thumbnail + "=w500-h500-l90-rj";
          }
        }
      }

      let artistName = "Unknown Artist";
      if (song.artist && song.artist.name) {
        artistName = song.artist.name;
      } else if (Array.isArray(song.artists)) {
        artistName = song.artists.map((a: any) => a.name).join(", ");
      } else if (song.artists && typeof song.artists === "object" && (song.artists as any).name) {
        artistName = (song.artists as any).name;
      }

      return {
        id: `yt_${song.videoId}`,
        title: song.name || "Unknown Track",
        artist: artistName,
        thumbnail: thumbnail,
        duration: song.duration || 180,
        streamUrl: `/api/stream?id=${song.videoId}`,
        isYoutube: true
      };
    });
  } catch (err: any) {
    console.error(`[MusicSearchService] YTMusic search failed for "${query}":`, err.message);
    return [];
  }
}

// Local Offline Library Search for Resilience
function getLocalLibrary(): any[] {
  try {
    const filePath = path.join(process.cwd(), "src", "assets", "library.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err: any) {
    console.error("[MusicSearchService] Error reading local library:", err.message);
  }
  return [
    { id: "1", title: "Ambient Chill", artist: "Relaxing Sounds", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", duration: 372 },
    { id: "2", title: "Techno Beat", artist: "Rhythm Lab", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", duration: 423 },
    { id: "3", title: "Sailor (Acoustic Original)", artist: "The Seafarers", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", duration: 302 },
    { id: "4", title: "Birds (Whistling Echoes)", artist: "Skyline Echo", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", duration: 302 }
  ];
}

function searchLocalLibrary(query: string): any[] {
  const q = query.toLowerCase().trim();
  const cleanQ = q.replace(/\b(original|official|track|audio)\b/gi, "").trim().replace(/\s+/g, " ");
  const library = getLocalLibrary();
  
  if (!cleanQ) return library;

  const filtered = library.filter((track: any) => {
    const title = (track.title || "").toLowerCase();
    const artist = (track.artist || "").toLowerCase();
    return title.includes(q) || artist.includes(q) || title.includes(cleanQ) || artist.includes(cleanQ);
  });

  if (filtered.length > 0) {
    return filtered;
  }
  // If nothing matches perfectly, return the entire library list to keep the UI active
  return library;
}

// Multi-mirror infrastructure of JioSaavn API for maximum uptime and error resilience
const JIOSAAVN_API_MIRRORS = [
  "https://saavn.dev",
  "https://saavn.me",
  "https://jiosaavn-api-lime.vercel.app",
  "https://jiosaavn-api.vercel.app",
  "https://jiosaavn-api-five.vercel.app",
  "https://saavn-api.vercel.app"
];

// Helper to determine if a query is primarily English characters
function isEnglishQuery(q: string): boolean {
  return /^[a-zA-Z0-9\s\-_.,!()&'"]+$/.test(q);
}

// Robust fallback search fetcher that cycles through multiple API mirrors and path schemas
async function fetchFromJioSaavn(query: string): Promise<any[] | null> {
  const cleanQ = encodeURIComponent(query);
  
  for (const baseUrl of JIOSAAVN_API_MIRRORS) {
    const paths = [`/api/search/songs?query=${cleanQ}`, `/search/songs?query=${cleanQ}`];
    
    for (const path of paths) {
      const url = `${baseUrl}${path}`;
      try {
        console.log(`[MusicSearchService] Try mirror: ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            // Cook up multi-language headers so the API retrieves both english and regional content catalogs
            "Cookie": "L=english%2Chindi; country=IN; gdpr_acceptance=true",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "application/json"
          },
          signal: controller.signal
        } as any);

        clearTimeout(timeoutId);

        if (response.ok) {
          const json: any = await response.json();
          let songs = null;
          
          if (json && json.success) {
            if (Array.isArray(json.data)) {
              songs = json.data;
            } else if (json.data && Array.isArray(json.data.results)) {
              songs = json.data.results;
            }
          } else if (Array.isArray(json)) {
            songs = json;
          } else if (json && Array.isArray(json.results)) {
            songs = json.results;
          } else if (json && json.data && Array.isArray(json.data)) {
            songs = json.data;
          }
          
          if (songs && songs.length > 0) {
            console.log(`[MusicSearchService] Resolved ${songs.length} items from ${baseUrl}`);
            return songs;
          }
        }
      } catch (err: any) {
        console.warn(`[MusicSearchService] Mirror fail for ${baseUrl}${path}:`, err.message);
      }
    }
  }
  return null;
}

// Exclude remixes, background noise, nature chimes, bird chirps, tuning and instrumentals unless explicitly searched for
function filterProperSongs(songs: any[], queryStr: string): any[] {
  if (!songs || !Array.isArray(songs)) return [];
  const qClean = (queryStr || "").toLowerCase().trim();
  
  const remixKeywords = [
    "remix", "re-mix", "reworked", "lofi", "lo-fi", "reverb", "reverse", "slowed", "sped up", 
    "mashup", "tribute", "instrumental", "karaoke", "acoustic", "live", "rework", "dance", 
    "bass boosted", "deep-bass", "cover", "bgm", "piano version", "violin version"
  ];
  
  const noiseKeywords = [
    "chirp", "chirping", "bird", "birds", "nature sounds", "white noise", "meditation", "ambient", 
    "relaxation", "relaxing", "sleep sounds", "rain sounds", "ocean waves", "thunderstorm", 
    "tuning", "sfx", "sound effect", "tunes", "instrumental", "flute", "piano match", "chime", "chimes"
  ];

  return songs.filter(song => {
    const title = (song.title || song.name || "").toLowerCase();
    const artist = (song.artist || song.primaryArtists || "").toLowerCase();
    const album = (song.album?.name || song.album || "").toLowerCase();
    const combinedText = `${title} ${artist} ${album}`;

    // 1. Remix filter
    for (const kw of remixKeywords) {
      if (combinedText.includes(kw)) {
        if (!qClean.includes(kw)) {
          return false;
        }
      }
    }

    // 2. Ambient background sounds, chirping, instrumental tunes filter
    for (const kw of noiseKeywords) {
      if (combinedText.includes(kw)) {
        if (qClean.includes(kw)) {
          continue;
        }
        
        // Retain "birds of a feather" (Billie Eilish) under exceptions
        if (title.includes("birds of a feather") || title.includes("bird of a feather")) {
          continue;
        }
        
        return false;
      }
    }

    return true;
  });
}

// Prioritize original English tracks and bury low-quality regional covers, remixes, or custom versions
function prioritizeAndFilterSongs(songs: any[], isEnglish: boolean): any[] {
  if (!songs || !Array.isArray(songs)) return [];

  const scoredSongs = songs.map(song => {
    let score = 100;
    
    const title = (song.name || song.title || "").toLowerCase();
    const album = (song.album?.name || song.album || "").toLowerCase();
    const artist = (song.primaryArtists || "").toLowerCase();
    const songLang = (song.language || "").toLowerCase();
    
    if (isEnglish) {
      if (songLang === "english") {
        score += 120; // Major priority boost for English music catalogs
      } else if (songLang && songLang !== "english") {
        score -= 160; // Bury non-english fallback records
      }
      
      const isRemixOrCover = /\b(cover|remix|lofi|reverb|mashup|tribute|instrumental|karaoke|version|acoustic|live|rework|dance|bass)\b/i.test(title + " " + album);
      if (isRemixOrCover) {
        score -= 150; // Bury covers and remix modifications down or filter them
      }

      const isRegionalTerm = /\b(hindi|punjabi|tamil|telugu|bhojpuri|haryanvi|bengali|marathi|kannada|malayalam|gujarati|odia)\b/i.test(title + " " + album + " " + artist);
      if (isRegionalTerm) {
        score -= 100;
      }
    } else {
      const isRemixOrCover = /\b(cover|remix|lofi|reverb|mashup|tribute|instrumental|karaoke)\b/i.test(title + " " + album);
      if (isRemixOrCover) {
        score -= 65;
      }
    }

    return { song, score };
  });

  scoredSongs.sort((a, b) => b.score - a.score);

  const highQualityExists = scoredSongs.some(item => item.score >= 180);
  let finalResults = scoredSongs;
  if (highQualityExists && isEnglish) {
    finalResults = scoredSongs.filter(item => item.score >= 50);
  }

  if (finalResults.length === 0) {
    finalResults = scoredSongs;
  }

  return finalResults.map(item => item.song);
}

// Endpoint: Unified Music Search matching Option A (JioSaavn API) and YouTube Music Core Hybrid Sequencer
router.get("/api/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q) {
    return res.json([]);
  }

  try {
    const isEnglish = isEnglishQuery(q);
    console.log(`[MusicSearchService] API request for: "${q}". English? ${isEnglish}`);

    // EXTREMELY POWERFUL HYBRID FETCH: Execute both YouTube Music and JioSaavn searches in parallel
    const [saavnSongsRaw, ytSongs] = await Promise.all([
      fetchFromJioSaavn(q).catch((e) => {
        console.warn("[MusicSearchService] Parallel Saavn fetch failed:", e.message);
        return null;
      }),
      searchYTMusic(q).catch((e) => {
        console.warn("[MusicSearchService] Parallel YTMusic search failed:", e.message);
        return [];
      })
    ]);

    let songs = saavnSongsRaw;

    // OFFLINE HIGH-RESILIENCE FALLBACK: Search our local enriched offline database
    let usingLocalFallback = false;
    if (!songs || songs.length === 0) {
      console.log(`[MusicSearchService] JioSaavn search returned empty or failed. querying local fallback for: "${q}"`);
      songs = searchLocalLibrary(q);
      usingLocalFallback = true;
    }

    // Filter, prioritize English matches, and bury regional covers programmatically
    const sortedSongs = usingLocalFallback ? songs : prioritizeAndFilterSongs(songs, isEnglish);

    // Map JioSaavn metadata to the standardized front-end TrackResult structure
    const formattedSaavn = sortedSongs.map((item: any) => {
      let artistName = "Unknown Artist";
      if (item.primaryArtists) {
        if (typeof item.primaryArtists === "string") {
          artistName = item.primaryArtists;
        } else if (Array.isArray(item.primaryArtists)) {
          artistName = item.primaryArtists.map((a: any) => typeof a === "string" ? a : (a.name || "")).join(", ");
        }
      } else if (item.artists?.primary && Array.isArray(item.artists.primary)) {
        artistName = item.artists.primary.map((a: any) => a.name).join(", ");
      } else if (item.artists && Array.isArray(item.artists)) {
        artistName = item.artists.map((a: any) => typeof a === "string" ? a : (a.name || "")).join(", ");
      } else if (item.artist) {
        artistName = item.artist;
      }

      let thumbnail = item.thumbnail || "";
      if (item.image) {
        if (Array.isArray(item.image)) {
          const highest = item.image[item.image.length - 1];
          thumbnail = typeof highest === "string" ? highest : (highest?.link || highest?.url || "");
        } else if (typeof item.image === "string") {
          thumbnail = item.image;
        }
      }

      let streamUrl = item.url || "";
      if (item.downloadUrl) {
        if (Array.isArray(item.downloadUrl)) {
          const highestQuality = item.downloadUrl.find((d: any) => d.quality === "320kbps") || 
                                 item.downloadUrl.find((d: any) => d.quality === "160kbps") || 
                                 item.downloadUrl[item.downloadUrl.length - 1];
          streamUrl = typeof highestQuality === "string" ? highestQuality : (highestQuality?.link || highestQuality?.url || "");
        } else if (typeof item.downloadUrl === "string") {
          streamUrl = item.downloadUrl;
        }
      }

      return {
        id: item.id || Math.random().toString(36).substr(2, 9),
        title: item.name || item.title || "Unknown Title",
        artist: artistName,
        thumbnail: thumbnail,
        duration: item.duration ? (parseInt(item.duration, 10) || 0) : 0,
        streamUrl: streamUrl
      };
    });

    // Smart Multi-API Integration Scheme:
    // - If it is an English query (Western song): YouTube Music returns the official releases. We place these 100% original full tracks at the very top.
    // - If it's a regional query (Hindi, Punjabi, etc.): JioSaavn has official, high-quality, high-speed regional links. We put Saavn first and add YouTube as alternative selections.
    // Always prioritize YouTube Music (Official YouTube Source) first 
    const finalMergedResults = [...ytSongs, ...formattedSaavn];

    // Deduplicate by (title + artist) roughly while preserving rank prioritization
    const seen = new Set<string>();
    const deduplicatedResults: any[] = [];

    for (const item of finalMergedResults) {
      const uniqueKey = `${(item.title || "").toLowerCase().trim()}-${(item.artist || "").toLowerCase().trim()}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        deduplicatedResults.push(item);
      } else {
        const idx = deduplicatedResults.findIndex(r => `${(r.title || "").toLowerCase().trim()}-${(r.artist || "").toLowerCase().trim()}` === uniqueKey);
        if (idx !== -1 && !deduplicatedResults[idx].isYoutube && item.isYoutube) {
          deduplicatedResults[idx] = item;
        }
      }
    }

    const filterProper = req.query.filterProper !== "false";
    const finalFiltered = filterProper ? filterProperSongs(deduplicatedResults, q) : deduplicatedResults;

    res.json(finalFiltered);
  } catch (error: any) {
    console.error(`[MusicSearchService] Search execution failed completely:`, error.message);
    // Even if exceptional error happens, fallback to local library search to prevent blank player errors
    try {
      const fallback = searchLocalLibrary(q).map((item: any) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        thumbnail: item.thumbnail || "",
        duration: item.duration || 0,
        streamUrl: item.url
      }));
      res.json(fallback);
    } catch {
      res.json([]); // Absorb error resiliently
    }
  }
});

router.get("/api/stream", async (req, res) => {
  try {
    const videoId = req.query.id as string;
    if (!videoId) {
      return res.status(400).json({ error: "Missing video ID" });
    }

    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
    const format = ytdl.chooseFormat(info.formats, { 
      filter: 'audioonly', 
      quality: 'highestaudio' 
    });

    if (!format || !format.url) {
        return res.status(500).json({ error: "Stream unavailable" });
    }

    // Adapt to play directly in mobile app player or browser audio tags
    // If client requests json explicitly, return JSON block; else, issue a transparent redirect (HTTP 302 Found)
    if (req.query.json === "true" || req.headers.accept?.includes("application/json")) {
      return res.json({ url: format.url });
    }

    res.redirect(format.url);
  } catch (error) {
    console.error("Stream resolution failed:", error);
    res.status(500).json({ error: "Stream unavailable" });
  }
});

export default router;
