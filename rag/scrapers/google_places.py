from __future__ import annotations

import os
import time
import googlemaps


# Maps Google Places 'types' arrays to our category field
_TYPE_MAP = [
    ({"restaurant", "food", "meal_takeaway", "meal_delivery", "cafe", "bakery", "bar"}, "restaurant"),
    ({"lodging"}, "hotel"),
    ({"tourist_attraction", "museum", "art_gallery", "church", "hindu_temple",
      "mosque", "synagogue", "place_of_worship", "natural_feature", "park",
      "amusement_park", "aquarium", "zoo"}, "attraction"),
    ({"night_club", "bowling_alley", "movie_theater", "stadium", "casino"}, "activity"),
    ({"spa", "gym", "health"}, "activity"),
    ({"beach"}, "beach"),
]


def _map_category(types: list[str]) -> str:
    types_set = set(types)
    for type_group, category in _TYPE_MAP:
        if types_set & type_group:
            return category
    return "attraction"  # default


def scrape(city: str) -> list[dict]:
    """Scrape reviews from Google Places for a given city.

    Runs 5 category searches, fetches reviews for each place found,
    and returns a flat list of standard review dicts.
    """
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_PLACES_API_KEY not set in environment")

    gmaps = googlemaps.Client(key=api_key)
    city_lower = city.lower().strip()

    # Search queries tailored for travel destinations (beaches especially for Maui)
    queries = [
        f"best restaurants in {city}",
        f"hotels in {city}",
        f"tourist attractions in {city}",
        f"things to do in {city}",
        f"beaches in {city}",
    ]

    seen_place_ids: set[str] = set()
    reviews: list[dict] = []

    for query in queries:
        print(f"  Searching: {query}")
        try:
            search_result = gmaps.places(query=query)
        except Exception as e:
            print(f"  Warning: places search failed for '{query}': {e}")
            continue

        places = search_result.get("results", [])
        print(f"  Found {len(places)} places")

        for place in places:
            place_id = place.get("place_id")
            if not place_id or place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)

            # Derive category from the search result's types (already present, no extra API call)
            place_types = place.get("types", [])
            category = _map_category(place_types)

            time.sleep(0.5)  # rate limiting

            try:
                detail = gmaps.place(
                    place_id=place_id,
                    fields=["name", "rating", "reviews"],
                )
            except Exception as e:
                print(f"  Warning: place detail failed for {place_id}: {e}")
                continue

            result = detail.get("result", {})
            place_name = result.get("name", "Unknown")
            place_rating = result.get("rating")
            place_reviews = result.get("reviews", [])

            for r in place_reviews:
                content = r.get("text", "").strip()
                if not content:
                    continue
                reviews.append({
                    "city": city_lower,
                    "location_name": place_name,
                    "source": "google",
                    "content": content,
                    "rating": float(r.get("rating", place_rating or 0)),
                    "category": category,
                    "metadata": {
                        "author": r.get("author_name"),
                        "relative_time": r.get("relative_time_description"),
                        "place_id": place_id,
                    },
                })

    print(f"  Total reviews scraped: {len(reviews)}")
    return reviews
