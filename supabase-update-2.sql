-- Kāzu plānotājs, 2. atjauninājums: uzdevumi, sēdvietas, programma, tradīcijas, ielūgums.
-- Palaid VIENREIZ: Supabase → SQL Editor → New query → iekopē visu → Run.

-- 1) Jaunas tabulas
create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  text text not null,
  note text default '',
  tags text default '',
  done boolean default false,
  sort int default 0,
  custom boolean default false
);

create table if not exists public.plan_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shape text default 'serpentīns',
  seats int default 10,
  sort int default 0
);

create table if not exists public.plan_program (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  time text default '',
  what text default '',
  place text default '',
  who text default '',
  sort int default 0
);

create table if not exists public.plan_traditions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  what text default '',
  when_text text default '',
  want text default '',
  sort int default 0
);

-- 2) Viesam galds; ielūguma dati pamatdatos
alter table public.plan_guests add column if not exists table_id uuid references public.plan_tables(id) on delete set null;
alter table public.plan_guests add column if not exists sit_with uuid references public.plan_guests(id) on delete set null;
alter table public.plan_settings
  add column if not exists bride text default '',
  add column if not exists groom text default '',
  add column if not exists ceremony_time text default '15:00',
  add column if not exists rsvp_date date,
  add column if not exists contact text default '',
  add column if not exists inv_style text default 'klasisks';

-- 3) Piekļuve tikai jums abiem
alter table public.plan_tasks      enable row level security;
alter table public.plan_tables     enable row level security;
alter table public.plan_program    enable row level security;
alter table public.plan_traditions enable row level security;
create policy "pāris drīkst visu" on public.plan_tasks      for all to authenticated using (true) with check (true);
create policy "pāris drīkst visu" on public.plan_tables     for all to authenticated using (true) with check (true);
create policy "pāris drīkst visu" on public.plan_program    for all to authenticated using (true) with check (true);
create policy "pāris drīkst visu" on public.plan_traditions for all to authenticated using (true) with check (true);

-- 4) Tiešraides atjaunināšana
alter publication supabase_realtime add table public.plan_tasks, public.plan_tables, public.plan_program, public.plan_traditions;

-- 5) Datums no uzdevumu saraksta (ja vēl nav ievadīts)
-- budžeta sadaļas (var pievienot un dzēst lapā); Nakšņošana un Medusmēnesis noņemti
alter table public.plan_settings add column if not exists budget_cats jsonb;
update public.plan_settings set budget_cats = '["Norises vieta","Ēdināšana","Dzērieni","Tērpi un stils","Gredzeni","Foto un video","Mūzika un izklaide","Noformējums un ziedi","Ceremonija: Turaidas baznīca","Transports","Ielūgumi un drukas darbi","Citi"]'::jsonb where id = 1 and budget_cats is null;
delete from public.plan_budget where cat in ('Nakšņošana', 'Medusmēnesis');

update public.plan_settings set wedding_date = '2027-08-11' where id = 1 and wedding_date is null;

