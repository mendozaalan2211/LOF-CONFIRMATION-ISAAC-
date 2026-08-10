import React, { useState, useEffect, useMemo } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { SEED_STUDENTS, SEED_COACHES, DEFAULT_STAGES } from "./seedData.js";

// ============================================================
//  LOF - Lifestyle of Freedom - Coaches Dashboard
//  Freedom en Espanol
//
//  Version PUBLICA con Supabase: todos los coaches comparten
//  los mismos datos en vivo. Se guarda en la nube (Supabase).
//  Admin (PIN) maneja etapas y estudiantes (agregar/editar/quitar/estado).
// ============================================================

// ---- Admin PIN (cambialo por el tuyo) ----
const ADMIN_PIN = "1234";

// ------------------------------------------------------------
//  Almacenamiento en Supabase
//  Guardamos TODO el estado (students + stages) como un solo
//  registro en la tabla 'app_state', fila id = 1.
// ------------------------------------------------------------
const STATE_ID = 1;

async function loadState() {
  const { data, error } = await supabase
    .from("app_state").select("data").eq("id", STATE_ID).single();
  if (error) { console.warn("load:", error.message); return null; }
  return data ? data.data : null;
}
async function saveState(state) {
  const { error } = await supabase
    .from("app_state").upsert({ id: STATE_ID, data: state });
  if (error) { console.error("save:", error.message); return false; }
  return true;
}

// ------------------------------------------------------------
//  Fechas
// ------------------------------------------------------------
function isoOf(d) { const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10); }
function todayISO() { return isoOf(new Date()); }
function prettyDate(iso) {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[parseInt(m)-1] + " " + parseInt(d);
}
function lastWeeks(n) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7); arr.push(isoOf(d)); }
  return arr;
}
// Sunday ISO date for a given course week number (1-based)
function weekDateISO(weekNum) {
  const [y, m, d] = COURSE_START.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  return isoOf(start);
}
// Which course week is "today" closest to (1..COURSE_WEEKS), for default selection
function currentWeekNum() {
  const [y, m, d] = COURSE_START.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const wk = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(wk, 1), COURSE_WEEKS);
}

