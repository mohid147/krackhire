// src/components/UserDashboard.jsx
// Dedicated user dashboard — replaces modal-based History + Tracker
// Integrated via setView('dashboard') in App.jsx

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "../lib/design.js";

const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const sb = SUPA_URL && SUPA_ANON ? createClient(SUPA_URL, SUPA_ANON) : null;

if (!sb) {
  console.warn('[Dashboard] Supabase client not initialized - missing env vars:', {
    VITE_SUPABASE_URL: SUPA_URL ? "✓" : "✗",
    VITE_SUPABASE_ANON_KEY: SUPA_ANON ? "✓" : "✗"
  });
}

/* ── Helpers ── */
const PREMIUM_PLANS = ["starter","early_adopter","pro","pro_monthly","pro_yearly",
  "college_basic","college_pro","premium","founding_user","beta_friend"];

function isPremiumPlan(plan, expiresAt) {
  if (!plan || plan === "free") return false;
  if (plan === "early_adopter" || plan === "founding_user") return true;
  if (!PREMIUM_PLANS.includes(plan)) return false;
  if (!expiresAt) return false;
  return new Date(expiresAt) > new Date();
}

function planLabel(plan) {
  const m = { free:"Free", starter:"Starter", early_adopter:"Early Adopter",
    pro:"Pro", pro_monthly:"Pro", pro_yearly:"Pro Yearly",
    founding_user:"Founding Member", beta_friend:"Beta Friend",
    college_basic:"College", college_pro:"College Pro", premium:"Premium" };
  return m[plan] || (plan ? plan.charAt(0).toUpperCase()+plan.slice(1) : "Free");
}

/* ── Primitives ── */
const Spin = ({ s=16, c=C.sage }) => (
  <span style={{ display:"inline-block", width:s, height:s, borderRadius:"50%",
    border:`2px solid ${c}25`, borderTopColor:c,
    animation:"kh-spin .7s linear infinite", flexShrink:0 }}/>
);

const Skel = ({ h=16, w="100%", r=6 }) => (
  <div style={{ height:h, width:w, borderRadius:r,
    background:"linear-gradient(90deg,#f0eeec 25%,#e8e6e3 50%,#f0eeec 75%)",
    backgroundSize:"200% 100%", animation:"kh-shimmer 1.4s infinite" }}/>
);

const Tag = ({ children, color=C.sage, bg }) => (
  <span style={{ padding:"3px 10px", borderRadius:99, background:bg||color+"15",
    color, fontSize:12, fontWeight:600, letterSpacing:.3 }}>{children}</span>
);

function ScoreRing({ score, size=56, color=C.sage, label="" }) {
  const r=22; const circ=2*Math.PI*r;
  const dash = circ * (Math.min(100, Math.max(0, score)) / 100);
  const scoreColor = score >= 70 ? C.sage : score >= 50 ? C.amber : C.red;
  const ringColor = color || scoreColor;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
      <svg width={size} height={size} viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke={C.ink4} strokeWidth="4"/>
        <circle cx="26" cy="26" r={r} fill="none" stroke={ringColor} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 26 26)"
          style={{ transition:"stroke-dasharray .8s ease" }}/>
        <text x="26" y="30" textAnchor="middle" fill={ringColor}
          fontSize="11" fontWeight="700" fontFamily="DM Sans,sans-serif">{score}</text>
      </svg>
      {label && <span style={{ fontSize:10, color:C.ink3, fontWeight:600,
        textTransform:"uppercase", letterSpacing:.5 }}>{label}</span>}
    </div>
  );
}

/* ── Job Tracker constants ── */
const JOB_STATUSES = ["Applied","Assessment","Interview","Offer","Rejected","On Hold"];
const STATUS_COLORS = {
  Applied:C.blue, Assessment:C.amber, Interview:C.purple,
  Offer:C.sage, Rejected:C.red, "On Hold":C.stone
};

/* ── DB calls ── */
async function fetchAnalyses(uid) {
  if (!sb || !uid) {
    console.warn('[Dashboard] Missing Supabase client or user ID for analyses fetch');
    return [];
  }
  try {
    const { data, error } = await sb.from("analyses")
      .select("id,company,role,gap_score,ats_score,skill_score,created_at")
      .eq("user_id", uid).order("created_at", { ascending:false }).limit(50);
    if (error) {
      console.error('[Dashboard] Error fetching analyses:', error);
      return [];
    }
    console.log('[Dashboard] Loaded analyses:', data?.length);
    return data || [];
  } catch(e) {
    console.error('[Dashboard] Exception fetching analyses:', e);
    return [];
  }
}

