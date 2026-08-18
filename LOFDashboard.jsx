import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { SEED_STUDENTS, SEED_COACHES, DEFAULT_STAGES } from "./seedData.js";

// ============================================================
//  FREEDOM EN ESPAÑOL — Panel de Coaches (rediseño)
//  Lifestyle of Freedom
//
//  Datos compartidos en vivo vía Supabase (tabla app_state,
//  fila id=1). MISMO esquema que el panel anterior: students +
//  stages en un solo JSON. No se pierde ningún dato.
// ============================================================

const ADMIN_PIN = "1234"; // cámbialo por el tuyo desde el código
const STATE_ID = 1;

// Programa: 12 semanas, arrancó el 12 de julio 2026 (domingos)
const COURSE_START = "2026-07-12";
const COURSE_WEEKS = 12;

// ------------------------------------------------------------
//  Supabase load / save
// ------------------------------------------------------------
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
function weekDateISO(weekNum) {
  const [y, m, d] = COURSE_START.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  return isoOf(start);
}
function currentWeekNum() {
  const [y, m, d] = COURSE_START.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const wk = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(wk, 1), COURSE_WEEKS);
}
// Todas las fechas-domingo del programa hasta hoy (para historial/rachas)
function courseWeeksSoFar() {
  const arr = [];
  const today = todayISO();
  for (let w = 1; w <= COURSE_WEEKS; w++) {
    const iso = weekDateISO(w);
    if (iso <= today) arr.push({ w, iso });
  }
  return arr;
}

// ------------------------------------------------------------
//  Idioma (ES por defecto, EN opcional para el CEO)
// ------------------------------------------------------------
const T = {
  es: {
    overview: "Resumen", weeks: "Semanas", coaches: "Coaches", admin: "Admin",
    dashboard: "Panel general", weeklyAtt: "Asistencia semanal", live: "En vivo",
    ministryProgress: "Progreso del ministerio", ofStudents: "de {n} estudiantes completos",
    students: "Estudiantes", presentToday: "Presentes hoy", attendance: "Asistencia",
    complete: "Completos", needAttention: "Necesitan atención",
    absentWeeks: "ausente {n}+ semanas", search: "Buscar estudiante, coach, FFG o teléfono...",
    coachBreakdown: "Desglose por coach", rankedByAtt: "ordenado por asistencia",
    tapCoach: "Toca un coach para ver y editar sus estudiantes.",
    present: "Presente", markPresent: "Marcar presente", presentOnly: "Solo presentes",
    showPresentOnly: "Ver solo presentes", progress: "Progreso", checkin: "Registro",
    noStudents: "Aún no hay estudiantes para este coach. Agrégalos desde Admin.",
    results: "resultado(s)", noResults: "Sin resultados. Prueba otro nombre, FFG o teléfono.",
    export: "Exportar CSV", totalPresent: "Total presentes este domingo",
    week: "Semana", of: "de", byCoach: "Asistencia por coach", total: "TOTAL",
    markFrom: "Marca asistencia desde el Registro de cada coach. Los números se actualizan en vivo.",
    enterPin: "Ingresa el PIN de admin", wrongPin: "PIN incorrecto. Intenta de nuevo.",
    unlock: "Desbloquear", onlyYou: "Solo tú tienes el PIN. Los coaches no pueden editar aquí.",
    stages: "Etapas", manageStages: "Administra etapas y estudiantes",
    currentStages: "Etapas actuales", noStages: "Aún no hay etapas. Agrega una abajo.",
    addStage: "Agregar etapa", remove: "Quitar", addStudent: "Agregar estudiante",
    fullName: "Nombre completo", phone: "Teléfono", ffgLabel: "FFG (quién lo invitó)",
    age: "Edad", editStudent: "Editar estudiante", cancel: "Cancelar",
    saveChanges: "Guardar cambios", manageByCoach: "Administrar estudiantes por coach",
    noCoachStudents: "Este coach aún no tiene estudiantes.", active: "Activo",
    inactive: "Inactivo", edit: "Editar", changesSave: "Los cambios se guardan solos para todos.",
    saving: "Guardando...", saved: "Guardado", autoSaves: "Guardado automático",
    loading: "Cargando datos...", yrs: "años", notes: "Notas",
    notesPlaceholder: "Seguimiento pastoral, oración, situación...", saveNote: "Guardar nota",
    studentDetail: "Ficha del estudiante", attHistory: "Historial de asistencia",
    streak: "racha", weeksAttended: "semanas asistidas", coach: "Coach",
    close: "Cerrar", missingSupabase: "Falta conectar Supabase",
    fixSupabase: "Abre supabaseClient.js y pega tus claves de Supabase.",
    fullyComplete: "Completos", allStudents: "Todos", allGood: "Todos al día, nadie con ausencias largas.",
  },
  en: {
    overview: "Overview", weeks: "Weeks", coaches: "Coaches", admin: "Admin",
    dashboard: "Dashboard", weeklyAtt: "Weekly attendance", live: "Live",
    ministryProgress: "Ministry progress", ofStudents: "of {n} students fully complete",
    students: "Students", presentToday: "Present today", attendance: "Attendance",
    complete: "Complete", needAttention: "Need attention",
    absentWeeks: "absent {n}+ weeks", search: "Search student, coach, FFG or phone...",
    coachBreakdown: "Coach breakdown", rankedByAtt: "ranked by attendance",
    tapCoach: "Tap a coach to view and edit their students.",
    present: "Present", markPresent: "Mark present", presentOnly: "Present only",
    showPresentOnly: "Show present only", progress: "Progress", checkin: "Check-in",
    noStudents: "No students yet for this coach. Add them from Admin.",
    results: "result(s)", noResults: "No students found. Try another name, FFG or phone.",
    export: "Export CSV", totalPresent: "Total present this Sunday",
    week: "Week", of: "of", byCoach: "Attendance by coach", total: "TOTAL",
    markFrom: "Mark attendance from each coach's Check-in tab. Numbers update live.",
    enterPin: "Enter admin PIN", wrongPin: "Wrong PIN. Try again.",
    unlock: "Unlock", onlyYou: "Only you have the PIN. Coaches can't edit here.",
    stages: "Stages", manageStages: "Manage stages and students",
    currentStages: "Current stages", noStages: "No stages yet. Add one below.",
    addStage: "Add a stage", remove: "Remove", addStudent: "Add student",
    fullName: "Full name", phone: "Phone", ffgLabel: "FFG (who invited them)",
    age: "Age", editStudent: "Edit student", cancel: "Cancel",
    saveChanges: "Save changes", manageByCoach: "Manage students by coach",
    noCoachStudents: "No students for this coach yet.", active: "Active",
    inactive: "Inactive", edit: "Edit", changesSave: "Changes save automatically for everyone.",
    saving: "Saving...", saved: "Saved", autoSaves: "Auto-saves",
    loading: "Loading data...", yrs: "yrs", notes: "Notes",
    notesPlaceholder: "Pastoral follow-up, prayer, situation...", saveNote: "Save note",
    studentDetail: "Student detail", attHistory: "Attendance history",
    streak: "streak", weeksAttended: "weeks attended", coach: "Coach",
    close: "Close", missingSupabase: "Supabase not connected",
    fixSupabase: "Open supabaseClient.js and paste your Supabase keys.",
    fullyComplete: "Complete", allStudents: "All", allGood: "Everyone's on track, no long absences.",
  },
};
function tr(lang, key, vars) {
  let s = (T[lang] && T[lang][key]) || T.es[key] || key;
  if (vars) Object.keys(vars).forEach((k) => { s = s.replace("{" + k + "}", vars[k]); });
  return s;
}

