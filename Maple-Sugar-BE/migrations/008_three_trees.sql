-- One tapped tree at each campus building.

alter table node add column if not exists tracked boolean not null default false;

update node set tracked = id in (1, 7, 12);
