-- Supabase SQL for stream link cache sync
--
-- Run this against your Supabase database to add a table and RPC functions
-- used by `StreamLinkCacheSyncService` in the mobile app.

create table if not exists public.stream_link_cache (
    profile_id integer not null,
    content_key text not null,
    url text not null,
    stream_name text not null,
    addon_name text not null,
    addon_id text not null,
    cached_at_ms bigint not null,
    request_headers jsonb not null default '{}'::jsonb,
    response_headers jsonb not null default '{}'::jsonb,
    filename text,
    video_size bigint,
    binge_group text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (profile_id, content_key)
);

create or replace function public.sync_pull_stream_link_cache(
    p_profile_id integer
)
returns table (
    content_key text,
    url text,
    stream_name text,
    addon_name text,
    addon_id text,
    cached_at_ms bigint,
    request_headers jsonb,
    response_headers jsonb,
    filename text,
    video_size bigint,
    binge_group text
)
language sql stable as $$
    select
        content_key,
        url,
        stream_name,
        addon_name,
        addon_id,
        cached_at_ms,
        request_headers,
        response_headers,
        filename,
        video_size,
        binge_group
    from public.stream_link_cache
    where profile_id = p_profile_id
    order by cached_at_ms desc;
$$;

create or replace function public.sync_push_stream_link_cache(
    p_profile_id integer,
    p_entries jsonb
)
returns void
language plpgsql as $$
begin
    if p_entries is null or jsonb_array_length(p_entries) = 0 then
        return;
    end if;

    insert into public.stream_link_cache (
        profile_id,
        content_key,
        url,
        stream_name,
        addon_name,
        addon_id,
        cached_at_ms,
        request_headers,
        response_headers,
        filename,
        video_size,
        binge_group,
        updated_at
    )
    select
        p_profile_id,
        entry.content_key,
        entry.url,
        entry.stream_name,
        entry.addon_name,
        entry.addon_id,
        entry.cached_at_ms,
        coalesce(entry.request_headers, '{}'::jsonb),
        coalesce(entry.response_headers, '{}'::jsonb),
        entry.filename,
        entry.video_size,
        entry.binge_group,
        now()
    from jsonb_to_recordset(p_entries) as entry(
        content_key text,
        url text,
        stream_name text,
        addon_name text,
        addon_id text,
        cached_at_ms bigint,
        request_headers jsonb,
        response_headers jsonb,
        filename text,
        video_size bigint,
        binge_group text
    )
    on conflict (profile_id, content_key) do update
    set
        url = excluded.url,
        stream_name = excluded.stream_name,
        addon_name = excluded.addon_name,
        addon_id = excluded.addon_id,
        cached_at_ms = excluded.cached_at_ms,
        request_headers = excluded.request_headers,
        response_headers = excluded.response_headers,
        filename = excluded.filename,
        video_size = excluded.video_size,
        binge_group = excluded.binge_group,
        updated_at = now()
    where excluded.cached_at_ms >= public.stream_link_cache.cached_at_ms;
end;
$$;

create or replace function public.sync_delete_stream_link_cache(
    p_profile_id integer,
    p_keys jsonb
)
returns void
language plpgsql as $$
begin
    if p_keys is null or jsonb_array_length(p_keys) = 0 then
        return;
    end if;

    delete from public.stream_link_cache
    where profile_id = p_profile_id
      and content_key in (
        select jsonb_array_elements_text(p_keys)
      );
end;
$$;
