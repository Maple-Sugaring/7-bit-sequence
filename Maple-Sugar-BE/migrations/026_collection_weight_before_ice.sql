-- Iced buckets are reweighed after the ice is taken out.
--
-- When a student tags ice, the collection form has them take the bucket off
-- the sensor, remove the ice, put it back on, and enter the new weight. That
-- after-ice weight is the sap weight (weight_lb and volume_collected come from
-- it). The first, iced weight is kept in weight_before_ice_lb so the entry
-- shows both, and its presence is what tags a collection "Ice removed".
--
-- collection_logs gets the same fields because the signed-in collection
-- history lists those rows. Both are null (and ice false) on collections
-- without ice and on ice collections filed before this flow existed.

alter table collection_journal add column if not exists weight_before_ice_lb numeric(8, 2);

alter table collection_logs
  add column if not exists ice_present boolean not null default false,
  add column if not exists weight_before_ice_lb numeric(8, 2);
