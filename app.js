
(function(){
  const $ = s => document.querySelector(s);
  const eur = n => (Math.round(n)).toLocaleString("lv-LV") + " €";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };

  const CATS = ["Norises vieta","Ēdināšana","Dzērieni","Tērpi un stils","Gredzeni","Foto un video","Mūzika un izklaide","Noformējums un ziedi","Ceremonija: Turaidas baznīca","Transports","Ielūgumi un drukas darbi","Citi"];
  const STATUSES = ["Nav ielūgts","Ielūgts","Apstiprināja","Atteica"];
  const GROUPS = ["Ģimene","Draugi","Kolēģi","Cits"];
  const DEFAULTS = {names:"Mūsu kāzas", date:"", guests:80, target:35000, reserve:0.1, uplift:0.15};

  let sb = null, db = true, settings = {...DEFAULTS}, budget = [], guests = [];
  let settingsLoaded = false, budgetLoaded = false, guestsLoaded = false;
  const pending = {budget:false, guests:false, tasks:false, seating:false, program:false};

  // ---------- tabs ----------
  const TABS = ["parskats","budzets","viesi","uzdevumi","sedvietas","programma","ieluguma"];
  function showTab(){
    const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "parskats";
    TABS.forEach(id => { $("#"+id).hidden = id !== t; }); setTimeout(() => autosize($("#"+t)), 0);
    document.querySelectorAll("nav.tabs a").forEach(a => { if(a.dataset.tab === t) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  }
  window.addEventListener("hashchange", showTab); showTab();

  // ---------- status ----------
  let stTimer;
  function status(msg, err){ const el = $("#status"); el.textContent = msg; el.classList.toggle("err", !!err); clearTimeout(stTimer); if(!err && msg === "Saglabāts") stTimer = setTimeout(()=>{ el.textContent = "Sinhronizēts"; }, 1500); }
  async function save(p){ status("Saglabā…"); try{ const res = await p; if(res && res.error) throw res.error; status("Saglabāts"); loadAll(); } catch(e){ console.error(e); status("Neizdevās saglabāt: " + (e && e.message || "kļūda"), true); loadAll(); } }

  // ---------- calculations ----------
  function planned(r){
    const q = r.perGuest ? num(settings.guests) : num(r.qty);
    return q * num(r.price) * (r.uplift ? 1 + num(settings.uplift) : 1);
  }
  function totals(){
    let p = 0, a = 0, paid = 0, best = 0;
    budget.forEach(r => { const pl = planned(r); p += pl; const act = r.actual === null || r.actual === "" || r.actual === undefined ? null : num(r.actual); if(act !== null) a += act; best += act !== null ? act : pl; paid += num(r.paid); });
    const reserve = p * num(settings.reserve);
    return {p, a, paid, best, reserve, total: p + reserve};
  }

  // ---------- overview ----------
  function renderOverview(){
    $("#title").textContent = settings.names || "Mūsu kāzas";
    if(settings.date){
      const d = new Date(settings.date + "T00:00:00");
      $("#dateText").textContent = d.toLocaleDateString("lv-LV", {day:"numeric", month:"long", year:"numeric"});
      const days = Math.ceil((d - new Date(new Date().toDateString())) / 864e5);
      $("#countdown").hidden = false; $("#days").textContent = days >= 0 ? days : "✓";
    } else { $("#dateText").textContent = "datums vēl nav ievadīts"; $("#countdown").hidden = true; }

    const t = totals(), target = num(settings.target);
    $("#sPlanned").textContent = eur(t.total);
    const diff = target - t.total;
    $("#sTarget").innerHTML = "mērķis " + eur(target) + " · " + (diff >= 0 ? '<span class="pos">'+eur(diff)+' rezervē</span>' : '<span class="neg">'+eur(-diff)+' pāri</span>');
    const pct = target ? Math.min(100, t.total / target * 100) : 0;
    $("#sBar").style.width = pct + "%"; $("#sBar").classList.toggle("over", t.total > target);
    $("#sPaid").textContent = eur(t.paid);
    $("#sLeft").textContent = "vēl jāmaksā ~" + eur(Math.max(0, t.best - t.paid));
    const g = guestStats();
    // reālie viesi = visi sarakstā, izņemot atteikušos (ar personu skaitu)
    const real = g.all - g.no;
    $("#sGuests").textContent = real;
    $("#sGuestsSub").textContent = `sarakstā · ${g.yes} apstiprinājuši · plānoti ${num(settings.guests)}`;
    $("#sPer").textContent = real ? eur(t.total / real) : "–";
    $("#sPerSub").textContent = real ? `kopējās izmaksas ar rezervi / ${real} viesi sarakstā` : "pievieno viesus sarakstā";

    document.querySelectorAll("#settingsForm input").forEach(inp => {
      if(document.activeElement === inp) return;
      const v = settings[inp.dataset.k];
      inp.value = inp.dataset.pct ? Math.round(num(v) * 1000) / 10 : (v ?? "");
    });
  }
  $("#settingsForm").addEventListener("change", e => {
    const inp = e.target; if(!inp.dataset.k || !db) return;
    let v = inp.value;
    if(inp.type === "number") v = inp.dataset.pct ? num(v) / 100 : num(v);
    settings[inp.dataset.k] = v; renderAll();
    save(sb.from("plan_settings").upsert(settingsRow()));
  });

  // ---------- budget ----------
  // telefonā tabulas rāda kā kartītes: katrai šūnai paraksts no tabulas galvas
  function labelCells(root){
    (root.matches("table") ? [root] : root.querySelectorAll("table")).forEach(tb => {
      const ths = [...tb.querySelectorAll("thead th")].map(th => th.textContent.trim());
      tb.querySelectorAll("tbody tr[data-id]").forEach(tr => {
        const tds = tr.children; if(tds.length !== ths.length) return;
        [...tds].forEach((td, i) => { if(ths[i]) td.dataset.label = ths[i]; if(td.querySelector("textarea")) td.classList.add("wide"); });
      });
    });
  }
  function budgetCats(){
    const base = Array.isArray(settings.budget_cats) ? settings.budget_cats : CATS;
    return [...base, ...[...new Set(budget.map(r => r.cat))].filter(c => c && !base.includes(c))];
  }
  function renderBudget(){
    if(isEditing("#budgetBody")){ pending.budget = true; return; }
    const body = $("#budgetBody");
    if(!budgetLoaded){ return; }
    let html = "";
    const cats = budgetCats();
    cats.forEach(cat => {
      const rows = budget.filter(r => r.cat === cat).sort((a,b) => num(a.order) - num(b.order));
      const sp = rows.reduce((s,r)=>s+planned(r),0), sa = rows.reduce((s,r)=>s+(r.actual==null||r.actual===""?0:num(r.actual)),0), spd = rows.reduce((s,r)=>s+num(r.paid),0);
      html += `<tr class="cat"><td colspan="3">${esc(cat)}</td><td class="num">${eur(sp)}</td><td class="num">${sa?eur(sa):""}</td><td class="num">${spd?eur(spd):""}</td><td></td><td><button class="del" data-act="delcat" data-cat="${esc(cat)}" title="Dzēst visu sadaļu">Dzēst sadaļu</button></td></tr>`;
      rows.forEach(r => {
        const act = r.actual == null || r.actual === "" ? "" : r.actual;
        html += `<tr data-id="${esc(r.id)}">
          <td><textarea class="w-item grow" rows="1" data-f="item" aria-label="Pozīcija">${esc(r.item)}</textarea></td>
          <td class="num">${r.perGuest ? `<button class="icon" style="font-size:13px;color:var(--accent)" data-act="qty" title="Nospied, lai ievadītu skaitu">uz viesi (${num(settings.guests)})</button>` : `<input class="w-num" type="number" step="1" min="0" data-f="qty" value="${esc(r.qty)}" aria-label="Daudzums">`}</td>
          <td class="num"><input class="w-num" type="number" step="0.01" min="0" data-f="price" value="${esc(r.price)}" aria-label="Cena">${r.uplift?'<span class="hint" title="Pieskaitīts cenu pieaugums">★</span>':""}</td>
          <td class="num">${eur(planned(r))}</td>
          <td class="num"><input class="w-num" type="number" step="0.01" min="0" data-f="actual" value="${esc(act)}" placeholder="–" aria-label="Faktiski"></td>
          <td class="num"><input class="w-num" type="number" step="0.01" min="0" data-f="paid" value="${num(r.paid)||""}" placeholder="0" aria-label="Samaksāts"></td>
          <td><textarea class="w-note grow" rows="1" data-f="note" aria-label="Piezīmes">${esc(r.note)}</textarea>${r.range ? `<div class="hint">Tipiski LV: ${esc(r.range)}</div>` : ""}</td>
          <td><button class="del" data-act="del" title="Dzēst pozīciju">Dzēst</button></td></tr>`;
      });
      html += `<tr class="addrow"><td colspan="8"><button data-act="add" data-cat="${esc(cat)}">+ Pievienot pozīciju</button></td></tr>`;
    });
    const t = totals(), target = num(settings.target), diff = target - t.total;
    html += `<tr class="total"><td colspan="3">Starpsumma</td><td class="num">${eur(t.p)}</td><td class="num">${eur(t.a)}</td><td class="num">${eur(t.paid)}</td><td colspan="2"></td></tr>
      <tr class="total"><td colspan="3">Rezerve (${Math.round(num(settings.reserve)*100)}%)</td><td class="num">${eur(t.reserve)}</td><td colspan="4"></td></tr>
      <tr class="total big"><td colspan="3">KOPĀ</td><td class="num">${eur(t.total)}</td><td colspan="4" class="${diff>=0?"pos":"neg"}">${diff>=0 ? eur(diff)+" zem mērķa" : eur(-diff)+" virs mērķa"} (${eur(target)})</td></tr>`;
    body.innerHTML = html; labelCells($("#budgetTable")); autosize(body);
  }
  function askDel(msg){ return window.confirm(msg + "\n\nŠo nevarēs atsaukt."); }
  $("#budgetBody").addEventListener("change", e => {
    const inp = e.target, tr = inp.closest("tr[data-id]"); if(!tr || !inp.dataset.f || !db) return;
    const r = budget.find(x => x.id === tr.dataset.id); if(!r) return;
    const f = inp.dataset.f;
    let v = inp.value;
    if(["qty","price","paid"].includes(f)) v = num(v);
    if(f === "actual") v = v === "" ? null : num(v);
    r[f] = v; pending.budget = true;
    save(sb.from("plan_budget").update({[f]: v}).eq("id", r.id));
  });
  $("#budgetBody").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if(!b || !db) return;
    const tr = b.closest("tr[data-id]");
    if(b.dataset.act === "add"){
      const cat = b.dataset.cat, rows = budget.filter(r => r.cat === cat);
      const order = rows.length ? Math.max(...rows.map(r => num(r.order))) + 1 : 1;
      save(sb.from("plan_budget").insert({cat, item:"Jauna pozīcija", qty:1, price:0, per_guest:false, uplift:false, actual:null, paid:0, note:"", sort:order}));
    } else if(b.dataset.act === "del" && tr){
      const r = budget.find(x => x.id === tr.dataset.id);
      if(askDel(`Vai tiešām dzēst budžeta pozīciju „${(r && r.item) || "bez nosaukuma"}”?`)) save(sb.from("plan_budget").delete().eq("id", tr.dataset.id));
    } else if(b.dataset.act === "delcat"){
      const cat = b.dataset.cat, rows = budget.filter(r => r.cat === cat);
      const sum = rows.reduce((s,r) => s + planned(r), 0);
      if(!askDel(`Vai tiešām dzēst sadaļu „${cat}”` + (rows.length ? ` kopā ar ${rows.length} pozīcijām (${eur(sum)})?` : "?"))) return;
      const hasList = "budget_cats" in settings;
      if(!hasList && !rows.length){ alert("Lai varētu dzēst tukšas sadaļas, Supabase vienreiz jāpalaiž supabase-update-2.sql."); return; }
      if(rows.length) save(sb.from("plan_budget").delete().eq("cat", cat));
      if(hasList){ settings.budget_cats = budgetCats().filter(c => c !== cat); save(sb.from("plan_settings").update({budget_cats: settings.budget_cats}).eq("id", 1)); }
      renderBudget();
    } else if(b.dataset.act === "qty" && tr){
      save(sb.from("plan_budget").update({per_guest:false, qty:num(settings.guests)}).eq("id", tr.dataset.id));
    }
  });

  $("#catForm").addEventListener("submit", e => {
    e.preventDefault(); if(!db) return;
    const name = $("#catName").value.trim(); if(!name) return;
    if(budgetCats().includes(name)){ $("#catName").select(); return; }
    $("#catName").value = "";
    if("budget_cats" in settings){ settings.budget_cats = [...budgetCats(), name]; renderBudget(); save(sb.from("plan_settings").update({budget_cats: settings.budget_cats}).eq("id", 1)); }
    else save(sb.from("plan_budget").insert({cat:name, item:"Jauna pozīcija", qty:1, price:0, per_guest:false, uplift:false, actual:null, paid:0, note:"", sort:1}));
  });

  // ---------- guests ----------
  function guestStats(){
    let all = 0, yes = 0, no = 0, inv = 0, notInv = 0;
    guests.forEach(g => { const c = Math.max(1, num(g.count) || 1); all += c;
      if(g.status === "Apstiprināja") yes += c; else if(g.status === "Atteica") no += c; else if(g.status === "Ielūgts") inv += c; else notInv += c; });
    return {all, yes, no, inv, notInv};
  }
  function renderGuests(){
    const s = guestStats();
    $("#guestChips").innerHTML = `<span class="chip ok">${s.yes} nāks</span> <span class="chip warn">${s.inv} gaida atbildi</span> <span class="chip bad">${s.no} atteica</span> <span class="chip mut">${s.notInv} nav ielūgti</span>`;
    $("#groups").innerHTML = [...new Set(guests.map(g => g.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join("");
    { const sel = $("#gSit"), cur = sel.value, ok = guests.some(g => "sit_with" in g) || "inv_style" in settings;
      sel.disabled = !ok; sel.title = ok ? "" : "Vispirms Supabase jāpalaiž supabase-update-2.sql";
      sel.innerHTML = '<option value="">—</option>' + [...guests].sort((a,b) => (a.name||"").localeCompare(b.name||"","lv")).map(g => `<option value="${esc(g.id)}"${g.id === cur ? " selected" : ""}>${esc(g.name)}</option>`).join(""); }
    if(isEditing("#guestBody")){ pending.guests = true; return; }
    if(!guestsLoaded) return;
    const q = $("#gSearch").value.trim().toLowerCase(), f = $("#gFilter").value;
    const list = guests.filter(g => (!f || (g.status || "Nav ielūgts") === f) && (!q || (g.name+" "+(g.group||"")).toLowerCase().includes(q)))
      .sort((a,b) => (a.side||"").localeCompare(b.side||"","lv") || (a.group||"").localeCompare(b.group||"","lv") || (a.name||"").localeCompare(b.name||"","lv"));
    if(!guests.length){ $("#guestBody").innerHTML = `<tr><td colspan="10" class="empty">Sarakstā vēl nav neviena viesa. Pievieno pirmo ar formu augstāk.</td></tr>`; return; }
    if(!list.length){ $("#guestBody").innerHTML = `<tr><td colspan="10" class="empty">Neviens viesis neatbilst meklēšanai.</td></tr>`; return; }
    const opt = (arr, v) => arr.map(o => `<option${o===v?" selected":""}>${o}</option>`).join("");
    // vecas brīvi ierakstītas grupas (piem., "Darbs") paliek redzamas, līdz tās nomaina
    const grpOpts = v => (!v ? '<option value="" selected>—</option>' : "") + (v && !GROUPS.includes(v) ? `<option selected>${esc(v)}</option>` : "") + opt(GROUPS, v);
    const hasSit = guests.some(g => "sit_with" in g) || "inv_style" in settings;
    const byName = [...guests].sort((a,b) => (a.name||"").localeCompare(b.name||"","lv"));
    const sitSel = g => hasSit
      ? `<select data-f="sit_with" style="min-width:140px" aria-label="Sēž blakus">${'<option value="">—</option>' + byName.filter(o => o.id !== g.id).map(o => `<option value="${esc(o.id)}"${o.id === g.sit_with ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select>`
      : `<select disabled style="min-width:140px" title="Vispirms Supabase jāpalaiž supabase-update-2.sql"><option>—</option></select>`;
    $("#guestBody").innerHTML = list.map(g => `<tr data-id="${esc(g.id)}">
      <td><input data-f="name" value="${esc(g.name)}" style="min-width:160px" aria-label="Vārds"></td>
      <td><select data-f="side" style="min-width:130px" aria-label="Puse">${opt(["Līgavas","Līgavaiņa","Kopīgie"], g.side)}</select></td>
      <td><select data-f="group" style="min-width:110px" aria-label="Grupa">${grpOpts(g.group)}</select></td>
      <td class="num"><input data-f="count" type="number" min="1" step="1" value="${esc(g.count||1)}" style="width:60px" aria-label="Personas"></td>
      <td><select data-f="status" style="min-width:160px" aria-label="Statuss">${opt(STATUSES, g.status || "Nav ielūgts")}</select></td>
      <td><input data-f="diet" value="${esc(g.diet)}" placeholder="–" style="min-width:100px" aria-label="Ēdiena piezīmes"></td>
      <td><input data-f="stay" type="checkbox" ${g.stay?"checked":""} aria-label="Nakšņo"></td>
      <td>${sitSel(g)}</td>
      <td><textarea class="grow" rows="1" data-f="note" style="min-width:140px" aria-label="Piezīmes">${esc(g.note)}</textarea></td>
      <td><button class="del" data-act="del" title="Dzēst viesi">Dzēst</button></td></tr>`).join("");
    labelCells($("#viesi")); autosize($("#guestBody"));
  }
  $("#gSearch").addEventListener("input", renderGuests);
  $("#gFilter").addEventListener("change", renderGuests);
  $("#guestForm").addEventListener("submit", e => {
    e.preventDefault(); if(!db) return;
    const name = $("#gName").value.trim(); if(!name) return;
    const row = {name, side:$("#gSide").value, grp:$("#gGroup").value, count:Math.max(1, num($("#gCount").value)||1), status:"Nav ielūgts", diet:"", stay:false, note:""};
    const sitId = $("#gSit").value || null;
    $("#gName").value = ""; $("#gCount").value = 1; $("#gSit").value = ""; $("#gName").focus();
    if(!sitId){ save(sb.from("plan_guests").insert(row)); return; }
    // jaunais viesis sēž blakus izvēlētajam, un izvēlētajam uzreiz parādās jaunais viesis
    save((async () => {
      const res = await sb.from("plan_guests").insert({...row, sit_with: sitId}).select().single();
      if(res.error) return res;
      const other = guests.find(g => g.id === sitId);
      const prev = other && other.sit_with && guests.find(g => g.id === other.sit_with);
      if(prev && prev.sit_with === sitId){ const r2 = await sb.from("plan_guests").update({sit_with: null}).eq("id", prev.id); if(r2.error) return r2; }
      return sb.from("plan_guests").update({sit_with: res.data.id}).eq("id", sitId);
    })());
  });
  $("#guestBody").addEventListener("change", e => {
    const inp = e.target, tr = inp.closest("tr[data-id]"); if(!tr || !inp.dataset.f || !db) return;
    const g = guests.find(x => x.id === tr.dataset.id); if(!g) return;
    let v = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? Math.max(1, num(inp.value)||1) : inp.value;
    if(inp.dataset.f === "sit_with"){
      v = v || null; const old = g.sit_with; g.sit_with = v;
      const other = v && guests.find(x => x.id === v);
      // savieno abos virzienos, ja otram vēl nav neviena
      if(other && !other.sit_with){ other.sit_with = g.id; save(sb.from("plan_guests").update({sit_with: g.id}).eq("id", other.id)); }
      const prev = old && old !== v && guests.find(x => x.id === old);
      if(prev && prev.sit_with === g.id){ prev.sit_with = null; save(sb.from("plan_guests").update({sit_with: null}).eq("id", prev.id)); }
    }
    g[inp.dataset.f] = v; pending.guests = true;
    if(inp.tagName === "SELECT" || inp.type === "checkbox") { pending.guests = false; renderGuests(); renderOverview(); }
    save(sb.from("plan_guests").update({[inp.dataset.f === "group" ? "grp" : inp.dataset.f]: v}).eq("id", g.id));
  });
  $("#guestBody").addEventListener("click", e => {
    const b = e.target.closest("button[data-act=del]"); if(!b || !db) return;
    const tr = b.closest("tr[data-id]");
    const g = guests.find(x => x.id === tr.dataset.id);
    if(askDel(`Vai tiešām dzēst viesi „${(g && g.name) || "bez vārda"}”?`)) save(sb.from("plan_guests").delete().eq("id", tr.dataset.id));
  });

  // ================= UZDEVUMI =================
  const PHASES = [{"id":"p1","name":"12 un vairāk mēneši pirms","days":365},{"id":"p2","name":"9–11 mēneši pirms","days":270},{"id":"p3","name":"6–8 mēneši pirms","days":180},{"id":"p4","name":"4–5 mēneši pirms","days":120},{"id":"p5","name":"2–3 mēneši pirms","days":60},{"id":"p6","name":"Mēnesi pirms","days":14},{"id":"p7","name":"Pēdējās divas nedēļas","days":1},{"id":"p8","name":"Kāzu diena","days":0},{"id":"p9","name":"Pēc kāzām","days":-60}];
  const AREA = {b:"Budžets",g:"Viesi",v:"Pakalpojumi",a:"Tērpi",d:"Dokumenti",c:"Ceremonija un svinības",h:"Ceļojums"};
  const MONTHS_GEN = ["janvāris","februāris","marts","aprīlis","maijs","jūnijs","jūlijs","augusts","septembris","oktobris","novembris","decembris"];
  const MONTHS_LOC = ["janvārī","februārī","martā","aprīlī","maijā","jūnijā","jūlijā","augustā","septembrī","oktobrī","novembrī","decembrī"];
  const WEEKDAYS = ["svētdien","pirmdien","otrdien","trešdien","ceturtdien","piektdien","sestdien"];
  let tasks = [], tables = [], program = [], traditions = [];
  const missing = {tasks:false, tables:false, program:false, traditions:false};
  let onlyOpen = false; try{ onlyOpen = localStorage.getItem("kp-onlyopen") === "1"; }catch(e){}

  function weddingDate(){ if(!settings.date) return null; const d = new Date(settings.date + "T12:00:00"); return isNaN(d) ? null : d; }
  function fmtShort(d){ return d.getDate() + ". " + MONTHS_GEN[d.getMonth()] + " " + d.getFullYear(); }
  function phaseDeadline(p){ const w = weddingDate(); if(!w) return null; const d = new Date(w); d.setDate(d.getDate() - p.days); return d; }
  function todayNoon(){ const t = new Date(); t.setHours(12,0,0,0); return t; }
  function currentPhaseId(){ const t0 = todayNoon(); for(const p of PHASES){ const d = phaseDeadline(p); if(d && d >= t0) return p.id; } return null; }
  function needsUpdate(sel, what){ $(sel).innerHTML = `<div class="notice">Lai redzētu ${what}, Supabase vienreiz jāpalaiž fails <b>supabase-update-2.sql</b> (SQL Editor → New query → Run).</div>`; }
  function tagHtml(tags){
    tags = tags || ""; let out = "";
    if(tags.includes("t")) out += '<span class="tag t">Turaida</span>';
    if(tags.includes("n")) out += '<span class="tag n">Nītaure</span>';
    for(const k of Object.keys(AREA)) if(tags.includes(k)) out += '<span class="tag">' + AREA[k] + '</span>';
    return out;
  }
  function confirmDel(b, fn, what){ if(askDel(`Vai tiešām dzēst ${what || "šo ierakstu"}?`)) fn(); }


  function renderTasks(){
    $("#taskProgress").hidden = missing.tasks;
    if(missing.tasks){ needsUpdate("#taskList", "uzdevumus"); return; }
    if(isEditing("#taskList")){ pending.tasks = true; return; }
    const done = tasks.filter(t => t.done).length, all = tasks.length, pct = all ? Math.round(done / all * 100) : 0;
    $("#taskProgress").innerHTML = `<div class="v">${done} no ${all}</div><div class="bar"><i style="width:${pct}%"></i></div><div class="s">${pct}% paveikts</div>`;
    $("#onlyOpen").checked = onlyOpen;
    const nowId = currentPhaseId(), t0 = todayNoon();
    let html = "";
    PHASES.forEach(p => {
      const ts = tasks.filter(t => t.phase === p.id).sort((a,b) => (a.custom - b.custom) || num(a.sort) - num(b.sort));
      const pd = ts.filter(t => t.done).length, dl = phaseDeadline(p);
      let pill = "";
      if(ts.length && pd === ts.length) pill = '<span class="chip ok">Gatavs</span>';
      else if(dl && p.days > 0 && dl < t0) pill = '<span class="chip bad">Nokavēts</span>';
      else if(p.id === nowId) pill = '<span class="chip warn">Tagad</span>';
      const dlText = dl ? (p.days > 0 ? "līdz " + fmtShort(dl) : p.days === 0 ? fmtShort(dl) : "līdz " + fmtShort(dl)) : "";
      html += `<section class="phase${p.id === nowId ? " now" : ""}"><div class="phase-head"><h3 class="ph">${esc(p.name)}</h3>${pill}<span class="hint">${pd}/${ts.length}${dlText ? " · " + dlText : ""}</span></div><ul class="tasks">`;
      ts.forEach(t => {
        if(onlyOpen && t.done) return;
        html += `<li class="task${t.done ? " checked" : ""}" data-id="${esc(t.id)}"><input type="checkbox" id="tk-${esc(t.id)}" data-f="done" ${t.done ? "checked" : ""}>
          <label for="tk-${esc(t.id)}"><span class="txt">${esc(t.text)}</span>${t.note ? `<span class="note">${esc(t.note)}</span>` : ""}</label>
          <div class="tags">${t.custom ? '<span class="tag">Savs</span>' : tagHtml(t.tags)}<button class="del" data-act="del" title="Dzēst uzdevumu">Dzēst</button></div></li>`;
      });
      html += `</ul><form class="addtask" data-phase="${p.id}"><input placeholder="Pievienot savu uzdevumu" aria-label="Pievienot uzdevumu posmā ${esc(p.name)}"><button type="submit">Pievienot</button></form></section>`;
    });
    $("#taskList").innerHTML = html;
  }
  $("#onlyOpen").addEventListener("change", e => { onlyOpen = e.target.checked; try{ localStorage.setItem("kp-onlyopen", onlyOpen ? "1" : "0"); }catch(_){} renderTasks(); });
  $("#taskList").addEventListener("change", e => {
    const inp = e.target, li = inp.closest("li[data-id]"); if(!li || inp.dataset.f !== "done") return;
    const t = tasks.find(x => x.id === li.dataset.id); if(!t) return;
    t.done = inp.checked; renderTasks(); renderOverview();
    save(sb.from("plan_tasks").update({done: t.done}).eq("id", t.id));
  });
  $("#taskList").addEventListener("submit", e => {
    const f = e.target.closest("form.addtask"); if(!f) return; e.preventDefault();
    const inp = f.querySelector("input"), v = inp.value.trim(); if(!v) return;
    inp.value = "";
    save(sb.from("plan_tasks").insert({phase: f.dataset.phase, text: v.slice(0, 300), custom: true, sort: Date.now() % 1000000}));
  });
  $("#taskList").addEventListener("click", e => {
    const b = e.target.closest("button[data-act=del]"); if(!b) return;
    const li = b.closest("li[data-id]");
    const t = tasks.find(x => x.id === li.dataset.id);
    confirmDel(b, () => save(sb.from("plan_tasks").delete().eq("id", li.dataset.id)), "uzdevumu „" + (t ? t.text : "") + "”");
  });

  // ================= SĒDVIETAS =================
  function seatsUsed(tid){ return guests.filter(g => g.table_id === tid && g.status !== "Atteica").reduce((s,g) => s + Math.max(1, num(g.count) || 1), 0); }
  // „sēž blakus”: parāda pāri un brīdina, ja viņi nav pie viena galda
  function sitHint(g, tid, long){
    const o = g.sit_with && guests.find(x => x.id === g.sit_with); if(!o) return "";
    const ot = tables.find(t => t.id === o.table_id);
    if(o.status === "Atteica") return ` <span class="hint">· blakus ${esc(o.name)} (atteica)</span>`;
    if(tid && o.table_id === tid) return ` <span class="hint">↔ ${esc(o.name)}</span>`;
    if(!tid) return `<div class="hint">Blakus: <b>${esc(o.name)}</b>${ot ? " (pie galda „" + esc(ot.name) + "”)" : ""}</div>`;
    return ` <span class="chip warn" title="Jāsēž blakus">↔ ${esc(o.name)} ${ot ? "pie cita galda" : "bez galda"}</span>`;
  }
  function renderSeating(){
    if(missing.tables){ needsUpdate("#tableCards", "sēdvietu plānu"); $("#seatGuests").innerHTML = ""; return; }
    if(isEditing("#sedvietas")){ pending.seating = true; return; }
    const sorted = [...tables].sort((a,b) => num(a.sort) - num(b.sort) || String(a.name).localeCompare(b.name, "lv"));
    const ids = new Set(sorted.map(t => t.id));
    const coming = guests.filter(g => g.status !== "Atteica");
    const seatsTotal = sorted.reduce((s,t) => s + num(t.seats), 0);
    const seated = coming.filter(g => ids.has(g.table_id)).reduce((s,g) => s + Math.max(1, num(g.count) || 1), 0);
    const people = coming.reduce((s,g) => s + Math.max(1, num(g.count) || 1), 0);
    $("#seatChips").innerHTML = `<span class="chip ok">${seated} apsēdināti</span> <span class="chip ${people - seated ? "warn" : "mut"}">${people - seated} bez galda</span> <span class="chip ${seatsTotal - seated < 0 ? "bad" : "mut"}">${seatsTotal - seated} brīvas vietas</span>`;
    $("#tableCards").innerHTML = sorted.length ? sorted.map(t => {
      const used = seatsUsed(t.id), over = used > num(t.seats);
      const names = coming.filter(g => g.table_id === t.id).sort((a,b) => (a.name||"").localeCompare(b.name||"", "lv"));
      return `<div class="tcard${over ? " over" : ""}" data-id="${esc(t.id)}">
        <div class="trow"><input class="tname" data-f="name" value="${esc(t.name)}" aria-label="Galda nosaukums"><span class="cap">${used} / ${num(t.seats)}</span></div>
        <div class="bar"><i class="${over ? "over" : ""}" style="width:${Math.min(100, num(t.seats) ? used / num(t.seats) * 100 : 0)}%"></i></div>
        ${names.length ? `<ul class="tguests">${names.map(g => `<li>${esc(g.name)}${num(g.count) > 1 ? ` <span class="hint">+${num(g.count) - 1}</span>` : ""}${sitHint(g, t.id)}</li>`).join("")}</ul>` : '<p class="hint">Neviens vēl nav apsēdināts</p>'}
        <div class="trow"><select data-f="shape" aria-label="Galda forma">${["serpentīns","apaļš","taisnstūra"].map(o => `<option${o === t.shape ? " selected" : ""}>${o}</option>`).join("")}</select>
        <label class="inline">Vietas <input type="number" min="1" max="80" data-f="seats" value="${num(t.seats)}" style="width:64px"></label>
        <button class="del" data-act="del">Dzēst galdu</button></div></div>`;
    }).join("") : '<p class="hint">Galdu vēl nav. Pievieno pirmo zemāk.</p>';
    const opts = cur => '<option value="">— bez galda —</option>' + sorted.map(t => `<option value="${esc(t.id)}"${cur === t.id ? " selected" : ""}>${esc(t.name)} (${seatsUsed(t.id)}/${num(t.seats)})</option>`).join("");
    const filter = $("#seatFilter").value;
    const list = coming.filter(g => filter === "all" || !ids.has(g.table_id)).sort((a,b) => (ids.has(a.table_id) - ids.has(b.table_id)) || (a.grp||"").localeCompare(b.grp||"", "lv") || (a.name||"").localeCompare(b.name||"", "lv"));
    $("#seatGuests").innerHTML = !guests.length ? '<p class="empty">Viesu sarakstā vēl nav neviena. Pievieno viesus sadaļā <a href="#viesi">Viesi</a>.</p>'
      : !list.length ? '<p class="empty">Visi viesi ir apsēdināti.</p>'
      : list.map(g => `<div class="sg" data-id="${esc(g.id)}"><div><b>${esc(g.name)}</b>${num(g.count) > 1 ? ` <span class="hint">(${num(g.count)} pers.)</span>` : ""}<div class="hint">${esc([g.side, g.grp].filter(Boolean).join(" · "))}</div>${sitHint(g, ids.has(g.table_id) ? g.table_id : null, true)}</div><select data-f="table_id" aria-label="Galds viesim ${esc(g.name)}">${opts(ids.has(g.table_id) ? g.table_id : "")}</select></div>`).join("");
  }
  $("#seatFilter").addEventListener("change", renderSeating);
  $("#tableCards").addEventListener("change", e => {
    const inp = e.target, card = inp.closest(".tcard[data-id]"); if(!card || !inp.dataset.f) return;
    const t = tables.find(x => x.id === card.dataset.id); if(!t) return;
    const f = inp.dataset.f; let v = inp.value; if(f === "seats") v = Math.max(1, Math.round(num(v)) || 1);
    t[f] = v; pending.seating = true;
    save(sb.from("plan_tables").update({[f]: v}).eq("id", t.id));
  });
  $("#tableCards").addEventListener("click", e => {
    const b = e.target.closest("button[data-act=del]"); if(!b) return;
    const card = b.closest(".tcard[data-id]");
    const t = tables.find(x => x.id === card.dataset.id);
    confirmDel(b, () => save(sb.from("plan_tables").delete().eq("id", card.dataset.id)), "galdu „" + (t ? t.name : "") + "” (viesi paliks sarakstā bez galda)");
  });
  $("#seatGuests").addEventListener("change", e => {
    const s = e.target, row = s.closest(".sg[data-id]"); if(!row) return;
    const g = guests.find(x => x.id === row.dataset.id); if(!g) return;
    g.table_id = s.value || null;
    save(sb.from("plan_guests").update({table_id: g.table_id}).eq("id", g.id));
    // ja viesim norādīts „sēž blakus” un tas vēl nav pie galda, apsēdina abus kopā
    const o = g.sit_with && guests.find(x => x.id === g.sit_with);
    if(g.table_id && o && !tables.some(t => t.id === o.table_id) && o.status !== "Atteica"){ o.table_id = g.table_id; save(sb.from("plan_guests").update({table_id: g.table_id}).eq("id", o.id)); }
    renderSeating();
  });
  $("#tableForm").addEventListener("submit", e => {
    e.preventDefault(); const name = $("#tName").value.trim(); if(!name) return;
    const sort = tables.length ? Math.max(...tables.map(t => num(t.sort))) + 1 : 0;
    save(sb.from("plan_tables").insert({name, shape: $("#tShape").value, seats: Math.max(1, Math.round(num($("#tSeats").value)) || 10), sort}));
    $("#tName").value = "";
  });

  // ================= PROGRAMMA =================
  const SECTIONS = ["Rīts: sagatavošanās","Ceremonija Turaidas baznīcā un ceļš uz Nītauri","Svinības Nītaures Dzirnavās","Vakara beigas un nākamā diena"];
  function renderProgram(){
    if(missing.program){ needsUpdate("#programList", "programmu"); return; }
    if(isEditing("#programma")){ pending.program = true; return; }
    const secs = [...SECTIONS, ...[...new Set(program.map(r => r.section))].filter(s => !SECTIONS.includes(s))];
    $("#programList").innerHTML = secs.map(sec => {
      const rows = program.filter(r => r.section === sec).sort((a,b) => num(a.sort) - num(b.sort));
      return `<div class="block"><h3 class="ph">${esc(sec)}</h3><div class="tablebox"><table class="prog"><thead><tr><th>Laiks</th><th>Kas notiek</th><th>Kur</th><th>Atbildīgais</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr data-id="${esc(r.id)}"><td><input data-f="time" value="${esc(r.time)}" style="width:96px" aria-label="Laiks"></td>
          <td><textarea class="grow" rows="1" data-f="what" style="min-width:240px" aria-label="Kas notiek">${esc(r.what)}</textarea></td>
          <td><textarea class="grow" rows="1" data-f="place" style="min-width:150px" aria-label="Kur">${esc(r.place)}</textarea></td>
          <td><textarea class="grow" rows="1" data-f="who" style="min-width:150px" aria-label="Atbildīgais">${esc(r.who)}</textarea></td>
          <td><button class="del" data-act="del">Dzēst</button></td></tr>`).join("")}
        <tr class="addrow"><td colspan="5"><button data-act="add" data-sec="${esc(sec)}">+ Pievienot rindu</button></td></tr></tbody></table></div></div>`;
    }).join("");
    if(missing.traditions){ needsUpdate("#tradList", "tradīcijas"); }
    else {
      const rows = [...traditions].sort((a,b) => num(a.sort) - num(b.sort));
      $("#tradList").innerHTML = `<div class="tablebox"><table><thead><tr><th>Tradīcija</th><th>Kas notiek</th><th>Kad</th><th>Gribam?</th></tr></thead><tbody>${rows.map(r => `<tr data-id="${esc(r.id)}"><td><b>${esc(r.name)}</b></td><td>${esc(r.what)}</td><td><input data-f="when_text" value="${esc(r.when_text)}" style="width:130px" aria-label="Kad"></td>
        <td><select data-f="want" class="want ${r.want === "Jā" ? "yes" : r.want === "Nē" ? "no" : ""}" aria-label="Gribam?">${["","Jā","Varbūt","Nē"].map(o => `<option value="${o}"${o === (r.want || "") ? " selected" : ""}>${o || "—"}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>`;
    }
    labelCells($("#programma")); autosize($("#programList"));
  }
  $("#programList").addEventListener("change", e => {
    const inp = e.target, tr = inp.closest("tr[data-id]"); if(!tr || !inp.dataset.f) return;
    const r = program.find(x => x.id === tr.dataset.id); if(!r) return;
    r[inp.dataset.f] = inp.value; pending.program = true;
    save(sb.from("plan_program").update({[inp.dataset.f]: inp.value}).eq("id", r.id));
  });
  $("#programList").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if(!b) return;
    if(b.dataset.act === "add"){
      const sec = b.dataset.sec, rows = program.filter(r => r.section === sec);
      save(sb.from("plan_program").insert({section: sec, time: "", what: "", place: "", who: "", sort: rows.length ? Math.max(...rows.map(r => num(r.sort))) + 1 : 1}));
    } else if(b.dataset.act === "del"){
      const tr = b.closest("tr[data-id]");
      const r = program.find(x => x.id === tr.dataset.id);
      confirmDel(b, () => save(sb.from("plan_program").delete().eq("id", tr.dataset.id)), "programmas rindu" + (r && r.what ? " „" + r.what + "”" : ""));
    }
  });
  $("#tradList").addEventListener("change", e => {
    const inp = e.target, tr = inp.closest("tr[data-id]"); if(!tr || !inp.dataset.f) return;
    const r = traditions.find(x => x.id === tr.dataset.id); if(!r) return;
    r[inp.dataset.f] = inp.value; if(inp.tagName === "SELECT") inp.className = "want " + (inp.value === "Jā" ? "yes" : inp.value === "Nē" ? "no" : "");
    save(sb.from("plan_traditions").update({[inp.dataset.f]: inp.value}).eq("id", r.id));
  });

  // ================= IELŪGUMS =================
  function invDateLong(){
    const d = weddingDate(); if(!d) return "[datums]";
    const w = WEEKDAYS[d.getDay()];
    return w.charAt(0).toUpperCase() + w.slice(1) + ", " + d.getFullYear() + ". gada " + d.getDate() + ". " + MONTHS_LOC[d.getMonth()];
  }
  function invDateShort(){ const d = weddingDate(); if(!d) return "[datums]"; return String(d.getDate()).padStart(2,"0") + "." + String(d.getMonth()+1).padStart(2,"0") + "." + d.getFullYear() + "."; }
  function rsvpText(){ if(!settings.rsvp_date) return "[datums]"; const d = new Date(settings.rsvp_date + "T12:00:00"); return d.getDate() + ". " + MONTHS_LOC[d.getMonth()]; }
  function renderInvitation(){
    const hasCols = "inv_style" in settings;
    $("#invMissing").hidden = hasCols;
    document.querySelectorAll("#invForm [data-k]").forEach(inp => { if(document.activeElement !== inp) inp.value = settings[inp.dataset.k] ?? ""; });
    const B = esc(settings.bride || "[Līgavas vārds]"), G = esc(settings.groom || "[Līgavaiņa vārds]");
    const T = esc(settings.ceremony_time || "[00:00]"), C = esc(settings.contact || "[tālrunis · e-pasts]");
    const style = settings.inv_style || "klasisks";
    let html = "";
    if(style === "moderns"){
      html = `<div class="inv inv-mod"><div class="m-top"><span>Mēs precamies</span><span class="acc">${invDateShort()}</span></div>
        <div><h1>${B}</h1><div class="m-and"><i></i><span class="acc">un</span></div><h1>${G}</h1></div>
        <p class="m-lead">Būsim priecīgi, ja kopā ar mums nosvinēsi mūsu lielo dienu.</p>
        <div class="m-grid"><div><small>Ceremonija</small>Turaidas baznīca<br>plkst. ${T}</div><div><small>Svinības</small>Nītaures Dzirnavas</div><div><small>Atbildi līdz</small>${rsvpText()}</div><div><small>Kontakti</small>${C}</div></div></div>`;
    } else if(style === "rotalīgs"){
      html = `<div class="inv inv-fun"><div class="f-card"><div class="f-top">♥ Uzmanību, svarīgs paziņojums! ♥</div>
        <div><h1>${B}<br><span>un</span><br>${G}</h1><p class="f-sub">beidzot to dara!</p></div>
        <p>Mēs precamies, un bez Tevis ballīte nebūs tā pati. Ēdīsim, dejosim un smiesimies līdz rīta gaismai!</p>
        <div class="f-boxes"><div><small>Kad</small>${invDateShort()}<br>plkst. ${T}</div><div><small>Jā vārds</small>Turaidas<br>baznīcā</div><div><small>Ballīte</small>Nītaures<br>Dzirnavās</div></div>
        <p class="f-small">Līdzi ņem labu garastāvokli un ērtas dejošanas kurpes.</p>
        <div><p class="f-rsvp">Dod ziņu līdz ${rsvpText()}, vai būsi.<br>Mums jāzina, cik lielu kūku cept!</p><p class="f-small">${C}</p></div></div></div>`;
    } else {
      html = `<div class="inv inv-cls"><div class="c-b1"><div class="c-b2">
        <div class="c-sec"><svg width="120" height="24" viewBox="0 0 120 24" fill="none" stroke="#7E6440" stroke-width="1.2" aria-hidden="true"><path d="M2 12h44"/><path d="M74 12h44"/><path d="M60 4c-4 4-4 12 0 16c4-4 4-12 0-16z"/><circle cx="52" cy="12" r="2"/><circle cx="68" cy="12" r="2"/></svg>
        <p class="c-lead">Ar prieku aicinām Jūs dalīt mūsu laimi<br>un būt kopā ar mums mūsu kāzu dienā</p></div>
        <div class="c-sec"><h1>${B}</h1><p class="c-amp">&amp;</p><h1>${G}</h1></div>
        <div class="c-sec"><p class="c-date">${invDateLong()}</p><div class="c-rule"></div><p>Laulību ceremonija plkst. ${T}<br>Turaidas baznīcā</p><p>Svinības turpināsies<br>Nītaures Dzirnavās</p></div>
        <div class="c-sec"><p class="c-small"><i>Lūdzam apstiprināt savu ierašanos līdz ${rsvpText()}</i></p><p class="c-small">${C}</p></div></div></div></div>`;
    }
    $("#invPreview").innerHTML = html;
  }
  $("#invForm").addEventListener("change", e => {
    const inp = e.target; if(!inp.dataset.k) return;
    settings[inp.dataset.k] = inp.value; renderInvitation();
    const v = inp.value === "" && inp.type === "date" ? null : inp.value;
    save(sb.from("plan_settings").update({[inp.dataset.k]: v}).eq("id", 1));
  });
  $("#invForm").addEventListener("input", e => { const inp = e.target; if(inp.dataset.k && inp.type !== "date"){ settings[inp.dataset.k] = inp.value; renderInvitation(); } });
  $("#invPrint").addEventListener("click", () => window.print());

  // ================= PĀRSKATS: nākamie uzdevumi =================
  function renderNextTasks(){
    const el = $("#nextTasks"); if(!el) return;
    if(missing.tasks || !tasks.length){ el.innerHTML = '<p class="hint">Uzdevumi parādīsies pēc atjauninājuma.</p>'; $("#sTasks").textContent = "–"; return; }
    const done = tasks.filter(t => t.done).length;
    $("#sTasks").textContent = done + " / " + tasks.length;
    const order = Object.fromEntries(PHASES.map((p,i) => [p.id, i]));
    const open = tasks.filter(t => !t.done).sort((a,b) => order[a.phase] - order[b.phase] || (a.custom - b.custom) || num(a.sort) - num(b.sort)).slice(0, 5);
    el.innerHTML = open.length ? `<ul class="nexts">${open.map(t => { const p = PHASES.find(x => x.id === t.phase); const dl = p && phaseDeadline(p); const late = dl && p.days > 0 && dl < todayNoon();
      return `<li data-id="${esc(t.id)}"><input type="checkbox" id="nx-${esc(t.id)}" aria-label="Atzīmēt kā izdarītu"><label for="nx-${esc(t.id)}">${esc(t.text)}<span class="hint">${esc(p ? p.name : "")}${dl && p.days > 0 ? " · līdz " + fmtShort(dl) : ""}${late ? ' · <span class="neg">nokavēts</span>' : ""}</span></label></li>`; }).join("")}</ul><a href="#uzdevumi" class="more">Visi uzdevumi →</a>` : '<p>Visi uzdevumi izdarīti! 🎉</p>';
  }
  $("#nextTasks").addEventListener("change", e => {
    const li = e.target.closest("li[data-id]"); if(!li) return;
    const t = tasks.find(x => x.id === li.dataset.id); if(!t) return;
    t.done = true; renderNextTasks(); renderTasks();
    save(sb.from("plan_tasks").update({done: true}).eq("id", t.id));
  });

  // ---------- loaders for new tables ----------
  function isMissingTable(error){ return error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache|Could not find/i.test(error.message || "")); }
  async function loadOpt(table, key, assign){
    const {data, error} = await sb.from(table).select("*");
    if(error){ if(isMissingTable(error)){ missing[key] = true; assign([]); return; } throw error; }
    missing[key] = false; assign(data);
  }
  const loadTasks = () => loadOpt("plan_tasks", "tasks", d => tasks = d);
  const loadTables = () => loadOpt("plan_tables", "tables", d => tables = d);
  const loadProgram = () => loadOpt("plan_program", "program", d => program = d);
  const loadTraditions = () => loadOpt("plan_traditions", "traditions", d => traditions = d);

  // ---------- keep typing safe while live updates arrive ----------
  function isEditing(sel){ const a = document.activeElement; return a && a.matches("input:not([type=checkbox]),select,textarea") && a.closest(sel); }
  document.addEventListener("focusout", () => setTimeout(() => {
    if(pending.budget && !isEditing("#budgetBody")){ pending.budget = false; renderBudget(); }
    if(pending.guests && !isEditing("#guestBody")){ pending.guests = false; renderGuests(); }
    if(pending.tasks && !isEditing("#taskList")){ pending.tasks = false; renderTasks(); }
    if(pending.seating && !isEditing("#sedvietas")){ pending.seating = false; renderSeating(); }
    if(pending.program && !isEditing("#programma")){ pending.program = false; renderProgram(); }
    renderOverview();
  }, 0));

  function autosize(root){ root.querySelectorAll("textarea.grow").forEach(t => { t.style.height = "auto"; if(t.scrollHeight) t.style.height = t.scrollHeight + "px"; }); }
  document.addEventListener("input", e => { if(e.target.matches && e.target.matches("textarea.grow")){ e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; } });
  document.addEventListener("keydown", e => { if(e.key === "Enter" && !e.shiftKey && e.target.matches && e.target.matches("textarea.grow")){ e.preventDefault(); e.target.blur(); } });
  function renderAll(){ renderOverview(); renderBudget(); renderGuests(); renderTasks(); renderSeating(); renderProgram(); renderInvitation(); renderNextTasks(); }

  // ---------- Supabase ----------
  function settingsRow(){ return {id:1, names:settings.names||"", wedding_date:settings.date||null, guests:num(settings.guests), target:num(settings.target), reserve:num(settings.reserve), uplift:num(settings.uplift)}; }
  async function loadSettings(){ const {data, error} = await sb.from("plan_settings").select("*").eq("id",1).maybeSingle(); if(error) throw error;
    settingsLoaded = true; settings = {...DEFAULTS}; if(data){ settings = {...data, names:data.names||"", date:data.wedding_date||""}; } }
  async function loadBudget(){ const {data, error} = await sb.from("plan_budget").select("*"); if(error) throw error;
    budgetLoaded = true; budget = data.map(r => ({id:r.id, cat:r.cat, item:r.item, qty:r.qty, price:r.price, perGuest:r.per_guest, uplift:r.uplift, actual:r.actual, paid:r.paid, note:r.note, range:r.range, order:r.sort})); }
  async function loadGuests(){ const {data, error} = await sb.from("plan_guests").select("*"); if(error) throw error;
    guestsLoaded = true; guests = data.map(g => ({...g, group:g.grp})); }
  const loaders = {plan_settings:loadSettings, plan_budget:loadBudget, plan_guests:loadGuests, plan_tasks:loadTasks, plan_tables:loadTables, plan_program:loadProgram, plan_traditions:loadTraditions};
  async function reload(fn){ try{ await fn(); status("Sinhronizēts"); renderAll(); } catch(e){ console.error(e); status("Kļūda: " + (e.message||e), true); } }
  function loadAll(){ return reload(async () => {
    const res = await Promise.allSettled(Object.values(loaders).map(f => f()));
    const bad = res.find(r => r.status === "rejected"); if(bad){ renderAll(); throw bad.reason; }
  }); }

  let channel = null;
  async function enterApp(session){
    $("#loginForm").hidden = true; $("#app").hidden = false;
    $("#who").textContent = session.user.email;
    showTab(); await loadAll();
    if(!channel){
      channel = sb.channel("kazu-plans");
      Object.keys(loaders).forEach(t => channel.on("postgres_changes", {event:"*", schema:"public", table:t}, () => reload(loaders[t])));
      channel.subscribe();
    }
  }
  function showLogin(){ $("#app").hidden = true; $("#loginForm").hidden = false; if(channel){ sb.removeChannel(channel); channel = null; } }

  const cfg = window.KAZU_PLAN_CONFIG || {};
  if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("TAVS-PROJEKTS") || !window.supabase){ $("#setup").hidden = false; return; }
  let url = String(cfg.SUPABASE_URL).trim(); try{ url = new URL(url).origin; }catch(e){}
  sb = window.supabase.createClient(url, String(cfg.SUPABASE_ANON_KEY).trim());

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault(); $("#lErr").textContent = ""; $("#lBtn").disabled = true;
    const {error} = await sb.auth.signInWithPassword({email:$("#lEmail").value.trim(), password:$("#lPass").value});
    $("#lBtn").disabled = false;
    if(error) $("#lErr").textContent = error.message === "Invalid login credentials" ? "Nepareizs e-pasts vai parole." : error.message;
  });
  $("#logout").addEventListener("click", () => sb.auth.signOut());
  // atjauno datus, kad lapa atkal kļūst redzama (telefonā)
  document.addEventListener("visibilitychange", () => { if(!document.hidden && !$("#app").hidden) loadAll(); });

  let entered = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if(session && !entered){ entered = true; setTimeout(() => enterApp(session), 0); }
    else if(!session){ entered = false; showLogin(); }
  });
})();
