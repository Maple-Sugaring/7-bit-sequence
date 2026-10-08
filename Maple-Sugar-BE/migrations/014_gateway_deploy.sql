-- Where a gateway is mounted and the installer's own note about it, so an
-- admin can describe a deployed gateway the way they describe a node.

alter table gateway add column if not exists notes varchar(500);
alter table gateway add column if not exists latitude numeric(9, 6);
alter table gateway add column if not exists longitude numeric(9, 6);