async function fetchJobs(uid) {
  if (!sb || !uid) {
    console.warn('[Dashboard] Missing Supabase client or user ID for jobs fetch');
    return [];
  }
  try {
    const { data, error } = await sb.from("job_tracker")
      .select("*").eq("user_id", uid)
      .order("applied_date", { ascending:false }).limit(100);
    if (error) {
      console.error('[Dashboard] Error fetching jobs:', error);
      return [];
    }
    console.log('[Dashboard] Loaded jobs:', data?.length);
    return data || [];
  } catch(e) {
    console.error('[Dashboard] Exception fetching jobs:', e);
    return [];
  }
}

async function addJob(uid, job) {
  if (!sb) {
    console.error('[Dashboard] Supabase client not available for addJob');
    return null;
  }
  try {
    const { data, error } = await sb.from("job_tracker")
      .insert({ ...job, user_id:uid }).select().single();
    if (error) {
      console.error('[Dashboard] Error adding job:', error);
      return null;
    }
    return data;
  } catch(e) {
    console.error('[Dashboard] Exception adding job:', e);
    return null;
  }
}

async function updateJob(id, updates) {
  if (!sb) return;
  try {
    const { error } = await sb.from("job_tracker").update(updates).eq("id", id);
    if (error) console.error('[Dashboard] Error updating job:', error);
  } catch(e) {
    console.error('[Dashboard] Exception updating job:', e);
  }
}

async function deleteJob(id) {
  if (!sb) return;
  try {
    const { error } = await sb.from("job_tracker").delete().eq("id", id);
    if (error) console.error('[Dashboard] Error deleting job:', error);
  } catch(e) {
    console.error('[Dashboard] Exception deleting job:', e);
  }
}

