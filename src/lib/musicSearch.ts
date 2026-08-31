import { TrackMeta } from "../types";

export interface JioSaavnSong {
  id: string;
  name: string;
  type: string;
  album: { id: string; name: string; url: string };
  year: string;
  duration: string | number;
  primaryArtists: string;
  image: { quality: string; link: string }[];
  downloadUrl: { quality: string; link: string }[];
  language: string;
  url: string;
  itunes_name?: string;
  itunes_artist?: string;
  itunes_image?: string;
}

export interface SongTrack {
  id: string;
  name: string;
  artist: string;
  url: string;
  image: string;
  duration: number;
  language?: string;
  year?: number;
  type?: string;
}

export interface TrackResult extends TrackMeta {
  id: string;
}

// Global known popular song keywords mapping for smart query redirection
const GLOBAL_SONG_EXPANSIONS: { [key: string]: string } = {
  "birds of a feather": "birds of a feather billie eilish",
  "birds of feather": "birds of a feather billie eilish",
  "birds": "birds of a feather billie eilish",
  "sailor": "sailor song gigi perez",
  "sailor song": "sailor song gigi perez",
  "seller": "sailor song gigi perez",
  "sealer": "sailor song gigi perez",
  "sealor": "sailor song gigi perez",
  "saylor": "sailor song gigi perez",
  "gigi perez": "sailor song gigi perez",
  "blinding lights": "blinding lights the weeknd",
  "perfect": "perfect ed sheeran",
  "shape of you": "shape of you ed sheeran",
  "bad habits": "bad habits ed sheeran"
};

/**
 * Filter helper that eliminates covers, karaoke, remixes, and lofis unless explicitly searched for
 */
const filterOfficialSongsOnly = (trackName: string, trackArtist: string, userQuery: string): boolean => {
  const name = trackName.toLowerCase();
  const artist = trackArtist.toLowerCase();
  const q = userQuery.toLowerCase();

  // Keyword identifiers of non-official or version content
  const keywords = ["cover", "karaoke", "reverb", "lofi", "tribute", "slowed", "instrumental", "remix", "mashup", "bgm", "acoustic", "version"];
  
  for (const keyword of keywords) {
    // If the keyword is present in the title or artist name
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(name) || regex.test(artist)) {
      // If the user did not explicitly request this keyword, skip/filter it out
      if (!q.includes(keyword)) {
        return false;
      }
    }
  }
  
  // Extra checks for descriptive non-official patterns
  if (!q.includes("cover")) {
    if (name.includes("originally performed by") || 
        name.includes("tribute to") || 
        name.includes("sound-alike") || 
        name.includes("re-recorded") ||
        name.includes("made famous by")) {
      return false;
    }
  }
  
  return true;
};

/**
 * Filter proper songs matching request by rejecting remixes, ambient noises, whistles, animal nature chirpings, etc.
 */
export const filterProperSongs = (songs: any[], queryStr: string): any[] => {
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

    // 2. Dunes, birds chirps, noises (instrumentals/ambient) filter
    for (const kw of noiseKeywords) {
      if (combinedText.includes(kw)) {
        if (qClean.includes(kw)) {
          continue;
        }
        
        // Exceptional allowance: Billie Eilish’s "birds of a feather"
        if (title.includes("birds of a feather") || title.includes("bird of a feather")) {
          continue;
        }
        
        return false;
      }
    }

    return true;
  });
};

/**
 * Fetches songs globally using the autocomplete endpoint and handles smart relevance sorting.
 * @param query - The search string typed by the user (e.g., 'sailor', 'birds of a feather', or Hindi tracks).
 * @returns A promise that resolves to an array of processed JioSaavnSong objects.
 */