-- 6) Sākuma dati
insert into public.plan_tasks (phase, text, note, tags, sort) values
('p1', 'Vienojieties par kopējo budžetu un to, kas maksā par ko', '', 'b', 1),
('p1', 'Izveidojiet budžeta tabulu ar 10% rezervi neparedzētiem izdevumiem', '', 'b', 2),
('p1', 'Nosakiet aptuveno viesu skaitu', 'No tā atkarīga zāle, ēdināšana un liela daļa budžeta.', 'g', 3),
('p1', 'Izvēlieties datumu, kad brīva gan Turaidas baznīca, gan Nītaures Dzirnavas', '', 'tn', 4),
('p1', 'Sazinieties ar Turaidas ev. lut. draudzi un rezervējiet laiku', 'Noskaidrojiet mācītāju, ziedojumu vai maksu un baznīcas noteikumus par dekoriem, mūziku un fotografēšanu.', 't', 5),
('p1', 'Noskaidrojiet ar Turaidas muzejrezervātu viesu iekļūšanu', 'Ieejas maksa kāzu viesiem, autostāvvieta, vai drīkst fotosesiju teritorijā un vai tai vajag atļauju.', 't', 6),
('p1', 'Rezervējiet Nītaures Dzirnavas un izlasiet līgumu', 'Kas iekļauts (ēdināšana, dekori, naktsmītnes), līdz cikiem drīkst svinēt, avansa un atcelšanas noteikumi.', 'n', 7),
('p1', 'Izvēlieties vedējus un aiciniet viņus', 'Latviešu kāzās vedēji bieži vada vakaru un rūpējas par tradīcijām.', 'c', 8),
('p1', 'Rezervējiet fotogrāfu', 'Populārākie vasaras sezonai aizņemti gadu iepriekš.', 'v', 9),
('p1', 'Izlemiet, vai vajag kāzu koordinatoru dienai', '', 'v', 10),
('p2', 'Rezervējiet videogrāfu', '', 'v', 1),
('p2', 'Izvēlieties kāzu vadītāju vai vienojieties, ka vakaru vada vedēji', '', 'v', 2),
('p2', 'Mūzika svinībām: grupa vai DJ', 'Pārbaudiet, ko atļauj Nītaures Dzirnavas (skaļums, beigu laiks).', 'n', 3),
('p2', 'Mūzika baznīcā: ērģelnieks, dziedātājs vai ansamblis', 'Saskaņojiet ar draudzi, jo baznīcai var būt savs ērģelnieks.', 't', 4),
('p2', 'Ēdināšana un dzērieni, ja tie nav iekļauti vietas cenā', '', 'n', 5),
('p2', 'Sastādiet viesu sarakstu ar kontaktiem', '', 'g', 6),
('p2', 'Nosūtiet “rezervējiet datumu” ziņu tālu dzīvojošiem viesiem', '', 'g', 7),
('p2', 'Sāciet meklēt līgavas kleitu', 'Šūšanai vai pasūtīšanai parasti vajag 4–6 mēnešus.', 'a', 8),
('p2', 'Naktsmītnes viesiem Nītaurē vai Siguldā', 'Pajautājiet Nītaures Dzirnavām par naktsmītnēm uz vietas vai tuvumā.', 'n', 9),
('p3', 'Pierakstieties uz pirmslaulību mācību draudzē', 'Luterāņu draudzēs to parasti prasa. Pajautājiet arī, vai kādam no jums jābūt kristītam vai konfirmētam.', 't', 1),
('p3', 'Floristi un dekors baznīcai un zālei', 'Baznīcas dekoru saskaņojiet ar draudzi.', 'tn', 2),
('p3', 'Ielūgumu dizains un teksts', '', 'g', 3),
('p3', 'Transports: kāzu auto un autobuss viesiem no Turaidas uz Nītauri', 'Pārbaudiet maršrutu un laiku; rēķinieties ar apmēram 40 minūšu braucienu.', 'tn', 4),
('p3', 'Līgavaiņa uzvalks', '', 'a', 5),
('p3', 'Izvēlieties un rezervējiet kāzu ceļojumu', 'Pārbaudiet pasu derīguma termiņu un vīzas.', 'h', 6),
('p3', 'Atrodiet kūkas meistaru', '', 'v', 7),
('p4', 'Laulību gredzeni', 'Gravējumam un izmēra maiņai vajag laiku.', 'a', 1),
('p4', 'Frizieris un vizāžists, norunājiet izmēģinājuma datumu', '', 'a', 2),
('p4', 'Ēdienkartes degustācija Nītaures Dzirnavās', '', 'n', 3),
('p4', 'Apavi, plīvurs un aksesuāri', '', 'a', 4),
('p4', 'Dienas plāna melnraksts', 'Baznīca, fotosesija, pārbrauciens, ierašanās svinībās, vakariņas, kūka.', 'c', 5),
('p4', 'Izsūtiet ielūgumus', 'Atbildes termiņu lieciet apmēram 6 nedēļas pirms kāzām.', 'g', 6),
('p5', 'Iesniedziet laulības iesniegumu draudzē', 'Laulību baznīcā reģistrē mācītājs, tāpēc atsevišķi dzimtsarakstu nodaļā nav jāiet. Precīzu termiņu noskaidrojiet ar draudzi.', 'dt', 1),
('p5', 'Sagatavojiet dokumentus', 'Pases vai ID kartes. Ja kāds bijis precējies: šķiršanās dokuments. Ārvalstniekam: izziņa par tiesībām stāties laulībā ar apostille un tulkojumu.', 'd', 2),
('p5', 'Vienojieties par uzvārdu pēc laulībām', 'To norāda iesniegumā.', 'd', 3),
('p5', 'Noskaidrojiet ar mācītāju, vai vajag lieciniekus', 'Bieži tie ir vedēji.', 'dt', 4),
('p5', 'Pārrunas ar mācītāju: ceremonijas gaita, lasījumi, dziesmas', '', 't', 5),
('p5', 'Pirmās dejas nodarbības', '', 'c', 6),
('p5', 'Ar vedējiem: kuras tradīcijas gribat un kuras ne', 'Mičošana, līgavas zagšana, šķēršļi ceļā, spēles.', 'c', 7),
('p5', 'Kleitas pielaikošana', '', 'a', 8),
('p5', 'Frizūras un grima izmēģinājums', '', 'a', 9),
('p5', 'Pateicības dāvaniņas viesiem', '', 'g', 10),
('p6', 'Apkopojiet atbildes un atgādiniet tiem, kas nav atbildējuši', '', 'g', 1),
('p6', 'Sēdvietu plāns', '', 'g', 2),
('p6', 'Galīgais viesu skaits un ēdienkarte Nītaures Dzirnavām', 'Alerģijas, veģetārieši, bērnu porcijas, šoferi.', 'n', 3),
('p6', 'Dienas grafiks ar laikiem un kontaktiem visiem pakalpojumu sniedzējiem', '', 'c', 4),
('p6', 'Apstipriniet visus pakalpojumu sniedzējus un samaksas grafiku', '', 'b', 5),
('p6', 'Izlemiet, kas teiks runas un tostus', '', 'c', 6),
('p6', 'Saņemiet gredzenus un pārbaudiet izmēru', '', 'a', 7),
('p6', 'Kleitas pēdējā pielaikošana', '', 'a', 8),
('p7', 'Aploksnes ar atlikušajām samaksām, nododiet vedējiem', '', 'b', 1),
('p7', 'Ārkārtas soma', 'Adata un diegs, plāksteri, zāles, lādētājs, lietussargi, ūdens.', 'c', 2),
('p7', 'Laika prognoze un plāns B fotosesijai lietus gadījumā', 'Turaidā fotografēšana notiek ārā.', 't', 3),
('p7', 'Mēģinājums baznīcā, ja draudze to piedāvā', '', 't', 4),
('p7', 'Nogādājiet dekorus un lietas uz Nītaures Dzirnavām', '', 'n', 5),
('p7', 'Sakravājiet ceļojuma somu', '', 'h', 6),
('p8', 'Pases vai ID kartes līdzi uz baznīcu', '', 'd', 1),
('p8', 'Gredzeni pie vedēja', '', 'c', 2),
('p8', 'Paēdiet brokastis', '', 'c', 3),
('p8', 'Nozīmējiet kontaktpersonu pakalpojumu sniedzējiem, lai tā nebūtu jūs', '', 'c', 4),
('p8', 'Baudiet dienu', '', '', 5),
('p9', 'Pateicības viesiem', '', 'g', 1),
('p9', 'Noskaidrojiet, kur un kad saņemt laulības apliecību', '', 'd', 2),
('p9', 'Ja mainās uzvārds: jauna pase vai ID karte PMLP', 'Pēc tam banka, darbs, VID, ģimenes ārsts, ceļojumu rezervācijas.', 'd', 3),
('p9', 'Kleitas un uzvalka tīrīšana', '', 'a', 4),
('p9', 'Atsauksmes pakalpojumu sniedzējiem', '', 'v', 5),
('p9', 'Saņemiet foto un video, izveidojiet albumu', '', 'v', 6),
('p9', 'Noslēdziet budžetu', '', 'b', 7);

