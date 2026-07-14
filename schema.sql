CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE saved_kanji (
    id           SERIAL PRIMARY KEY,
    kanji        VARCHAR(1)   NOT NULL,
    on_readings  TEXT[]       NOT NULL DEFAULT '{}',
    kun_readings TEXT[]       NOT NULL DEFAULT '{}',
    meanings     TEXT[]       NOT NULL DEFAULT '{}',
    jlpt         INTEGER,
    saved_at     BIGINT       NOT NULL,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT saved_kanji_kanji_user_unique UNIQUE (kanji, user_id)
);
\q
