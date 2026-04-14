"""Yelp Fusion API scraper — disabled for now.

Uncomment and add YELP_API_KEY to .env to enable.
Yelp Fusion free tier: 500 calls/day, max 3 review snippets per business.
"""


def scrape(city: str) -> list[dict]:
    print("  [Yelp] Skipped — Yelp integration is currently disabled.")
    return []


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
