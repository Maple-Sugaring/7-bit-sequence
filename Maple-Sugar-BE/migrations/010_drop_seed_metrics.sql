-- Seeded seasons wrote a temperature on every generated row. Hardware ingest
-- leaves temperature null, so this removes the makeup series and keeps the nodes.
delete from metrics where temperature is not null;
