-- Kāzu plānotājs. Palaid šo Supabase: SQL Editor → New query → Run.
-- Var palaist tajā pašā projektā, kur foto lietotne: tabulas sākas ar "plan_".

-- 1) Tabulas
create table if not exists public.plan_settings (
  id int primary key default 1 check (id = 1),
  names text default 'Mūsu kāzas',
  wedding_date date,
  guests int default 80,
  target numeric default 35000,
  reserve numeric default 0.1,
  uplift numeric default 0.15
);

create table if not exists public.plan_budget (
  id uuid primary key default gen_random_uuid(),
  cat text not null,
  item text not null default '',
  qty numeric default 1,
  price numeric default 0,
  per_guest boolean default false,
  uplift boolean default false,
  actual numeric,
  paid numeric default 0,
  note text default '',
  range text default '',
  sort int default 0
);

create table if not exists public.plan_guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  side text default 'Kopīgie',
  grp text default '',
  count int default 1,
  status text default 'Nav ielūgts',
  diet text default '',
  stay boolean default false,
  note text default '',
  created_at timestamptz default now()
);

-- 2) Piekļuve: tikai pieteikušies lietotāji (jūs abi). Anonīmi apmeklētāji neredz neko.
alter table public.plan_settings enable row level security;
alter table public.plan_budget   enable row level security;
alter table public.plan_guests   enable row level security;

create policy "pāris drīkst visu" on public.plan_settings for all to authenticated using (true) with check (true);
create policy "pāris drīkst visu" on public.plan_budget   for all to authenticated using (true) with check (true);
create policy "pāris drīkst visu" on public.plan_guests   for all to authenticated using (true) with check (true);

-- 3) Tiešraides atjaunināšana (otra izmaiņas parādās uzreiz)
alter publication supabase_realtime add table public.plan_settings, public.plan_budget, public.plan_guests;

-- 4) Sākuma dati no budžeta tāmes (kazu-budzeta-tame.xlsx)
insert into public.plan_settings (id) values (1) on conflict (id) do nothing;

