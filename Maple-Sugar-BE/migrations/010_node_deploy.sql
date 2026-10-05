-- Identity captured when an admin or the service account deploys a node.
-- rf_tag is optional until the trees carry tags. notes is the installer's
-- own line about the tree, the bucket, or the hang.

alter table node add column if not exists rf_tag varchar(64);
alter table node add column if not exists notes varchar(500);