insert into public.plan_tables (name, shape, seats, sort) values
('Galvenais galds', 'taisnstūra', 6, 0),
('1. serpentīns', 'serpentīns', 20, 1),
('2. serpentīns', 'serpentīns', 20, 2),
('3. serpentīns', 'serpentīns', 20, 3);

insert into public.plan_program (section, time, what, place, who, sort) values
('Rīts: sagatavošanās', '08:00', 'Brokastis līgavai un līgavainim (katram savā vietā)', 'Mājās / naktsmītnē', '', 1),
('Rīts: sagatavošanās', '08:30', 'Frizēšana un grims līgavai un viņas māsai/draudzenēm', 'Līgavas sagatavošanās vieta', 'Frizētava, vizažiste', 2),
('Rīts: sagatavošanās', '10:00', 'Ziedi piegādāti: pušķis, piespraudes, baznīcas rotājumi', 'Līgavas vieta, baznīca', 'Florists', 3),
('Rīts: sagatavošanās', '11:00', 'Fotogrāfs pie līgavas: detaļas, kleita, gredzeni, sagatavošanās', 'Līgavas vieta', 'Fotogrāfs', 4),
('Rīts: sagatavošanās', '11:30', 'Līgavainis un vīdu bārs gatavojas', 'Līgavaiņa vieta', 'Vīdu bārs', 5),
('Rīts: sagatavošanās', '12:30', 'Līgava saģērbjas', 'Līgavas vieta', 'Māsa / draudzene', 6),
('Rīts: sagatavošanās', '13:00', 'Līgavas izpirkšana vai first look (pāris satiekas pirms ceremonijas)', 'Līgavas vieta', 'Vīdu bārs, māsa/draudzene', 7),
('Rīts: sagatavošanās', '13:45', 'Izbraukšana uz Turaidu', '', 'Šoferis', 8),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '14:15', 'Viesi ierodas, novieto auto un iet uz baznīcu', 'Turaidas muzejrezervāta stāvvieta', 'Viesu sagaidītājs', 9),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '14:40', 'Līgavainis un vīdu bārs baznīcā', 'Turaidas baznīca', '', 10),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '14:50', 'Līgava ierodas', 'Turaidas baznīca', 'Šoferis', 11),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '15:00', 'Laulību ceremonija (ap 30–45 min)', 'Turaidas baznīca', 'Mācītājs', 12),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '15:45', 'Iznākšana no baznīcas, apsveikumi', 'Pie baznīcas', '', 13),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '16:15', 'Grupu foto ar ģimenēm un viesiem', 'Pie baznīcas', 'Fotogrāfs, palīgs ar viesu sarakstu', 14),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '16:40', 'Viesi brauc uz Nītaures Dzirnavām (35–45 min)', '', 'Viesu sagaidītājs', 15),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '16:40', 'Pāra fotosesija Turaidā: pils, Dainu kalns, parks', 'Turaidas muzejrezervāts', 'Fotogrāfs', 16),
('Ceremonija Turaidas baznīcā un ceļš uz Nītauri', '17:30', 'Pāris brauc uz Nītauri, pa ceļam tilti un šķēršļi', '', 'Šoferis, vīdu bārs (izpirkšanai)', 17),
('Svinības Nītaures Dzirnavās', '17:20', 'Viesi ierodas: dzērieni, uzkodas, mūzika fonā', 'Nītaures Dzirnavas', 'Vietas administrators', 18),
('Svinības Nītaures Dzirnavās', '18:15', 'Pāris ierodas, sagaidīšana ar maizi un sāli, pārnešana pār slieksni', 'Nītaures Dzirnavas', 'Vecāki, vakara vadītājs', 19),
('Svinības Nītaures Dzirnavās', '18:30', 'Viesi sasēžas pie galdiem, vakara vadītāja ievads', 'Nītaures Dzirnavas', 'Vakara vadītājs', 20),
('Svinības Nītaures Dzirnavās', '18:45', 'Vakariņas: uzkodas un pamatēdiens', 'Nītaures Dzirnavas', 'Ēdinātājs', 21),
('Svinības Nītaures Dzirnavās', '19:30', 'Runas un tosti: vecāki, vīdu bārs, māsa/draudzene', 'Nītaures Dzirnavas', 'Vakara vadītājs', 22),
('Svinības Nītaures Dzirnavās', '20:15', 'Pirmā deja', 'Nītaures Dzirnavas', 'DJ / grupa', 23),
('Svinības Nītaures Dzirnavās', '20:30', 'Dejas un spēles ar viesiem', 'Nītaures Dzirnavas', 'DJ, vakara vadītājs', 24),
('Svinības Nītaures Dzirnavās', '21:30', 'Līgavas zagšana un izpirkšana (ja izvēlas)', 'Nītaures Dzirnavas', 'Vīdu bārs', 25),
('Svinības Nītaures Dzirnavās', '22:30', 'Kāzu torte', 'Nītaures Dzirnavas', 'Ēdinātājs', 26),
('Svinības Nītaures Dzirnavās', '23:00', 'Dejas turpinās, nakts uzkodas', 'Nītaures Dzirnavas', 'DJ', 27),
('Vakara beigas un nākamā diena', '00:00', 'Mičošana, pušķa mešana', 'Nītaures Dzirnavas', 'Vakara vadītājs', 28),
('Vakara beigas un nākamā diena', '00:30', 'Pūra lāde, dejas turpinās', 'Nītaures Dzirnavas', '', 29),
('Vakara beigas un nākamā diena', '02:00', 'Pēdējā dziesma, transports viesiem uz mājām vai naktsmītnēm', '', 'Vīdu bārs', 30),
('Vakara beigas un nākamā diena', '03:00', 'Svinību beigas', '', 'Vietas administrators', 31),
('Vakara beigas un nākamā diena', 'Nākamā diena, 12:00', 'Brančs vai “otrā diena” ar tuvākajiem, pirts', '', '', 32);

