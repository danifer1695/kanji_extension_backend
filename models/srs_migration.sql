--Table alteration SRS (Spaced Repetition System) implementation 
ALTER TABLE saved_kanji
    ADD COLUMN mastery_level SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN times_correct INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN times_incorrect INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_reviewed TIMESTAMPTZ,
    ADD COLUMN next_review TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ADD CONSTRAINT mastery_level_range CHECK (mastery_level BETWEEN 0 AND 8);

CREATE INDEX idx_saved_kanji_due ON saved_kanji (user_id, next_review);
