-- Kāzu plānotājs, 3. atjauninājums: kontakti (piegādātāji, mūziķi u. c.).
-- Palaid Supabase → SQL Editor → New query → iekopē visu → Run. Var droši palaist arī atkārtoti.

create table if not exists public.plan_contacts (
  id uuid primary key default gen_random_uuid(),
  category text default 'Cits',
  name text not null default '',
  person text default '',
  phone text default '',
  email text default '',
  web text default '',
  status text default 'Jāsazinās',
  note text default '',
  sort int default 0,
  created_at timestamptz default now()
);

alter table public.plan_contacts enable row level security;
drop policy if exists "pāris drīkst visu" on public.plan_contacts;
create policy "pāris drīkst visu" on public.plan_contacts for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_contacts') then
    alter publication supabase_realtime add table public.plan_contacts;
  end if;
end $$;

-- sākuma kontakti (tikai ja tabula vēl tukša)
insert into public.plan_contacts (category, name, person, phone, email, web, status, note, sort)
select * from (values
  ('Norises vieta', 'Nītaures Dzirnavas', 'Diāna', '', 'diana@svinam.com', '', 'Gaida piedāvājumu', 'Pajautāt par nomas cenu un numuriem', 1),
  ('Ceremonija', 'Turaidas baznīca', '', '', '', '', 'Jāsazinās', '', 2)
) as v(category, name, person, phone, email, web, status, note, sort)
where not exists (select 1 from public.plan_contacts);