// ============================================================
//  App principal
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
  const [lang, setLang] = useState("es");
  const [detailId, setDetailId] = useState(null);

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
        const seed = { students: SEED_STUDENTS, stages: DEFAULT_STAGES };
        setStudents(seed.students); setStages(seed.stages);
        await saveState(seed);
      }
    }
    boot();
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
    persist(students.map((e) => e.id === id ? { ...e, steps: { ...(e.steps || {}), [step]: !(e.steps || {})[step] } } : e));
  }
  function toggleAttendance(id) {
    persist(students.map((e) => e.id === id ? { ...e, attendance: { ...(e.attendance || {}), [date]: !(e.attendance || {})[date] } } : e));
  }
  function toggleAttendanceOn(id, iso) {
    persist(students.map((e) => e.id === id ? { ...e, attendance: { ...(e.attendance || {}), [iso]: !(e.attendance || {})[iso] } } : e));
  }
  function saveNote(id, note) {
    persist(students.map((e) => e.id === id ? { ...e, note } : e));
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
    const present = group.filter((e) => (e.attendance || {})[date]).length;
    const attPct = total ? Math.round((present / total) * 100) : 0;
    const byStage = {};
    stages.forEach((st) => { byStage[st] = group.filter((e) => (e.steps || {})[st]).length; });
    const complete = group.filter((e) => stages.length > 0 && stages.every((st) => (e.steps || {})[st])).length;
    const totalBoxes = total * stages.length;
    const filled = group.reduce((sum, e) => sum + stages.filter((st) => (e.steps || {})[st]).length, 0);
    const progPct = totalBoxes ? Math.round((filled / totalBoxes) * 100) : 0;
    return { total, present, attPct, byStage, complete, progPct };
  }

  const totals = useMemo(() => {
    if (!students || !stages) return null;
    const act = students.filter((e) => e.active !== false);
    const total = act.length;
    const present = act.filter((e) => (e.attendance || {})[date]).length;
    const complete = act.filter((e) => stages.length > 0 && stages.every((st) => (e.steps || {})[st])).length;
    const byStage = {};
    stages.forEach((st) => { byStage[st] = act.filter((e) => (e.steps || {})[st]).length; });
    const totalBoxes = total * stages.length;
    const filled = act.reduce((sum, e) => sum + stages.filter((st) => (e.steps || {})[st]).length, 0);
    const progPct = totalBoxes ? Math.round((filled / totalBoxes) * 100) : 0;
    return { total, present, attPct: total ? Math.round(present/total*100) : 0, complete, byStage, progPct };
  }, [students, stages, date]);

  // Estudiantes que necesitan atención: ausentes en las últimas 2+ semanas del programa
  const needAttention = useMemo(() => {
    if (!students) return [];
    const weeks = courseWeeksSoFar().slice(-3); // últimas 3 semanas ocurridas
    if (weeks.length < 2) return [];
    const act = students.filter((e) => e.active !== false);
    const flagged = [];
    act.forEach((e) => {
      // contar semanas seguidas ausentes desde la más reciente hacia atrás
      let streakMissed = 0;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (!(e.attendance || {})[weeks[i].iso]) streakMissed++;
        else break;
      }
      if (streakMissed >= 2) flagged.push({ student: e, missed: streakMissed });
    });
    return flagged.sort((a, b) => b.missed - a.missed);
  }, [students]);

  const searchResults = useMemo(() => {
    if (!students || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return students.filter((e) =>
      e.name.toLowerCase().includes(q) || e.coach.toLowerCase().includes(q) ||
      (e.ffg || "").toLowerCase().includes(q) || (e.phone || "").includes(q)
    ).slice(0, 20);
  }, [students, search]);

  const detailStudent = useMemo(
    () => (students && detailId != null ? students.find((e) => e.id === detailId) : null),
    [students, detailId]
  );

  function exportCSV() {
    if (!students || !stages) return;
    const head = ["Nombre", "Coach", "Teléfono", "Edad", "FFG", "Activo", ...stages, "Notas"];
    const rows = students.map((e) => [
      e.name, e.coach, e.phone || "", e.age === "" || e.age == null ? "" : e.age,
      e.ffg || "", e.active === false ? "No" : "Sí",
      ...stages.map((st) => (e.steps || {})[st] ? "Sí" : ""),
      (e.note || "").replace(/[\r\n]+/g, " "),
    ]);
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "freedom-estudiantes-" + todayISO() + ".csv";
    a.click(); URL.revokeObjectURL(url);
  }

  const t = (k, v) => tr(lang, k, v);

  if (connError) {
    return (
      <div style={S.loadingWrap}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 460, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#9888;&#65039;</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, fontFamily: DISPLAY }}>{t("missingSupabase")}</div>
          <div style={{ fontSize: 14, color: MUTE, lineHeight: 1.6 }}>{t("fixSupabase")}</div>
        </div>
      </div>
    );
  }
  if (!students || !stages) {
    return (
      <div style={S.loadingWrap}>
        <style>{CSS}</style>
        <div style={S.loadingDot} />
        <span style={S.loadingText}>{t("loading")}</span>
      </div>
    );
  }

  const inOverview = coachSel === "Overview";
  const inWeeks = coachSel === "Weeks";
  const title = inOverview ? t("dashboard") : inWeeks ? t("weeklyAtt") : coachSel;

  return (
    <div style={S.shell}>
      <style>{CSS}</style>

      <aside className={"lof-sidebar" + (sidebarOpen ? " open" : "")} style={S.sidebar}>
        <div style={S.brandRow}>
          <div style={S.mark}>F</div>
          <div>
            <div style={S.brandTitle}>Freedom</div>
            <div style={S.brandSub}>en Español · LOF</div>
          </div>
        </div>

        <button style={{ ...S.navItem, ...(inOverview ? S.navItemOn : {}) }}
          onClick={() => { setCoachSel("Overview"); setSidebarOpen(false); }}>
          <span style={S.navGlyph}>◈</span> {t("overview")}
        </button>
        <button style={{ ...S.navItem, ...(inWeeks ? S.navItemOn : {}) }}
          onClick={() => { setCoachSel("Weeks"); setSidebarOpen(false); }}>
          <span style={S.navGlyph}>▦</span> {t("weeks")}
        </button>

        <div style={S.navLabel}>{coaches.length} {t("coaches").toUpperCase()}</div>
        <div style={S.navScroll}>
          {coaches.map((c) => {
            const on = coachSel === c;
            const st = statsCoach(c);
            return (
              <button key={c} style={{ ...S.navItem, ...(on ? S.navItemOn : {}) }}
                onClick={() => { setCoachSel(c); setSidebarOpen(false); }}>
                <span style={{ ...S.navDot, background: on ? GOLD : "rgba(255,255,255,0.25)" }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                <span style={S.navCount}>{st.total}</span>
              </button>
            );
          })}
        </div>

        <button style={S.adminBtn} onClick={() => { setAdminOpen(true); setSidebarOpen(false); }}>
          <span style={{ fontSize: 13 }}>⚙</span> {t("admin")}
        </button>
      </aside>

      {sidebarOpen && <div style={S.backdrop} onClick={() => setSidebarOpen(false)} />}

      <main className="lof-main" style={S.main}>
        <div style={S.topbar}>
          <button className="lof-burger" style={S.burger} onClick={() => setSidebarOpen(true)}>☰</button>
          <div style={{ minWidth: 0 }}>
            <div style={S.eyebrow}>{inOverview ? "FREEDOM EN ESPAÑOL" : inWeeks ? "PROGRAMA · 12 SEMANAS" : t("coach").toUpperCase()}</div>
            <h1 style={S.h1}>{title}</h1>
            <div style={S.live}><span style={S.liveDot} /> {t("live")}</div>
          </div>
          <div style={S.topRight}>
            <div style={S.langToggle}>
              <button style={{ ...S.langBtn, ...(lang === "es" ? S.langOn : {}) }} onClick={() => setLang("es")}>ES</button>
              <button style={{ ...S.langBtn, ...(lang === "en" ? S.langOn : {}) }} onClick={() => setLang("en")}>EN</button>
            </div>
            <input type="date" style={S.date} value={date} onChange={(e) => setDate(e.target.value)} />
            <div style={S.saveState}>
              {saving ? <span style={S.saving}>{t("saving")}</span>
                : ok ? <span style={S.saved}>✓ {t("saved")}</span>
                : <span style={S.savedIdle}>{t("autoSaves")}</span>}
            </div>
          </div>
        </div>

        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input style={S.searchInput} placeholder={t("search")}
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button style={S.searchClear} onClick={() => setSearch("")}>×</button>}
        </div>

        {search.trim() ? (
          <SearchView results={searchResults} stages={stages} date={date} t={t}
            onCoach={(c) => { setCoachSel(c); setSearch(""); }} onOpen={(id) => setDetailId(id)} />
        ) : inWeeks ? (
          <WeeksView students={students} coaches={coaches} t={t} />
        ) : inOverview ? (
          <OverviewView totals={totals} coaches={coaches} statsCoach={statsCoach} stages={stages}
            date={date} needAttention={needAttention} onCoach={setCoachSel} onExport={exportCSV}
            onOpen={(id) => setDetailId(id)} t={t} />
        ) : (
          <CoachView coach={coachSel} students={students.filter((e) => e.coach === coachSel)}
            stats={statsCoach(coachSel)} stages={stages} date={date} t={t}
            toggleStep={toggleStep} toggleAttendance={toggleAttendance} onOpen={(id) => setDetailId(id)} />
        )}
      </main>

      {detailStudent && (
        <StudentDetailModal e={detailStudent} stages={stages} t={t}
          onToggleStep={toggleStep} onToggleAtt={toggleAttendanceOn} onSaveNote={saveNote}
          onClose={() => setDetailId(null)} onCoach={(c) => { setCoachSel(c); setDetailId(null); }} />
      )}

      {adminOpen && (
        <AdminModal
          stages={stages} coaches={coaches} students={students} t={t}
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
function OverviewView({ totals, coaches, statsCoach, stages, date, needAttention, onCoach, onExport, onOpen, t }) {
  const rankedCoaches = coaches.map((c) => ({ c, s: statsCoach(c) })).sort((a, b) => b.s.attPct - a.s.attPct);

  return (
    <>
      {/* Hero: progreso del ministerio como titular editorial */}
      <div className="lof-hero" style={S.hero}>
        <div style={S.heroLeft}>
          <div style={S.heroLabel}>{t("ministryProgress")}</div>
          <div style={S.heroNum}>
            {totals.progPct}<span style={S.heroPct}>%</span>
          </div>
          <div style={S.heroSub}>{totals.complete} {t("ofStudents", { n: totals.total })}</div>
          <div style={S.heroBarTrack}><div style={{ ...S.heroBarFill, width: totals.progPct + "%" }} /></div>
        </div>
        <div style={S.heroStages}>
          {stages.map((st) => {
            const pct = totals.total ? Math.round((totals.byStage[st] / totals.total) * 100) : 0;
            return (
              <div key={st} style={S.heroStage}>
                <div style={S.heroStageTop}>
                  <span style={S.heroStageName}>{st}</span>
                  <span style={S.heroStageVal}>{totals.byStage[st]}<span style={S.heroStageOf}> / {totals.total}</span></span>
                </div>
                <div style={S.heroStageTrack}><div style={{ ...S.heroStageFill, width: pct + "%" }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPIs */}
      <div className="lof-kpis" style={S.kpis}>
        <Kpi big value={totals.total} label={t("students")} />
        <Kpi value={totals.present} label={t("presentToday")} accent={SAGE} />
        <Kpi value={totals.attPct + "%"} label={t("attendance")} accent={GOLD} />
        <Kpi value={totals.complete} label={t("fullyComplete")} accent={GOLD} />
      </div>

      {/* Necesitan atención */}
      <div style={S.attentionCard}>
        <div style={S.attentionHead}>
          <span style={S.attentionTitle}>◐ {t("needAttention")}</span>
          <span style={S.attentionCount}>{needAttention.length}</span>
        </div>
        {needAttention.length === 0 ? (
          <div style={S.attentionEmpty}>{t("allGood")}</div>
        ) : (
          <div style={S.attentionList}>
            {needAttention.slice(0, 8).map(({ student, missed }) => (
              <button key={student.id} style={S.attentionRow} onClick={() => onOpen(student.id)}>
                <span style={S.attentionName}>{student.name}</span>
                <span style={S.attentionMeta}>{student.coach}</span>
                <span style={S.attentionFlag}>{t("absentWeeks", { n: missed })}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desglose por coach */}
      <div style={S.tableCard}>
        <div style={S.tableHead}>
          <div>
            <span style={S.tableTitle}>{t("coachBreakdown")}</span>
            <span style={S.tableSub}> · {prettyDate(date)} · {t("rankedByAtt")}</span>
          </div>
          <button style={S.exportBtn} onClick={onExport}>↓ {t("export")}</button>
        </div>
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.thLeft }}>{t("coach")}</th>
                <th style={S.th}>{t("students")}</th>
                {stages.map((st) => <th key={st} style={S.th}>{st}</th>)}
                <th style={S.th}>{t("present")}</th>
                <th style={S.th}>{t("attendance")}</th>
                <th style={S.th}>{t("complete")}</th>
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
                  <td style={{ ...S.td, color: s.present ? SAGE : MUTE }}>{s.present}</td>
                  <td style={{ ...S.td, color: pctColor(s.attPct), fontWeight: 700 }}>{s.attPct}%</td>
                  <td style={{ ...S.td, fontWeight: 700, color: s.complete ? SAGE : MUTE }}>{s.complete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={S.hint}>{t("tapCoach")}</div>
    </>
  );
}

// ============================================================
//  Weeks
// ============================================================
function WeeksView({ students, coaches, t }) {
  const [week, setWeek] = useState(currentWeekNum());
  const iso = weekDateISO(week);
  const act = students.filter((e) => e.active !== false);

  const rows = coaches.map((c) => {
    const group = act.filter((e) => e.coach === c);
    const total = group.length;
    const present = group.filter((e) => (e.attendance || {})[iso]).length;
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
          <button key={w} onClick={() => setWeek(w)}
            style={{ ...S.weekChip, ...(w === week ? S.weekChipOn : {}) }}>{w}</button>
        ))}
      </div>
      <div style={S.weekMeta}>{t("week")} {week} {t("of")} {COURSE_WEEKS} · {prettyDate(iso)}</div>

      <div style={S.weekTotalCard}>
        <div>
          <div style={S.weekTotalLabel}>{t("totalPresent")}</div>
          <div style={S.weekTotalValue}>{totalPresent}<span style={S.weekTotalOf}> / {totalStudents}</span></div>
        </div>
        <div style={S.weekTotalPct}>{totalPct}%</div>
      </div>

      <div style={S.tableCard}>
        <div style={S.tableHead}>
          <div><span style={S.tableTitle}>{t("byCoach")}</span><span style={S.tableSub}> · {t("week")} {week}</span></div>
        </div>
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.thLeft }}>{t("coach")}</th>
                <th style={S.th}>{t("present")}</th>
                <th style={S.th}>{t("students")}</th>
                <th style={S.th}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.coach}>
                  <td style={{ ...S.td, ...S.tdName }}>{r.coach}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: r.present ? SAGE : MUTE }}>{r.present}</td>
                  <td style={S.td}>{r.total}</td>
                  <td style={{ ...S.td, color: pctColor(r.pct), fontWeight: 700 }}>{r.pct}%</td>
                </tr>
              ))}
              <tr style={S.weekTotalRow}>
                <td style={{ ...S.td, ...S.tdName, fontWeight: 800 }}>{t("total")}</td>
                <td style={{ ...S.td, fontWeight: 800, color: SAGE }}>{totalPresent}</td>
                <td style={{ ...S.td, fontWeight: 800 }}>{totalStudents}</td>
                <td style={{ ...S.td, fontWeight: 800, color: GOLD }}>{totalPct}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div style={S.hint}>{t("markFrom")}</div>
    </>
  );
}

// ============================================================
//  Student info chips
// ============================================================
function StudentInfo({ e, t }) {
  return (
    <div style={S.infoRow}>
      {e.phone ? <a href={"tel:" + e.phone} style={S.infoChip} onClick={(ev) => ev.stopPropagation()}>☏ {e.phone}</a> : null}
      {e.age !== "" && e.age != null ? <span style={S.infoChip}>◷ {e.age} {t("yrs")}</span> : null}
      {e.ffg ? <span style={S.infoChip}>◇ FFG: {e.ffg}</span> : null}
      {e.note ? <span style={{ ...S.infoChip, color: GOLD, borderColor: "rgba(200,162,75,0.3)" }}>✎ {t("notes")}</span> : null}
    </div>
  );
}

// ============================================================
//  Search
// ============================================================
function SearchView({ results, stages, date, onCoach, onOpen, t }) {
  return (
    <div>
      <div style={S.searchCount}>{results.length} {t("results")}</div>
      {results.length === 0 && <div style={S.empty}>{t("noResults")}</div>}
      <div style={S.list}>
        {results.map((e) => {
          const done = stages.filter((st) => (e.steps || {})[st]).length;
          const present = !!(e.attendance || {})[date];
          return (
            <div key={e.id} style={S.card} onClick={() => onOpen(e.id)}>
              <div style={S.cardHead}>
                <div>
                  <div style={S.name}>{e.name}</div>
                  <button style={S.coachLink} onClick={(ev) => { ev.stopPropagation(); onCoach(e.coach); }}>{e.coach} ›</button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {present && <span style={S.presentTag}>✓ {t("present")}</span>}
                  <div style={S.progress}>{done}/{stages.length}</div>
                </div>
              </div>
              <StudentInfo e={e} t={t} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
//  Coach view
// ============================================================
function CoachView({ coach, students, stats, stages, date, toggleStep, toggleAttendance, onOpen, t }) {
  const [tab, setTab] = useState("progress");
  const [presentOnly, setPresentOnly] = useState(false);
  return (
    <>
      <div className="lof-kpis" style={S.coachStats}>
        <Kpi value={stats.total} label={t("students")} />
        <Kpi value={stats.present} label={t("present") + " · " + prettyDate(date)} accent={SAGE} />
        <Kpi value={stats.progPct + "%"} label={t("progress")} accent={GOLD} />
        <Kpi value={stats.complete} label={t("complete")} accent={GOLD} />
      </div>

      <div style={S.tabsRow}>
        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(tab === "progress" ? S.tabOn : {}) }} onClick={() => setTab("progress")}>{t("progress")}</button>
          <button style={{ ...S.tab, ...(tab === "checkin" ? S.tabOn : {}) }} onClick={() => setTab("checkin")}>{t("checkin")}</button>
        </div>
        {tab === "checkin" && (
          <button onClick={() => setPresentOnly(!presentOnly)}
            style={{ ...S.filterBtn, ...(presentOnly ? S.filterBtnOn : {}) }}>
            {presentOnly ? "✓ " + t("presentOnly") : t("showPresentOnly")}
          </button>
        )}
      </div>

      {students.length === 0 && <div style={S.empty}>{t("noStudents")}</div>}

      <div style={S.list}>
        {students
          .filter((e) => !(presentOnly && tab === "checkin") || (e.attendance || {})[date])
          .map((e) => {
          const done = stages.filter((st) => (e.steps || {})[st]).length;
          const present = !!(e.attendance || {})[date];
          const inactive = e.active === false;
          return (
            <div key={e.id} style={{ ...S.card, ...(inactive ? S.cardInactive : {}) }}>
              <div style={S.cardHead}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => onOpen(e.id)}>
                  <div style={S.name}>{e.name}</div>
                  {inactive && <span style={S.inactiveBadge}>{t("inactive")}</span>}
                </div>
                {inactive ? null : tab === "progress" ? (
                  <div style={S.progress} onClick={() => onOpen(e.id)}>{done}/{stages.length}</div>
                ) : (
                  <button onClick={() => toggleAttendance(e.id)} style={{ ...S.attBtn, ...(present ? S.attOn : {}) }}>
                    {present ? "✓ " + t("present") : t("markPresent")}
                  </button>
                )}
              </div>
              <div onClick={() => onOpen(e.id)} style={{ cursor: "pointer" }}><StudentInfo e={e} t={t} /></div>
              {tab === "progress" && !inactive && (
                <div style={S.steps}>
                  {stages.map((st) => {
                    const on = !!(e.steps || {})[st];
                    return (
                      <button key={st} onClick={() => toggleStep(e.id, st)} style={{ ...S.step, ...(on ? S.stepOn : {}) }}>
                        <span style={{ ...S.check, ...(on ? S.checkOn : {}) }}>{on ? "✓" : ""}</span>
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

// ============================================================
//  Student detail modal (nuevo: notas, historial, rachas)
// ============================================================
function StudentDetailModal({ e, stages, onToggleStep, onToggleAtt, onSaveNote, onClose, onCoach, t }) {
  const [note, setNote] = useState(e.note || "");
  const weeks = courseWeeksSoFar();
  const attended = weeks.filter((w) => (e.attendance || {})[w.iso]).length;
  // racha actual (semanas seguidas presente desde la más reciente)
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if ((e.attendance || {})[weeks[i].iso]) streak++; else break;
  }
  const done = stages.filter((st) => (e.steps || {})[st]).length;

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(ev) => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={S.modalTitle}>{e.name}</div>
            <button style={S.coachLink} onClick={() => onCoach(e.coach)}>{e.coach} ›</button>
          </div>
          <button style={S.close} onClick={onClose}>×</button>
        </div>

        <StudentInfo e={e} t={t} />

        <div style={S.detailStatRow}>
          <div style={S.detailStat}>
            <div style={S.detailStatN}>{done}<span style={S.detailStatOf}>/{stages.length}</span></div>
            <div style={S.detailStatL}>{t("progress")}</div>
          </div>
          <div style={S.detailStat}>
            <div style={{ ...S.detailStatN, color: SAGE }}>{attended}</div>
            <div style={S.detailStatL}>{t("weeksAttended")}</div>
          </div>
          <div style={S.detailStat}>
            <div style={{ ...S.detailStatN, color: streak > 0 ? GOLD : MUTE }}>{streak}🔥</div>
            <div style={S.detailStatL}>{t("streak")}</div>
          </div>
        </div>

        <div style={S.adminSection}>{stages.length} {t("stages").toUpperCase()}</div>
        <div style={S.steps}>
          {stages.map((st) => {
            const on = !!(e.steps || {})[st];
            return (
              <button key={st} onClick={() => onToggleStep(e.id, st)} style={{ ...S.step, ...(on ? S.stepOn : {}) }}>
                <span style={{ ...S.check, ...(on ? S.checkOn : {}) }}>{on ? "✓" : ""}</span>
                {st}
              </button>
            );
          })}
        </div>

        <div style={S.adminSection}>{t("attHistory")}</div>
        <div style={S.attGrid}>
          {weeks.map((w) => {
            const on = !!(e.attendance || {})[w.iso];
            return (
              <button key={w.iso} onClick={() => onToggleAtt(e.id, w.iso)}
                style={{ ...S.attCell, ...(on ? S.attCellOn : {}) }} title={prettyDate(w.iso)}>
                <span style={S.attCellW}>{w.w}</span>
                <span style={S.attCellMark}>{on ? "✓" : "·"}</span>
              </button>
            );
          })}
        </div>

        <div style={S.adminSection}>{t("notes")}</div>
        <textarea style={S.noteArea} value={note} onChange={(ev) => setNote(ev.target.value)}
          placeholder={t("notesPlaceholder")} rows={3} />
        <button style={{ ...S.addBtn, width: "100%", marginTop: 8 }}
          onClick={() => { onSaveNote(e.id, note.trim()); onClose(); }}>{t("saveNote")}</button>
      </div>
    </div>
  );
}

// ============================================================
//  Admin modal
// ============================================================
function AdminModal({ stages, coaches, students, onAddStage, onRemoveStage, onAddStudent, onUpdateStudent, onRemoveStudent, onToggleActive, onClose, t }) {
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
            <div style={S.modalTitle}>{t("admin")}</div>
            <div style={S.modalSub}>{t("manageStages")}</div>
          </div>
          <button style={S.close} onClick={onClose}>×</button>
        </div>

        {!unlocked ? (
          <div style={S.pinWrap}>
            <div style={S.pinLabel}>{t("enterPin")}</div>
            <input type="password" inputMode="numeric" style={{ ...S.pinInput, ...(err ? S.pinErr : {}) }}
              value={pin} onChange={(e) => { setPin(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()} placeholder="••••" autoFocus />
            {err && <div style={S.pinErrText}>{t("wrongPin")}</div>}
            <button style={S.pinBtn} onClick={tryUnlock}>{t("unlock")}</button>
            <div style={S.pinHint}>{t("onlyYou")}</div>
          </div>
        ) : (
          <div>
            <div style={S.adminTabs}>
              <button style={{ ...S.adminTab, ...(tab === "stages" ? S.adminTabOn : {}) }} onClick={() => { setTab("stages"); setEditId(null); }}>{t("stages")}</button>
              <button style={{ ...S.adminTab, ...(tab === "students" ? S.adminTabOn : {}) }} onClick={() => setTab("students")}>{t("students")}</button>
            </div>

            {tab === "stages" ? (
              <div>
                <div style={S.adminSection}>{t("currentStages")}</div>
                <div style={S.stageList}>
                  {stages.length === 0 && <div style={S.stageEmpty}>{t("noStages")}</div>}
                  {stages.map((st) => (
                    <div key={st} style={S.stageRow}>
                      <span>{st}</span>
                      <button style={S.stageDel} onClick={() => onRemoveStage(st)}>{t("remove")}</button>
                    </div>
                  ))}
                </div>
                <div style={S.adminSection}>{t("addStage")}</div>
                <div style={S.addRow}>
                  <input style={S.addInput} value={newStage} onChange={(e) => setNewStage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { onAddStage(newStage); setNewStage(""); } }}
                    placeholder="Serving, Leader, Connected..." />
                  <button style={S.addBtn} onClick={() => { onAddStage(newStage); setNewStage(""); }}>+</button>
                </div>
              </div>
            ) : editId ? (
              <div>
                <div style={S.adminSection}>{t("editStudent")}</div>
                <div className="lof-formgrid" style={S.formGrid}>
                  <input style={S.formInput} placeholder={t("fullName")} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <input style={S.formInput} placeholder={t("phone")} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  <input style={S.formInput} placeholder={t("ffgLabel")} value={editForm.ffg} onChange={(e) => setEditForm({ ...editForm, ffg: e.target.value })} />
                  <input style={S.formInput} type="number" placeholder={t("age")} value={editForm.age} onChange={(e) => setEditForm({ ...editForm, age: e.target.value })} />
                  <select style={S.formInput} value={editForm.coach} onChange={(e) => setEditForm({ ...editForm, coach: e.target.value })}>
                    {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={S.formActions}>
                  <button style={S.cancelBtn} onClick={() => setEditId(null)}>{t("cancel")}</button>
                  <button style={S.addBtn} onClick={saveEdit}>{t("saveChanges")}</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={S.adminSection}>{t("addStudent")}</div>
                <div className="lof-formgrid" style={S.formGrid}>
                  <input style={S.formInput} placeholder={t("fullName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input style={S.formInput} placeholder={t("phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <input style={S.formInput} placeholder={t("ffgLabel")} value={form.ffg} onChange={(e) => setForm({ ...form, ffg: e.target.value })} />
                  <input style={S.formInput} type="number" placeholder={t("age")} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                  <select style={S.formInput} value={form.coach} onChange={(e) => setForm({ ...form, coach: e.target.value })}>
                    {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button style={{ ...S.addBtn, width: "100%", marginTop: 10 }}
                  onClick={() => { onAddStudent(form); setForm({ ...emptyForm, coach: form.coach }); }}>+ {t("addStudent")}</button>

                <div style={S.adminSection}>{t("manageByCoach")}</div>
                <select style={{ ...S.formInput, width: "100%", marginBottom: 10 }} value={manageCoach} onChange={(e) => setManageCoach(e.target.value)}>
                  {coaches.map((c) => <option key={c} value={c}>{c} ({students.filter((s) => s.coach === c).length})</option>)}
                </select>
                <div style={{ ...S.stageList, maxHeight: 240, overflowY: "auto" }}>
                  {coachStudents.length === 0 && <div style={S.stageEmpty}>{t("noCoachStudents")}</div>}
                  {coachStudents.map((e) => (
                    <div key={e.id} style={S.stageRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{e.name}</div>
                        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {[e.phone, e.age !== "" && e.age != null ? e.age + " " + t("yrs") : "", e.ffg ? "FFG: " + e.ffg : ""].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                        <button style={{ ...S.toggleBtn, ...(e.active === false ? S.toggleOff : S.toggleOn) }} onClick={() => onToggleActive(e.id)}>
                          {e.active === false ? t("inactive") : t("active")}
                        </button>
                        <button style={S.editBtn} onClick={() => startEdit(e)}>{t("edit")}</button>
                        <button style={S.stageDel} onClick={() => onRemoveStudent(e.id)}>{t("remove")}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={S.pinHint}>{t("changesSave")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  Small components + helpers
// ============================================================
function Kpi({ value, label, accent, big }) {
  return (
    <div style={{ ...S.kpi, ...(big ? S.kpiBig : {}) }}>
      <div style={{ ...S.kpiValue, color: accent || TXT }}>{value}</div>
      <div style={S.kpiLabel}>{label}</div>
    </div>
  );
}
function pctColor(p) {
  if (p >= 70) return SAGE;
  if (p >= 40) return GOLD;
  if (p > 0) return "#d99a6b";
  return "rgba(240,238,232,0.35)";
}
function prettyDate(iso) {
  const [y, m, d] = iso.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return months[parseInt(m)-1] + " " + parseInt(d);
}

// ============================================================
//  Paleta + tipografía (rediseño)
// ============================================================
const GOLD = "#C9A24B";       // acento único, disciplinado
const GOLD_SOFT = "rgba(201,162,75,0.13)";
const SAGE = "#7FB08A";       // presente / activo
const BG = "#0B0B0C";         // negro cálido
const PANEL = "#151517";      // superficie
const PANEL_2 = "#1B1B1E";    // superficie elevada
const SIDEBAR = "#0E0E10";
const LINE = "rgba(255,255,255,0.07)";
const LINE_2 = "rgba(255,255,255,0.12)";
const TXT = "#F0EEE8";        // texto marfil
const MUTE = "rgba(240,238,232,0.48)";
const DISPLAY = "'Fraunces', Georgia, serif";
const BODY = "'Inter', system-ui, -apple-system, sans-serif";

const CSS = "* { box-sizing: border-box; margin: 0; padding: 0; }"
  + " body { font-family: " + BODY + "; }"
  + " ::selection { background: " + GOLD + "; color: #000; }"
  + " input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid " + GOLD + "; outline-offset: 2px; }"
  + " @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }"
  + " @keyframes fadein { from{opacity:0; transform: translateY(10px)} to{opacity:1; transform:none} }"
  + " @keyframes rise { from{opacity:0; transform: translateY(6px)} to{opacity:1; transform:none} }"
  + " ::-webkit-scrollbar { width: 8px; height: 8px; }"
  + " ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }"
  + " ::-webkit-scrollbar-track { background: transparent; }"
  + " a { text-decoration: none; }"
  + " .lof-card-anim { animation: rise .3s ease both; }"
  + " @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }"
  + " @media (max-width: 960px) { .lof-hero { grid-template-columns: 1fr !important; } .lof-heroleft { border-right: none !important; border-bottom: 1px solid " + LINE + "; padding-right: 0 !important; padding-bottom: 22px; margin-bottom: 6px; } }"
  + " @media (max-width: 860px) {"
  + "   .lof-sidebar { position: fixed !important; left: 0; top: 0; z-index: 50; transform: translateX(-100%); transition: transform .22s ease; }"
  + "   .lof-sidebar.open { transform: translateX(0); }"
  + "   .lof-burger { display: flex !important; }"
  + "   .lof-kpis { grid-template-columns: 1fr 1fr !important; }"
  + "   .lof-main { padding: 18px 16px 60px !important; }"
  + " }"
  + " @media (max-width: 520px) { .lof-kpis { grid-template-columns: 1fr 1fr !important; } .lof-formgrid { grid-template-columns: 1fr !important; } }";

const S = {
  shell: { display: "flex", minHeight: "100vh", background: BG, color: TXT, fontFamily: BODY },
  loadingWrap: { minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: TXT, fontFamily: BODY },
  loadingDot: { width: 10, height: 10, borderRadius: 999, background: GOLD, animation: "pulse 1s infinite" },
  loadingText: { color: MUTE, fontSize: 15 },

  // Sidebar
  sidebar: { width: 258, background: SIDEBAR, borderRight: "1px solid " + LINE, padding: "24px 14px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 },
  brandRow: { display: "flex", alignItems: "center", gap: 12, padding: "0 6px 22px" },
  mark: { width: 44, height: 44, borderRadius: 13, background: "linear-gradient(140deg, " + GOLD + ", #9a7a30)", color: "#0B0B0C", fontWeight: 900, fontSize: 22, fontFamily: DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(201,162,75,0.25)" },
  brandTitle: { fontSize: 17, fontWeight: 600, fontFamily: DISPLAY, letterSpacing: "-0.2px" },
  brandSub: { fontSize: 11.5, color: MUTE, marginTop: 1, letterSpacing: "0.3px" },
  navItem: { display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", background: "transparent", color: MUTE, padding: "11px 12px", borderRadius: 10, fontSize: 13.5, fontWeight: 500, cursor: "pointer", textAlign: "left", marginBottom: 2 },
  navItemOn: { background: "#212124", color: TXT, fontWeight: 600 },
  navGlyph: { fontSize: 13, width: 16, textAlign: "center", opacity: 0.85 },
  navDot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginLeft: 5 },
  navCount: { fontSize: 11.5, color: MUTE, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  navLabel: { fontSize: 10, color: "rgba(240,238,232,0.32)", fontWeight: 700, letterSpacing: "1px", padding: "18px 12px 8px" },
  navScroll: { overflowY: "auto", flex: 1, marginRight: -6, paddingRight: 6 },
  adminBtn: { display: "flex", alignItems: "center", gap: 8, width: "100%", border: "1px solid " + LINE_2, background: "transparent", color: MUTE, padding: "11px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 },

  // Main
  main: { flex: 1, padding: "28px 30px 60px", maxWidth: 1200, minWidth: 0 },
  topbar: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22, flexWrap: "wrap" },
  burger: { display: "none", border: "1px solid " + LINE_2, background: PANEL, color: TXT, width: 42, height: 42, borderRadius: 11, fontSize: 18, cursor: "pointer" },
  eyebrow: { fontSize: 10.5, color: GOLD, fontWeight: 700, letterSpacing: "1.6px", marginBottom: 4 },
  h1: { fontSize: 34, fontWeight: 600, letterSpacing: "-1px", margin: "0 0 6px", fontFamily: DISPLAY, lineHeight: 1.05 },
  live: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: SAGE },
  liveDot: { width: 7, height: 7, borderRadius: 999, background: SAGE, animation: "pulse 1.4s infinite" },
  topRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  langToggle: { display: "inline-flex", gap: 2, background: PANEL, border: "1px solid " + LINE, borderRadius: 9, padding: 3 },
  langBtn: { border: "none", background: "transparent", color: MUTE, padding: "6px 11px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.5px" },
  langOn: { background: GOLD, color: "#0B0B0C" },
  date: { background: PANEL, border: "1px solid " + LINE, borderRadius: 10, padding: "9px 12px", color: TXT, fontSize: 13.5, colorScheme: "dark" },
  saveState: { fontSize: 12.5 },
  saving: { color: GOLD, animation: "pulse 1s infinite" },
  saved: { color: SAGE },
  savedIdle: { color: MUTE },

  // Search
  searchWrap: { display: "flex", alignItems: "center", gap: 10, background: PANEL, border: "1px solid " + LINE, borderRadius: 12, padding: "0 15px", marginBottom: 24 },
  searchIcon: { fontSize: 18, opacity: 0.55 },
  searchInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: TXT, fontSize: 14, padding: "13px 0" },
  searchClear: { border: "none", background: "transparent", color: MUTE, fontSize: 22, cursor: "pointer", lineHeight: 1 },
  searchCount: { fontSize: 12.5, color: MUTE, marginBottom: 14 },

  // Hero
  hero: { display: "grid", gridTemplateColumns: "300px 1fr", gap: 34, background: "linear-gradient(135deg, " + PANEL_2 + ", " + PANEL + ")", border: "1px solid " + LINE, borderRadius: 22, padding: "30px 32px", marginBottom: 22 },
  heroLeft: { borderRight: "1px solid " + LINE, paddingRight: 28 },
  heroLabel: { fontSize: 12, color: MUTE, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 6 },
  heroNum: { fontSize: 88, fontWeight: 600, fontFamily: DISPLAY, color: GOLD, lineHeight: 0.9, letterSpacing: "-3px", margin: "8px 0 10px" },
  heroPct: { fontSize: 40, marginLeft: 2 },
  heroSub: { fontSize: 12.5, color: MUTE, marginBottom: 18 },
  heroBarTrack: { height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" },
  heroBarFill: { height: "100%", background: "linear-gradient(90deg, #9a7a30, " + GOLD + ")", borderRadius: 999, transition: "width .5s ease" },
  heroStages: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 26px", alignContent: "center" },
  heroStage: {},
  heroStageTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 },
  heroStageName: { fontSize: 13, fontWeight: 600, color: TXT },
  heroStageVal: { fontSize: 15, fontWeight: 700, color: GOLD, fontFamily: DISPLAY, fontVariantNumeric: "tabular-nums" },
  heroStageOf: { fontSize: 12, color: MUTE, fontWeight: 400 },
  heroStageTrack: { height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" },
  heroStageFill: { height: "100%", background: GOLD, borderRadius: 999, transition: "width .5s ease" },

  // KPIs
  kpis: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 },
  kpi: { background: PANEL, border: "1px solid " + LINE, borderRadius: 18, padding: "22px 22px" },
  kpiBig: { background: "linear-gradient(135deg, " + PANEL_2 + ", " + PANEL + ")" },
  kpiValue: { fontSize: 44, fontWeight: 600, fontFamily: DISPLAY, letterSpacing: "-1.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  kpiLabel: { fontSize: 12.5, color: MUTE, marginTop: 8 },

  // Attention card
  attentionCard: { background: PANEL, border: "1px solid " + LINE, borderRadius: 18, padding: "20px 22px", marginBottom: 22 },
  attentionHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  attentionTitle: { fontSize: 15, fontWeight: 600, fontFamily: DISPLAY },
  attentionCount: { fontSize: 12, fontWeight: 700, color: GOLD, background: GOLD_SOFT, borderRadius: 999, padding: "3px 10px", fontVariantNumeric: "tabular-nums" },
  attentionEmpty: { fontSize: 13.5, color: MUTE, padding: "4px 0" },
  attentionList: { display: "flex", flexDirection: "column", gap: 8 },
  attentionRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: PANEL_2, border: "1px solid " + LINE, borderRadius: 12, padding: "12px 14px", cursor: "pointer" },
  attentionName: { fontSize: 14, fontWeight: 600, color: TXT, flexShrink: 0 },
  attentionMeta: { fontSize: 12.5, color: MUTE, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  attentionFlag: { fontSize: 11.5, fontWeight: 700, color: "#d99a6b", background: "rgba(217,154,107,0.12)", border: "1px solid rgba(217,154,107,0.25)", borderRadius: 999, padding: "4px 11px", flexShrink: 0, whiteSpace: "nowrap" },

  // Table
  tableCard: { background: PANEL, border: "1px solid " + LINE, borderRadius: 18, overflow: "hidden" },
  tableHead: { padding: "20px 22px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  tableTitle: { fontSize: 16, fontWeight: 600, fontFamily: DISPLAY },
  tableSub: { fontSize: 12.5, color: MUTE },
  exportBtn: { border: "1px solid " + LINE_2, background: "transparent", color: TXT, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  tableScroll: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: { fontSize: 10.5, fontWeight: 700, color: "rgba(240,238,232,0.6)", textAlign: "center", padding: "12px 10px", borderBottom: "1px solid " + LINE, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.6px" },
  thLeft: { textAlign: "left", paddingLeft: 22 },
  tr: { cursor: "pointer", transition: "background .1s" },
  td: { fontSize: 14.5, fontWeight: 600, textAlign: "center", padding: "14px 10px", borderBottom: "1px solid " + LINE, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  tdName: { textAlign: "left", paddingLeft: 22, fontWeight: 600 },
  hint: { fontSize: 12.5, color: MUTE, marginTop: 16, textAlign: "center" },
  empty: { background: PANEL, border: "1px dashed " + LINE_2, borderRadius: 16, padding: "30px", textAlign: "center", color: MUTE, fontSize: 14 },

  // Coach stats
  coachStats: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 },

  // Tabs
  tabsRow: { marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  tabs: { display: "inline-flex", gap: 4, background: PANEL, border: "1px solid " + LINE, borderRadius: 12, padding: 4 },
  tab: { border: "none", background: "transparent", color: MUTE, padding: "9px 22px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  tabOn: { background: GOLD, color: "#0B0B0C" },
  filterBtn: { border: "1px solid " + LINE_2, background: "transparent", color: MUTE, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterBtnOn: { background: "rgba(127,176,138,0.16)", borderColor: "rgba(127,176,138,0.4)", color: SAGE },

  // Cards / list
  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: PANEL, border: "1px solid " + LINE, borderRadius: 16, padding: "17px 19px", transition: "border-color .12s" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  name: { fontSize: 15.5, fontWeight: 600 },
  progress: { fontSize: 13, fontWeight: 700, color: GOLD, background: GOLD_SOFT, borderRadius: 999, padding: "5px 13px", cursor: "pointer", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  coachLink: { border: "none", background: "transparent", color: GOLD, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 3, fontWeight: 600 },
  presentTag: { fontSize: 12, fontWeight: 600, color: SAGE, background: "rgba(127,176,138,0.14)", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" },
  attBtn: { border: "1px solid " + LINE_2, background: "transparent", color: MUTE, borderRadius: 999, padding: "9px 17px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  attOn: { background: "rgba(127,176,138,0.16)", borderColor: "rgba(127,176,138,0.45)", color: SAGE },
  infoRow: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 13 },
  infoChip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTE, background: PANEL_2, border: "1px solid " + LINE, borderRadius: 8, padding: "5px 11px" },
  steps: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 },
  step: { display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid " + LINE_2, background: "transparent", color: MUTE, borderRadius: 10, padding: "8px 13px", fontSize: 13, cursor: "pointer", transition: "all .12s ease" },
  stepOn: { borderColor: "rgba(201,162,75,0.5)", background: GOLD_SOFT, color: TXT },
  check: { width: 16, height: 16, borderRadius: 5, border: "1.5px solid " + MUTE, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#0B0B0C" },
  checkOn: { background: GOLD, borderColor: GOLD },
  cardInactive: { opacity: 0.5 },
  inactiveBadge: { fontSize: 10.5, fontWeight: 700, color: MUTE, background: "rgba(255,255,255,0.06)", border: "1px solid " + LINE, borderRadius: 999, padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.4px" },

  // Weeks
  weekBar: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  weekChip: { width: 46, height: 46, borderRadius: 13, border: "1px solid " + LINE_2, background: PANEL, color: MUTE, fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0, fontFamily: DISPLAY, fontVariantNumeric: "tabular-nums" },
  weekChipOn: { background: GOLD, borderColor: GOLD, color: "#0B0B0C" },
  weekMeta: { fontSize: 13, color: MUTE, marginBottom: 20 },
  weekTotalCard: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, " + PANEL_2 + ", " + PANEL + ")", border: "1px solid rgba(201,162,75,0.3)", borderRadius: 20, padding: "24px 28px", marginBottom: 22 },
  weekTotalLabel: { fontSize: 12.5, color: MUTE, fontWeight: 600 },
  weekTotalValue: { fontSize: 52, fontWeight: 600, fontFamily: DISPLAY, letterSpacing: "-2px", color: SAGE, lineHeight: 1, marginTop: 6, fontVariantNumeric: "tabular-nums" },
  weekTotalOf: { fontSize: 26, color: MUTE, fontWeight: 400 },
  weekTotalPct: { fontSize: 46, fontWeight: 600, color: GOLD, letterSpacing: "-1px", fontFamily: DISPLAY, fontVariantNumeric: "tabular-nums" },
  weekTotalRow: { background: "rgba(201,162,75,0.07)" },

  // Modals
  modalWrap: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20, backdropFilter: "blur(3px)" },
  modal: { background: PANEL, border: "1px solid " + LINE_2, borderRadius: 22, width: "100%", maxWidth: 500, padding: 26, animation: "fadein .2s ease", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12 },
  modalTitle: { fontSize: 22, fontWeight: 600, fontFamily: DISPLAY, letterSpacing: "-0.5px", lineHeight: 1.1 },
  modalSub: { fontSize: 12.5, color: MUTE, marginTop: 3 },
  close: { border: "none", background: "transparent", color: MUTE, fontSize: 28, cursor: "pointer", lineHeight: 1, flexShrink: 0 },

  // Detail modal
  detailStatRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "18px 0 4px" },
  detailStat: { background: PANEL_2, border: "1px solid " + LINE, borderRadius: 14, padding: "14px 12px", textAlign: "center" },
  detailStatN: { fontSize: 26, fontWeight: 600, fontFamily: DISPLAY, letterSpacing: "-1px", color: GOLD, fontVariantNumeric: "tabular-nums" },
  detailStatOf: { fontSize: 15, color: MUTE, fontWeight: 400 },
  detailStatL: { fontSize: 11, color: MUTE, marginTop: 4 },
  attGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7 },
  attCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "1px solid " + LINE_2, background: "transparent", color: MUTE, borderRadius: 10, padding: "9px 0", cursor: "pointer" },
  attCellOn: { background: "rgba(127,176,138,0.16)", borderColor: "rgba(127,176,138,0.45)", color: SAGE },
  attCellW: { fontSize: 10.5, fontWeight: 700, opacity: 0.7 },
  attCellMark: { fontSize: 15, fontWeight: 700, lineHeight: 1 },
  noteArea: { width: "100%", background: PANEL_2, border: "1px solid " + LINE_2, borderRadius: 12, padding: "12px 14px", color: TXT, fontSize: 13.5, fontFamily: BODY, resize: "vertical", lineHeight: 1.5 },

  // PIN
  pinWrap: { display: "flex", flexDirection: "column", gap: 12 },
  pinLabel: { fontSize: 13.5, color: MUTE },
  pinInput: { background: BG, border: "1px solid " + LINE_2, borderRadius: 12, padding: "14px 16px", color: TXT, fontSize: 24, letterSpacing: "10px", textAlign: "center" },
  pinErr: { borderColor: "#c96b6f" },
  pinErrText: { fontSize: 12.5, color: "#e0898c" },
  pinBtn: { background: GOLD, color: "#0B0B0C", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  pinHint: { fontSize: 11.5, color: MUTE, marginTop: 14, lineHeight: 1.5 },

  // Admin
  adminTabs: { display: "inline-flex", gap: 4, background: BG, border: "1px solid " + LINE, borderRadius: 10, padding: 4, marginBottom: 4 },
  adminTab: { border: "none", background: "transparent", color: MUTE, padding: "8px 20px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  adminTabOn: { background: GOLD, color: "#0B0B0C" },
  adminSection: { fontSize: 10.5, color: MUTE, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", margin: "20px 0 10px" },
  stageList: { display: "flex", flexDirection: "column", gap: 8 },
  stageEmpty: { fontSize: 13, color: MUTE, padding: "10px 0" },
  stageRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: BG, border: "1px solid " + LINE, borderRadius: 11, padding: "12px 15px", fontSize: 14 },
  stageDel: { border: "none", background: "transparent", color: "#e0898c", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  editBtn: { border: "1px solid " + LINE_2, background: "transparent", color: GOLD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", borderRadius: 7, padding: "5px 11px", whiteSpace: "nowrap" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  formInput: { background: BG, border: "1px solid " + LINE_2, borderRadius: 10, padding: "11px 13px", color: TXT, fontSize: 13.5, colorScheme: "dark", minWidth: 0, fontFamily: BODY },
  formActions: { display: "flex", gap: 8, marginTop: 12 },
  cancelBtn: { flex: 1, border: "1px solid " + LINE_2, background: "transparent", color: TXT, borderRadius: 10, padding: "11px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  addRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  addInput: { flex: "1 1 140px", minWidth: 0, background: BG, border: "1px solid " + LINE_2, borderRadius: 10, padding: "11px 14px", color: TXT, fontSize: 14, fontFamily: BODY },
  addBtn: { background: GOLD, color: "#0B0B0C", border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  toggleBtn: { border: "1px solid " + LINE_2, borderRadius: 7, padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  toggleOn: { background: "rgba(127,176,138,0.16)", borderColor: "rgba(127,176,138,0.4)", color: SAGE },
  toggleOff: { background: "transparent", color: MUTE },
};