// ============================================================
//  App
// ============================================================
export default function LOFDashboard() {
  const [students, setStudents] = useState(null);
  const [stages, setStages] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [coachSel, setCoachSel] = useState("Overview");
  const [date, setDate] = useState(todayISO());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [connError, setConnError] = useState(false);

  // Cargar de Supabase al abrir + refrescar cada 15s para ver cambios de otros
  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!supabaseConfigured) { setConnError(true); return; }
      const state = await loadState();
      if (!alive) return;
      if (state && state.students) {
        setStudents(state.students);
        setStages(state.stages && state.stages.length ? state.stages : DEFAULT_STAGES);
      } else {
        // primera vez: sembrar datos reales
        const seed = { students: SEED_STUDENTS, stages: DEFAULT_STAGES };
        setStudents(seed.students); setStages(seed.stages);
        await saveState(seed);
      }
    }
    boot();

    // Realtime: escuchar cambios en la fila
    const channel = supabase
      .channel("app_state_changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "app_state", filter: "id=eq." + STATE_ID },
        (payload) => {
          if (payload.new && payload.new.data) {
            setStudents(payload.new.data.students);
            setStages(payload.new.data.stages || DEFAULT_STAGES);
          }
        })
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  async function persist(nextStudents, nextStages) {
    const s = nextStudents !== undefined ? nextStudents : students;
    const st = nextStages !== undefined ? nextStages : stages;
    setStudents(s); setStages(st);
    setSaving(true);
    const good = await saveState({ students: s, stages: st });
    setSaving(false);
    if (good) { setOk(true); setTimeout(() => setOk(false), 1200); }
  }

  function toggleStep(id, step) {
    persist(students.map((e) => e.id === id ? { ...e, steps: { ...e.steps, [step]: !e.steps[step] } } : e));
  }
  function toggleAttendance(id) {
    persist(students.map((e) => e.id === id ? { ...e, attendance: { ...e.attendance, [date]: !e.attendance[date] } } : e));
  }
  function toggleConfirmed(id) {
    persist(students.map((e) => e.id === id ? { ...e, confirmed: { ...(e.confirmed || {}), [date]: !((e.confirmed || {})[date]) } } : e));
  }
  function addStage(name) {
    const clean = name.trim(); if (!clean || stages.includes(clean)) return;
    persist(undefined, [...stages, clean]);
  }
  function removeStage(name) {
    const nextStages = stages.filter((s) => s !== name);
    const nextStudents = students.map((e) => { const s = { ...e.steps }; delete s[name]; return { ...e, steps: s }; });
    persist(nextStudents, nextStages);
  }
  function addStudent(data) {
    const name = (data.name || "").trim(); if (!name || !data.coach) return;
    const id = (students.reduce((m, e) => Math.max(m, e.id), 0) || 0) + 1;
    persist([...students, {
      id, name, phone: (data.phone||"").trim(), ffg: (data.ffg||"").trim(),
      age: data.age ? parseInt(data.age) : "", coach: data.coach, active: true, steps: {}, attendance: {}
    }]);
  }
  function updateStudent(id, data) {
    persist(students.map((e) => e.id === id ? {
      ...e, name: (data.name||"").trim() || e.name, phone: (data.phone||"").trim(),
      ffg: (data.ffg||"").trim(), age: data.age !== "" ? parseInt(data.age) : "", coach: data.coach || e.coach
    } : e));
  }
  function removeStudent(id) { persist(students.filter((e) => e.id !== id)); }
  function toggleActive(id) {
    persist(students.map((e) => e.id === id ? { ...e, active: e.active === false ? true : false } : e));
  }

  const coaches = useMemo(() => {
    if (!students) return [];
    return Array.from(new Set([...SEED_COACHES, ...students.map((e) => e.coach)]));
  }, [students]);

  function statsCoach(coach) {
    const group = students.filter((e) => e.coach === coach && e.active !== false);
    const total = group.length;
    const present = group.filter((e) => e.attendance[date]).length;
    const confirmed = group.filter((e) => (e.confirmed || {})[date]).length;
    const attPct = total ? Math.round((present / total) * 100) : 0;
    const byStage = {};
    stages.forEach((st) => { byStage[st] = group.filter((e) => e.steps[st]).length; });
    const complete = group.filter((e) => stages.length > 0 && stages.every((st) => e.steps[st])).length;
    const totalBoxes = total * stages.length;
    const filled = group.reduce((sum, e) => sum + stages.filter((st) => e.steps[st]).length, 0);
    const progPct = totalBoxes ? Math.round((filled / totalBoxes) * 100) : 0;
    return { total, present, confirmed, attPct, byStage, complete, progPct };
  }

  const totals = useMemo(() => {
    if (!students || !stages) return null;
    const act = students.filter((e) => e.active !== false);
    const total = act.length;
    const present = act.filter((e) => e.attendance[date]).length;
    const confirmed = act.filter((e) => (e.confirmed || {})[date]).length;
    const complete = act.filter((e) => stages.length > 0 && stages.every((st) => e.steps[st])).length;
    const byStage = {};
    stages.forEach((st) => { byStage[st] = act.filter((e) => e.steps[st]).length; });
    const totalBoxes = total * stages.length;
    const filled = act.reduce((sum, e) => sum + stages.filter((st) => e.steps[st]).length, 0);
    const progPct = totalBoxes ? Math.round((filled / totalBoxes) * 100) : 0;
    return { total, present, confirmed, attPct: total ? Math.round(present/total*100) : 0, complete, byStage, progPct };
  }, [students, stages, date]);

  const history = useMemo(() => {
    if (!students) return [];
    const weeks = lastWeeks(12);
    const act = students.filter((e) => e.active !== false);
    const total = act.length || 1;
    return weeks.map((iso) => {
      const present = act.filter((e) => e.attendance[iso]).length;
      return { iso, present, pct: Math.round((present / total) * 100) };
    });
  }, [students]);

  const searchResults = useMemo(() => {
    if (!students || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return students.filter((e) =>
      e.name.toLowerCase().includes(q) || e.coach.toLowerCase().includes(q) ||
      (e.ffg || "").toLowerCase().includes(q) || (e.phone || "").includes(q)
    ).slice(0, 15);
  }, [students, search]);

  // ----- Estados de error / carga -----
  if (connError) {
    return (
      <div style={S.loadingWrap}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 460, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#9888;&#65039;</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Falta conectar Supabase</div>
          <div style={{ fontSize: 14, color: MUTE, lineHeight: 1.6 }}>
            Abre el archivo <b>src/supabaseClient.js</b> y pega tus dos claves de Supabase.
            Revisa la GUIA (paso 2) que viene con el proyecto.
          </div>
        </div>
      </div>
    );
  }
  if (!students || !stages) {
    return (
      <div style={S.loadingWrap}>
        <style>{CSS}</style>
        <div style={S.loadingDot} />
        <span style={S.loadingText}>Loading data...</span>
      </div>
    );
  }

  const inOverview = coachSel === "Overview";
  const inWeeks = coachSel === "Weeks";

  return (
    <div style={S.shell}>
      <style>{CSS}</style>

      <aside className={"lof-sidebar" + (sidebarOpen ? " open" : "")} style={S.sidebar}>
        <div style={S.brandRow}>
          <div style={S.mark}>LOF</div>
          <div>
            <div style={S.brandTitle}>LOF Panel</div>
            <div style={S.brandSub}>Lifestyle of Freedom</div>
          </div>
        </div>

        <button style={{ ...S.navItem, ...(inOverview ? S.navItemOn : {}) }}
          onClick={() => { setCoachSel("Overview"); setSidebarOpen(false); }}>
          <span style={S.navIcon}>&#9638;</span> Overview
        </button>

        <button style={{ ...S.navItem, ...(coachSel === "Weeks" ? S.navItemOn : {}) }}
          onClick={() => { setCoachSel("Weeks"); setSidebarOpen(false); }}>
          <span style={S.navIcon}>&#128197;</span> Weeks
        </button>

        <div style={S.navLabel}>{coaches.length} COACHES</div>
        <div style={S.navScroll}>
          {coaches.map((c) => (
            <button key={c} style={{ ...S.navItem, ...(coachSel === c ? S.navItemOn : {}) }}
              onClick={() => { setCoachSel(c); setSidebarOpen(false); }}>
              <span style={S.navDot} /> {c}
            </button>
          ))}
        </div>

        <button style={S.adminBtn} onClick={() => { setAdminOpen(true); setSidebarOpen(false); }}>
          <span style={{ fontSize: 13 }}>&#9881;</span> Admin
        </button>
      </aside>

      {sidebarOpen && <div style={S.backdrop} onClick={() => setSidebarOpen(false)} />}

      <main className="lof-main" style={S.main}>
        <div style={S.topbar}>
          <button className="lof-burger" style={S.burger} onClick={() => setSidebarOpen(true)}>&#9776;</button>
          <div>
            <h1 style={S.h1}>{inOverview ? "Dashboard" : inWeeks ? "Weekly attendance" : coachSel}</h1>
            <div style={S.live}><span style={S.liveDot} /> Live</div>
          </div>
          <div style={S.topRight}>
            <input type="date" style={S.date} value={date} onChange={(e) => setDate(e.target.value)} />
            <div style={S.saveState}>
              {saving ? <span style={S.saving}>Saving...</span>
                : ok ? <span style={S.saved}>&#10003; Saved</span>
                : <span style={S.savedIdle}>Auto-saves</span>}
            </div>
          </div>
        </div>

        <div style={S.searchWrap}>
          <span style={S.searchIcon}>&#128269;</span>
          <input style={S.searchInput} placeholder="Search student, coach, FFG or phone..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button style={S.searchClear} onClick={() => setSearch("")}>&times;</button>}
        </div>

        {search.trim() ? (
          <SearchView results={searchResults} stages={stages} date={date} onCoach={(c) => { setCoachSel(c); setSearch(""); }} />
        ) : inWeeks ? (
          <WeeksView students={students} coaches={coaches} />
        ) : inOverview ? (
          <OverviewView totals={totals} coaches={coaches} statsCoach={statsCoach} stages={stages} date={date} history={history} onCoach={setCoachSel} />
        ) : (
          <CoachView coach={coachSel} students={students.filter((e) => e.coach === coachSel)}
            stats={statsCoach(coachSel)} stages={stages} date={date} toggleStep={toggleStep} toggleAttendance={toggleAttendance} />
        )}
      </main>

      {adminOpen && (
        <AdminModal
          stages={stages} coaches={coaches} students={students}
          onAddStage={addStage} onRemoveStage={removeStage}
          onAddStudent={addStudent} onUpdateStudent={updateStudent} onRemoveStudent={removeStudent} onToggleActive={toggleActive}
          onClose={() => setAdminOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================
//  Overview
// ============================================================
function OverviewView({ totals, coaches, statsCoach, stages, date, history, onCoach }) {
  const shown = stages.slice(0, 3);
  const maxPct = Math.max(10, ...history.map((h) => h.pct));
  const rankedCoaches = coaches.map((c) => ({ c, s: statsCoach(c) })).sort((a, b) => b.s.attPct - a.s.attPct);

  return (
    <>
      <div className="lof-progressbanner" style={S.progressBanner}>
        <div className="lof-pbleft" style={S.pbLeft}>
          <div style={S.pbLabel}>Overall ministry progress</div>
          <div style={S.pbValue}>{totals.progPct}<span style={S.pbPct}>%</span></div>
          <div style={S.pbSub}>{totals.complete} of {totals.total} students fully complete</div>
        </div>
        <div style={S.pbBarWrap}>
          <div style={S.pbBarTrack}><div style={{ ...S.pbBarFill, width: totals.progPct + "%" }} /></div>
          <div style={S.pbStages}>
            {stages.map((st) => {
              const pct = totals.total ? Math.round((totals.byStage[st] / totals.total) * 100) : 0;
              return (
                <div key={st} style={S.pbStage}>
                  <div style={S.pbStageTop}><span>{st}</span><span style={{ color: GOLD }}>{pct}%</span></div>
                  <div style={S.pbStageTrack}><div style={{ ...S.pbStageFill, width: pct + "%" }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lof-cards" style={S.cards}>
        <SummaryCard tag="TOTAL" dark
          a={{ n: totals.total, l: "Students" }}
          b={{ n: totals.present, l: "Present today", c: "#6ee7a8" }}
          c={{ n: totals.attPct + "%", l: "Attendance", c: GOLD }}
          d={{ n: totals.complete, l: "Fully complete", c: GOLD }} />
        {shown.map((st, i) => {
          const colors = ["#111", "#2563eb", GOLD];
          const bgs = [null, "#eff4ff", GOLD_SOFT];
          return <MiniCard key={st} tag={st} tagColor={colors[i]} tagBg={bgs[i]} value={totals.byStage[st]} total={totals.total} />;
        })}
      </div>

      <div style={S.tableCard}>
        <div style={S.tableHead}>
          <span style={S.tableTitle}>Coach breakdown</span>
          <span style={S.tableSub}>&middot; {prettyDate(date)} &middot; ranked by attendance</span>
        </div>
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.thLeft }}>Coach</th>
                <th style={S.th}>Students</th>
                {stages.map((st) => <th key={st} style={S.th}>{st}</th>)}
                <th style={S.th}>Present</th>
                <th style={S.th}>Att.%</th>
                <th style={S.th}>Complete</th>
              </tr>
            </thead>
            <tbody>
              {rankedCoaches.map(({ c, s }) => (
                <tr key={c} style={S.tr} onClick={() => onCoach(c)}>
                  <td style={{ ...S.td, ...S.tdName }}>{c}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{s.total}</td>
                  {stages.map((st) => (
                    <td key={st} style={{ ...S.td, color: s.byStage[st] ? GOLD : MUTE }}>{s.byStage[st]}</td>
                  ))}
                  <td style={{ ...S.td, color: s.present ? "#6ee7a8" : MUTE }}>{s.present}</td>
                  <td style={{ ...S.td, color: pctColor(s.attPct) }}>{s.attPct}%</td>
                  <td style={{ ...S.td, fontWeight: 700, color: s.complete ? "#6ee7a8" : MUTE }}>{s.complete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={S.hint}>Tap a coach to view and edit their students.</div>
    </>
  );
}

function WeeksView({ students, coaches }) {
  const [week, setWeek] = useState(currentWeekNum());
  const iso = weekDateISO(week);

  const act = students.filter((e) => e.active !== false);

  const rows = coaches.map((c) => {
    const group = act.filter((e) => e.coach === c);
    const total = group.length;
    const present = group.filter((e) => e.attendance[iso]).length;
    const pct = total ? Math.round((present / total) * 100) : 0;
    return { coach: c, present, total, pct };
  });

  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalStudents = rows.reduce((s, r) => s + r.total, 0);
  const totalPct = totalStudents ? Math.round((totalPresent / totalStudents) * 100) : 0;

  const weekNums = [];
  for (let i = 1; i <= COURSE_WEEKS; i++) weekNums.push(i);

  return (
    <>
      <div style={S.weekBar}>
        {weekNums.map((w) => (
          <button key={w}
            onClick={() => setWeek(w)}
            style={{ ...S.weekChip, ...(w === week ? S.weekChipOn : {}) }}>
            {w}
          </button>
        ))}
      </div>
      <div style={S.weekMeta}>Week {week} of {COURSE_WEEKS} &middot; Sunday {prettyDate(iso)}</div>

      <div style={S.weekTotalCard}>
        <div>
          <div style={S.weekTotalLabel}>Total present this Sunday</div>
          <div style={S.weekTotalValue}>{totalPresent}<span style={S.weekTotalOf}> / {totalStudents}</span></div>
        </div>
        <div style={S.weekTotalPct}>{totalPct}%</div>
      </div>

      <div style={S.tableCard}>
        <div style={S.tableHead}>
          <span style={S.tableTitle}>Attendance by coach</span>
          <span style={S.tableSub}>&middot; Week {week}</span>
        </div>
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.thLeft }}>Coach</th>
                <th style={S.th}>Present</th>
                <th style={S.th}>Students</th>
                <th style={S.th}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.coach}>
                  <td style={{ ...S.td, ...S.tdName }}>{r.coach}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: r.present ? "#6ee7a8" : MUTE }}>{r.present}</td>
                  <td style={S.td}>{r.total}</td>
                  <td style={{ ...S.td, color: pctColor(r.pct) }}>{r.pct}%</td>
                </tr>
              ))}
              <tr style={S.weekTotalRow}>
                <td style={{ ...S.td, ...S.tdName, fontWeight: 800 }}>TOTAL</td>
                <td style={{ ...S.td, fontWeight: 800, color: "#6ee7a8" }}>{totalPresent}</td>
                <td style={{ ...S.td, fontWeight: 800 }}>{totalStudents}</td>
                <td style={{ ...S.td, fontWeight: 800, color: GOLD }}>{totalPct}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div style={S.hint}>Mark attendance from each coach's Check-in tab. Numbers here update live.</div>
    </>
  );
}

function StudentInfo({ e }) {
  return (
    <div style={S.infoRow}>
      {e.phone ? <a href={"tel:" + e.phone} style={S.infoChip} onClick={(ev) => ev.stopPropagation()}>&#128222; {e.phone}</a> : null}
      {e.age !== "" && e.age != null ? <span style={S.infoChip}>&#127874; {e.age} yrs</span> : null}
      {e.ffg ? <span style={S.infoChip}>&#128101; FFG: {e.ffg}</span> : null}
    </div>
  );
}

function SearchView({ results, stages, date, onCoach }) {
  return (
    <div>
      <div style={S.searchCount}>{results.length} result{results.length === 1 ? "" : "s"}</div>
      {results.length === 0 && <div style={S.empty}>No students found. Try another name, FFG or phone.</div>}
      <div style={S.list}>
        {results.map((e) => {
          const done = stages.filter((st) => e.steps[st]).length;
          const present = !!e.attendance[date];
          return (
            <div key={e.id} style={S.card}>
              <div style={S.cardHead}>
                <div>
                  <div style={S.name}>{e.name}</div>
                  <button style={S.coachLink} onClick={() => onCoach(e.coach)}>{e.coach} &rsaquo;</button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {present && <span style={S.presentTag}>&#10003; Present</span>}
                  <div style={S.progress}>{done}/{stages.length}</div>
                </div>
              </div>
              <StudentInfo e={e} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachView({ coach, students, stats, stages, date, toggleStep, toggleAttendance }) {
  const [tab, setTab] = useState("progress");
  const [presentOnly, setPresentOnly] = useState(false);
  return (
    <>
      <div className="lof-coachstats" style={S.coachStats}>
        <Stat n={stats.total} l="Students" />
        <Stat n={stats.present} l={"Present . " + prettyDate(date)} c="#6ee7a8" />
        <Stat n={stats.progPct + "%"} l="Progress" c={GOLD} />
      </div>

      <div style={S.tabsRow}>
        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(tab === "progress" ? S.tabOn : {}) }} onClick={() => setTab("progress")}>Progress</button>
          <button style={{ ...S.tab, ...(tab === "checkin" ? S.tabOn : {}) }} onClick={() => setTab("checkin")}>Check-in</button>
        </div>
        {tab === "checkin" && (
          <button
            onClick={() => setPresentOnly(!presentOnly)}
            style={{ ...S.filterBtn, ...(presentOnly ? S.filterBtnOn : {}) }}>
            {presentOnly ? "\u2713 Present only" : "Show present only"}
          </button>
        )}
      </div>

      {students.length === 0 && <div style={S.empty}>No students yet for this coach. Add them from the Admin panel.</div>}

      <div style={S.list}>
        {students
          .filter((e) => !(presentOnly && tab === "checkin") || e.attendance[date])
          .map((e) => {
          const done = stages.filter((st) => e.steps[st]).length;
          const present = !!e.attendance[date];
          const inactive = e.active === false;
          return (
            <div key={e.id} style={{ ...S.card, ...(inactive ? S.cardInactive : {}) }}>
              <div style={S.cardHead}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={S.name}>{e.name}</div>
                  {inactive && <span style={S.inactiveBadge}>Inactive</span>}
                </div>
                {inactive ? null : tab === "progress" ? (
                  <div style={S.progress}>{done}/{stages.length}</div>
                ) : (
                  <button onClick={() => toggleAttendance(e.id)} style={{ ...S.attBtn, ...(present ? S.attOn : {}) }}>
                    {present ? "\u2713 Present" : "Mark present"}
                  </button>
                )}
              </div>
              <StudentInfo e={e} />
              {tab === "progress" && !inactive && (
                <div style={S.steps}>
                  {stages.map((st) => {
                    const on = !!e.steps[st];
                    return (
                      <button key={st} onClick={() => toggleStep(e.id, st)} style={{ ...S.step, ...(on ? S.stepOn : {}) }}>
                        <span style={{ ...S.check, ...(on ? S.checkOn : {}) }}>{on ? "\u2713" : ""}</span>
                        {st}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminModal({ stages, coaches, students, onAddStage, onRemoveStage, onAddStudent, onUpdateStudent, onRemoveStudent, onToggleActive, onClose }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState("stages");
  const [newStage, setNewStage] = useState("");
  const emptyForm = { name: "", phone: "", ffg: "", age: "", coach: coaches[0] || "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [manageCoach, setManageCoach] = useState(coaches[0] || "");

  function tryUnlock() {
    if (pin === ADMIN_PIN) { setUnlocked(true); setErr(false); }
    else { setErr(true); setPin(""); }
  }
  function startEdit(e) {
    setEditId(e.id);
    setEditForm({ name: e.name, phone: e.phone || "", ffg: e.ffg || "", age: e.age === "" || e.age == null ? "" : String(e.age), coach: e.coach });
  }
  function saveEdit() { onUpdateStudent(editId, editForm); setEditId(null); }
  const coachStudents = students.filter((e) => e.coach === manageCoach);

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={S.modalTitle}>Admin</div>
            <div style={S.modalSub}>Manage stages and students</div>
          </div>
          <button style={S.close} onClick={onClose}>&times;</button>
        </div>

        {!unlocked ? (
          <div style={S.pinWrap}>
            <div style={S.pinLabel}>Enter admin PIN</div>
            <input type="password" inputMode="numeric" style={{ ...S.pinInput, ...(err ? S.pinErr : {}) }}
              value={pin} onChange={(e) => { setPin(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()} placeholder="****" autoFocus />
            {err && <div style={S.pinErrText}>Wrong PIN. Try again.</div>}
            <button style={S.pinBtn} onClick={tryUnlock}>Unlock</button>
            <div style={S.pinHint}>Only you have this PIN. Coaches can't edit here.</div>
          </div>
        ) : (
          <div>
            <div style={S.adminTabs}>
              <button style={{ ...S.adminTab, ...(tab === "stages" ? S.adminTabOn : {}) }} onClick={() => { setTab("stages"); setEditId(null); }}>Stages</button>
              <button style={{ ...S.adminTab, ...(tab === "students" ? S.adminTabOn : {}) }} onClick={() => setTab("students")}>Students</button>
            </div>

            {tab === "stages" ? (
              <div>
                <div style={S.adminSection}>Current stages</div>
                <div style={S.stageList}>
                  {stages.length === 0 && <div style={S.stageEmpty}>No stages yet. Add one below.</div>}
                  {stages.map((st) => (
                    <div key={st} style={S.stageRow}>
                      <span>{st}</span>
                      <button style={S.stageDel} onClick={() => onRemoveStage(st)}>Remove</button>
                    </div>
                  ))}
                </div>
                <div style={S.adminSection}>Add a stage</div>
                <div style={S.addRow}>
                  <input style={S.addInput} value={newStage} onChange={(e) => setNewStage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { onAddStage(newStage); setNewStage(""); } }}
                    placeholder="e.g. Serving, Leader, Connected..." />
                  <button style={S.addBtn} onClick={() => { onAddStage(newStage); setNewStage(""); }}>Add</button>
                </div>
              </div>
            ) : editId ? (
              <div>
                <div style={S.adminSection}>Edit student</div>
                <div className="lof-formgrid" style={S.formGrid}>
                  <input style={S.formInput} placeholder="Full name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <input style={S.formInput} placeholder="Phone number" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  <input style={S.formInput} placeholder="FFG (who invited them)" value={editForm.ffg} onChange={(e) => setEditForm({ ...editForm, ffg: e.target.value })} />
                  <input style={S.formInput} type="number" placeholder="Age" value={editForm.age} onChange={(e) => setEditForm({ ...editForm, age: e.target.value })} />
                  <select style={S.formInput} value={editForm.coach} onChange={(e) => setEditForm({ ...editForm, coach: e.target.value })}>
                    {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={S.formActions}>
                  <button style={S.cancelBtn} onClick={() => setEditId(null)}>Cancel</button>
                  <button style={S.addBtn} onClick={saveEdit}>Save changes</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={S.adminSection}>Add a student</div>
                <div className="lof-formgrid" style={S.formGrid}>
                  <input style={S.formInput} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input style={S.formInput} placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <input style={S.formInput} placeholder="FFG (who invited them)" value={form.ffg} onChange={(e) => setForm({ ...form, ffg: e.target.value })} />
                  <input style={S.formInput} type="number" placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                  <select style={S.formInput} value={form.coach} onChange={(e) => setForm({ ...form, coach: e.target.value })}>
                    {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button style={{ ...S.addBtn, width: "100%", marginTop: 10 }}
                  onClick={() => { onAddStudent(form); setForm({ ...emptyForm, coach: form.coach }); }}>Add student</button>

                <div style={S.adminSection}>Manage students by coach</div>
                <select style={{ ...S.formInput, width: "100%", marginBottom: 10 }} value={manageCoach} onChange={(e) => setManageCoach(e.target.value)}>
                  {coaches.map((c) => <option key={c} value={c}>{c} ({students.filter((s) => s.coach === c).length})</option>)}
                </select>
                <div style={{ ...S.stageList, maxHeight: 240, overflowY: "auto" }}>
                  {coachStudents.length === 0 && <div style={S.stageEmpty}>No students for this coach yet.</div>}
                  {coachStudents.map((e) => (
                    <div key={e.id} style={S.stageRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{e.name}</div>
                        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {[e.phone, e.age !== "" && e.age != null ? e.age + " yrs" : "", e.ffg ? "FFG: " + e.ffg : ""].filter(Boolean).join("  .  ")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                        <button style={{ ...S.toggleBtn, ...(e.active === false ? S.toggleOff : S.toggleOn) }} onClick={() => onToggleActive(e.id)}>
                          {e.active === false ? "Inactive" : "Active"}
                        </button>
                        <button style={S.editBtn} onClick={() => startEdit(e)}>Edit</button>
                        <button style={S.stageDel} onClick={() => onRemoveStudent(e.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={S.pinHint}>Changes save automatically and apply for everyone.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ tag, dark, a, b, c, d }) {
  return (
    <div style={{ ...S.summaryCard, ...(dark ? S.summaryDark : {}) }}>
      <div style={{ ...S.pill, ...(dark ? S.pillDark : {}) }}>{tag}</div>
      <div style={S.summaryGrid}>
        <Cell {...a} dark={dark} /><Cell {...b} dark={dark} />
        <Cell {...c} dark={dark} /><Cell {...d} dark={dark} />
      </div>
    </div>
  );
}
function Cell({ n, l, c, dark }) {
  return (
    <div>
      <div style={{ ...S.cellN, color: c || (dark ? "#fff" : "#111") }}>{n}</div>
      <div style={{ ...S.cellL, color: dark ? "rgba(255,255,255,.55)" : "#888" }}>{l}</div>
    </div>
  );
}
function MiniCard({ tag, tagColor, tagBg, value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={S.miniCard}>
      <div style={{ ...S.pill, background: tagBg || "#111", color: tagBg ? tagColor : "#fff" }}>{tag}</div>
      <div style={S.miniValue}>{value}</div>
      <div style={S.miniLabel}>of {total} &middot; {pct}%</div>
      <div style={S.bar}><div style={{ ...S.barFill, width: pct + "%" }} /></div>
    </div>
  );
}
function Stat({ n, l, c }) {
  return (
    <div style={S.statBox}>
      <div style={{ ...S.statN, color: c || "#fff" }}>{n}</div>
      <div style={S.statL}>{l}</div>
    </div>
  );
}
function pctColor(p) {
  if (p >= 70) return "#6ee7a8";
  if (p >= 40) return GOLD;
  if (p > 0) return "#f59e6b";
  return "rgba(245,245,244,0.35)";
}

const GOLD = "#C8A24B";
const GOLD_SOFT = "rgba(200,162,75,0.14)";
const BG = "#0A0A0B";
const PANEL = "#141416";
const SIDEBAR = "#0E0E10";
const LINE = "rgba(255,255,255,0.08)";
const TXT = "#F5F5F4";
const MUTE = "rgba(245,245,244,0.5)";

const CSS = "* { box-sizing: border-box; margin: 0; padding: 0; }"
  + " body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }"
  + " ::selection { background: " + GOLD + "; color: #000; }"
  + " input:focus, select:focus, button:focus-visible { outline: 2px solid " + GOLD + "; outline-offset: 2px; }"
  + " @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }"
  + " @keyframes fadein { from{opacity:0; transform: translateY(8px)} to{opacity:1; transform:none} }"
  + " @keyframes grow { from{transform: scaleY(0); transform-origin: bottom} to{transform: scaleY(1)} }"
  + " ::-webkit-scrollbar { width: 8px; height: 8px; }"
  + " ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }"
  + " a { text-decoration: none; }"
  + " @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }"
  + " @media (max-width: 900px) { .lof-progressbanner { grid-template-columns: 1fr !important; } .lof-pbleft { border-right: none !important; padding-right: 0 !important; } }"
  + " @media (max-width: 860px) {"
  + "   .lof-sidebar { position: fixed !important; left: 0; top: 0; z-index: 50; transform: translateX(-100%); transition: transform .22s ease; }"
  + "   .lof-sidebar.open { transform: translateX(0); }"
  + "   .lof-burger { display: flex !important; }"
  + "   .lof-cards { grid-template-columns: 1fr 1fr !important; }"
  + "   .lof-coachstats { grid-template-columns: 1fr 1fr !important; }"
  + "   .lof-main { padding: 18px 16px 60px !important; }"
  + " }"
  + " @media (max-width: 520px) { .lof-cards { grid-template-columns: 1fr !important; } .lof-formgrid { grid-template-columns: 1fr !important; } }";

const S = {
  shell: { display: "flex", minHeight: "100vh", background: BG, color: TXT, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" },
  loadingWrap: { minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: TXT, fontFamily: "'Inter', system-ui, sans-serif" },
  loadingDot: { width: 10, height: 10, borderRadius: 999, background: GOLD, animation: "pulse 1s infinite" },
  loadingText: { color: MUTE, fontSize: 15 },
  sidebar: { width: 250, background: SIDEBAR, borderRight: "1px solid " + LINE, padding: "22px 14px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 },
  brandRow: { display: "flex", alignItems: "center", gap: 12, padding: "0 6px 20px" },
  mark: { width: 42, height: 42, borderRadius: 11, background: "linear-gradient(135deg, " + GOLD + ", #8a6d24)", color: "#000", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 15, fontWeight: 700 },
  brandSub: { fontSize: 11.5, color: MUTE, marginTop: 1 },
  navItem: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", background: "transparent", color: MUTE, padding: "11px 12px", borderRadius: 10, fontSize: 13.5, fontWeight: 500, cursor: "pointer", textAlign: "left", marginBottom: 2 },
  navItemOn: { background: "#1c1c1f", color: TXT, fontWeight: 600 },
  navIcon: { fontSize: 14 },
  navDot: { width: 6, height: 6, borderRadius: 999, background: GOLD, flexShrink: 0, marginLeft: 4 },
  navLabel: { fontSize: 10.5, color: "rgba(245,245,244,0.35)", fontWeight: 700, letterSpacing: "0.8px", padding: "16px 12px 8px" },
  navScroll: { overflowY: "auto", flex: 1 },
  adminBtn: { display: "flex", alignItems: "center", gap: 8, width: "100%", border: "1px solid " + LINE, background: "transparent", color: MUTE, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 },
  main: { flex: 1, padding: "24px 26px 60px", maxWidth: 1180, minWidth: 0 },
  topbar: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" },
  burger: { display: "none", border: "1px solid " + LINE, background: PANEL, color: TXT, width: 40, height: 40, borderRadius: 10, fontSize: 18, cursor: "pointer" },
  eyebrow: { fontSize: 11, color: MUTE, fontWeight: 700, letterSpacing: "1.2px" },
  h1: { fontSize: 30, fontWeight: 800, letterSpacing: "-1px", margin: "2px 0 4px" },
  live: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6ee7a8" },
  liveDot: { width: 7, height: 7, borderRadius: 999, background: "#6ee7a8", animation: "pulse 1.4s infinite" },
  topRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  date: { background: PANEL, border: "1px solid " + LINE, borderRadius: 10, padding: "9px 12px", color: TXT, fontSize: 13.5, colorScheme: "dark" },
  saveState: { fontSize: 12.5 },
  saving: { color: GOLD, animation: "pulse 1s infinite" },
  saved: { color: "#6ee7a8" },
  savedIdle: { color: MUTE },
  searchWrap: { display: "flex", alignItems: "center", gap: 10, background: PANEL, border: "1px solid " + LINE, borderRadius: 12, padding: "0 14px", marginBottom: 22 },
  searchIcon: { fontSize: 14, opacity: 0.6 },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: TXT, fontSize: 14, padding: "13px 0" },
  searchClear: { border: "none", background: "transparent", color: MUTE, fontSize: 20, cursor: "pointer" },
  searchCount: { fontSize: 12.5, color: MUTE, marginBottom: 14 },
  coachLink: { border: "none", background: "transparent", color: GOLD, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 2, fontWeight: 600 },
  presentTag: { fontSize: 12, fontWeight: 600, color: "#6ee7a8", background: "#173d2b", borderRadius: 999, padding: "4px 10px" },
  infoRow: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 },
  infoChip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTE, background: "#0A0A0B", border: "1px solid " + LINE, borderRadius: 8, padding: "5px 10px" },
  progressBanner: { display: "grid", gridTemplateColumns: "260px 1fr", gap: 24, background: PANEL, border: "1px solid " + LINE, borderRadius: 18, padding: "22px 24px", marginBottom: 22 },
  pbLeft: { borderRight: "1px solid " + LINE, paddingRight: 20 },
  pbLabel: { fontSize: 12, color: MUTE, fontWeight: 600 },
  pbValue: { fontSize: 52, fontWeight: 800, letterSpacing: "-2px", color: GOLD, lineHeight: 1, margin: "6px 0" },
  pbPct: { fontSize: 26, marginLeft: 2 },
  pbSub: { fontSize: 12, color: MUTE },
  pbBarWrap: { display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 },
  pbBarTrack: { height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" },
  pbBarFill: { height: "100%", background: "linear-gradient(90deg, #8a6d24, " + GOLD + ")", borderRadius: 999 },
  pbStages: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginTop: 4 },
  pbStage: {},
  pbStageTop: { display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5, color: MUTE },
  pbStageTrack: { height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" },
  pbStageFill: { height: "100%", background: GOLD, borderRadius: 999 },
  cards: { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 14, marginBottom: 22 },
  summaryCard: { background: "#fff", borderRadius: 18, padding: "18px 20px", color: "#111" },
  summaryDark: { background: "#111", color: "#fff", border: "1px solid " + LINE },
  pill: { display: "inline-block", background: "#111", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", padding: "5px 12px", borderRadius: 999, marginBottom: 14 },
  pillDark: { background: "#fff", color: "#000" },
  summaryGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 10px" },
  cellN: { fontSize: 30, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1 },
  cellL: { fontSize: 11.5, marginTop: 3 },
  miniCard: { background: PANEL, border: "1px solid " + LINE, borderRadius: 18, padding: "18px 18px" },
  miniValue: { fontSize: 34, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1 },
  miniLabel: { fontSize: 11.5, color: MUTE, marginTop: 4 },
  bar: { height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 999, marginTop: 12, overflow: "hidden" },
  barFill: { height: "100%", background: GOLD, borderRadius: 999 },
  chartCard: { background: PANEL, border: "1px solid " + LINE, borderRadius: 18, overflow: "hidden", marginBottom: 22, paddingBottom: 8 },
  chart: { display: "flex", alignItems: "flex-end", justifyContent: "space-around", gap: 10, padding: "10px 20px 16px", height: 190 },
  chartCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 },
  chartBarWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, width: "100%" },
  chartVal: { fontSize: 12, fontWeight: 700, color: TXT, marginBottom: 6 },
  chartBar: { width: "70%", maxWidth: 46, background: "linear-gradient(180deg, " + GOLD + ", #8a6d24)", borderRadius: "6px 6px 3px 3px", animation: "grow .4s ease" },
  chartLabel: { fontSize: 11, color: MUTE },
  tableCard: { background: PANEL, border: "1px solid " + LINE, borderRadius: 18, overflow: "hidden" },
  tableHead: { padding: "18px 20px 14px", display: "flex", alignItems: "baseline", gap: 8 },
  tableTitle: { fontSize: 15, fontWeight: 700 },
  tableSub: { fontSize: 12.5, color: MUTE },
  tableScroll: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: { fontSize: 11, fontWeight: 700, color: "rgba(245,245,244,0.65)", textAlign: "center", padding: "12px 10px", borderBottom: "1px solid " + LINE, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.5px" },
  thLeft: { textAlign: "left", paddingLeft: 20 },
  tr: { cursor: "pointer", transition: "background .1s" },
  td: { fontSize: 14.5, fontWeight: 600, textAlign: "center", padding: "14px 10px", borderBottom: "1px solid " + LINE, whiteSpace: "nowrap" },
  tdName: { textAlign: "left", paddingLeft: 20, fontWeight: 600 },
  hint: { fontSize: 12.5, color: MUTE, marginTop: 14, textAlign: "center" },
  empty: { background: PANEL, border: "1px dashed " + LINE, borderRadius: 16, padding: "28px", textAlign: "center", color: MUTE, fontSize: 14 },
  coachStats: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 },
  statBox: { background: PANEL, border: "1px solid " + LINE, borderRadius: 16, padding: "16px 18px" },
  statN: { fontSize: 28, fontWeight: 800, letterSpacing: "-1px" },
  statL: { fontSize: 11.5, color: MUTE, marginTop: 2 },
  tabsRow: { marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  tabs: { display: "inline-flex", gap: 4, background: PANEL, border: "1px solid " + LINE, borderRadius: 12, padding: 4 },
  tab: { border: "none", background: "transparent", color: MUTE, padding: "9px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  tabOn: { background: GOLD, color: "#000" },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: PANEL, border: "1px solid " + LINE, borderRadius: 16, padding: "16px 18px" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: 700 },
  progress: { fontSize: 13, fontWeight: 700, color: GOLD, background: GOLD_SOFT, borderRadius: 999, padding: "4px 12px" },
  attBtn: { border: "1px solid " + LINE, background: "transparent", color: MUTE, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  attOn: { background: "#173d2b", borderColor: "#2e6b4a", color: "#6ee7a8" },
  // Weeks view
  weekBar: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  weekChip: { width: 44, height: 44, borderRadius: 12, border: "1px solid " + LINE, background: PANEL, color: MUTE, fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  weekChipOn: { background: GOLD, borderColor: GOLD, color: "#000" },
  weekMeta: { fontSize: 13, color: MUTE, marginBottom: 20 },
  weekTotalCard: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, #16304d22, " + PANEL + ")", border: "1px solid rgba(200,162,75,0.35)", borderRadius: 18, padding: "20px 24px", marginBottom: 22 },
  weekTotalLabel: { fontSize: 12.5, color: MUTE, fontWeight: 600 },
  weekTotalValue: { fontSize: 46, fontWeight: 800, letterSpacing: "-2px", color: "#6ee7a8", lineHeight: 1, marginTop: 6 },
  weekTotalOf: { fontSize: 24, color: MUTE, fontWeight: 700 },
  weekTotalPct: { fontSize: 40, fontWeight: 800, color: GOLD, letterSpacing: "-1px" },
  weekTotalRow: { background: "rgba(200,162,75,0.08)" },

  filterBtn: { border: "1px solid " + LINE, background: "transparent", color: MUTE, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterBtnOn: { background: "#173d2b", borderColor: "#2e6b4a", color: "#6ee7a8" },
  steps: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 },
  step: { display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid " + LINE, background: "transparent", color: MUTE, borderRadius: 10, padding: "8px 12px", fontSize: 13, cursor: "pointer", transition: "all .12s ease" },
  stepOn: { borderColor: "rgba(200,162,75,0.5)", background: GOLD_SOFT, color: TXT },
  check: { width: 16, height: 16, borderRadius: 5, border: "1.5px solid " + MUTE, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#000" },
  checkOn: { background: GOLD, borderColor: GOLD },
  modalWrap: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 },
  modal: { background: "#141416", border: "1px solid " + LINE, borderRadius: 20, width: "100%", maxWidth: 480, padding: 24, animation: "fadein .18s ease", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 800 },
  modalSub: { fontSize: 12.5, color: MUTE, marginTop: 2 },
  close: { border: "none", background: "transparent", color: MUTE, fontSize: 26, cursor: "pointer", lineHeight: 1 },
  pinWrap: { display: "flex", flexDirection: "column", gap: 12 },
  pinLabel: { fontSize: 13.5, color: MUTE },
  pinInput: { background: "#0A0A0B", border: "1px solid " + LINE, borderRadius: 12, padding: "14px 16px", color: TXT, fontSize: 22, letterSpacing: "8px", textAlign: "center" },
  pinErr: { borderColor: "#e0575b" },
  pinErrText: { fontSize: 12.5, color: "#f08a8d" },
  pinBtn: { background: GOLD, color: "#000", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  pinHint: { fontSize: 11.5, color: MUTE, marginTop: 12, lineHeight: 1.5 },
  adminTabs: { display: "inline-flex", gap: 4, background: "#0A0A0B", border: "1px solid " + LINE, borderRadius: 10, padding: 4, marginBottom: 4 },
  adminTab: { border: "none", background: "transparent", color: MUTE, padding: "8px 18px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  adminTabOn: { background: GOLD, color: "#000" },
  adminSection: { fontSize: 11, color: MUTE, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", margin: "18px 0 10px" },
  stageList: { display: "flex", flexDirection: "column", gap: 8 },
  stageEmpty: { fontSize: 13, color: MUTE, padding: "10px 0" },
  stageRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#0A0A0B", border: "1px solid " + LINE, borderRadius: 10, padding: "11px 14px", fontSize: 14 },
  stageDel: { border: "none", background: "transparent", color: "#f08a8d", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  editBtn: { border: "1px solid " + LINE, background: "transparent", color: GOLD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", borderRadius: 7, padding: "4px 10px", whiteSpace: "nowrap" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  formInput: { background: "#0A0A0B", border: "1px solid " + LINE, borderRadius: 10, padding: "11px 13px", color: TXT, fontSize: 13.5, colorScheme: "dark", minWidth: 0 },
  formActions: { display: "flex", gap: 8, marginTop: 12 },
  cancelBtn: { flex: 1, border: "1px solid " + LINE, background: "transparent", color: TXT, borderRadius: 10, padding: "11px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  addRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  addInput: { flex: "1 1 140px", minWidth: 0, background: "#0A0A0B", border: "1px solid " + LINE, borderRadius: 10, padding: "11px 14px", color: TXT, fontSize: 14 },
  addBtn: { background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  cardInactive: { opacity: 0.5 },
  inactiveBadge: { fontSize: 10.5, fontWeight: 700, color: MUTE, background: "rgba(255,255,255,0.06)", border: "1px solid " + LINE, borderRadius: 999, padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.4px" },
  toggleBtn: { border: "1px solid " + LINE, borderRadius: 7, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  toggleOn: { background: "#173d2b", borderColor: "#2e6b4a", color: "#6ee7a8" },
  toggleOff: { background: "transparent", color: MUTE },
};
