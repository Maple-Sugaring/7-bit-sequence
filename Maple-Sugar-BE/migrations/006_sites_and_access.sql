-- Account expiry is a specific moment, not a calendar date.
-- Existing date-only values become 11:59pm Eastern on that day.

alter table users
  alter column account_expiry type timestamp with time zone
  using case
    when account_expiry is null then null
    else ((account_expiry::timestamp + time '23:59') at time zone 'America/New_York')
  end;
