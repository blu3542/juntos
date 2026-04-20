from __future__ import annotations

from supabase import Client


def store_reviews(reviews: list[dict], client: Client) -> tuple[int, int, int]:
    """Insert reviews into Supabase, skipping duplicates.

    Returns (inserted_count, skipped_count, updated_count).
    """
    if not reviews:
        return 0, 0, 0

    city = reviews[0]["city"]

    # Fetch existing rows for this city to dedup in Python (and allow updates)
    existing_resp = (
        client.table("reviews")
        .select("id, location_name, content, category, source")
        .eq("city", city)
        .execute()
    )
    existing_map = {
        (row["location_name"], row["content"]): row
        for row in (existing_resp.data or [])
    }

    new_rows = []
    skipped = 0
    updated = 0
    for review in reviews:
        key = (review["location_name"], review["content"])
        existing_row = existing_map.get(key)
        if existing_row:
            # If the row already exists, opportunistically update category/source/metadata/embedding
            # so re-ingestion can improve labeling without creating duplicates.
            updates = {}
            if review.get("category") and review.get("category") != existing_row.get("category"):
                updates["category"] = review.get("category")
            if review.get("source") and review.get("source") != existing_row.get("source"):
                updates["source"] = review.get("source")

            # Keep latest embedding/metadata if provided.
            if review.get("embedding") is not None:
                updates["embedding"] = review.get("embedding")
            if review.get("metadata") is not None:
                updates["metadata"] = review.get("metadata")

            if updates:
                client.table("reviews").update(updates).eq("id", existing_row["id"]).execute()
                updated += 1
            else:
                skipped += 1
        else:
            new_rows.append(review)
            existing_map[key] = {"id": None, "category": review.get("category"), "source": review.get("source")}  # prevent dupes within the same batch

    if not new_rows:
        return 0, skipped, updated

    # Insert in batches of 100
    batch_size = 100
    inserted = 0
    for i in range(0, len(new_rows), batch_size):
        batch = new_rows[i : i + batch_size]
        client.table("reviews").insert(batch).execute()
        inserted += len(batch)

    return inserted, skipped, updated
