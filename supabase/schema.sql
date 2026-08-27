-- ============================================================================
-- Ideas Diarias — schema
-- Proyecto: jobidai-daily-content
-- Aplicar con: supabase MCP (apply_migration) o pegando en el SQL Editor.
-- Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

create table if not exists public.ideas_diarias (
  id                uuid primary key default gen_random_uuid(),

  -- Fecha del "run" (no la fecha de publicación de la noticia).
  -- Se ancla a hora de Santo Domingo para que un run de 7am no caiga en el día anterior.
  fecha             date not null default (now() at time zone 'America/Santo_Domingo')::date,

  fuente            text not null check (fuente in ('hackernews', 'reddit', 'google_news')),
  titulo            text not null,
  url               text,

  -- Hash para deduplicar. md5 basta: es dedupe, no criptografía.
  url_hash          text generated always as (md5(coalesce(url, titulo))) stored,

  puntaje           integer,          -- score/upvotes de la fuente, si aplica
  publicado_en      timestamptz,      -- fecha de publicación original, si la fuente la da

  -- Campos generados por Claude
  resumen           text,
  angulos           jsonb not null default '[]'::jsonb,   -- [{ "angulo": "...", "gancho": "..." }]
  formato_sugerido  text,             -- p.ej. "carrusel", "hilo", "video corto", "post largo"
  score_relevancia  smallint check (score_relevancia between 0 and 10),

  -- Control de calidad del pipeline
  descartable       boolean not null default false,
  error             text,             -- p.ej. 'parse_error' cuando la IA no devolvió JSON válido

  raw               jsonb,            -- payload original de la fuente, por si hay que reprocesar
  created_at        timestamptz not null default now()
);

comment on table  public.ideas_diarias        is 'Ideas de contenido generadas diariamente por el workflow de n8n (HN + Reddit + Google News -> Claude).';
comment on column public.ideas_diarias.fecha  is 'Fecha del run en timezone America/Santo_Domingo.';
comment on column public.ideas_diarias.error  is 'Marca fallas del pipeline (parse_error, etc). NULL = item sano.';

-- Un mismo link no se guarda dos veces en el mismo día (re-ejecutar el workflow es seguro).
create unique index if not exists ideas_diarias_fecha_url_hash_key
  on public.ideas_diarias (fecha, url_hash);

create index if not exists ideas_diarias_fecha_idx
  on public.ideas_diarias (fecha desc);

create index if not exists ideas_diarias_utiles_idx
  on public.ideas_diarias (fecha desc, score_relevancia desc)
  where descartable = false and error is null;

-- ============================================================================
-- RLS
-- El workflow de n8n escribe con la service_role key, que hace bypass de RLS.
-- RLS queda activo para que la anon key NO pueda leer ni escribir nada.
-- ============================================================================

alter table public.ideas_diarias enable row level security;

-- Lectura para usuarios autenticados (dashboards, apps internas).
-- Si no vas a leer desde el cliente, puedes borrar esta policy sin afectar el workflow.
drop policy if exists "ideas_diarias: lectura autenticada" on public.ideas_diarias;
create policy "ideas_diarias: lectura autenticada"
  on public.ideas_diarias
  for select
  to authenticated
  using (true);
