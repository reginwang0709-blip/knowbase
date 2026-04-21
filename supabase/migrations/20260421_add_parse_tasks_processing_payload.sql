alter table parse_tasks
add column if not exists processing_payload jsonb not null default '{}'::jsonb;
