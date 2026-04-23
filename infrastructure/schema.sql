-- ============================================================
-- Juntos – Aurora PostgreSQL schema
-- Apply with:  psql -h <cluster_endpoint> -U juntos_admin -d juntos -f schema.sql
-- ============================================================

-- pgvector: must be enabled before any vector columns or operators are used
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
    id                  UUID        PRIMARY KEY,
    display_name        TEXT,
    budget              TEXT,
    destination         TEXT,
    trip_style          TEXT,
    pace_morning        TEXT,
    pace_evening        TEXT,
    downtime            TEXT,
    accommodation       TEXT,
    dietary             TEXT[],
    onboarding_complete BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS conversations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,
    title       TEXT,
    is_group    BOOLEAN     NOT NULL DEFAULT FALSE,
    group_name  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id      UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role                 TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content              TEXT        NOT NULL,
    is_agent             BOOLEAN     NOT NULL DEFAULT FALSE,
    sender_id            UUID,
    sender_display_name  TEXT,
    attachments          JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
    ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS group_members (
    conversation_id  UUID  NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id          UUID  NOT NULL,
    display_name     TEXT,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_invites (
    id                    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id       UUID  NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    invited_user_id       UUID  NOT NULL,
    invited_by            UUID  NOT NULL,
    status                TEXT  NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'accepted', 'declined')),
    inviter_display_name  TEXT
);

CREATE TABLE IF NOT EXISTS websocket_connections (
    connection_id   TEXT        PRIMARY KEY,
    conversation_id UUID        NOT NULL,
    user_id         UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ws_connections_conversation_idx
    ON websocket_connections (conversation_id);

CREATE TABLE IF NOT EXISTS reviews (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    city           TEXT        NOT NULL,
    location_name  TEXT        NOT NULL,
    source         TEXT,
    content        TEXT        NOT NULL,
    rating         FLOAT,
    category       TEXT,
    embedding      VECTOR(1536),
    metadata       JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplication constraint used by the Python upsert (ON CONFLICT DO UPDATE).
-- md5(content) avoids B-tree index size limits on long review texts.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_dedup_idx
    ON reviews (location_name, md5(content), city);

-- IVFFlat index for fast cosine similarity search.
-- NOTE: For best recall, (re-)create this index after an initial data load
-- using: CREATE INDEX CONCURRENTLY ... to avoid locking the table.
-- lists = 100 is a reasonable default; tune to sqrt(row_count) as data grows.
CREATE INDEX IF NOT EXISTS reviews_embedding_idx
    ON reviews USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ── Stored procedures ────────────────────────────────────────────────────────

-- match_reviews: cosine-similarity search over review embeddings for a given city.
-- Called by the agent edge function as an RPC equivalent.
CREATE OR REPLACE FUNCTION match_reviews(
    query_embedding  VECTOR(1536),
    city_filter      TEXT,
    match_count      INT DEFAULT 10
)
RETURNS TABLE (
    id             UUID,
    location_name  TEXT,
    source         TEXT,
    content        TEXT,
    rating         FLOAT,
    category       TEXT,
    similarity     FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.location_name,
        r.source,
        r.content,
        r.rating,
        r.category,
        -- pgvector <=> is cosine distance (0 = identical, 2 = opposite)
        -- convert to similarity score in [−1, 1]
        (1.0 - (r.embedding <=> query_embedding))::FLOAT AS similarity
    FROM reviews r
    WHERE r.city      = city_filter
      AND r.embedding IS NOT NULL
    ORDER BY r.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- create_group_conversation: inserts a new group conversation and returns its UUID.
CREATE OR REPLACE FUNCTION create_group_conversation(
    p_group_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO conversations (group_name, is_group)
    VALUES (p_group_name, TRUE)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- accept_group_invite: marks the invite accepted and adds the user to group_members.
CREATE OR REPLACE FUNCTION accept_group_invite(
    p_invite_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_invite group_invites%ROWTYPE;
BEGIN
    SELECT * INTO STRICT v_invite
    FROM group_invites
    WHERE id = p_invite_id;

    UPDATE group_invites
    SET    status = 'accepted'
    WHERE  id = p_invite_id;

    INSERT INTO group_members (conversation_id, user_id)
    VALUES (v_invite.conversation_id, v_invite.invited_user_id)
    ON CONFLICT DO NOTHING;
END;
$$;

-- decline_group_invite: marks the invite declined.
CREATE OR REPLACE FUNCTION decline_group_invite(
    p_invite_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE group_invites
    SET    status = 'declined'
    WHERE  id = p_invite_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite not found: %', p_invite_id;
    END IF;
END;
$$;
