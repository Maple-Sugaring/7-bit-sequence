-- Self-service profile (issue #30). Free text so nobody is limited to a list;
-- null means the person has not said.
alter table users add column if not exists pronouns varchar(40);
