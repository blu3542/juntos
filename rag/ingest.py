"""Ingestion CLI: scrape → clean → embed → store reviews in Supabase.

Usage:
    python ingest.py --city maui --source google
    python ingest.py --city paris --source all
    python ingest.py --city tokyo --source google
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Load .env from repo root (one level up from rag/)
from dotenv import load_dotenv
_ENV_PATH = (Path(__file__).resolve().parent.parent / ".env").resolve()
_DOTENV_LOADED = load_dotenv(_ENV_PATH)

from supabase import create_client

from scrapers import google_places, reddit, tripadvisor, yelp
from pipeline.clean import clean_text
from pipeline.embed import embed_texts
from pipeline.store import store_reviews


SCRAPERS = {
    "google": google_places,
    "reddit": reddit,
    "tripadvisor": tripadvisor,
    "yelp": yelp,
}


def run_source(source_name: str, city: str, supabase_client) -> tuple[int, int]:
    """Run a single scraper source through the full pipeline.

    Returns (inserted, skipped).
    """
    scraper = SCRAPERS[source_name]
    print(f"\n[{source_name.upper()}] Scraping {city}...")

    try:
        raw_reviews = scraper.scrape(city)
    except NotImplementedError as e:
        print(f"  Skipped: {e}")
        return 0, 0
    except Exception as e:
        print(f"  Error during scraping: {e}")
        return 0, 0

    print(f"  Scraped {len(raw_reviews)} raw reviews")

    # Clean review text
    cleaned = []
    dropped = 0
    for review in raw_reviews:
        clean = clean_text(review["content"])
        if clean is None:
            dropped += 1
        else:
            cleaned.append({**review, "content": clean})

    print(f"  After cleaning: {len(cleaned)} reviews ({dropped} dropped as too short/empty)")

    if not cleaned:
        return 0, 0

    # Embed all review texts in one batched call
    print(f"  Embedding {len(cleaned)} texts...")
    texts = [r["content"] for r in cleaned]
    try:
        embeddings = embed_texts(texts)
    except Exception as e:
        print(f"  Error during embedding: {e}")
        return 0, 0

    # Attach embeddings
    reviews_with_embeddings = [
        {**review, "embedding": embedding}
        for review, embedding in zip(cleaned, embeddings)
    ]

    # Store in Supabase
    print(f"  Storing in Supabase...")
    try:
        result = store_reviews(reviews_with_embeddings, supabase_client)
        if isinstance(result, tuple) and len(result) == 3:
            inserted, skipped, updated = result
        else:
            inserted, skipped = result  # type: ignore[misc]
            updated = 0
    except Exception as e:
        print(f"  Error during storage: {e}")
        return 0, 0

    print(f"  Stored {inserted} new reviews ({skipped} duplicates skipped, {updated} updated)")
    return inserted, skipped


def main():
    parser = argparse.ArgumentParser(description="Ingest travel reviews into Supabase")
    parser.add_argument("--city", required=True, help="City to scrape (e.g. maui, tokyo, paris)")
    parser.add_argument(
        "--source",
        default="google",
        choices=["google", "reddit", "tripadvisor", "yelp", "all"],
        help="Data source to scrape (default: google)",
    )
    args = parser.parse_args()

    city = args.city.lower().strip()
    sources = list(SCRAPERS.keys()) if args.source == "all" else [args.source]

    # Validate env
    supabase_url = (os.getenv("SUPABASE_URL") or "").strip()
    supabase_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not supabase_key:
        missing = []
        if not supabase_url:
            missing.append("SUPABASE_URL")
        if not supabase_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        print(f"  .env path: {_ENV_PATH}")
        print(f"  .env exists: {_ENV_PATH.exists()}")
        print(f"  load_dotenv returned: {_DOTENV_LOADED}")
        print(f"  missing: {', '.join(missing) if missing else 'unknown'}")
        sys.exit(1)

    supabase_client = create_client(supabase_url, supabase_key)

    print(f"Starting ingestion for city: {city}")
    print(f"Sources: {', '.join(sources)}")

    total_inserted = 0
    total_skipped = 0

    for source in sources:
        inserted, skipped = run_source(source, city, supabase_client)
        total_inserted += inserted
        total_skipped += skipped

    print(f"\nDone! Total: {total_inserted} new reviews inserted, {total_skipped} duplicates skipped.")


if __name__ == "__main__":
    main()