insert into public.plan_budget (cat, item, qty, price, per_guest, uplift, note, range, sort) values
('Norises vieta', 'Nītaures Dzirnavas: telpu noma (1–2 dienas)', 1, 3500, false, false, 'Piemēra summa: ēdienkartē nomas cena nav norādīta, jāprasa diana@svinam.com; pajautāt arī par numuriem', '2 000–6 000 €', 1),
('Norises vieta', 'Papildu noformējums / telts svinību vietā', 1, 300, false, false, 'Ja daļa svinību ārā, vajag rezerves plānu lietum', '0–1 200 €', 2),
('Ēdināšana', 'Sagaidīšanas uzkodas, 5 gab. × 3,30 € (uz viesi)', 0, 16.5, true, true, 'Nītaures Dzirnavu cenas 2026', '5–6 gab. × 3,30–3,80 €', 1),
('Ēdināšana', 'Kafija / tēja viesus sagaidot (uz viesi)', 0, 3.5, true, true, 'Nītaures Dzirnavas; pēc izvēles', '3,50 €/pers.', 2),
('Ēdināšana', 'Vakariņu ēdienkarte Nr. 2 (uz viesi)', 0, 71.2, true, true, 'Nītaures Dzirnavas. Ēdienkarte Nr. 1 sanāk ap 76–84 €/pers. (aukstais galds 42,30 € + uzkoda + pamatēdiens)', '71,20 €/pers.', 3),
('Ēdināšana', 'Deserts (uz viesi)', 0, 7.8, true, true, 'Nītaures Dzirnavas', '7,80 €/pers.', 4),
('Ēdināšana', 'Kāzu torte (uz viesi)', 0, 6, true, false, 'Pasūtīt atsevišķi; precizēt, vai Dzirnavas ņem maksu par atnestu torti', '4–8 €/pers.', 5),
('Ēdināšana', 'Brokastis nākamajā rītā (komplekts)', 0, 14.2, false, true, 'Ievadiet nakšņojošo viesu skaitu', '14,20 € komplekts / 19,80 € bufete', 6),
('Ēdināšana', 'Apkalpošana / viesmīļi', 1, 0, false, false, 'Ēdienkartē nav norādīts, vai apkalpošana iekļauta cenā; pajautāt Dzirnavām', 'precizēt', 7),
('Dzērieni', 'Alkohols un bezalkoholiskie dzērieni (uz viesi)', 0, 25, true, false, 'Lētāk nopirkt pašiem; noskaidrot korķa naudu', '15–40 €/pers.', 1),
('Dzērieni', 'Korķa nauda / bārs', 1, 300, false, false, '', '0–800 €', 2),
('Tērpi un stils', 'Līgavas kleita', 1, 1500, false, false, '', '600–3 000 €', 1),
('Tērpi un stils', 'Līgavaiņa uzvalks', 1, 600, false, false, '', '300–1 200 €', 2),
('Tērpi un stils', 'Apavi, aksesuāri, plīvurs', 1, 350, false, false, '', '200–700 €', 3),
('Tērpi un stils', 'Frizūra un grims (iesk. izmēģinājumu)', 1, 350, false, false, '', '200–600 €', 4),
('Gredzeni', 'Laulības gredzeni (pāris)', 1, 1000, false, false, 'Gravēšana parasti +20–60 €', '500–2 500 €', 1),
('Foto un video', 'Fotogrāfs (visa diena)', 1, 1600, false, false, '', '1 000–2 500 €', 1),
('Foto un video', 'Videogrāfs', 1, 1300, false, false, '', '900–2 500 €', 2),
('Foto un video', 'Fotostūris / foto kaste', 1, 300, false, false, 'Pēc izvēles', '200–500 €', 3),
('Mūzika un izklaide', 'Vedējs / vakara vadītājs', 1, 1200, false, false, 'Labākie aizņemti 1 gadu uz priekšu', '700–2 000 €', 1),
('Mūzika un izklaide', 'DJ vai dzīvā mūzika', 1, 1100, false, false, 'Grupa parasti 1 500 €+', '700–3 000 €', 2),
('Mūzika un izklaide', 'Ceremonijas mūzika', 1, 250, false, false, '', '150–500 €', 3),
('Noformējums un ziedi', 'Līgavas pušķis un piespraudes', 1, 180, false, false, '', '100–300 €', 1),
('Noformējums un ziedi', 'Galdu dekori un ziedu kompozīcijas', 1, 1100, false, false, '', '600–2 500 €', 2),
('Noformējums un ziedi', 'Floristes darbs, piegāde, uzstādīšana', 1, 250, false, false, '', '100–400 €', 3),
('Ceremonija: Turaidas baznīca', 'Laulāšana: ziedojums / maksa draudzei', 1, 200, false, false, 'Precizēt ar Turaidas draudzi; baznīcas laulības ir juridiski spēkā', '100–400 €', 1),
('Ceremonija: Turaidas baznīca', 'Ērģelnieks / solists', 1, 250, false, false, '', '150–500 €', 2),
('Ceremonija: Turaidas baznīca', 'Pirmslaulību kurss / sarunas ar mācītāju', 1, 50, false, false, 'Luteriskajā baznīcā parasti obligāts', '0–100 €', 3),
('Ceremonija: Turaidas baznīca', 'Baznīcas noformējums (ziedi solos, pie altāra)', 1, 250, false, false, 'Pajautāt draudzei, kas atļauts', '150–500 €', 4),
('Ceremonija: Turaidas baznīca', 'Turaidas muzejrezervāta ieejas maksa viesiem', 1, 0, false, false, 'Baznīca atrodas muzejrezervātā; noskaidrot, vai kāzu viesiem jāpērk biļetes', 'precizēt', 5),
('Transports', 'Jaunā pāra auto', 1, 300, false, false, '', '150–500 €', 1),
('Transports', 'Viesu autobuss Turaida → Nītaures Dzirnavas (~35 km)', 1, 450, false, false, 'Ap 45 min brauciens', '300–600 €', 2),
('Transports', 'Viesu autobuss naktī atpakaļ (piem., uz Siguldu/Rīgu)', 1, 500, false, false, 'Ja viesi nepaliek pa nakti', '350–700 €', 3),
('Ielūgumi un drukas darbi', 'Ielūgumi (~1 uz 2 viesiem)', 45, 4, false, false, 'Vai bezmaksas e-ielūgumi', '2–6 €/gab.', 1),
('Ielūgumi un drukas darbi', 'Sēdvietu plāns, ēdienkartes, vārdu kartītes', 1, 150, false, false, '', '80–250 €', 2),
('Nakšņošana', 'Jaunā pāra numurs', 1, 200, false, false, '', '100–400 €', 1),
('Nakšņošana', 'Viesu nakšņošana (ja maksā jūs)', 1, 700, false, false, 'Bieži muižā ir numuri, var iekļaut nomā', '0–2 000 €', 2),
('Medusmēnesis', 'Ceļojums (lidojumi, viesnīca, izdevumi)', 1, 3000, false, false, '', '1 500–6 000 €', 1),
('Citi', 'Dāvaniņas viesiem', 1, 250, false, false, '', '100–400 €', 1),
('Citi', 'Pirmskāzu (fotosesija, vecpuišu/vecmeitu ballīte)', 1, 300, false, false, '', '0–800 €', 2);
