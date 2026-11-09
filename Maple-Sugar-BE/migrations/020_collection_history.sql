-- Keep historical identifiers in collection logs after deleting a node or bucket.
alter table collection_logs
  drop constraint collection_logs_node_id_fkey,
  drop constraint collection_logs_bucket_id_fkey;
create index collection_logs_history_order on collection_logs (collected_at desc, id desc);
