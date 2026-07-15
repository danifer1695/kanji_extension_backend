CREATE TABLE saved_kanji (
    id              SERIAL PRIMARY KEY,
    kanji           VARCHAR(1)      NOT NULL,
    on_readings     TEXT[]          NOT NULL DEFAULT '{}',
    kun_readings    TEXT[]          NOT NULL DEFAULT '{}',
    meanings        TEXT[]          NOT NULL DEFAULT '{}',
    jlpt            INTEGER,
    saved_at        BIGINT          NOT NULL,

    mastery_level   SMALLINT        NOT NULL DEFAULT 0,
    times_correct   INTEGER         NOT NULL DEFAULT 0,
    times_incorrect INTEGER         NOT NULL DEFAULT 0,
    last_reviewed   TIMESTAMPTZ,
    next_review     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    CONSTRAINT saved_kanji_kanji_user_unique UNIQUE (kanji, user_id)
    CONSTRAINT mastery_level_range CHECK (mastery_level BETWEEN 0 AND 8);
);

CREATE INDEX idx_saved_kanji_due ON saved_kanji (user_id, next_review_at);
\q
