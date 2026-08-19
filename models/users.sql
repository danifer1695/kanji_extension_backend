CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(255) NOT NULL UNIQUE,
    email           TEXT UNIQUE,
    password_hash   TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);
