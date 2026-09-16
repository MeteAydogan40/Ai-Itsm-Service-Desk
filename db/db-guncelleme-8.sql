

create or replace function estimate_resolution(
  query_embedding vector(768) default null,
  p_category text default null,
  exclude_id uuid default null,
  min_similarity float default 0.45,
  min_sample int default 3
)
returns table (
  basis text,
  sample_size bigint,
  avg_minutes numeric,
  median_minutes numeric,
  fastest_minutes numeric,
  slowest_minutes numeric
)
language plpgsql
stable
as $$
declare
  semantic_count bigint := 0;
begin
  -- 1. kademe: anlamca benzeyen çözülmüş çağrılar
  if query_embedding is not null then
    select count(*) into semantic_count
    from tickets t
    where t.embedding is not null
      and t.resolved_at is not null
      and (exclude_id is null or t.id <> exclude_id)
      and 1 - (t.embedding <=> query_embedding) >= min_similarity;
  end if;

  if semantic_count >= min_sample then
    return query
    with matched as (
      select extract(epoch from (t.resolved_at - t.created_at)) / 60 as minutes
      from tickets t
      where t.embedding is not null
        and t.resolved_at is not null
        and (exclude_id is null or t.id <> exclude_id)
        and 1 - (t.embedding <=> query_embedding) >= min_similarity
    )
    select
      'benzer çağrılar'::text,
      count(*),
      round(avg(minutes)),
      round(percentile_cont(0.5) within group (order by minutes)::numeric),
      round(min(minutes)),
      round(max(minutes))
    from matched;
    return;
  end if;

  -- 2. kademe: aynı kategorideki çözülmüş çağrılar
  return query
  with matched as (
    select extract(epoch from (t.resolved_at - t.created_at)) / 60 as minutes
    from tickets t
    where t.resolved_at is not null
      and (exclude_id is null or t.id <> exclude_id)
      and (p_category is null or t.category = p_category)
  )
  select
    'kategori ortalaması'::text,
    count(*),
    round(avg(minutes)),
    round(percentile_cont(0.5) within group (order by minutes)::numeric),
    round(min(minutes)),
    round(max(minutes))
  from matched;
end;
$$;