/* ═══════════════════════════════════════════════════════════
   TAB: OVERVIEW
═══════════════════════════════════════════════════════════ */
function OverviewTab({ user, profile, analyses, jobs, onNavigate, onUpgrade }) {
  const isPro = isPremiumPlan(profile?.plan, profile?.plan_expires_at);
  const lifetimeLeft = profile?.lifetime_accesses_remaining ?? 0;
  const used = profile?.analyses_this_month || 0;

  const avgScore = useMemo(() => {
    const valid = analyses.filter(a => a.gap_score != null);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, a) => s + a.gap_score, 0) / valid.length);
  }, [analyses]);

  const jobStats = useMemo(() => {
    const s = {};
    JOB_STATUSES.forEach(st => s[st] = jobs.filter(j => j.status === st).length);
    return s;
  }, [jobs]);

  const planColor = {
    founding_user:C.purple, beta_friend:C.blue,
    early_adopter:C.purple,
  }[profile?.plan] || (isPro ? C.amber : C.stone);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* Welcome + plan card */}
      <div style={{ background:`linear-gradient(135deg,${C.sage},#2D5240)`,
        borderRadius:14, padding:"24px 24px", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-20, top:-20, width:120, height:120,
          borderRadius:"50%", background:"rgba(255,255,255,.06)" }}/>
        <div style={{ position:"absolute", right:20, bottom:-30, width:80, height:80,
          borderRadius:"50%", background:"rgba(255,255,255,.04)" }}/>
        <div style={{ fontSize:22, fontFamily:"'Lora',Georgia,serif", fontWeight:700,
          marginBottom:4, position:"relative" }}>
          Hey, {user?.user_metadata?.name?.split(" ")[0] || "there"} 👋
        </div>
        <div style={{ fontSize:14, opacity:.8, marginBottom:18, position:"relative" }}>
          {user?.email}
        </div>
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", position:"relative" }}>
          <div style={{ background:"rgba(255,255,255,.12)", borderRadius:10,
            padding:"12px 16px", minWidth:100, backdropFilter:"blur(4px)" }}>
            <div style={{ fontSize:22, fontWeight:800 }}>{planLabel(profile?.plan)}</div>
            <div style={{ fontSize:11, opacity:.75, textTransform:"uppercase", letterSpacing:.8, marginTop:2 }}>Current plan</div>
          </div>
          {isPro ? (
            profile?.plan_expires_at && !["founding_user","early_adopter"].includes(profile.plan) ? (
              <div style={{ background:"rgba(255,255,255,.12)", borderRadius:10,
                padding:"12px 16px", backdropFilter:"blur(4px)" }}>
                <div style={{ fontSize:15, fontWeight:700 }}>
                  {new Date(profile.plan_expires_at).toLocaleDateString("en-IN",
                    { day:"numeric", month:"short", year:"numeric" })}
                </div>
                <div style={{ fontSize:11, opacity:.75, textTransform:"uppercase", letterSpacing:.8, marginTop:2 }}>Plan expires</div>
              </div>
            ) : (
              <div style={{ background:"rgba(255,255,255,.12)", borderRadius:10,
                padding:"12px 16px", backdropFilter:"blur(4px)" }}>
                <div style={{ fontSize:15, fontWeight:700 }}>Lifetime ♾</div>
                <div style={{ fontSize:11, opacity:.75, textTransform:"uppercase", letterSpacing:.8, marginTop:2 }}>Access</div>
              </div>
            )
          ) : (
            <div style={{ background:"rgba(255,255,255,.12)", borderRadius:10,
              padding:"12px 16px", backdropFilter:"blur(4px)" }}>
              <div style={{ fontSize:22, fontWeight:800 }}>{used}/3</div>
              <div style={{ fontSize:11, opacity:.75, textTransform:"uppercase", letterSpacing:.8, marginTop:2 }}>Free analyses used</div>
            </div>
          )}
          {lifetimeLeft > 0 && !isPro && (
            <div style={{ background:"rgba(255,255,255,.12)", borderRadius:10,
              padding:"12px 16px", backdropFilter:"blur(4px)" }}>
              <div style={{ fontSize:22, fontWeight:800 }}>⚡ {lifetimeLeft}</div>
              <div style={{ fontSize:11, opacity:.75, textTransform:"uppercase", letterSpacing:.8, marginTop:2 }}>Lifetime accesses</div>
            </div>
          )}
        </div>
        {!isPro && (
          <button onClick={onUpgrade}
            style={{ marginTop:16, padding:"10px 20px", borderRadius:9,
              background:"#fff", color:C.sage, fontSize:13.5, fontWeight:700,
              cursor:"pointer", border:"none", fontFamily:"inherit", position:"relative" }}>
            ⚡ Upgrade to Pro — ₹49/month
          </button>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12 }}>
        {[
          { label:"Total Analyses", value:analyses.length, color:C.sage,   icon:"🔍", action:()=>onNavigate("analyses") },
          { label:"Avg Score",      value:avgScore ?? "—", color:C.blue,   icon:"📊", action:()=>onNavigate("analyses") },
          { label:"Jobs Tracked",   value:jobs.length,     color:C.purple, icon:"📋", action:()=>onNavigate("tracker") },
          { label:"Interviews",     value:jobStats["Interview"]||0, color:C.amber, icon:"🎯", action:()=>onNavigate("tracker") },
        ].map((s,i) => (
          <button key={i} onClick={s.action}
            style={{ padding:"16px 14px", background:C.surface, borderRadius:12,
              border:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left",
              fontFamily:"inherit", transition:"all .18s", boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.08)"; e.currentTarget.style.transform="translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.05)"; e.currentTarget.style.transform="none"; }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{s.icon}</div>
            <div style={{ fontSize:24, fontWeight:800, color:s.color, lineHeight:1, marginBottom:4 }}>{s.value}</div>
            <div style={{ fontSize:11.5, color:C.ink3, fontWeight:600, textTransform:"uppercase", letterSpacing:.4 }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Recent analyses */}
      {analyses.length > 0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>Recent analyses</span>
            <button onClick={()=>onNavigate("analyses")}
              style={{ fontSize:13, color:C.blue, fontWeight:600, cursor:"pointer",
                background:"none", border:"none", fontFamily:"inherit" }}>View all →</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {analyses.slice(0,4).map((a,i) => {
              const clr = a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
              return (
                <div key={a.id||i} style={{ display:"flex", alignItems:"center", gap:14,
                  padding:"13px 16px", background:C.surface, borderRadius:10,
                  border:`1px solid ${C.border}` }}>
                  <ScoreRing score={a.gap_score??0} size={52} color={clr}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.ink,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {a.role||"Unknown role"}{a.company?` — ${a.company}`:""}
                    </div>
                    <div style={{ fontSize:12, color:C.ink3, marginTop:3 }}>
                      {new Date(a.created_at).toLocaleDateString("en-IN",
                        { day:"numeric", month:"short", year:"numeric" })}
                      {a.ats_score != null && ` · ATS: ${a.ats_score}`}
                      {a.skill_score != null && ` · Skills: ${a.skill_score}`}
                    </div>
                  </div>
                  <div style={{ fontSize:18, fontWeight:800, color:clr, flexShrink:0 }}>
                    {a.gap_score ?? "—"}<span style={{ fontSize:11, color:C.ink3, fontWeight:400 }}>/100</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job pipeline */}
      {jobs.length > 0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>Application pipeline</span>
            <button onClick={()=>onNavigate("tracker")}
              style={{ fontSize:13, color:C.blue, fontWeight:600, cursor:"pointer",
                background:"none", border:"none", fontFamily:"inherit" }}>Manage →</button>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {JOB_STATUSES.filter(st => jobStats[st] > 0).map(st => (
              <div key={st} style={{ padding:"8px 16px", borderRadius:99,
                background:STATUS_COLORS[st]+"15", color:STATUS_COLORS[st],
                fontSize:13, fontWeight:600 }}>
                {st}: {jobStats[st]}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: ANALYSES HISTORY
═══════════════════════════════════════════════════════════ */
function AnalysesTab({ analyses, loading, onRefresh }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return analyses;
    const q = search.toLowerCase();
    return analyses.filter(a =>
      a.role?.toLowerCase().includes(q) || a.company?.toLowerCase().includes(q)
    );
  }, [analyses, search]);

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {[1,2,3,4].map(i => <Skel key={i} h={72} r={10}/>)}
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Controls */}
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Filter by role or company…"
          style={{ flex:1, padding:"10px 14px", borderRadius:9,
            border:`1.5px solid ${C.border}`, background:C.surface,
            fontSize:14, color:C.ink, fontFamily:"inherit", outline:"none" }}/>
        <button onClick={onRefresh}
          style={{ padding:"10px 16px", borderRadius:9, border:`1.5px solid ${C.border}`,
            background:C.surface, fontSize:14, color:C.ink2, cursor:"pointer",
            fontFamily:"inherit", fontWeight:600, minHeight:44 }}>↻</button>
        <div style={{ fontSize:13, color:C.ink3, whiteSpace:"nowrap" }}>
          {filtered.length} {filtered.length===1?"analysis":"analyses"}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 20px", color:C.ink3 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
          <div style={{ fontSize:15, marginBottom:6, color:C.ink2 }}>
            {search ? "No results found." : "No analyses yet."}
          </div>
          <div style={{ fontSize:13 }}>
            {search ? "Try a different search term." : "Run your first analysis in the tool."}
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map((a, i) => {
            const clr = a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
            return (
              <div key={a.id||i} style={{ display:"flex", alignItems:"center", gap:16,
                padding:"16px 18px", background:C.surface, borderRadius:12,
                border:`1px solid ${C.border}`, transition:"box-shadow .18s" }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.07)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <ScoreRing score={a.gap_score??0} size={60} color={clr} label="Score"/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.ink,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {a.role || "Unknown role"}
                  </div>
                  {a.company && (
                    <div style={{ fontSize:13, color:C.ink2, marginTop:2 }}>@ {a.company}</div>
                  )}
                  <div style={{ display:"flex", gap:10, marginTop:6, flexWrap:"wrap" }}>
                    {a.ats_score   != null && <Tag color={C.blue}   bg={C.blueBg}>ATS: {a.ats_score}</Tag>}
                    {a.skill_score != null && <Tag color={C.purple} bg={C.purpleBg}>Skills: {a.skill_score}</Tag>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:22, fontWeight:800, color:clr }}>
                    {a.gap_score ?? "—"}<span style={{ fontSize:12, color:C.ink3, fontWeight:400 }}>/100</span>
                  </div>
                  <div style={{ fontSize:11.5, color:C.ink3, marginTop:4 }}>
                    {new Date(a.created_at).toLocaleDateString("en-IN",
                      { day:"numeric", month:"short", year:"numeric" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: JOB TRACKER
═══════════════════════════════════════════════════════════ */
function TrackerTab({ jobs, setJobs, user, toast }) {
  const [showAdd,  setShowAdd]  = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    company:"", role:"", source:"", status:"Applied",
    applied_date: new Date().toISOString().split("T")[0],
    round:"", notes:"", follow_up_date:"",
  });

  const F = k => ({ value:form[k]||"", onChange:v=>setForm(p=>({...p,[k]:v})) });

  function resetForm() {
    setForm({ company:"", role:"", source:"", status:"Applied",
      applied_date:new Date().toISOString().split("T")[0],
      round:"", notes:"", follow_up_date:"" });
  }

  async function handleAdd() {
    if (!form.company.trim() || !form.role.trim()) {
      toast && toast("Company and role are required.", "error"); return;
    }
    const saved = await addJob(user.id, form);
    if (saved) { setJobs(p => [saved, ...p]); resetForm(); setShowAdd(false); }
  }

  async function handleStatusChange(id, status) {
    await updateJob(id, { status });
    setJobs(p => p.map(j => j.id===id ? {...j, status} : j));
  }

  async function handleDelete(id) {
    if (!confirm("Remove this job from tracker?")) return;
    await deleteJob(id);
    setJobs(p => p.filter(j => j.id !== id));
  }

  const stats = useMemo(() => {
    const s = {};
    JOB_STATUSES.forEach(st => s[st] = jobs.filter(j => j.status===st).length);
    return s;
  }, [jobs]);

  const visible = useMemo(() =>
    statusFilter === "all" ? jobs : jobs.filter(j => j.status===statusFilter),
    [jobs, statusFilter]
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Status pills */}
      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
        <button onClick={()=>setStatusFilter("all")}
          style={{ padding:"7px 16px", borderRadius:99, border:`1.5px solid ${statusFilter==="all"?C.sage:C.border}`,
            background:statusFilter==="all"?C.sageBg:C.surface, color:statusFilter==="all"?C.sage:C.ink2,
            fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
            whiteSpace:"nowrap", minHeight:36, flexShrink:0 }}>
          All ({jobs.length})
        </button>
        {JOB_STATUSES.map(st => (
          <button key={st} onClick={()=>setStatusFilter(st)}
            style={{ padding:"7px 16px", borderRadius:99,
              border:`1.5px solid ${statusFilter===st?STATUS_COLORS[st]:C.border}`,
              background:statusFilter===st?STATUS_COLORS[st]+"18":C.surface,
              color:statusFilter===st?STATUS_COLORS[st]:C.ink2,
              fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
              whiteSpace:"nowrap", minHeight:36, flexShrink:0 }}>
            {st} ({stats[st]||0})
          </button>
        ))}
        <button onClick={()=>{ resetForm(); setShowAdd(!showAdd); }}
          style={{ marginLeft:"auto", padding:"7px 16px", borderRadius:99,
            background:C.sage, color:"#fff", border:"none", fontSize:13, fontWeight:700,
            cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
            minHeight:36, flexShrink:0 }}>
          + Add Job
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ padding:"18px 18px", background:C.bg, borderRadius:12,
          border:`1px solid ${C.border}`, animation:"kh-slideUp .2s ease" }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:14 }}>Add Application</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}
            className="tracker-input-grid">
            <SimpleField label="Company *" {...F("company")} placeholder="e.g. Infosys"/>
            <SimpleField label="Role *"    {...F("role")}    placeholder="e.g. SDE Trainee"/>
            <SimpleField label="Source"    {...F("source")}  placeholder="Naukri / LinkedIn"/>
            <SimpleField label="Date Applied" type="date" {...F("applied_date")}/>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2,
                letterSpacing:.5, textTransform:"uppercase" }}>Status</label>
              <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}
                style={{ padding:"11px 13px", borderRadius:9, border:`1.5px solid ${C.border}`,
                  background:C.bg, fontSize:15, color:C.ink, fontFamily:"inherit", minHeight:44 }}>
                {JOB_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <SimpleField label="Round"           {...F("round")}          placeholder="e.g. Round 1"/>
            <SimpleField label="Follow-up Date"  type="date" {...F("follow_up_date")}/>
          </div>
          <SimpleField label="Notes" {...F("notes")} placeholder="Any notes…" rows={2}/>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button onClick={handleAdd}
              style={{ padding:"10px 20px", borderRadius:9, background:C.sage, color:"#fff",
                fontSize:14, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit", minHeight:44 }}>
              Save Application
            </button>
            <button onClick={()=>setShowAdd(false)}
              style={{ padding:"10px 16px", borderRadius:9, border:`1.5px solid ${C.border}`,
                background:C.surface, color:C.ink2, fontSize:14, fontWeight:600,
                cursor:"pointer", fontFamily:"inherit", minHeight:44 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Jobs list */}
      {visible.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 20px", color:C.ink3 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:15, color:C.ink2, marginBottom:6 }}>
            {statusFilter !== "all" ? `No ${statusFilter} applications.` : "No applications yet."}
          </div>
          <div style={{ fontSize:13 }}>Click "+ Add Job" to start tracking.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {visible.map(job => (
            <div key={job.id} style={{ padding:"14px 18px", background:C.surface,
              borderRadius:12, border:`1px solid ${C.border}`,
              display:"flex", alignItems:"flex-start", gap:14, transition:"box-shadow .18s" }}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.07)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:5 }}>
                  <span style={{ fontSize:15, fontWeight:700, color:C.ink }}>{job.company}</span>
                  <span style={{ fontSize:13, color:C.ink3 }}>·</span>
                  <span style={{ fontSize:14, color:C.ink2 }}>{job.role}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <select value={job.status} onChange={e=>handleStatusChange(job.id,e.target.value)}
                    style={{ padding:"3px 10px", borderRadius:99,
                      background:STATUS_COLORS[job.status]+"18",
                      color:STATUS_COLORS[job.status], fontSize:12.5,
                      fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit" }}>
                    {JOB_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  {job.applied_date   && <span style={{ fontSize:12, color:C.ink3 }}>Applied {job.applied_date}</span>}
                  {job.source         && <span style={{ fontSize:12, color:C.ink3 }}>via {job.source}</span>}
                  {job.follow_up_date && <span style={{ fontSize:12, color:C.amber }}>📅 {job.follow_up_date}</span>}
                </div>
                {job.notes && (
                  <div style={{ fontSize:13, color:C.ink3, marginTop:6, lineHeight:1.55 }}>{job.notes}</div>
                )}
              </div>
              <button onClick={()=>handleDelete(job.id)}
                style={{ color:C.ink4, fontSize:18, cursor:"pointer", background:"none",
                  border:"none", lineHeight:1, padding:"2px 6px", borderRadius:6,
                  flexShrink:0, transition:"color .15s" }}
                onMouseEnter={e=>e.currentTarget.style.color=C.red}
                onMouseLeave={e=>e.currentTarget.style.color=C.ink4}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* simple field used inside TrackerTab */
function SimpleField({ label, value, onChange, placeholder, rows, type="text" }) {
  const [f, setF] = useState(false);
  const base = {
    padding:"11px 13px", borderRadius:9,
    border:`1.5px solid ${f?C.sage:C.border}`,
    background:f?C.surface:C.bg, fontSize:15, color:C.ink,
    fontFamily:"inherit", outline:"none", width:"100%",
    transition:"all .18s", WebkitAppearance:"none",
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2,
        letterSpacing:.5, textTransform:"uppercase" }}>{label}</label>}
      {rows
        ? <textarea value={value} onChange={e=>onChange(e.target.value)}
            placeholder={placeholder} rows={rows}
            onFocus={()=>setF(true)} onBlur={()=>setF(false)}
            style={{ ...base, resize:"vertical", lineHeight:1.65 }}/>
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)}
            placeholder={placeholder}
            onFocus={()=>setF(true)} onBlur={()=>setF(false)}
            style={base}/>
      }
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: ACCOUNT
═══════════════════════════════════════════════════════════ */
function AccountTab({ user, profile, onSignOut, onUpgrade, onInvite }) {
  const isPro = isPremiumPlan(profile?.plan, profile?.plan_expires_at);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:520 }}>

      {/* Profile card */}
      <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`,
        overflow:"hidden" }}>
        <div style={{ padding:"20px 20px", background:C.bg,
          borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:14 }}>
          {user?.user_metadata?.avatar_url ? (
            <img src={user.user_metadata.avatar_url} alt=""
              style={{ width:52, height:52, borderRadius:"50%", flexShrink:0 }}/>
          ) : (
            <div style={{ width:52, height:52, borderRadius:"50%", background:C.sage,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20, fontWeight:800, color:"#fff", flexShrink:0 }}>
              {(user?.user_metadata?.name||user?.email||"U")[0].toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:C.ink }}>
              {user?.user_metadata?.name || user?.email?.split("@")[0] || "User"}
            </div>
            <div style={{ fontSize:13.5, color:C.ink3, marginTop:2 }}>{user?.email}</div>
          </div>
        </div>
        {[
          ["Plan",          planLabel(profile?.plan)],
          ["Analyses used", `${profile?.analyses_this_month||0} this month`],
          ["Lifetime accesses", `${profile?.lifetime_accesses_remaining??0} remaining`],
          profile?.plan_expires_at && !["founding_user","early_adopter"].includes(profile.plan)
            ? ["Plan expires", new Date(profile.plan_expires_at).toLocaleDateString("en-IN",
                { day:"numeric", month:"long", year:"numeric" })]
            : null,
        ].filter(Boolean).map(([k,v]) => (
          <div key={k} style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13.5, color:C.ink2 }}>{k}</span>
            <span style={{ fontSize:13.5, fontWeight:600, color:C.ink }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      {!isPro && (
        <button onClick={onUpgrade}
          style={{ padding:"14px 20px", borderRadius:10, background:C.sage,
            color:"#fff", fontSize:14.5, fontWeight:700, cursor:"pointer",
            border:"none", fontFamily:"inherit", textAlign:"left", minHeight:52,
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span>⚡ Upgrade to Pro</span>
          <span style={{ opacity:.8 }}>₹49/month →</span>
        </button>
      )}

      <button onClick={onInvite}
        style={{ padding:"14px 20px", borderRadius:10, background:C.blueBg,
          color:C.blue, fontSize:14, fontWeight:600, cursor:"pointer",
          border:`1px solid ${C.blue}20`, fontFamily:"inherit", textAlign:"left",
          minHeight:52, display:"flex", alignItems:"center", gap:10 }}>
        🎟️ Redeem invite code
      </button>

      <button onClick={onSignOut}
        style={{ padding:"14px 20px", borderRadius:10, background:C.redBg,
          color:C.red, fontSize:14, fontWeight:600, cursor:"pointer",
          border:`1px solid ${C.red}20`, fontFamily:"inherit", textAlign:"left",
          minHeight:52, display:"flex", alignItems:"center", gap:10 }}>
        Sign out
      </button>

      <p style={{ fontSize:12.5, color:C.ink3, lineHeight:1.7 }}>
        For billing issues or account deletion, email{" "}
        <a href="mailto:hellokrackhire@gmail.com" style={{ color:C.blue }}>
          hellokrackhire@gmail.com
        </a>
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════════ */
const TABS = [
  { id:"overview",  label:"Overview",  icon:"🏠" },
  { id:"analyses",  label:"Analyses",  icon:"🔍" },
  { id:"tracker",   label:"Job Tracker",icon:"📋" },
  { id:"account",   label:"Account",   icon:"👤" },
];

export default function UserDashboard({
  user, profile, onBack, onSignOut, onUpgrade, onInvite, toast
}) {
  const [activeTab,  setActiveTab]  = useState("overview");
  const [analyses,   setAnalyses]   = useState([]);
  const [jobs,       setJobs]       = useState([]);
  const [loadingA,   setLoadingA]   = useState(true);
  const [loadingJ,   setLoadingJ]   = useState(true);

  const loadAnalyses = useCallback(async () => {
    if (!user?.id) {
      console.warn('[Dashboard] No user ID available for fetchAnalyses');
      return;
    }
    setLoadingA(true);
    try {
      const data = await fetchAnalyses(user.id);
      setAnalyses(data);
    } catch(e) {
      console.error('[Dashboard] Failed to load analyses:', e);
      setAnalyses([]);
    }
    setLoadingA(false);
  }, [user?.id]);

  const loadJobs = useCallback(async () => {
    if (!user?.id) {
      console.warn('[Dashboard] No user ID available for fetchJobs');
      return;
    }
    setLoadingJ(true);
    try {
      const data = await fetchJobs(user.id);
      setJobs(data);
    } catch(e) {
      console.error('[Dashboard] Failed to load jobs:', e);
      setJobs([]);
    }
    setLoadingJ(false);
  }, [user?.id]);

  useEffect(() => { 
    console.log('[Dashboard] Component mounted', { userId: user?.id, email: user?.email });
    loadAnalyses(); 
    loadJobs(); 
  }, [loadAnalyses, loadJobs]);

  // Scroll to top on mount
  useEffect(() => { window.scrollTo({ top:0, behavior:"instant" }); }, []);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <style>{`
        @keyframes kh-spin    { to { transform:rotate(360deg); } }
        @keyframes kh-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes kh-slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @media(max-width:768px){.tracker-input-grid{grid-template-columns:1fr!important}}
      `}</style>

      {/* Header */}
      <header style={{ position:"sticky", top:0, zIndex:100, height:54,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 clamp(14px,4vw,32px)",
        background:"rgba(249,248,246,.97)", backdropFilter:"blur(14px)",
        borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:8, fontWeight:700,
            fontSize:15, color:C.ink, letterSpacing:"-.3px" }}>
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="9" fill="#3D6B4F"/>
              <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white"/>
              <circle cx="31" cy="31" r="7" fill="#6EBD8A"/>
              <path d="M28 31L30.5 33.5L34.5 29" stroke="#3D6B4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Krack<span style={{ color:C.sage }}>Hire</span>
          </div>
          <span style={{ padding:"2px 8px", borderRadius:99, background:C.sageBg,
            color:C.sage, fontSize:11, fontWeight:700 }}>Dashboard</span>
        </div>
        <button onClick={onBack}
          style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${C.border}`,
            background:C.surface, color:C.ink2, fontSize:13.5, fontWeight:600,
            cursor:"pointer", fontFamily:"inherit", minHeight:40 }}>
          ← Back to tool
        </button>
      </header>

      <div style={{ maxWidth:780, margin:"0 auto", padding:"24px clamp(14px,4vw,24px) 80px" }}>

        {/* Tab bar */}
        <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`,
          marginBottom:24, overflowX:"auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              style={{ padding:"11px 16px", background:"transparent", border:"none",
                borderBottom:activeTab===t.id?`2.5px solid ${C.sage}`:"2.5px solid transparent",
                color:activeTab===t.id?C.sage:C.ink3,
                fontWeight:activeTab===t.id?700:500, fontSize:14, cursor:"pointer",
                whiteSpace:"nowrap", fontFamily:"inherit",
                display:"flex", alignItems:"center", gap:6, transition:"color .15s",
                minHeight:44 }}>
              {t.icon} {t.label}
              {t.id==="analyses" && analyses.length > 0 && (
                <span style={{ background:C.sageBg, color:C.sage, borderRadius:99,
                  fontSize:11, padding:"1px 6px", fontWeight:700 }}>{analyses.length}</span>
              )}
              {t.id==="tracker" && jobs.length > 0 && (
                <span style={{ background:C.blueBg, color:C.blue, borderRadius:99,
                  fontSize:11, padding:"1px 6px", fontWeight:700 }}>{jobs.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ animation:"kh-slideUp .25s ease" }}>
          {activeTab === "overview" && (
            <OverviewTab user={user} profile={profile}
              analyses={analyses} jobs={jobs}
              onNavigate={setActiveTab} onUpgrade={onUpgrade}/>
          )}
          {activeTab === "analyses" && (
            <AnalysesTab analyses={analyses} loading={loadingA} onRefresh={loadAnalyses}/>
          )}
          {activeTab === "tracker" && (
            <TrackerTab jobs={jobs} setJobs={setJobs} user={user} toast={toast}/>
          )}
          {activeTab === "account" && (
            <AccountTab user={user} profile={profile}
              onSignOut={onSignOut} onUpgrade={onUpgrade} onInvite={onInvite}/>
          )}
        </div>
      </div>
    </div>
  );
}