insert into public.plan_traditions (name, what, when_text, sort) values
('Līgavas izpirkšana', 'Līgavainis “izpērk” līgavu no viņas ģimenes un draugiem ar uzdevumiem', 'Rītā, ap 13:00', 1),
('Tilti un slēdzene', 'Pāris pārnes vai pārved līgavu pār tiltiem, pieslēdz slēdzeni un izmet atslēgu', 'Ceļā uz Nītauri', 2),
('Šķēršļi ceļā', 'Draugi vai kaimiņi aizsprosto ceļu, vīdu bārs izpērk ceļu', 'Ceļā uz Nītauri', 3),
('Maize un sāls', 'Vecāki sagaida pāri ar maizi un sāli', '18:15', 4),
('Pārnešana pār slieksni', 'Līgavainis ienes līgavu svinību vietā', '18:15', 5),
('Līgavas zagšana', 'Viesi “nozog” līgavu, līgavainis un vīdu bārs izpērk', '21:30', 6),
('Mičošana', 'Līgavai noņem plīvuru un uzliek miču vai lakatu, līgavainim cepuri; viesi dzied', '00:00', 7),
('Pušķa un plīvura nodošana', 'Līgava nodod pušķi neprecētām meitām', 'Mičošanā', 8),
('Pūra lāde', 'Līgava dāvina dāvanas līgavaiņa ģimenei', 'Pēc mičošanas', 9);
