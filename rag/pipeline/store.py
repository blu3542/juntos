from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Generator

import boto3
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool
from pgvector.psycopg2 import register_vector

# Module-level singleton pool — initialised once on first call to store_reviews.
_pool: ThreadedConnectionPool | None = None


def _get_secret(secret_arn: str) -> dict:
    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response["SecretString"])


def _build_pool() -> ThreadedConnectionPool:
    secret_arn = os.environ["DB_SECRET_ARN"]
    secret = _get_secret(secret_arn)

    conn_kwargs = dict(
        host=secret["host"],
        port=int(secret.get("port", 5432)),
        dbname=secret["dbname"],
        user=secret["username"],
        password=secret["password"],
        connect_timeout=10,
        sslmode="require",
    )

    pool = ThreadedConnectionPool(minconn=1, maxconn=5, **conn_kwargs)

    # Register the pgvector psycopg2 type adapter once on any connection;
    # the registration is global to the process after the first call.
    conn = pool.getconn()
    try:
        register_vector(conn)
    finally:
        pool.putconn(conn)

    return pool


def _get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = _build_pool()
    return _pool


@contextmanager
def _get_conn() -> Generator[psycopg2.extensions.connection, None, None]:
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def store_reviews(reviews: list[dict], client=None) -> tuple[int, int, int]:
    """Upsert reviews into Aurora PostgreSQL.

    The `client` parameter is accepted but ignored; it exists so that callers
    that still pass a Supabase client (rag/ingest.py) continue to work
    without changes until Phase 2 of the migration.

    Returns (inserted_count, skipped_count, updated_count).
    skipped_count is always 0 — every conflict results in an UPDATE.
    """
    if not reviews:
        return 0, 0, 0

    inserted = 0
    updated = 0

    with _get_conn() as conn:
        with conn.cursor() as cur:
            for review in reviews:
                metadata = review.get("metadata")

                cur.execute(
                    """
                    INSERT INTO reviews
                        (city, location_name, source, content,
                         rating, category, embedding, metadata)
                    VALUES
                        (%(city)s, %(location_name)s, %(source)s, %(content)s,
                         %(rating)s, %(category)s, %(embedding)s, %(metadata)s)
                    ON CONFLICT (location_name, md5(content), city) DO UPDATE SET
                        category  = COALESCE(EXCLUDED.category,  reviews.category),
                        source    = COALESCE(EXCLUDED.source,    reviews.source),
                        embedding = CASE
                                        WHEN EXCLUDED.embedding IS NOT NULL
                                        THEN EXCLUDED.embedding
                                        ELSE reviews.embedding
                                    END,
                        metadata  = CASE
                                        WHEN EXCLUDED.metadata IS NOT NULL
                                        THEN EXCLUDED.metadata
                                        ELSE reviews.metadata
                                    END
                    RETURNING (xmax = 0) AS is_insert
                    """,
                    {
                        "city":          review.get("city"),
                        "location_name": review.get("location_name"),
                        "source":        review.get("source"),
                        "content":       review.get("content"),
                        "rating":        review.get("rating"),
                        "category":      review.get("category"),
                        "embedding":     review.get("embedding"),
                        "metadata":      psycopg2.extras.Json(metadata) if metadata is not None else None,
                    },
                )
                row = cur.fetchone()
                if row and row[0]:
                    inserted += 1
                else:
                    updated += 1

        conn.commit()

    return inserted, 0, updated
