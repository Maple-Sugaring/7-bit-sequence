-- Refresh-token store.
--
-- Each row is one long-lived refresh token for one user on one device. Only the
-- token's hash is kept, so a database dump cannot be replayed as a live session.
--
-- Rotation with reuse detection: every refresh mints a new token in the same
-- `family_id` and points the spent row at its successor via `replaced_by`
-- (and stamps `revoked_at`). If a spent token is ever presented again — the
-- signature of a stolen, already-rotated token — the whole family is revoked at
-- once. `expires_at` bounds the absolute lifetime regardless of activity.

create table if not exists sessions
(
    id           bigint generated always as identity
        primary key,
    user_id      integer                  not null
        references users on delete cascade,
    -- Groups a chain of rotated tokens so reuse can revoke the lineage at once.
    family_id    uuid                     not null,
    -- SHA-256 hex of the opaque token. Unique so a presented token maps to at
    -- most one row.
    token_hash   text                     not null
        unique,
    user_agent   text,
    created_ip   text,
    issued_at    timestamp with time zone not null default CURRENT_TIMESTAMP,
    last_used_at timestamp with time zone,
    expires_at   timestamp with time zone not null,
    -- Set when the token is rotated out or explicitly revoked.
    revoked_at   timestamp with time zone,
    -- The row that superseded this one on rotation; a spent-but-reused token is
    -- one whose replaced_by (or revoked_at) is already set.
    replaced_by  bigint
        references sessions on delete set null
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_family_id_idx on sessions (family_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);