export const searchGlobalSongs = async (query: string): Promise<JioSaavnSong[]> => {
  if (!query || !query.trim()) return [];

  const rawQuery = query.trim();

  // 1. Direct Link Paste Resolution
  if (rawQuery.startsWith("http://") || rawQuery.startsWith("https://")) {
    // Case A: JioSaavn Song URL (Shared from web or mobile app)
    if (rawQuery.includes("jiosaavn.com")) {
      try {
        const detailsUrl = `https://saavn.sumit.co/api/songs?link=${encodeURIComponent(rawQuery)}`;
        let detailsRes = await fetch(detailsUrl);
        if (!detailsRes.ok) {
          detailsRes = await fetch(`https://saavn.sumit.co/api/songs?url=${encodeURIComponent(rawQuery)}`);
        }
        
        if (detailsRes.ok) {
          const payload = await detailsRes.json();
          const results = payload?.data;
          
          if (Array.isArray(results) && results.length > 0) {
            return results;
          } else if (results && typeof results === "object") {
            return [results as JioSaavnSong];
          }
        }
      } catch (err) {
        console.warn("Failed fetching metadata for pasted JioSaavn URL:", err);
      }
    }

    // Case B: General direct stream URL (pasted mp3, m4a, wav, etc.)
    const isDirectAudio = rawQuery.endsWith(".mp3") || rawQuery.endsWith(".m4a") || rawQuery.endsWith(".wav") || rawQuery.includes(".mp3?") || rawQuery.includes("stream");
    if (isDirectAudio) {
      return [{
        id: "custom_" + Math.random().toString(36).substring(2, 11),
        name: "Direct Audio Stream Link",
        type: "song",
        album: { id: "custom", name: "Web Audio Stream", url: "" },
        year: String(new Date().getFullYear()),
        duration: "240",
        primaryArtists: "Web Streamer",
        image: [{ quality: "500x500", link: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500" }],
        downloadUrl: [{ quality: "320kbps", link: rawQuery }],
        language: "english",
        url: rawQuery
      }];
    }
  }

  try {
    const norm = rawQuery.toLowerCase();
    let finalQuery = rawQuery;

    for (const [key, expansion] of Object.entries(GLOBAL_SONG_EXPANSIONS)) {
      if (norm === key || norm.includes(key)) {
        finalQuery = expansion;
        break;
      }
    }

    // 2. Intelligent Dual-Search Pipeline: Retrieve clean metadata via iTunes to correct typos & identify official artists
    let itunesTracks: any[] = [];
    const isEnglishInput = /^[a-zA-Z0-9\s,.'"-]+$/.test(finalQuery);

    if (isEnglishInput) {
      try {
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(finalQuery)}&media=music&limit=5`;
        const itunesRes = await fetch(itunesUrl);
        if (itunesRes.ok) {
          const data = await itunesRes.json();
          itunesTracks = data.results || [];
        }
      } catch (err) {
        console.warn("iTunes API connection failed or CORS-blocked, continuing with JioSaavn direct:", err);
      }
    }

    let saavnSongs: JioSaavnSong[] = [];

    // Map iTunes corrected results to JioSaavn targets
    if (itunesTracks.length > 0) {
      const distinctTracks: any[] = [];
      const seenKeys = new Set<string>();

      for (const t of itunesTracks) {
        const key = `${t.trackName?.toLowerCase().trim()}-${t.artistName?.toLowerCase().trim()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          distinctTracks.push(t);
          if (distinctTracks.length >= 3) break; // Look up top 3 clean candidates
        }
      }

      const lookupPromises = distinctTracks.map(async (t) => {
        try {
          const refinedSearchTerm = `${t.artistName} ${t.trackName}`;
          const songSearchUrl = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(refinedSearchTerm)}&limit=3`;
          const songRes = await fetch(songSearchUrl);
          if (songRes.ok) {
            const payload = await songRes.json();
            const results = payload?.data?.results || payload?.results || payload?.data;
            if (Array.isArray(results) && results.length > 0) {
              const matched = results[0];
              const artworkUrl = t.artworkUrl100 || "";
              const hdArtworkUrl = artworkUrl
                ? artworkUrl.replace(/100x100(bb)?\.jpg/, "500x500bb.jpg").replace("100x100", "500x500")
                : "";

              // Return first matching official track on JioSaavn with swapped official metadata tags
              return {
                ...matched,
                itunes_name: t.trackName,
                itunes_artist: t.artistName,
                itunes_image: hdArtworkUrl
              };
            }
          }
        } catch (e) {
          console.warn(`JioSaavn refined lookup failed for "${t.trackName}":`, e);
        }
        return null;
      });

      const resolved = await Promise.all(lookupPromises);
      for (const s of resolved) {
        if (s && s.id) {
          saavnSongs.push(s);
        }
      }
    }

    // 3. Fallback to direct JioSaavn searches if iTunes returned no tracks or resolving failed
    if (saavnSongs.length === 0) {
      try {
        const songSearchUrl = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(finalQuery)}&limit=15`;
        const songRes = await fetch(songSearchUrl);
        if (songRes.ok) {
          const payload = await songRes.json();
          const results = payload?.data?.results || payload?.results || payload?.data;
          if (Array.isArray(results) && results.length > 0) {
            saavnSongs = results;
          }
        }
      } catch (err) {
        console.warn("Direct song search fallback failed:", err);
      }
    }

    // 4. Autocomplete search fallback (If direct list yields nothing)
    if (saavnSongs.length === 0) {
      const targetUrl = `https://saavn.sumit.co/api/search?query=${encodeURIComponent(finalQuery)}`;
      const response = await fetch(targetUrl);
      if (response.ok) {
        const payload = await response.json();
        const trackList = payload?.data?.songs?.results;
        if (Array.isArray(trackList) && trackList.length > 0) {
          saavnSongs = trackList;
        }
      }
    }

    // Sort by language to prioritize original global English tracks
    if (isEnglishInput && saavnSongs.length > 0) {
      saavnSongs.sort((trackA, trackB) => {
        const languageA = trackA.language?.toLowerCase() || '';
        const languageB = trackB.language?.toLowerCase() || '';
        if (languageA === 'english' && languageB !== 'english') return -1;
        if (languageA !== 'english' && languageB === 'english') return 1;
        return 0;
      });
    }

    // Batch fetch complete song details in case the list items lack high-quality download resources
    const ids = saavnSongs.map(t => t.id).filter(Boolean);
    let detailedSongs: any[] = [];

    if (ids.length > 0) {
      try {
        const detailUrl = `https://saavn.sumit.co/api/songs?ids=${ids.join(',')}`;
        const detailRes = await fetch(detailUrl);
        if (detailRes.ok) {
          const detailPayload = await detailRes.json();
          const list = Array.isArray(detailPayload?.data) ? detailPayload.data : (detailPayload?.data?.results || []);
          if (Array.isArray(list) && list.length > 0) {
            detailedSongs = list;
          }
        }
      } catch (err) {
        console.warn("Detail batch query failed, compiling using initial attributes instead", err);
      }
    }

    const detailedSongsMap = new Map<string, any>();
    for (const dSong of detailedSongs) {
      if (dSong && dSong.id) {
        detailedSongsMap.set(String(dSong.id), dSong);
      }
    }

    const finalSongs: JioSaavnSong[] = [];
    for (const track of saavnSongs) {
      const detail = detailedSongsMap.get(String(track.id));
      if (detail && Array.isArray(detail.downloadUrl) && detail.downloadUrl.length > 0) {
        finalSongs.push({
          ...track,
          ...detail,
          itunes_name: track.itunes_name,
          itunes_artist: track.itunes_artist,
          itunes_image: track.itunes_image
        });
      } else if (track.downloadUrl && Array.isArray(track.downloadUrl) && track.downloadUrl.length > 0) {
        finalSongs.push(track);
      } else if (detail) {
        finalSongs.push({
          ...track,
          ...detail,
          itunes_name: track.itunes_name,
          itunes_artist: track.itunes_artist,
          itunes_image: track.itunes_image
        });
      } else {
        finalSongs.push(track);
      }
    }

    return finalSongs;

  } catch (error) {
    console.error("Global music data synchronization transaction failed:", error);
    return [];
  }
};

/**
 * Master metadata extraction utility to robustly extract artist names from different JioSaavn schema variations.
 */
export function extractArtistName(song: any): string {
  if (!song) return "Various Artists";

  const getName = (a: any): string => {
    if (typeof a === 'string') return a.trim();
    if (a && typeof a === 'object') {
      return (a.name || a.artistName || "").trim();
    }
    return "";
  };

  const getFromArrayOrString = (val: any): string[] => {
    if (typeof val === 'string') {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(val)) {
      return val.map(getName).filter(Boolean);
    }
    return [];
  };

  const list: string[] = [];

  // 1. Try song.artists.primary
  if (song.artists?.primary && Array.isArray(song.artists.primary)) {
    list.push(...song.artists.primary.map(getName));
  }

  // 2. Try song.artistMap.primaryArtists
  if (list.length === 0 && song.artistMap?.primaryArtists && Array.isArray(song.artistMap.primaryArtists)) {
    list.push(...song.artistMap.primaryArtists.map(getName));
  }

  // 3. Try song.primaryArtists
  if (list.length === 0 && song.primaryArtists) {
    list.push(...getFromArrayOrString(song.primaryArtists));
  }

  // 4. Try song.singers
  if (list.length === 0 && song.singers) {
    list.push(...getFromArrayOrString(song.singers));
  }

  // 5. Try song.artists.all
  if (list.length === 0 && song.artists?.all && Array.isArray(song.artists.all)) {
    list.push(...song.artists.all.map(getName));
  }

  // 6. Try song.artistMap.artists
  if (list.length === 0 && song.artistMap?.artists && Array.isArray(song.artistMap.artists)) {
    list.push(...song.artistMap.artists.map(getName));
  }

  // 7. Try song.artists general fallback
  if (list.length === 0 && song.artists) {
    if (Array.isArray(song.artists)) {
      list.push(...song.artists.map(getName));
    } else if (typeof song.artists === 'string') {
      list.push(...getFromArrayOrString(song.artists));
    } else if (typeof song.artists === 'object' && song.artists !== null) {
      const subcategories = ['primary', 'all', 'featured', 'artists'];
      for (const cat of subcategories) {
        if (Array.isArray((song.artists as any)[cat])) {
          list.push(...(song.artists as any)[cat].map(getName));
          break;
        }
      }
    }
  }

  // 8. Try primary_artists (snake case variation)
  if (list.length === 0 && song.primary_artists) {
    list.push(...getFromArrayOrString(song.primary_artists));
  }

  let uniqueNames = Array.from(new Set(list)).map(name => name.trim()).filter(Boolean);

  // If "Various Artists" is listed alongside other real artists, filter out "Various Artists"
  if (uniqueNames.length > 1) {
    uniqueNames = uniqueNames.filter(name => name.toLowerCase() !== "various artists");
  }

  if (uniqueNames.length > 0) {
    return uniqueNames.join(', ');
  }

  // Secondary backup check features
  if (song.artists?.featured && Array.isArray(song.artists.featured)) {
    const featured = song.artists.featured.map(getName).filter(Boolean);
    if (featured.length > 0) return featured.join(', ');
  }

  return "Various Artists";
}

/**
 * High-performance global music search with advanced relevance keyword weighting
 */
export async function searchInternationalTracks(query: string): Promise<SongTrack[]> {
  const saavnSongs = await searchGlobalSongs(query);

  const mappedTracks: SongTrack[] = saavnSongs.map((song): SongTrack | null => {
    const artistName = song.itunes_artist || extractArtistName(song);
    const trackName = song.itunes_name || song.name || "Unknown Track";

    let streamUrl = "";
    if (Array.isArray(song?.downloadUrl)) {
      const highest = song.downloadUrl.find((d: any) => d?.quality === "320kbps") || 
                      song.downloadUrl.find((d: any) => d?.quality === "160kbps") || 
                      song.downloadUrl[song.downloadUrl.length - 1];
      streamUrl = typeof highest === "string" ? highest : ((highest as any)?.link || (highest as any)?.url || "");
    } else if (typeof song?.downloadUrl === "string") {
      streamUrl = song.downloadUrl;
    }

    const ensureHttps = (url: string) => {
      if (typeof url === 'string' && url.startsWith('http://')) {
        return url.replace('http://', 'https://');
      }
      return url;
    };
    
    streamUrl = ensureHttps(streamUrl);

    let image = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150";
    if (song.itunes_image) {
      image = song.itunes_image;
    } else if (Array.isArray(song?.image)) {
      const highestImage = song.image[song.image.length - 1];
      image = typeof highestImage === "string" ? highestImage : ((highestImage as any)?.link || (highestImage as any)?.url || "");
    } else if (typeof song?.image === "string") {
      image = song.image;
    }

    let duration = 180;
    if (song?.duration !== undefined) {
      const parsed = parseInt(String(song.duration), 10);
      if (!isNaN(parsed) && parsed > 0) {
        duration = parsed;
      }
    }

    // Strict Filter out short clips, teasers, and preview snippets (typically 30s-37s clips)
    if (duration < 60) {
      return null;
    }

    const titleLower = trackName.toLowerCase();
    if (titleLower.includes("ringtone") || titleLower.includes("teaser") || titleLower.includes("preview") || titleLower.includes("30s") || titleLower.includes("30sec") || titleLower.includes("short clip") || titleLower.includes("promo")) {
      return null;
    }

    return {
      id: song?.id || Math.random().toString(36).substring(2, 11),
      name: trackName,
      artist: artistName,
      url: streamUrl,
      image: image,
      duration: duration,
      language: song?.language || "",
      year: parseInt(song?.year || "", 10) || undefined,
      type: song?.type || "song"
    };
  }).filter((t): t is SongTrack => t !== null && t.url !== undefined && t.url.trim() !== "");

  // Apply strict official song filter
  const filteredMusic = mappedTracks.filter(t => filterOfficialSongsOnly(t.name, t.artist, query));

  // Perform meticulous relevance score sorting
  return filteredMusic.sort((a, b) => {
    let aScore = 0;
    let bScore = 0;

    const normQuery = query.toLowerCase().trim();
    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();
    const aArtist = (a.artist || "").toLowerCase();
    const bArtist = (b.artist || "").toLowerCase();

    // Exactly matching query is an absolute priority
    if (aName === normQuery) aScore += 10000;
    if (bName === normQuery) bScore += 10000;

    // Inclusion matching
    if (aName.includes(normQuery)) aScore += 2000;
    if (bName.includes(normQuery)) bScore += 2000;

    if (aArtist.includes(normQuery)) aScore += 1000;
    if (bArtist.includes(normQuery)) bScore += 1000;

    // Language priority
    const aLang = (a.language || "").toLowerCase();
    const bLang = (b.language || "").toLowerCase();
    if (aLang === "english" && bLang !== "english") aScore += 500;
    if (aLang !== "english" && bLang === "english") bScore += 500;

    // Favor official media types
    if (a.type === "song") aScore += 100;
    if (b.type === "song") bScore += 100;

    // Penalize historic archival material unless explicitly query-matched
    if (a.year && a.year < 1960) aScore -= 5000;
    if (b.year && b.year < 1960) bScore -= 5000;

    return bScore - aScore;
  });
}

/**
 * Standard Entrypoint conforming to components requirement
 */
export async function searchMusic(query: string, filterProper: boolean = true): Promise<TrackResult[]> {
  if (!query || !query.trim()) return [];

  let results: TrackResult[] = [];

  // 1. Try our high-quality server-side hybrid search API (YouTube Music + JioSaavn)
  try {
    const origin = typeof window !== 'undefined' && window.location && window.location.origin.startsWith('http')
      ? window.location.origin
      : 'http://localhost:3000';
    const serverSearchUrl = `${origin}/api/search?q=${encodeURIComponent(query.trim())}&filterProper=${filterProper}`;
    
    console.log(`[MusicSearch] Performing primary server-side hybrid search: ${serverSearchUrl}`);
    const res = await fetch(serverSearchUrl);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        results = data.map((track: any) => {
          // Resolve relative streamUrls (like /api/stream?id=...) to absolute URLs utilizing the active host origin
          let streamUrl = track.streamUrl || '';
          if (streamUrl.startsWith('/')) {
            streamUrl = `${origin}${streamUrl}`;
          }
          let thumbnail = track.thumbnail || '';
          if (thumbnail.startsWith('/')) {
            thumbnail = `${origin}${thumbnail}`;
          }
          return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            thumbnail: thumbnail,
            duration: track.duration,
            streamUrl: streamUrl
          };
        });
      }
    }
  } catch (err: any) {
    console.warn(`[MusicSearch] Server search failed or timed out. Falling back to resilient direct client-side search pipeline.`, err.message);
  }

  // 2. High-Resilience Fallback: Run direct client-side search using native iTunes & direct JioSaavn fetch API
  if (results.length === 0) {
    const songs = await searchInternationalTracks(query);
    results = songs.map((song) => ({
      id: song.id,
      title: song.name,
      artist: song.artist,
      thumbnail: song.image,
      duration: song.duration,
      streamUrl: song.url
    }));
    
    if (filterProper) {
      results = filterProperSongs(results, query);
    }
  }

  return results;
}
