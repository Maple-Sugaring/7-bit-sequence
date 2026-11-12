alter table alerts add column data_mode text not null default 'test' check (data_mode in ('test', 'production'));
alter table alerts alter column data_mode set default lock_data_mode();
