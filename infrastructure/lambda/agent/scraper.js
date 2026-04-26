const SCRAPE_CATEGORIES = ["restaurant", "attraction"];
const MAX_PLACES        = 5;
const MAX_REVIEWS       = 3;
const FETCH_TIMEOUT_MS  = 5000;
const DETAIL_SLEEP_MS   = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(raw) {
  if (!raw || typeof raw !== "string") return null;
  const stripped = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length >= 20 ? stripped : null;
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function searchPlaces(category, city, apiKey) {
  const query = encodeURIComponent(`best ${category} in ${city}`);
  const url   = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;
  const data  = await fetchJson(url);
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Places Text Search error: ${data.status} — ${data.error_message ?? ""}`);
  }
  return (data.results ?? []).slice(0, MAX_PLACES);
}

async function getPlaceDetails(placeId, apiKey) {
  const fields = "name,rating,reviews";
  const url    = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
  const data   = await fetchJson(url);
  if (data.status !== "OK") {
    throw new Error(`Places Details error: ${data.status} — ${data.error_message ?? ""}`);
  }
  return data.result ?? {};
}

export async function scrapeCityReviews(city, { embedText, getPool, log }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const pool   = await getPool();

  let inserted = 0;
  let updated  = 0;

  for (const category of SCRAPE_CATEGORIES) {
    let places;
    try {
      places = await searchPlaces(category, city, apiKey);
    } catch (err) {
      log({ scraper: "searchPlaces", category, city, error: err.message });
      continue;
    }

    for (const place of places) {
      await sleep(DETAIL_SLEEP_MS);

      let detail;
      try {
        detail = await getPlaceDetails(place.place_id, apiKey);
      } catch (err) {
        log({ scraper: "getPlaceDetails", place_id: place.place_id, error: err.message });
        continue;
      }

      const locationName = detail.name ?? place.name ?? "Unknown";
      const rating       = detail.rating ?? place.rating ?? null;
      const rawReviews   = (detail.reviews ?? []).slice(0, MAX_REVIEWS);

      for (const review of rawReviews) {
        const content = cleanText(review.text);
        if (!content) continue;

        let embedding;
        try {
          embedding = await embedText(`${locationName} ${content}`);
        } catch (err) {
          log({ scraper: "embedText", locationName, error: err.message });
          continue;
        }

        const embeddingLiteral = `[${embedding.join(",")}]`;
        const metadata = JSON.stringify({
          author:     review.author_name ?? null,
          time:       review.time        ?? null,
          place_id:   place.place_id,
          scraped_at: new Date().toISOString(),
        });

        try {
          const { rows } = await pool.query(
            `INSERT INTO reviews (city, location_name, source, content, rating, category, embedding, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)
             ON CONFLICT (location_name, md5(content), city) DO UPDATE SET
               category  = COALESCE(EXCLUDED.category,  reviews.category),
               embedding = CASE WHEN EXCLUDED.embedding IS NOT NULL THEN EXCLUDED.embedding ELSE reviews.embedding END,
               metadata  = EXCLUDED.metadata
             RETURNING (xmax = 0) AS is_insert`,
            [city, locationName, "google_places", content, rating, category, embeddingLiteral, metadata]
          );
          if (rows[0]?.is_insert) inserted++;
          else updated++;
        } catch (err) {
          log({ scraper: "upsert", locationName, error: err.message });
        }
      }
    }
  }

  log({ scraper: "done", city, inserted, updated, total: inserted + updated });
  return { inserted, updated, total: inserted + updated };
}
