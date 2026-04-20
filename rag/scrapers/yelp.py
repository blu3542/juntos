"""Yelp Fusion API scraper — disabled for now.

Uncomment and add YELP_API_KEY to .env to enable.
Yelp Fusion free tier: 500 calls/day, max 3 review snippets per business.
"""

from __future__ import annotations

import os
import time
from typing import Any

import requests


def scrape(city: str) -> list[dict]:
    api_key = os.getenv("YELP_API_KEY")
    if not api_key:
        print("  [Yelp] YELP_API_KEY not set — skipping.")
        return []

    city_lower = city.lower().strip()
    headers = {"Authorization": f"Bearer {api_key}"}

    # Tuneable knobs
    try:
        business_limit = int(os.getenv("YELP_BUSINESS_LIMIT") or "30")
    except Exception:
        business_limit = 30

    try:
        per_category_limit = int(os.getenv("YELP_PER_CATEGORY_LIMIT") or "20")
    except Exception:
        per_category_limit = 20

    categories = [
        ("restaurants", "restaurant"),
        ("hotels", "hotel"),
        ("arts", "attraction"),
        ("beaches", "beach"),
        ("tours", "activity"),
    ]

    def _get_json(url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _pick_url(biz: dict[str, Any]) -> str | None:
        return biz.get("url") or biz.get("alias")

    reviews: list[dict] = []
    seen_business_ids: set[str] = set()

    yelp_base = "https://api.yelp.com/v3"

    for yelp_cat, our_cat in categories:
        params = {
            "location": city,
            "categories": yelp_cat,
            "limit": min(per_category_limit, 50),
            "sort_by": "best_match",
        }

        try:
            data = _get_json(f"{yelp_base}/businesses/search", params=params)
        except Exception as e:
            print(f"  [Yelp] Warning: business search failed for category '{yelp_cat}': {e}")
            continue

        businesses = data.get("businesses") or []
        for biz in businesses:
            if len(seen_business_ids) >= business_limit:
                break

            biz_id = biz.get("id")
            if not biz_id or biz_id in seen_business_ids:
                continue
            seen_business_ids.add(biz_id)

            biz_name = biz.get("name") or "Unknown"
            biz_rating = biz.get("rating")
            biz_review_count = biz.get("review_count")
            biz_url = _pick_url(biz)

            # Yelp reviews endpoint returns at most 3 snippets.
            time.sleep(0.25)
            try:
                rev = _get_json(f"{yelp_base}/businesses/{biz_id}/reviews")
            except Exception as e:
                print(f"  [Yelp] Warning: reviews fetch failed for {biz_id}: {e}")
                continue

            for r in rev.get("reviews") or []:
                content = (r.get("text") or "").strip()
                if not content:
                    continue

                reviews.append(
                    {
                        "city": city_lower,
                        "location_name": biz_name,
                        "source": "yelp",
                        "content": content,
                        "rating": float(r.get("rating") or biz_rating or 0) or None,
                        "category": our_cat,
                        "metadata": {
                            "yelp_id": biz_id,
                            "url": biz_url,
                            "review_count": biz_review_count,
                            "author": (r.get("user") or {}).get("name"),
                            "time_created": r.get("time_created"),
                            "category_alias": yelp_cat,
                        },
                    }
                )

    return reviews


# ---------------------------------------------------------------------------
# Commented-out implementation — uncomment to enable
# ---------------------------------------------------------------------------
# import os
# import time
# import requests
#
# YELP_BASE = "https://api.yelp.com/v3"
#
#
# def scrape(city: str) -> list[dict]:
#     api_key = os.getenv("YELP_API_KEY")
#     if not api_key:
#         print("  [Yelp] YELP_API_KEY not set — skipping.")
#         return []
#
#     headers = {"Authorization": f"Bearer {api_key}"}
#     city_lower = city.lower().strip()
#     reviews = []
#
#     # Search for businesses
#     params = {
#         "location": city,
#         "categories": "restaurants,hotels,arts",
#         "limit": 50,
#     }
#     resp = requests.get(f"{YELP_BASE}/businesses/search", headers=headers, params=params)
#     resp.raise_for_status()
#     businesses = resp.json().get("businesses", [])
#     print(f"  [Yelp] Found {len(businesses)} businesses")
#
#     for biz in businesses:
#         biz_id = biz["id"]
#         biz_name = biz["name"]
#         biz_rating = biz.get("rating")
#         biz_categories = [c["alias"] for c in biz.get("categories", [])]
#         category = "restaurant" if "restaurants" in biz_categories else \
#                    "hotel" if "hotels" in biz_categories else "attraction"
#
#         time.sleep(0.3)
#         rev_resp = requests.get(f"{YELP_BASE}/businesses/{biz_id}/reviews", headers=headers)
#         if not rev_resp.ok:
#             continue
#
#         for r in rev_resp.json().get("reviews", []):
#             content = r.get("text", "").strip()
#             if not content:
#                 continue
#             reviews.append({
#                 "city": city_lower,
#                 "location_name": biz_name,
#                 "source": "yelp",
#                 "content": content,
#                 "rating": float(r.get("rating", biz_rating or 0)),
#                 "category": category,
#                 "metadata": {
#                     "yelp_id": biz_id,
#                     "url": biz.get("url"),
#                     "review_count": biz.get("review_count"),
#                 },
#             })
#
#     print(f"  [Yelp] Total reviews scraped: {len(reviews)}")
#     return reviews
