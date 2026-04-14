from supabase import Client


def store_reviews(reviews: list[dict], client: Client) -> tuple[int, int]:
    """Insert reviews into Supabase, skipping duplicates.

    Returns (inserted_count, skipped_count).
    """
    if not reviews:
        return 0, 0

    city = reviews[0]["city"]

    # Fetch existing (location_name, content) pairs for this city to dedup in Python
    existing_resp = (
        client.table("reviews")
        .select("location_name, content")
        .eq("city", city)
        .execute()
    )
    existing = {
        (row["location_name"], row["content"])
        for row in (existing_resp.data or [])
    }

    new_rows = []
    skipped = 0
    for review in reviews:
        key = (review["location_name"], review["content"])
        if key in existing:
            skipped += 1
        else:
            new_rows.append(review)
            existing.add(key)  # prevent dupes within the same batch

    if not new_rows:
        return 0, skipped

    # Insert in batches of 100
    batch_size = 100
    inserted = 0
    for i in range(0, len(new_rows), batch_size):
        batch = new_rows[i : i + batch_size]
        client.table("reviews").insert(batch).execute()
        inserted += len(batch)

    return inserted, skipped
