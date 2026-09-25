-- Baseline schema, as authored by the team.
--
-- Reproduced as given, with two mechanical changes so it can run repeatably
-- against a fresh database in any environment:
--   * IF NOT EXISTS on each table
--   * the `alter table ... owner to innocenziorizzuto` statements are dropped,
--     since the role only exists on one developer's machine and ownership is
--     already correct for whichever role runs the migration
--
-- Everything the frontend additionally requires is added in 002 rather than
-- edited in here, so this file stays comparable to the team's source DDL.

create table if not exists roles
(
    id        integer generated always as identity
        primary key,
    role_name varchar(50) not null
        unique
);

create table if not exists users
(
    id         integer generated always as identity
        primary key,
    role_id    integer
        references roles,
    full_name  varchar(100) not null,
    email      varchar(255) not null
        unique,
    created_at timestamp with time zone default CURRENT_TIMESTAMP
);

create table if not exists gateway
(
    id           integer generated always as identity
        primary key,
    gateway_code varchar(50) not null
        unique,
    ip_address   varchar(45),
    status       varchar(20) default 'active'::character varying,
    last_ping    timestamp with time zone
);

create table if not exists node
(
    id            integer generated always as identity
        primary key,
    gateway_id    integer
        references gateway,
    node_code     varchar(50) not null
        unique,
    battery_level numeric(5, 2),
    status        varchar(20)              default 'active'::character varying,
    installed_at  timestamp with time zone default CURRENT_TIMESTAMP
);

create table if not exists buckets
(
    id              integer generated always as identity
        primary key,
    node_id         integer
        references node,
    capacity_liters numeric(6, 2),
    tree_species    varchar(50),
    installed_at    timestamp with time zone default CURRENT_TIMESTAMP
);

create table if not exists alerts
(
    id          integer generated always as identity
        primary key,
    node_id     integer
        references node,
    alert_type  varchar(50) not null,
    severity    varchar(20)              default 'warning'::character varying,
    message     text,
    is_resolved boolean                  default false,
    created_at  timestamp with time zone default CURRENT_TIMESTAMP
);

create table if not exists collection_logs
(
    id                      integer generated always as identity
        primary key,
    user_id                 integer
        references users,
    node_id                 integer
        references node,
    bucket_id               integer
        references buckets,
    volume_collected_liters numeric(6, 2) not null,
    collected_at            timestamp with time zone default CURRENT_TIMESTAMP
);

create table if not exists metrics
(
    id                  integer generated always as identity
        primary key,
    recorded_by_user_id integer
        references users,
    node_id             integer
        references node,
    bucket_id           integer
        references buckets,
    fill_level_percent  numeric(5, 2),
    sap_flow_rate_lph   numeric(6, 2),
    recorded_at         timestamp with time zone default CURRENT_TIMESTAMP
);

create table if not exists societies
(
    society_id serial
        primary key,
    name       varchar(255)                        not null,
    created_at timestamp default CURRENT_TIMESTAMP not null
);
