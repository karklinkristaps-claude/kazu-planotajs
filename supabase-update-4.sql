-- Kāzu plānotājs, 4. atjauninājums: viesi ar jautājuma zīmi ("?" — vēl nav izlemts, vai aicināt).
-- Palaid Supabase → SQL Editor → New query → iekopē visu → Run. Var droši palaist arī atkārtoti.

alter table public.plan_guests add column if not exists maybe boolean not null default false;
