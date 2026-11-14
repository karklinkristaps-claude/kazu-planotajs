
(function(){
  const $ = s => document.querySelector(s);
  const eur = n => (Math.round(n)).toLocaleString("lv-LV") + " €";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };

  const CATS = ["Norises vieta","Ēdināšana","Dzērieni","Tērpi un stils","Gredzeni","Foto un video","Mūzika un izklaide","Noformējums un ziedi","Ceremonija: Turaidas baznīca","Transports","Ielūgumi un drukas darbi","Nakšņošana","Medusmēnesis","Citi"];
  const STATUSES = ["Nav ielūgts","Ielūgts","Apstiprināja","Atteica"];
  const DEFAULTS = {names:"Mūsu kāzas", date:"", guests:80, target:35000, reserve:0.1, uplift:0.15};

  let sb = null, db = true, settings = {...DEFAULTS}, budget = [], guests = [];
  let settingsLoaded = false, budgetLoaded = false, guestsLoaded = false;
  const pending = {budget:false, guests:false};

  // ---------- tabs ----------
  const TABS = ["parskats","budzets","viesi"];
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
    $("#sGuests").textContent = g.yes + " / " + num(settings.guests);
    $("#sGuestsSub").textContent = "apstiprinājuši no plānotajiem · sarakstā " + g.all;
    $("#sPer").textContent = num(settings.guests) ? eur(t.total / num(settings.guests)) : "–";

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
  function renderBudget(){
    if(isEditing("#budgetBody")){ pending.budget = true; return; }
    const body = $("#budgetBody");
    if(!budgetLoaded){ return; }
    let html = "";
    const cats = [...CATS, ...[...new Set(budget.map(r => r.cat))].filter(c => !CATS.includes(c))];
    cats.forEach(cat => {
      const rows = budget.filter(r => r.cat === cat).sort((a,b) => num(a.order) - num(b.order));
      const sp = rows.reduce((s,r)=>s+planned(r),0), sa = rows.reduce((s,r)=>s+(r.actual==null||r.actual===""?0:num(r.actual)),0), spd = rows.reduce((s,r)=>s+num(r.paid),0);
      html += `<tr class="cat"><td colspan="3">${esc(cat)}</td><td class="num">${eur(sp)}</td><td class="num">${sa?eur(sa):""}</td><td class="num">${spd?eur(spd):""}</td><td colspan="2"></td></tr>`;
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
    body.innerHTML = html; autosize(body);
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
    } else if(b.dataset.act === "qty" && tr){
      save(sb.from("plan_budget").update({per_guest:false, qty:num(settings.guests)}).eq("id", tr.dataset.id));
    }
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
    if(isEditing("#guestBody")){ pending.guests = true; return; }
    if(!guestsLoaded) return;
    const q = $("#gSearch").value.trim().toLowerCase(), f = $("#gFilter").value;
    const list = guests.filter(g => (!f || (g.status || "Nav ielūgts") === f) && (!q || (g.name+" "+(g.group||"")).toLowerCase().includes(q)))
      .sort((a,b) => (a.side||"").localeCompare(b.side||"","lv") || (a.group||"").localeCompare(b.group||"","lv") || (a.name||"").localeCompare(b.name||"","lv"));
    if(!guests.length){ $("#guestBody").innerHTML = `<tr><td colspan="9" class="empty">Sarakstā vēl nav neviena viesa. Pievieno pirmo ar formu augstāk.</td></tr>`; return; }
    if(!list.length){ $("#guestBody").innerHTML = `<tr><td colspan="9" class="empty">Neviens viesis neatbilst meklēšanai.</td></tr>`; return; }
    const opt = (arr, v) => arr.map(o => `<option${o===v?" selected":""}>${o}</option>`).join("");
    $("#guestBody").innerHTML = list.map(g => `<tr data-id="${esc(g.id)}">
      <td><input data-f="name" value="${esc(g.name)}" style="min-width:160px" aria-label="Vārds"></td>
      <td><select data-f="side" aria-label="Puse">${opt(["Līgavas","Līgavaiņa","Kopīgie"], g.side)}</select></td>
      <td><input data-f="group" value="${esc(g.group)}" list="groups" style="min-width:110px" aria-label="Grupa"></td>
      <td class="num"><input data-f="count" type="number" min="1" step="1" value="${esc(g.count||1)}" style="width:60px" aria-label="Personas"></td>
      <td><select data-f="status" aria-label="Statuss">${opt(STATUSES, g.status || "Nav ielūgts")}</select></td>
      <td><input data-f="diet" value="${esc(g.diet)}" placeholder="–" style="min-width:120px" aria-label="Ēdiena piezīmes"></td>
      <td><input data-f="stay" type="checkbox" ${g.stay?"checked":""} aria-label="Nakšņo"></td>
      <td><textarea class="grow" rows="1" data-f="note" style="min-width:180px" aria-label="Piezīmes">${esc(g.note)}</textarea></td>
      <td><button class="del" data-act="del" title="Dzēst viesi">Dzēst</button></td></tr>`).join("");
    autosize($("#guestBody"));
  }
  $("#gSearch").addEventListener("input", renderGuests);
  $("#gFilter").addEventListener("change", renderGuests);
  $("#guestForm").addEventListener("submit", e => {
    e.preventDefault(); if(!db) return;
    const name = $("#gName").value.trim(); if(!name) return;
    save(sb.from("plan_guests").insert({name, side:$("#gSide").value, grp:$("#gGroup").value.trim(), count:Math.max(1, num($("#gCount").value)||1), status:"Nav ielūgts", diet:"", stay:false, note:""}));
    $("#gName").value = ""; $("#gCount").value = 1; $("#gName").focus();
  });
  $("#guestBody").addEventListener("change", e => {
    const inp = e.target, tr = inp.closest("tr[data-id]"); if(!tr || !inp.dataset.f || !db) return;
    const g = guests.find(x => x.id === tr.dataset.id); if(!g) return;
    let v = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? Math.max(1, num(inp.value)||1) : inp.value;
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

  // ---------- keep typing safe while live updates arrive ----------
  function isEditing(sel){ const a = document.activeElement; return a && a.matches("input:not([type=checkbox]),select,textarea") && a.closest(sel); }
  document.addEventListener("focusout", () => setTimeout(() => {
    if(pending.budget && !isEditing("#budgetBody")){ pending.budget = false; renderBudget(); }
    if(pending.guests && !isEditing("#guestBody")){ pending.guests = false; renderGuests(); }
    renderOverview();
  }, 0));

  function autosize(root){ root.querySelectorAll("textarea.grow").forEach(t => { t.style.height = "auto"; if(t.scrollHeight) t.style.height = t.scrollHeight + "px"; }); }
  document.addEventListener("input", e => { if(e.target.matches && e.target.matches("textarea.grow")){ e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; } });
  document.addEventListener("keydown", e => { if(e.key === "Enter" && !e.shiftKey && e.target.matches && e.target.matches("textarea.grow")){ e.preventDefault(); e.target.blur(); } });
  function renderAll(){ renderOverview(); renderBudget(); renderGuests(); }

  // ---------- Supabase ----------
  function settingsRow(){ return {id:1, names:settings.names||"", wedding_date:settings.date||null, guests:num(settings.guests), target:num(settings.target), reserve:num(settings.reserve), uplift:num(settings.uplift)}; }
  async function loadSettings(){ const {data, error} = await sb.from("plan_settings").select("*").eq("id",1).maybeSingle(); if(error) throw error;
    settingsLoaded = true; settings = {...DEFAULTS}; if(data){ settings = {names:data.names||"", date:data.wedding_date||"", guests:data.guests, target:data.target, reserve:data.reserve, uplift:data.uplift}; } }
  async function loadBudget(){ const {data, error} = await sb.from("plan_budget").select("*"); if(error) throw error;
    budgetLoaded = true; budget = data.map(r => ({id:r.id, cat:r.cat, item:r.item, qty:r.qty, price:r.price, perGuest:r.per_guest, uplift:r.uplift, actual:r.actual, paid:r.paid, note:r.note, range:r.range, order:r.sort})); }
  async function loadGuests(){ const {data, error} = await sb.from("plan_guests").select("*"); if(error) throw error;
    guestsLoaded = true; guests = data.map(g => ({...g, group:g.grp})); }
  const loaders = {plan_settings:loadSettings, plan_budget:loadBudget, plan_guests:loadGuests};
  async function reload(fn){ try{ await fn(); status("Sinhronizēts"); renderAll(); } catch(e){ console.error(e); status("Kļūda: " + (e.message||e), true); } }
  function loadAll(){ return reload(async () => { await Promise.all([loadSettings(), loadBudget(), loadGuests()]); }); }

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
