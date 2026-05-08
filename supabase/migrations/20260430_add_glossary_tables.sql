create extension if not exists pgcrypto;

create table if not exists glossary_terms (
  id uuid primary key default gen_random_uuid(),
  normalized_term text not null unique,
  canonical_term text not null,
  category text not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint glossary_terms_category_check check (
    category in (
      'technical_concept',
      'product_name',
      'company_name',
      'model_name',
      'framework',
      'event',
      'industry_term',
      'other'
    )
  )
);

do $$
declare
  contents_id_type text;
begin
  select
    format_type(a.atttypid, a.atttypmod)
  into contents_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'contents'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if contents_id_type is null then
    raise exception 'Cannot determine public.contents.id type. Run: select column_name, data_type from information_schema.columns where table_name = ''contents'' and column_name = ''id'';';
  end if;

  execute format(
    $sql$
      create table if not exists content_glossary_terms (
        id uuid primary key default gen_random_uuid(),
        content_id %1$s not null references contents(id) on delete cascade,
        glossary_term_id uuid not null references glossary_terms(id) on delete cascade,
        term_text text not null,
        source text not null default 'auto',
        confidence text null,
        evidence_snippet text null,
        first_evidence_block_id text null,
        occurrence_count integer not null default 1,
        explanation_status text not null default 'pending',
        highlight_enabled boolean not null default false,
        display_status text not null default 'inventory_only',
        display_reason text null,
        hidden_reason text null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint content_glossary_terms_content_glossary_term_unique unique (content_id, glossary_term_id),
        constraint content_glossary_terms_source_check check (
          source in ('auto', 'user_added')
        ),
        constraint content_glossary_terms_confidence_check check (
          confidence is null or confidence in ('high', 'medium', 'low')
        ),
        constraint content_glossary_terms_explanation_status_check check (
          explanation_status in ('ready', 'pending', 'generating', 'failed')
        ),
        constraint content_glossary_terms_display_status_check check (
          display_status in ('highlighted', 'inventory_only', 'hidden')
        )
      );

      create table if not exists glossary_occurrences (
        id uuid primary key default gen_random_uuid(),
        content_glossary_term_id uuid not null references content_glossary_terms(id) on delete cascade,
        content_id %1$s not null references contents(id) on delete cascade,
        block_id text null,
        start_offset integer null,
        end_offset integer null,
        matched_text text null,
        created_at timestamptz not null default now()
      );

      create table if not exists glossary_explanations (
        id uuid primary key default gen_random_uuid(),
        content_glossary_term_id uuid not null unique references content_glossary_terms(id) on delete cascade,
        definition text not null default '',
        why_it_matters text not null default '',
        evidence text not null default '',
        aliases jsonb not null default '[]'::jsonb,
        provider text null,
        model text null,
        generated_at timestamptz null,
        updated_at timestamptz not null default now()
      );

      create table if not exists user_glossary_feedback (
        id uuid primary key default gen_random_uuid(),
        user_id text null,
        content_id %1$s not null references contents(id) on delete cascade,
        glossary_term_id uuid not null references glossary_terms(id) on delete cascade,
        content_glossary_term_id uuid not null references content_glossary_terms(id) on delete cascade,
        feedback_type text not null default 'none',
        user_note text null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint user_glossary_feedback_feedback_type_check check (
          feedback_type in ('starred', 'hidden', 'incorrect', 'not_needed', 'none')
        )
      );
    $sql$,
    contents_id_type
  );
end
$$;

alter table if exists glossary_occurrences
  alter column block_id drop not null;

create index if not exists idx_content_glossary_terms_content_id
  on content_glossary_terms(content_id);

create index if not exists idx_content_glossary_terms_glossary_term_id
  on content_glossary_terms(glossary_term_id);

create index if not exists idx_glossary_occurrences_content_glossary_term_id
  on glossary_occurrences(content_glossary_term_id);

create index if not exists idx_glossary_occurrences_content_id
  on glossary_occurrences(content_id);

create index if not exists idx_user_glossary_feedback_content_id
  on user_glossary_feedback(content_id);

create index if not exists idx_user_glossary_feedback_glossary_term_id
  on user_glossary_feedback(glossary_term_id);

create unique index if not exists idx_user_glossary_feedback_unique
  on user_glossary_feedback(content_glossary_term_id, coalesce(user_id, 'anonymous'));
