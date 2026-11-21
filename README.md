# Kāzu plānotājs — palaišanas instrukcija

Kopīga weblapa jums abiem: pārskats ar atpakaļskaitīšanu, budžeta tāme (no `kazu-budzeta-tame.xlsx`) un viesu saraksts. Abi ienākat ar savu e-pastu un paroli, un otra izmaiņas parādās uzreiz. Citi cilvēki bez paroles neko neredz.

## 1. Supabase (≈5 min)
Var izmantot to pašu Supabase projektu, ko foto lietotnei.

1. Atver https://supabase.com un savu projektu (vai izveido jaunu, bez maksas).
2. **SQL Editor → New query**, iekopē visu `supabase-setup.sql` saturu un spied **Run**. Tas izveido tabulas, piekļuves noteikumus un ieliek budžeta pozīcijas.
3. **Authentication → Users → Add user → Create new user**: ievadi savu e-pastu un paroli, atzīmē **Auto Confirm User**. Atkārto partnerei.
4. **Authentication → Sign In / Providers** (vai **Settings**): izslēdz **Allow new users to sign up**, lai neviens cits nevar izveidot kontu.
5. **Project Settings → API**: nokopē **Project URL** un **anon public** atslēgu un ieraksti tās failā `config.js`.

## 2. Publicēšana (bez maksas)
Atver https://app.netlify.com/drop un ievelc visu `kazu-planotajs-supabase` mapi. Saņemsi `https://….netlify.app` adresi, ko nosūti partnerei. Adresi var nomainīt Netlify iestatījumos (Site configuration → Change site name).

Telefonā lapu var pievienot sākuma ekrānam (Safari: Kopīgot → Pievienot sākuma ekrānam; Chrome: ⋮ → Pievienot sākuma ekrānam).

## Faili
- `index.html`, `app.js` — pati lapa
- `config.js` — tavi Supabase dati
- `supabase-setup.sql` — tabulas, piekļuve un sākuma dati
- `supabase-update-2.sql`, `supabase-update-3.sql`, `supabase-update-4.sql` — vēlāki atjauninājumi; katru vienreiz palaiž Supabase SQL Editor (var arī atkārtoti)

## Ja kaut kas nestrādā
- **“Nepareizs e-pasts vai parole”**: pārbaudi, vai lietotājs izveidots ar Auto Confirm.
- **Lapā rakstīts “Gandrīz gatavs”**: `config.js` vēl nav ierakstīti Supabase dati.
- **Otra izmaiņas parādās tikai pēc pārlādes**: pārbaudi, vai SQL 3. solis (supabase_realtime) izpildījās bez kļūdas.
