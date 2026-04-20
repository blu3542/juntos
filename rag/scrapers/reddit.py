from __future__ import annotations

import os
import re
import time
from datetime import datetime

import feedparser
import requests


def _clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _to_utc_iso(ts):
    if not ts:
        return None
    try:
        return datetime.utcfromtimestamp(float(ts)).isoformat() + "Z"
    except Exception:
        return None


def _pick_category(subreddit: str) -> str:
    s = subreddit.lower()
    if s in {"food", "restaurants", "maui"}:
        return "attraction"

    if "hotel" in s or "resort" in s:
        return "hotel"
    if "travel" in s or "hawaiivisitors" in s:
        return "activity"
    return "attraction"


def _truthy_env(name: str) -> bool:
    val = (os.getenv(name) or "").strip().lower()
    return val in {"1", "true", "yes", "y", "on"}


def _get_with_retries(url: str, *, headers: dict, params=None, timeout: int = 30):
    """GET with simple backoff on 429/5xx.

    Returns None if ultimately blocked.
    """
    max_attempts = 4
    base_sleep = 1.5

    for attempt in range(max_attempts):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=timeout)
        except Exception:
            resp = None

        if resp is None:
            time.sleep(base_sleep * (attempt + 1))
            continue

        if resp.status_code == 200:
            return resp

        if resp.status_code == 403:
            return None

        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After")
            if retry_after:
                try:
                    time.sleep(float(retry_after))
                    continue
                except Exception:
                    pass
            time.sleep(base_sleep * (2 ** attempt))
            continue

        if 500 <= resp.status_code < 600:
            time.sleep(base_sleep * (attempt + 1))
            continue

        return None

    return None


def scrape(city: str) -> list[dict]:
    city_lower = city.lower().strip()

    queries = [
        f"{city} itinerary",
        f"things to do in {city}",
        f"best food in {city}",
        f"best beaches in {city}",
        f"where to stay in {city}",
        f"{city} airbnb",
        f"{city} condo rental",
        f"{city} vacation rental",
        f"{city} hostel",
    ]

    subreddits = ["Maui", "Hawaii", "travel", "MauiVisitors"]

    ua = os.getenv("REDDIT_USER_AGENT") or "juntos-rag/1.0"
    headers = {"User-Agent": ua, "Accept": "application/rss+xml,application/xml,text/xml"}

    reviews: list[dict] = []
    seen: set[str] = set()

    # Keep it bounded so ingestion is predictable.
    try:
        limit_per_query = int(os.getenv("REDDIT_LIMIT_PER_QUERY") or "20")
    except Exception:
        limit_per_query = 20

    try:
        sleep_seconds = float(os.getenv("REDDIT_SLEEP_SECONDS") or "0.5")
    except Exception:
        sleep_seconds = 0.5

    for sr in subreddits:
        for q in queries:
            time.sleep(sleep_seconds)
            q_lower = q.lower()
            query_category = "hotel" if any(k in q_lower for k in ["where to stay", "hotel", "resort", "lodging", "condo", "airbnb", "vacation rental", "hostel"]) else None
            rss_url = (
                f"https://www.reddit.com/r/{sr}/search.rss"
                f"?q={requests.utils.quote(q)}&restrict_sr=1&sort=relevance&t=year"
            )

            try:
                resp = _get_with_retries(rss_url, headers=headers, timeout=30)
                if resp is None:
                    raise requests.HTTPError("blocked", response=type("R", (), {"status_code": 403})())
            except Exception as e:
                # Some subreddits block RSS search endpoints (403). Fall back to the
                # subreddit listing RSS and filter locally by keywords.
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status != 403:
                    print(f"  [Reddit] Warning: RSS fetch failed for r/{sr} q='{q}': {e}")
                    continue

                listing_url = f"https://www.reddit.com/r/{sr}/.rss"
                try:
                    listing_resp = _get_with_retries(listing_url, headers=headers, timeout=30)
                    if listing_resp is None:
                        raise requests.HTTPError("blocked", response=type("R", (), {"status_code": 403})())
                except Exception as listing_e:
                    print(f"  [Reddit] Warning: RSS fallback failed for r/{sr} q='{q}': {listing_e}")
                    continue

                feed = feedparser.parse(listing_resp.text)
                q_words = [w for w in re.split(r"\W+", q.lower()) if w]
                count = 0
                for entry in getattr(feed, "entries", []) or []:
                    if count >= limit_per_query:
                        break

                    link = entry.get("link")
                    if not link:
                        continue

                    title = _clean_text(entry.get("title", ""))
                    summary = entry.get("summary", "")
                    summary_text = _clean_text(re.sub(r"<[^>]+>", " ", summary))
                    haystack = f"{title} {summary_text}".lower()
                    if q_words and not all(w in haystack for w in q_words[:3]):
                        continue

                    post_id = entry.get("id") or link
                    if post_id in seen:
                        continue
                    seen.add(post_id)

                    content = "\n\n".join([p for p in [title, summary_text] if p])
                    if len(content) < 50:
                        continue

                    published = entry.get("published_parsed")
                    published_iso = None
                    if published:
                        try:
                            published_iso = datetime(*published[:6]).isoformat() + "Z"
                        except Exception:
                            published_iso = None

                    reviews.append(
                        {
                            "city": city_lower,
                            "location_name": sr,
                            "source": "reddit",
                            "content": content,
                            "rating": None,
                            "category": _pick_category(sr),
                            "metadata": {
                                "post_id": post_id,
                                "subreddit": sr,
                                "url": link,
                                "created_at": published_iso,
                                "query": q,
                                "scraper": "rss_listing_fallback",
                            },
                        }
                    )
                    count += 1

                continue

            feed = feedparser.parse(resp.text)
            count = 0
            for entry in getattr(feed, "entries", []) or []:
                if count >= limit_per_query:
                    break

                link = entry.get("link")
                if not link:
                    continue
                post_id = entry.get("id") or link
                if post_id in seen:
                    continue
                seen.add(post_id)

                title = _clean_text(entry.get("title", ""))

                summary = entry.get("summary", "")
                summary_text = _clean_text(re.sub(r"<[^>]+>", " ", summary))
                content = "\n\n".join([p for p in [title, summary_text] if p])
                if len(content) < 50:
                    continue

                published = entry.get("published_parsed")
                published_iso = None
                if published:
                    try:
                        published_iso = datetime(*published[:6]).isoformat() + "Z"
                    except Exception:
                        published_iso = None

                reviews.append(
                    {
                        "city": city_lower,
                        "location_name": sr,
                        "source": "reddit",
                        "content": content,
                        "rating": None,
                        "category": query_category or _pick_category(sr),
                        "metadata": {
                            "post_id": post_id,
                            "subreddit": sr,
                            "url": link,
                            "created_at": published_iso,
                            "query": q,
                            "scraper": "rss",
                        },
                    }
                )
                count += 1

    return reviews
