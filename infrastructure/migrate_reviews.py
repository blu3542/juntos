"""
Migrates the reviews table from Supabase to RDS PostgreSQL.

Usage:
    export SUPABASE_URL=https://nigvyotnrlgbqeeyueql.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
    export DATABASE_URL=postgres://juntos_admin:<pass>@<host>:5432/juntos
    python migrate_reviews.py
"""

import json
import os
import sys

import psycopg2
import psycopg2.extras
import requests

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "https://nigvyotnrlgbqeeyueql.supabase.co")
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
DATABASE_URL     = os.environ["DATABASE_URL"]
PAGE_SIZE        = 500

# ── Fetch from Supabase REST API ──────────────────────────────────────────────

def fetch_reviews_page(offset: int) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/reviews"
    resp = requests.get(url, headers={
        "apikey":        SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    }, params={
        "select": "id,city,location_name,source,content,rating,category,embedding,metadata,created_at",
        "order":  "created_at.asc",
        "limit":  PAGE_SIZE,
        "offset": offset,
    })
    resp.raise_for_status()
    return resp.json()

# ── Insert into RDS ───────────────────────────────────────────────────────────

INSERT_SQL = """
    INSERT INTO reviews
        (id, city, location_name, source, content, rating, category, embedding, metadata, created_at)
    VALUES
        (%(id)s, %(city)s, %(location_name)s, %(source)s, %(content)s,
         %(rating)s, %(category)s, %(embedding)s, %(metadata)s, %(created_at)s)
    ON CONFLICT (location_name, md5(content), city) DO NOTHING
"""

def run():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    total = 0
    offset = 0

    print("Migrating reviews from Supabase → RDS...")

    while True:
        rows = fetch_reviews_page(offset)
        if not rows:
            break

        for row in rows:
            # Supabase returns embeddings as a JSON array of floats;
            # format as a Postgres vector literal for pgvector
            embedding = row.get("embedding")
            if embedding is not None:
                if isinstance(embedding, list):
                    row["embedding"] = f"[{','.join(str(x) for x in embedding)}]"
                # else leave as-is (already a string)

            metadata = row.get("metadata")
            row["metadata"] = psycopg2.extras.Json(metadata) if metadata is not None else None

            cur.execute(INSERT_SQL, row)

        conn.commit()
        total += len(rows)
        print(f"  Inserted {total} rows so far...")

        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    cur.close()
    conn.close()
    print(f"\nDone. {total} reviews migrated.")

if __name__ == "__main__":
    missing = [k for k in ("SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL") if not os.environ.get(k)]
    if missing:
        print(f"Missing env vars: {', '.join(missing)}")
        sys.exit(1)
    run()
