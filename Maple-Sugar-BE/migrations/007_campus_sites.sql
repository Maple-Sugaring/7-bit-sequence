-- The sugarbush is three places on the RIT campus.

update node
   set stand = case
         when id <= 6 then 'Alumni House'
         when id <= 11 then 'Chabad House'
         else 'Red Barn'
       end,
       node_name = case
         when id <= 6 then 'Alumni House - Tree ' || id::text
         when id <= 11 then 'Chabad House - Tree ' || (id - 6)::text
         else 'Red Barn - Tree ' || (id - 11)::text
       end,
       gateway_id = case
         when id <= 6 then 1
         when id <= 11 then 2
         else 3
       end,
       latitude = case
         when id <= 6 then 43.0840 + (id * 0.00018)
         when id <= 11 then 43.0849 + ((id - 6) * 0.00018)
         else 43.0897 + ((id - 11) * 0.00018)
       end,
       longitude = case
         when id <= 6 then -77.6738 - (id * 0.00015)
         when id <= 11 then -77.6802 - ((id - 6) * 0.00015)
         else -77.6688 - ((id - 11) * 0.00015)
       end;

update gateway set gateway_name = 'Alumni House Pi' where id = 1;
update gateway set gateway_name = 'Chabad House Pi', gateway_code = 'GW-CHABAD' where id = 2;
update gateway set gateway_name = 'Red Barn Pi', gateway_code = 'GW-BARN' where id = 3;

update alerts
   set message = replace(
         replace(
           replace(
             replace(message, 'North Ridge', 'Red Barn'),
             'Hill Bottom', 'Alumni House'),
           'Rabbi House', 'Chabad House'),
         'Sugar Shack', 'Red Barn');

alter table schedule_slots add column if not exists notes text not null default '';
alter table schedule_slots add column if not exists bucket_ids integer[] not null default '{}';
