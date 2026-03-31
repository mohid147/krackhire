import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelmetProvider } from 'react-helmet-async';
import AuthModal from './components/AuthModal.jsx';
import FileUpload from './components/FileUpload';
import { usePageTracking } from './components/GoogleAnalytics';
import PDFReportModal from './components/PDFReportModal.jsx';
import { HomePageSEO } from './components/SEO';
import { ProductSchema } from './components/StructuredData';
import UserDashboard from './components/UserDashboard.jsx';
import { C } from './lib/design.js';
import supabase from './lib/supabase.js';

/* ─── SUPABASE ───────────────────────────────────────────── */
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SITE_URL = import.meta.env.VITE_SITE_URL || "https://www.krackhire.in";

// CRITICAL: Validate environment configuration on startup
const ENV_ERRORS = [];
if (!SUPA_URL) ENV_ERRORS.push("VITE_SUPABASE_URL not configured");
if (!SUPA_ANON) ENV_ERRORS.push("VITE_SUPABASE_ANON_KEY not configured");
if (ENV_ERRORS.length > 0) {
  console.error("[KH] Configuration errors:", ENV_ERRORS);
}

// Track sent emails per session — prevents duplicate triggers
const _emailSent = new Set();

const sb = supabase;


/* ─── SUPABASE HELPERS ───────────────────────────────────── */
async function signInGoogle() {
  if (!sb) return;
  await sb.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:"https://www.krackhire.in", queryParams:{ access_type:"offline", prompt:"consent" }}});
}
async function doSignOut()        { if (sb) await sb.auth.signOut().catch(()=>{}); }
async function getProfile(uid)    { if (!sb||!uid) return null; try { const { data, error } = await sb.from("profiles").select("*").eq("id",uid).single(); if(error){ console.error("getProfile error:",error.message,error.code); return null; } return data; } catch(e){ console.error("getProfile catch:",e.message); return null; } }
async function getAnalyses(uid)   { if (!sb||!uid) return []; try { const { data } = await sb.from("analyses").select("id,company,role,gap_score,ats_score,skill_score,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(20); return data||[]; } catch(e) { return []; } }
async function getApprovedRevs()  { if (!sb) return []; try { const { data } = await sb.from("reviews").select("*").eq("approved",true).order("created_at",{ascending:false}).limit(20); return data||[]; } catch(e) { return []; } }
async function saveReview(r)      { if (!sb) return; try { await sb.from("reviews").insert({...r,approved:false}); } catch(e) { console.error("saveReview:",e.message); throw e; } }
async function saveFeedback(f)    { if (!sb) return; await sb.from("feedback").insert(f).catch(()=>{}); }
async function getTrackerJobs(uid){ if (!sb) return []; const { data } = await sb.from("job_tracker").select("*").eq("user_id",uid).order("applied_date",{ascending:false}).limit(50); return data||[]; }
async function saveTrackerJob(uid,job){ if (!sb) return null; const { data } = await sb.from("job_tracker").insert({...job,user_id:uid}).select().single(); return data; }
async function updateTrackerJob(id,updates){ if (!sb) return; await sb.from("job_tracker").update(updates).eq("id",id); }
async function deleteTrackerJob(id){ if (!sb) return; await sb.from("job_tracker").delete().eq("id",id); }

async function verifyPaymentReturn(txnId, userId) {
  try {
    const res = await callPayU("verify", { txnId, userId });
    return res;
  } catch(e) {
    console.error("verifyPaymentReturn:", e.message);
    return { success:false };
  }
}

async function redeemInviteCode(code, uid) {
  if (!sb || !code || !uid) return { ok:false, error:"Missing code or user." };
  const { data:inv, error } = await sb.from("invite_codes").select("*").eq("code", code.trim().toUpperCase()).single();
  if (error || !inv) return { ok:false, error:"Invalid invite code." };
  if ((inv.used_count||0) >= inv.usage_limit) return { ok:false, error:"This code has reached its usage limit." };
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return { ok:false, error:"This invite code has expired." };
  const accessUntil = new Date(Date.now() + (inv.access_days||30) * 86400000).toISOString();
  await sb.from("profiles").update({ plan:"beta_friend", plan_expires_at:accessUntil }).eq("id", uid);
  await sb.from("invite_codes").update({ used_count:(inv.used_count||0)+1 }).eq("id", inv.id);
  await sb.from("invite_redemptions").insert({ invite_code_id:inv.id, user_id:uid }).catch(()=>{});
  return { ok:true, accessUntil };
}

/* ─── API CALLS ──────────────────────────────────────────── */
async function callAPI(type, payload) {
  // Check network before calling
  if(typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No internet connection. Please check your network and try again.");
  }
  const ctrl = new AbortController();
  const tid  = setTimeout(()=>ctrl.abort(), 50000);
  try {
    const res  = await fetch("/api/analyse", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type,...payload}), signal:ctrl.signal });
    clearTimeout(tid);
    const data = await parseApiResponse(res, "Analysis service error");
    if (!res.ok) throw new Error(data?.error || data?.message || "Request failed");
    return data.result;
  } catch(e) { clearTimeout(tid); if(e.name==="AbortError") throw new Error("Timed out. Please try again."); throw e; }
}

async function callEmail(type, userId, data) {
  try {
    const res = await fetch("/api/email", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({type, userId, data}),
    });
    const d = await parseApiResponse(res, "Email service error");
    return d;
  } catch(e) {
    console.warn("callEmail error:", e.message);
    return {success:false};
  }
}

async function callPayU(action, body) {
  try {
    const res  = await fetch("/api/payment", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action,...body}) });
    const data = await parseApiResponse(res, "Payment service error");
    if (!res.ok) throw new Error(data?.message || data?.error || "Payment error");
    return data;
  } catch(e) {
    console.error("callPayU error:", e.message);
    throw e;
  }
}

async function parseApiResponse(res, fallbackMessage) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const msg = raw.slice(0, 180).trim() || fallbackMessage;
    throw new Error(msg);
  }
}

function parseJSON(raw) { try { return JSON.parse(raw.replace(/```json|```/g,"").trim()); } catch { return null; } }
/* ─── PLAN HELPERS ───────────────────────────────────────── */
const PREMIUM_PLANS = ["starter","early_adopter","pro","pro_monthly","pro_yearly","college_basic","college_pro","premium","founding_user","beta_friend"];
function isPremiumPlan(plan, expiresAt) {
  if (!plan || plan === "free") return false;
  if (plan === "early_adopter" || plan === "founding_user") return true;
  if (!PREMIUM_PLANS.includes(plan)) return false;
  if (!expiresAt) return false;
  return new Date(expiresAt) > new Date();
}
function planDisplayLabel(plan) {
  const m = { free:"Free", starter:"Starter", early_adopter:"Early Adopter", pro:"Pro", pro_monthly:"Pro", pro_yearly:"Pro Yearly", founding_user:"Founding Member", beta_friend:"Beta Friend", college_basic:"College", college_pro:"College Pro", premium:"Premium" };
  return m[plan] || (plan ? plan.charAt(0).toUpperCase()+plan.slice(1) : "Free");
}

/* ─── DESIGN TOKENS (shared across all components) ──────── */
// Imported from: src/lib/design.js

/* ─── TOAST ──────────────────────────────────────────────── */
function ToastItem({ id, msg, type, onClose }) {
  useEffect(()=>{ const t=setTimeout(()=>onClose(id),4200); return()=>clearTimeout(t); },[id,onClose]);
  const m = { success:[C.sage,C.sageBg], error:[C.red,C.redBg], info:[C.blue,C.blueBg], warn:[C.amber,C.amberBg] };
  const [clr,bg] = m[type]||m.info;
  return (
    <div style={{ padding:"12px 16px", background:bg, border:`1px solid ${clr}30`, borderRadius:10, boxShadow:"0 4px 16px rgba(0,0,0,.08)", display:"flex", alignItems:"center", gap:10, fontSize:13.5, color:clr, fontWeight:500, maxWidth:340, animation:"slideUp .25s ease" }}>
      <span className="inline">{type==="success"?"✓":type==="error"?"✕":type==="warn"?"⚠":"·"}</span>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={()=>onClose(id)} className="inline" style={{ opacity:.5, fontSize:18, lineHeight:1, color:clr }}>×</button>
    </div>
  );
}
function Toasts({ list, remove }) {
  return (
    <div style={{ position:"fixed", bottom:16, right:16, zIndex:9999, display:"flex", flexDirection:"column", gap:8, pointerEvents:"none", maxWidth:"calc(100vw - 32px)" }}>
      {list.map(t=><div key={t.id} style={{ pointerEvents:"all" }}><ToastItem {...t} onClose={remove}/></div>)}
    </div>
  );
}
/* ─── ERROR BOUNDARY ────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error) { return { hasError:true, error }; }
  componentDidCatch(error, info) { console.error("[KH] ErrorBoundary caught:", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#F9F8F6", padding:24, textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
        <h2 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:22, color:"#1C1917", marginBottom:10 }}>Something went wrong</h2>
        <p style={{ fontSize:15, color:"#78716C", marginBottom:24, maxWidth:360, lineHeight:1.7 }}>
          We hit an unexpected error. Your data is safe. Please refresh the page.
        </p>
        <button onClick={()=>window.location.reload()}
          style={{ padding:"12px 28px", background:"#3D6B4F", color:"#fff", borderRadius:10, fontSize:15, fontWeight:600, cursor:"pointer", border:"none", fontFamily:"inherit" }}>
          Refresh page
        </button>
        <p style={{ fontSize:12, color:"#A8A29E", marginTop:16 }}>
          If this keeps happening, contact <a href="mailto:hellokrackhire@gmail.com" style={{ color:"#3D6B4F" }}>hellokrackhire@gmail.com</a>
        </p>
      </div>
    );
  }
}

function useToast() {
  const [list,setList] = useState([]);
  const toast  = useCallback((msg,type="success")=>{ const id=`${Date.now()}-${Math.random()}`; setList(p=>[...p.slice(-3),{id,msg,type}]); },[]);
  const remove = useCallback((id)=>setList(p=>p.filter(x=>x.id!==id)),[]);
  return { toast, list, remove };
}

/* ─── PRIMITIVES ─────────────────────────────────────────── */
const Spin = memo(({s=18,c=C.sage})=>
  <span className="inline" style={{ width:s, height:s, borderRadius:"50%", border:`2px solid ${c}25`, borderTopColor:c, animation:"spin .7s linear infinite", flexShrink:0, display:"inline-block" }}/>
);
const Tag = memo(({children,color=C.sage,bg})=>
  <span className="inline" style={{ padding:"3px 10px", borderRadius:99, background:bg||color+"15", color, fontSize:12, fontWeight:600, letterSpacing:.3, minHeight:"unset", minWidth:"unset" }}>{children}</span>
);
function CopyBtn({ text }) {
  const [ok,setOk] = useState(false);
  return <button onClick={()=>{ navigator.clipboard.writeText(text).catch(()=>{}); setOk(true); setTimeout(()=>setOk(false),2000); }} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${ok?C.sage:C.border}`, background:ok?C.sage:C.surface, color:ok?"#fff":C.ink2, fontSize:13, fontWeight:600, cursor:"pointer", transition:"all .18s", minHeight:36 }}>{ok?"✓ Copied":"Copy"}</button>;
}

/* ─── BUTTONS ────────────────────────────────────────────── */
function Btn({ children, onClick, disabled, size="md", bg=C.ink, full, style:ext={} }) {
  return (
    <button onClick={onClick} disabled={disabled} className="kh-btn"
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, borderRadius:9, border:"none", background:disabled?C.ink4:bg, color:disabled?C.ink3:"#fff", fontSize:size==="lg"?16:size==="sm"?13.5:14.5, fontWeight:600, cursor:disabled?"not-allowed":"pointer", padding:size==="lg"?"15px 28px":size==="sm"?"9px 16px":"11px 22px", transition:"all .18s", width:full?"100%":"auto", boxShadow:disabled?"none":"0 1px 4px rgba(0,0,0,.10)", minHeight:size==="sm"?40:48, ...ext }}>
      {children}
    </button>
  );
}
function OutBtn({ children, onClick, size="md", style:ext={} }) {
  return (
    <button onClick={onClick} className="kh-out"
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, borderRadius:9, border:`1.5px solid ${C.border}`, background:C.surface, color:C.ink2, fontSize:size==="sm"?13.5:14.5, fontWeight:600, padding:size==="sm"?"9px 16px":"11px 22px", transition:"all .18s", cursor:"pointer", minHeight:size==="sm"?40:48, ...ext }}>
      {children}
    </button>
  );
}

/* ─── CARD, FIELD, SKEL ──────────────────────────────────── */
function Card({ children, style:ext={}, flat }) {
  return <div className={flat?"":"kh-card"} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:flat?"none":"0 1px 3px rgba(0,0,0,.05)", ...ext }}>{children}</div>;
}
function Field({ label, value, onChange, placeholder, rows, accent=C.sage, hint, maxLen, type="text" }) {
  const [f,setF] = useState(false);
  const base = { padding:"12px 14px", borderRadius:9, border:`1.5px solid ${f?accent:C.border}`, background:f?C.surface:C.bg, fontSize:15, color:C.ink, transition:"all .18s", width:"100%", fontFamily:"inherit", outline:"none", WebkitAppearance:"none" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label&&(
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.5, textTransform:"uppercase" }}>{label}</label>
          {maxLen&&<span className="inline" style={{ fontSize:11, color:value?.length>maxLen*.9?C.red:C.ink3, minHeight:"unset", minWidth:"unset" }}>{value?.length||0}/{maxLen}</span>}
        </div>
      )}
      {rows
        ?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} maxLength={maxLen} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{ ...base, lineHeight:1.75, resize:"vertical", minHeight:rows*22 }}/>
        :<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLen} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>
      }
      {hint&&<span className="inline" style={{ fontSize:12, color:C.ink3, minHeight:"unset", minWidth:"unset" }}>{hint}</span>}
    </div>
  );
}
const Skel = ({h=16,w="100%",r=6})=><div style={{ height:h, width:w, borderRadius:r, background:"linear-gradient(90deg,#f0eeec 25%,#e8e6e3 50%,#f0eeec 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }}/>;

/* ─── STARS ──────────────────────────────────────────────── */
function Stars({ rating, interactive, onChange }) {
  const [hov,setHov]=useState(0);
  return (
    <div style={{ display:"flex", gap:3 }}>
      {[1,2,3,4,5].map(n=>(
        <span key={n} onClick={()=>interactive&&onChange(n)} onMouseEnter={()=>interactive&&setHov(n)} onMouseLeave={()=>interactive&&setHov(0)}
          className="inline" style={{ fontSize:22, cursor:interactive?"pointer":"default", color:n<=(hov||rating)?"#D97706":C.ink4, transition:"color .12s", minHeight:"unset", minWidth:"unset" }}>★</span>
      ))}
    </div>
  );
}

/* ─── REVEAL ─────────────────────────────────────────────── */
function Reveal({ children, delay=0 }) {
  const ref=useRef(null); const [vis,setVis]=useState(false);
  useEffect(()=>{ const obs=new IntersectionObserver(([e])=>{ if(e.isIntersecting){setVis(true);obs.disconnect();} },{threshold:.08}); if(ref.current)obs.observe(ref.current); return()=>obs.disconnect(); },[]);
  return <div ref={ref} style={{ opacity:vis?1:0, transform:vis?"none":"translateY(20px)", transition:`opacity .55s ${delay}s ease, transform .55s ${delay}s ease` }}>{children}</div>;
}

/* ─── LOGO ───────────────────────────────────────────────── */
const Logo = memo(({dark,size="md"})=>{
  const fs=size==="sm"?14:size==="lg"?20:16;
  const ws=size==="sm"?24:size==="lg"?34:28;
  return (
    <div className="nav-logo inline" style={{ gap:8, fontWeight:700, fontSize:fs, letterSpacing:"-.3px", color:dark?"#fff":C.ink, minHeight:"unset", minWidth:"unset" }}>
      <svg width={ws} height={ws} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="9" fill="#3D6B4F"/>
        <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white"/>
        <circle cx="31" cy="31" r="7" fill="#6EBD8A"/>
        <path d="M28 31L30.5 33.5L34.5 29" stroke="#3D6B4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Krack<span style={{ color:C.sage }}>Hire</span></span>
    </div>
  );
});

/* ─── SCORE RING (visual score indicator) ────────────────── */
function ScoreRing({ score, size=80, color=C.sage, label="" }) {
  const r=32; const circ=2*Math.PI*r; const dash=circ*(score/100);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <svg width={size} height={size} viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke={C.ink4} strokeWidth="6"/>
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 36 36)" style={{ transition:"stroke-dasharray 1.2s ease" }}/>
        <text x="36" y="41" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="DM Sans,sans-serif">{score}</text>
      </svg>
      {label&&<span style={{ fontSize:11, color:C.ink3, fontWeight:600, textTransform:"uppercase", letterSpacing:.5 }}>{label}</span>}
    </div>
  );
}

/* ─── PROGRESS STEPS ─────────────────────────────────────── */
function ProgressSteps({ current }) {
  const steps = ["Upload","Analyse","Score","Improve","Track","Interview"];
  const idx = steps.indexOf(current);
  return (
    <div className="progress-steps" style={{ display:"flex", alignItems:"center", gap:0, overflowX:"auto", padding:"0 2px" }}>
      {steps.map((s,i)=>(
        <div key={s} style={{ display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:i<idx?C.sage:i===idx?C.sage:C.ink4, color:i<=idx?"#fff":C.ink3, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, transition:"background .3s", flexShrink:0 }}>
              {i<idx?"✓":i+1}
            </div>
            <span style={{ fontSize:10, color:i<=idx?C.sage:C.ink3, fontWeight:i===idx?700:400, whiteSpace:"nowrap" }}>{s}</span>
          </div>
          {i<steps.length-1&&<div className="step-connector" style={{ width:20, height:2, background:i<idx?C.sage:C.ink4, margin:"0 2px", marginBottom:18, flexShrink:0, transition:"background .3s" }}/>}
        </div>
      ))}
    </div>
  );
}

/* ─── ANALYSIS FEEDBACK ──────────────────────────────────── */
function AnalysisFeedback({ company, role, gapScore, userId, onDone }) {
  const [choice,setChoice]=useState(null); const [text,setText]=useState(""); const [sent,setSent]=useState(false); const [saving,setSaving]=useState(false);
  async function submit() {
    setSaving(true);
    await saveFeedback({ helpful:choice==="yes", comment:text.trim()||null, company:company||null, role:role||null, gap_score:gapScore||null, user_id:userId||null });
    setSaving(false); setSent(true); setTimeout(onDone,2000);
  }
  if(sent) return <div className="feedback-widget" style={{ padding:"13px 16px", background:C.sageBg, borderRadius:10, textAlign:"center", fontSize:14, color:C.sage, fontWeight:600 }}>✓ Thanks for your feedback — it helps us improve.</div>;
  return (
    <div className="feedback-widget" style={{ padding:"14px 16px", background:C.bg, borderRadius:10, border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:14, fontWeight:600, color:C.ink, marginBottom:10 }}>Was this analysis helpful?</div>
      <div className="feedback-btns" style={{ display:"flex", gap:8, marginBottom:choice?12:0, flexWrap:"wrap" }}>
        {[["yes","✓  Yes, it helped"],["improve","↻  Needs improvement"]].map(([v,label])=>(
          <button key={v} onClick={()=>setChoice(v)} style={{ padding:"9px 16px", borderRadius:8, border:`1.5px solid ${choice===v?C.sage:C.border}`, background:choice===v?C.sageBg:C.surface, color:choice===v?C.sage:C.ink2, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all .15s", minHeight:44, flex:1 }}>{label}</button>
        ))}
      </div>
      {choice&&(
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Field label="What could we improve? (optional)" value={text} onChange={setText} placeholder="Tell us what was missing or unclear…" rows={2} maxLen={500}/>
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={submit} disabled={saving} bg={C.sage} size="sm">{saving?<><Spin s={14} c="#fff"/>Saving…</>:"Submit"}</Btn>
            <OutBtn onClick={onDone} size="sm">Skip</OutBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SHARE SCORE CARD ───────────────────────────────────── */
function ShareScoreCard({ score, atsScore, skillScore, role, onClose }) {
  const [copied,setCopied]=useState(false);
  const shareText=`My Job Readiness Score: ${score}/100 on KrackHire${role?` for ${role} role`:""}\nATS: ${atsScore||"–"}/100 | Skills: ${skillScore||"–"}/100\nStill improving. www.krackhire.in`;

  function share(platform) {
    if(platform==="copy") { navigator.clipboard.writeText(shareText).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2500); return; }
    if(platform==="whatsapp") { window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`,"_blank"); return; }
    if(platform==="linkedin") { window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(import.meta.env.VITE_SITE_URL||"https://www.krackhire.in")}&summary=${encodeURIComponent(shareText)}`,"_blank"); return; }
    if(platform==="telegram") { window.open(`https://t.me/share/url?url=${encodeURIComponent(import.meta.env.VITE_SITE_URL||"https://www.krackhire.in")}&text=${encodeURIComponent(shareText)}`,"_blank"); return; }
    navigator.share?.({ text:shareText }).catch(()=>{});
  }

  const scoreClr = score>=70?C.sage:score>=50?C.amber:C.red;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, borderRadius:16, padding:"28px 24px", maxWidth:380, width:"100%", boxShadow:"0 20px 48px rgba(0,0,0,.18)", animation:"scaleIn .25s ease" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <Logo size="md"/>
          <div style={{ margin:"18px 0 8px", fontFamily:"'Lora',Georgia,serif", fontSize:15, fontWeight:700, color:C.ink }}>My Job Readiness Score</div>
        </div>

        {/* Score card visual */}
        <div style={{ background:`linear-gradient(135deg,${C.sage},#2D5240)`, borderRadius:12, padding:"24px 20px", marginBottom:20, textAlign:"center", color:"#fff" }}>
          <div style={{ fontSize:52, fontWeight:800, letterSpacing:-2, lineHeight:1 }}>{score}</div>
          <div style={{ fontSize:13, opacity:.8, marginBottom:16 }}>out of 100{role?` · ${role}`:""}</div>
          <div style={{ display:"flex", justifyContent:"center", gap:24 }}>
            {[["ATS Score",atsScore],["Skill Match",skillScore]].map(([label,val])=>val&&(
              <div key={label}>
                <div style={{ fontSize:20, fontWeight:700 }}>{val}</div>
                <div style={{ fontSize:11, opacity:.7 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:14, fontSize:11, opacity:.6 }}>www.krackhire.in</div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
          {[
            { label:"WhatsApp", icon:"📱", platform:"whatsapp", bg:"#25D366", fg:"#fff" },
            { label:"LinkedIn", icon:"💼", platform:"linkedin", bg:"#0077B5", fg:"#fff" },
            { label:"Telegram", icon:"✈️", platform:"telegram", bg:"#2AABEE", fg:"#fff" },
            { label:copied?"Copied!":"Copy text", icon:"📋", platform:"copy", bg:C.bg, fg:C.ink2 },
          ].map(s=>(
            <button key={s.platform} onClick={()=>share(s.platform)}
              style={{ padding:"10px 14px", borderRadius:9, background:s.bg, color:s.fg, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${s.bg==="#fff"||s.bg===C.bg?C.border:s.bg}`, display:"flex", alignItems:"center", justifyContent:"center", gap:7, minHeight:44, transition:"opacity .15s" }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize:12, color:C.ink3, textAlign:"center", lineHeight:1.6 }}>Share honestly. This reflects your current score — not a final result.</p>
        <button onClick={onClose} style={{ width:"100%", marginTop:12, fontSize:13.5, color:C.ink3, cursor:"pointer", padding:8, minHeight:36 }}>Close</button>
      </div>
    </div>
  );
}

/* ─── JOB TRACKER ────────────────────────────────────────── */
const JOB_STATUSES = ["Applied","Assessment","Interview","Offer","Rejected","On Hold"];
const STATUS_COLORS = { Applied:C.blue, Assessment:C.amber, Interview:C.purple, Offer:C.sage, Rejected:C.red, "On Hold":C.stone };

function JobTrackerModal({ user, onClose, toast }) {
  const [jobs,setJobs]       = useState([]);
  const [loading,setLoading] = useState(true);
  const [showAdd,setShowAdd] = useState(false);
  const [editId,setEditId]   = useState(null);
  const [form,setForm] = useState({ company:"", role:"", source:"", applied_date:new Date().toISOString().split("T")[0], status:"Applied", round:"", notes:"", follow_up_date:"" });

  useEffect(()=>{ if(user) getTrackerJobs(user.id).then(d=>{ setJobs(d); setLoading(false); }).catch(()=>setLoading(false)); else setLoading(false); },[user]);

  function resetForm() { setForm({ company:"", role:"", source:"", applied_date:new Date().toISOString().split("T")[0], status:"Applied", round:"", notes:"", follow_up_date:"" }); }

  async function addJob() {
    if(!form.company.trim()||!form.role.trim()) { toast("Company and role are required.","error"); return; }
    if(!user) { toast("Sign in to track applications.","warn"); return; }
    const saved = await saveTrackerJob(user.id, form);
    if(saved) { setJobs(p=>[saved,...p]); resetForm(); setShowAdd(false); toast("Job added to tracker ✓"); }
  }

  async function updateStatus(id, status) {
    await updateTrackerJob(id, { status });
    setJobs(p=>p.map(j=>j.id===id?{...j,status}:j));
  }

  async function deleteJob(id) {
    if(!confirm("Remove this job from tracker?")) return;
    await deleteTrackerJob(id);
    setJobs(p=>p.filter(j=>j.id!==id));
    toast("Removed from tracker.");
  }

  const stats = useMemo(()=>{
    const s = {}; JOB_STATUSES.forEach(st=>s[st]=jobs.filter(j=>j.status===st).length); return s;
  },[jobs]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1100, background:"rgba(0,0,0,.45)", backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"16px 16px 80px", overflowY:"auto" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="dashboard-inner" style={{ background:C.surface, borderRadius:16, maxWidth:720, width:"100%", marginTop:8, overflow:"hidden", boxShadow:"0 20px 48px rgba(0,0,0,.14)" }}>

        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, background:C.bg, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:C.ink }}>📋 Job Application Tracker</div>
            <div style={{ fontSize:12, color:C.ink3 }}>{user?`${jobs.length} applications tracked`:"Sign in to save applications"}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {user&&<Btn size="sm" bg={C.sage} onClick={()=>{ resetForm(); setEditId(null); setShowAdd(!showAdd); }}>+ Add Job</Btn>}
            <button onClick={onClose} style={{ fontSize:22, color:C.ink3, cursor:"pointer", lineHeight:1, minHeight:36, minWidth:36 }}>×</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:8, overflowX:"auto", flexWrap:"nowrap" }}>
          {JOB_STATUSES.map(st=>(
            <div key={st} style={{ flexShrink:0, padding:"7px 14px", borderRadius:99, background:STATUS_COLORS[st]+"15", color:STATUS_COLORS[st], fontSize:12.5, fontWeight:600, whiteSpace:"nowrap" }}>
              {st}: {stats[st]||0}
            </div>
          ))}
        </div>

        {/* Add form */}
        {showAdd&&(
          <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, background:C.bg, animation:"slideUp .2s ease" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:12 }}>Add New Application</div>
            <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <Field label="Company *" value={form.company} onChange={v=>setForm(p=>({...p,company:v}))} placeholder="e.g. Infosys" maxLen={80}/>
              <Field label="Role *" value={form.role} onChange={v=>setForm(p=>({...p,role:v}))} placeholder="e.g. SDE Trainee" maxLen={80} accent={C.blue}/>
            </div>
            <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
              <Field label="Source" value={form.source} onChange={v=>setForm(p=>({...p,source:v}))} placeholder="Naukri/LinkedIn/etc" maxLen={50}/>
              <Field label="Date Applied" value={form.applied_date} onChange={v=>setForm(p=>({...p,applied_date:v}))} type="date"/>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.5, textTransform:"uppercase" }}>Status</label>
                <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={{ padding:"11px 13px", borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:15, color:C.ink, fontFamily:"inherit", cursor:"pointer", minHeight:44 }}>
                  {JOB_STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <Field label="Round" value={form.round} onChange={v=>setForm(p=>({...p,round:v}))} placeholder="e.g. Round 1 / HR" maxLen={50}/>
              <Field label="Follow-up Date" value={form.follow_up_date} onChange={v=>setForm(p=>({...p,follow_up_date:v}))} type="date" accent={C.amber}/>
            </div>
            <Field label="Notes" value={form.notes} onChange={v=>setForm(p=>({...p,notes:v}))} placeholder="Any notes about this application…" rows={2} maxLen={300}/>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <Btn onClick={addJob} bg={C.sage} size="sm">Save Application</Btn>
              <OutBtn onClick={()=>setShowAdd(false)} size="sm">Cancel</OutBtn>
            </div>
          </div>
        )}

        {/* Jobs list */}
        <div style={{ maxHeight:440, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          {loading?[1,2,3].map(i=><div key={i} style={{ margin:"10px 20px" }}><Skel h={54}/></div>)
           :jobs.length===0?
             <div style={{ padding:"40px 20px", textAlign:"center", color:C.ink3 }}>
               <div style={{ fontSize:28, marginBottom:10 }}>📋</div>
               <div style={{ fontSize:14, marginBottom:6 }}>No applications tracked yet.</div>
               <div style={{ fontSize:13 }}>Add your first application above to start tracking.</div>
             </div>
           :jobs.map(job=>(
             <div key={job.id} style={{ padding:"13px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"flex-start", gap:12 }}>
               <div style={{ flex:1, minWidth:0 }}>
                 <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                   <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{job.company}</span>
                   <span style={{ fontSize:13, color:C.ink2 }}>·</span>
                   <span style={{ fontSize:13, color:C.ink2 }}>{job.role}</span>
                 </div>
                 <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                   <select value={job.status} onChange={e=>updateStatus(job.id,e.target.value)}
                     style={{ padding:"3px 10px", borderRadius:99, background:STATUS_COLORS[job.status]+"18", color:STATUS_COLORS[job.status], fontSize:12, fontWeight:600, border:"none", cursor:"pointer", fontFamily:"inherit", minHeight:"unset" }}>
                     {JOB_STATUSES.map(s=><option key={s}>{s}</option>)}
                   </select>
                   {job.applied_date&&<span style={{ fontSize:11.5, color:C.ink3 }}>Applied {job.applied_date}</span>}
                   {job.source&&<span style={{ fontSize:11.5, color:C.ink3 }}>via {job.source}</span>}
                   {job.follow_up_date&&<span style={{ fontSize:11.5, color:C.amber }}>📅 Follow up {job.follow_up_date}</span>}
                 </div>
                 {job.notes&&<div style={{ fontSize:12.5, color:C.ink3, marginTop:5, lineHeight:1.5 }}>{job.notes}</div>}
               </div>
               <button onClick={()=>deleteJob(job.id)} className="inline" style={{ color:C.ink4, fontSize:17, minHeight:"unset", minWidth:"unset", padding:"4px" }}>✕</button>
             </div>
           ))
          }
        </div>
      </div>
    </div>
  );
}

/* ─── INTERVIEW ROUNDS GUIDE ─────────────────────────────── */
function InterviewGuide({ role, company }) {
  const [activeRound, setActiveRound] = useState(0);
  const rounds = [
    { label:"Round 1", title:"Online Assessment", icon:"💻", color:C.blue,
      questions:["Aptitude and reasoning questions","Basic coding problems (arrays, strings, loops)","Verbal and logical reasoning","Time management — typically 60–90 minutes"],
      tips:["Practice on HackerRank and LeetCode Easy","Don't get stuck — move on and come back","Read all questions before starting","Watch for negative marking"],
      mistakes:["Spending too much time on one question","Not reading instructions carefully","Guessing randomly when there's negative marking"]
    },
    { label:"Round 2", title:"Technical Interview", icon:"🔧", color:C.sage,
      questions:["Data structures: arrays, linked lists, stacks, queues","OOP concepts: inheritance, polymorphism, encapsulation","Write code on paper or shared screen","Explain your approach before writing"],
      tips:["Think aloud — show your reasoning","Start with brute force, then optimise","Ask clarifying questions before coding","Test your code with examples"],
      mistakes:["Jumping to code without understanding the problem","Not asking clarifying questions","Giving up when stuck instead of reasoning through it"]
    },
    { label:"Round 3", title:"Advanced Technical", icon:"🏗️", color:C.amber,
      questions:["System design basics (for 2+ years experience)","Project deep-dive: explain your biggest project","Why did you make specific technical decisions?","How would you scale your solution?"],
      tips:["Know your projects deeply — every line","Draw diagrams when explaining systems","Mention trade-offs in your decisions","For freshers: emphasise learning ability"],
      mistakes:["Not knowing your own projects well enough","Over-engineering simple solutions","Ignoring non-functional requirements like scalability"]
    },
    { label:"Round 4", title:"HR Interview", icon:"🤝", color:C.purple,
      questions:["Tell me about yourself (prepare a 2-minute version)","Why do you want to join this company?","Where do you see yourself in 5 years?","Describe a challenge you overcame","Salary expectations"],
      tips:["Research the company thoroughly before the interview","Prepare 3 specific examples using the STAR format","Have 2–3 questions ready for the interviewer","Be honest about your salary expectations"],
      mistakes:["Speaking negatively about previous employers","Not researching the company","Being vague about reasons for joining","Discussing salary without research"]
    },
  ];
  const r = rounds[activeRound];
  return (
    <div>
      <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto" }}>
        {rounds.map((rd,i)=>(
          <button key={i} onClick={()=>setActiveRound(i)}
            style={{ padding:"8px 14px", borderRadius:8, border:`1.5px solid ${activeRound===i?rd.color:C.border}`, background:activeRound===i?rd.color+"15":C.surface, color:activeRound===i?rd.color:C.ink2, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", minHeight:40, whiteSpace:"nowrap", flexShrink:0, transition:"all .18s" }}>
            {rd.icon} {rd.label}
          </button>
        ))}
      </div>
      <Card flat style={{ overflow:"hidden" }}>
        <div style={{ padding:"14px 18px", background:r.color+"10", borderBottom:`1px solid ${r.color}25` }}>
          <div style={{ fontSize:15, fontWeight:700, color:r.color }}>{r.icon} {r.title}</div>
          {(role||company)&&<div style={{ fontSize:12.5, color:C.ink3, marginTop:3 }}>{[role,company].filter(Boolean).join(" at ")}</div>}
        </div>
        <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }} className="input-grid">
          <div>
            <div style={{ fontSize:11.5, fontWeight:700, color:r.color, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>Expected Questions</div>
            {r.questions.map((q,i)=>(
              <div key={i} style={{ display:"flex", gap:8, fontSize:13.5, color:C.ink2, marginBottom:8, lineHeight:1.6 }}>
                <span className="inline" style={{ color:r.color, fontWeight:700, minHeight:"unset", minWidth:"unset", flexShrink:0 }}>→</span>{q}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:11.5, fontWeight:700, color:C.sage, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>Preparation Tips</div>
            {r.tips.map((t,i)=>(
              <div key={i} style={{ display:"flex", gap:8, fontSize:13.5, color:C.ink2, marginBottom:8, lineHeight:1.6 }}>
                <span className="inline" style={{ color:C.sage, fontWeight:700, minHeight:"unset", minWidth:"unset", flexShrink:0 }}>✓</span>{t}
              </div>
            ))}
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11.5, fontWeight:700, color:C.red, textTransform:"uppercase", letterSpacing:.6, marginBottom:8 }}>Common Mistakes</div>
              {r.mistakes.map((m,i)=>(
                <div key={i} style={{ display:"flex", gap:8, fontSize:13, color:C.ink2, marginBottom:6, lineHeight:1.6 }}>
                  <span className="inline" style={{ color:C.red, fontWeight:700, minHeight:"unset", minWidth:"unset", flexShrink:0 }}>✗</span>{m}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ─── PAYMENT MODAL ──────────────────────────────────────── */
function PaymentModal({ planId, planLabel, planAmount, user, onClose, onSuccess, toast }) {
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState("confirm"); // confirm | redirecting | verifying | done

  async function startPayment() {
    if(!user){ toast("Please sign in to upgrade.","error"); return; }
    setLoading(true); setStep("redirecting");
    try {
      const res = await callPayU("initiate", {
        planId,
        userId:    user.id,
        userEmail: user.email,
        userName:  user.user_metadata?.name || "",
      });
      if (!res.success || !res.data?.payuParams) {
        throw new Error(res.message || "Could not create payment.");
      }
      // Build and auto-submit PayU form (redirect flow)
      const { payuParams, payuUrl } = res.data;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = payuUrl;
      form.style.display = "none";
      Object.entries(payuParams).forEach(([k,v])=>{
        const input = document.createElement("input");
        input.type = "hidden"; input.name = k; input.value = v;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      // Note: page will redirect to PayU — this component stays mounted briefly
    } catch(e) {
      toast(e.message || "Payment failed. Please try again.","error");
      setLoading(false); setStep("confirm");
    }
  }

  const featureList = [
    "Unlimited resume analyses",
    "PDF career reports with improvement plans",
    "Job application tracker",
    "All 6 AI outputs including Profile Optimizer",
    "Interview preparation by round",
    "Save all analyses & history",
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={loading?undefined:onClose}>
      <div onClick={e=>e.stopPropagation()} className="payment-modal-inner" style={{ background:C.surface, borderRadius:16, padding:"28px 24px", maxWidth:400, width:"100%" }}>
        {step==="redirecting" ? (
          <div style={{ textAlign:"center", padding:"32px 0" }}>
            <Spin s={36} c={C.sage}/>
            <div style={{ fontSize:16, fontWeight:700, color:C.ink, marginTop:18, marginBottom:8 }}>Redirecting to PayU…</div>
            <p style={{ fontSize:13.5, color:C.ink2 }}>You will be redirected to PayU's secure payment page. Please do not close this window.</p>
          </div>
        ) : (
          <>
            <div style={{ textAlign:"center", marginBottom:22 }}>
              <Logo size="md"/>
              <h2 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:22, color:C.ink, margin:"16px 0 6px", fontWeight:700 }}>Upgrade to {planLabel}</h2>
              <div style={{ fontSize:36, fontWeight:800, color:C.sage, marginBottom:4 }}>{planAmount}</div>
              <div style={{ fontSize:13, color:C.ink3 }}>{planId==="pro_yearly"?"per year — best value":planId==="starter"?"one-time, 7-day access":"per month"}</div>
            </div>
            <div style={{ background:C.sageBg, borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
              {featureList.map((f,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:13.5, color:C.ink2, marginBottom:i<featureList.length-1?8:0 }}>
                  <span className="inline" style={{ color:C.sage, fontWeight:700, minHeight:"unset", minWidth:"unset" }}>✓</span>{f}
                </div>
              ))}
            </div>
            <Btn onClick={startPayment} disabled={loading} full bg={C.sage} style={{ marginBottom:12, fontSize:15 }}>
              {loading?<><Spin s={16} c="#fff"/>Processing…</>:`Pay ${planAmount} via PayU`}
            </Btn>
            <button onClick={onClose} disabled={loading} style={{ width:"100%", textAlign:"center", fontSize:13.5, color:C.ink3, cursor:"pointer", padding:8, minHeight:36, opacity:loading?.4:1 }}>Cancel</button>
            <p style={{ marginTop:12, fontSize:11.5, color:C.ink3, textAlign:"center" }}>Secured by PayU · UPI · Cards · Net Banking</p>
          </>
        )}
      </div>
    </div>
  );
}


/* ─── UPGRADE MODAL ──────────────────────────────────────── */
function UpgradeModal({ onClose, onSelectPlan, user }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1150, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="upgrade-modal-inner" style={{ background:C.surface, borderRadius:"16px 16px 0 0", padding:"28px 20px 36px", width:"100%", maxWidth:480, boxShadow:"0 -8px 32px rgba(0,0,0,.14)", animation:"slideUp .3s ease" }}>
        <div style={{ width:40, height:4, borderRadius:99, background:C.ink4, margin:"0 auto 20px" }}/>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🔒</div>
          <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20, color:C.ink, fontWeight:700, marginBottom:6 }}>Upgrade to Pro</h3>
          <p style={{ fontSize:14, color:C.ink2, lineHeight:1.65 }}>Unlimited analyses, PDF reports, job tracker, and more.</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
          <button onClick={()=>onSelectPlan("pro_monthly")} style={{ padding:"15px 18px", borderRadius:10, border:`2px solid ${C.border}`, background:C.surface, cursor:"pointer", textAlign:"left", fontFamily:"inherit", minHeight:64, transition:"border-color .18s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.sage} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:15, fontWeight:700, color:C.ink }}>Pro Monthly</div><div style={{ fontSize:12.5, color:C.ink3 }}>Unlimited analyses · All features</div></div>
              <div style={{ fontSize:22, fontWeight:800, color:C.sage }}>₹49<span style={{ fontSize:12, fontWeight:400, color:C.ink3 }}>/mo</span></div>
            </div>
          </button>
          <button onClick={()=>onSelectPlan("pro_yearly")} style={{ padding:"15px 18px", borderRadius:10, border:`2px solid ${C.sage}`, background:C.sageBg, cursor:"pointer", textAlign:"left", fontFamily:"inherit", position:"relative", minHeight:64 }}>
            <div style={{ position:"absolute", top:-11, right:14, background:C.amber, color:"#fff", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99 }}>Best value</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:15, fontWeight:700, color:C.ink }}>Pro Yearly</div><div style={{ fontSize:12.5, color:C.sage, fontWeight:600 }}>Save ₹89 vs monthly</div></div>
              <div style={{ fontSize:22, fontWeight:800, color:C.sage }}>₹499<span style={{ fontSize:12, fontWeight:400, color:C.ink3 }}>/yr</span></div>
            </div>
          </button>
        </div>
        <OutBtn onClick={onClose} full size="sm">Continue with free plan</OutBtn>
      </div>
    </div>
  );
}

/* ─── USER MENU ──────────────────────────────────────────── */
function UserMenu({ user, profile, onSignOut, onUpgrade, onInvite, onAdmin, onDashboard }) {
  const [open,setOpen] = useState(false);
  const isPro      = isPremiumPlan(profile?.plan, profile?.plan_expires_at);
  const pLabel     = planDisplayLabel(profile?.plan);
  const lifetimeLeft = profile?.lifetime_accesses_remaining ?? 0;
  const planClr = profile?.plan==="founding_user"?C.purple:profile?.plan==="beta_friend"?C.blue:isPro?C.amber:C.stone;
  const planBg  = profile?.plan==="founding_user"?C.purpleBg:profile?.plan==="beta_friend"?C.blueBg:isPro?C.amberBg:C.bg;
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, cursor:"pointer", fontFamily:"inherit", minHeight:40 }}>
        {user.user_metadata?.avatar_url
          ?<img src={user.user_metadata.avatar_url} style={{ width:24, height:24, borderRadius:"50%", flexShrink:0 }} alt=""/>
          :<div style={{ width:24, height:24, borderRadius:"50%", background:C.sage, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>{(user.user_metadata?.name||user.email||"U")[0].toUpperCase()}</div>}
        <span style={{ fontSize:13, fontWeight:600, color:C.ink, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.user_metadata?.name?.split(" ")[0]||user.email?.split("@")[0]}</span>
        <Tag color={planClr} bg={planBg}>{pLabel}</Tag>
        <span className="inline" style={{ fontSize:10, color:C.ink3, minHeight:"unset", minWidth:"unset" }}>▾</span>
      </button>
      {open&&(
        <div onClick={()=>setOpen(false)} style={{ position:"absolute", top:"calc(100% + 6px)", right:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,.10)", minWidth:220, zIndex:500, overflow:"hidden", animation:"slideUp .2s ease" }}>
          <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}`, background:C.bg }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{user.user_metadata?.name||"User"}</div>
            <div style={{ fontSize:12, color:C.ink3, marginBottom:6 }}>{user.email}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <Tag color={planClr} bg={planBg}>{pLabel}</Tag>
              {!isPro&&<span className="inline" style={{ fontSize:11, color:C.ink3, minHeight:"unset", minWidth:"unset" }}>{profile?.analyses_this_month||0}/3 used</span>}
            </div>
            {!isPro&&lifetimeLeft>0&&!["admin","founder"].includes(profile?.role)&&<div style={{ marginTop:6, fontSize:12, color:C.purple, fontWeight:600 }}>⚡ {lifetimeLeft} lifetime {lifetimeLeft===1?"access":"accesses"} remaining</div>}
            {isPro&&profile?.plan_expires_at&&profile?.plan!=="founding_user"&&<div style={{ marginTop:5, fontSize:11.5, color:C.ink3 }}>Active until {new Date(profile.plan_expires_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>}
          </div>
          {!isPro&&<button onClick={onUpgrade} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, fontWeight:600, color:C.amber, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}`, minHeight:44 }}>⚡ Upgrade to Pro</button>}
          {!isPro&&<button onClick={onInvite} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, fontWeight:600, color:C.blue, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}`, minHeight:44 }}>🎟️ Enter invite code</button>}
          {user&&<button onClick={()=>{ setOpen(false); onDashboard?.(); }} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, fontWeight:600, color:C.sage, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}`, minHeight:44 }}>📊 My Dashboard</button>}
          {(["admin","founder"].includes(profile?.role) || user?.email==="mohidmd58@gmail.com")&&(
            <button onClick={()=>{ setOpen(false); onAdmin(); }} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, fontWeight:700, color:C.purple, cursor:"pointer", background:C.purpleBg, border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}`, minHeight:44 }}>⚙️ Admin Panel</button>
          )}
          <button onClick={onSignOut} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, color:C.red, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:44 }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ─── REVIEW FORM ────────────────────────────────────────── */
function ReviewForm({ user, onDone }) {
  const [name,setName]=useState(user?.user_metadata?.name||""); const [role,setRole]=useState(""); const [rating,setRating]=useState(0); const [text,setText]=useState(""); const [err,setErr]=useState(""); const [done,setDone]=useState(false); const [saving,setSaving]=useState(false);
  async function submit() {
    if(!name.trim()) return setErr("Please enter your name."); if(rating===0) return setErr("Please select a rating."); if(text.trim().length<20) return setErr("Please write at least 20 characters.");
    setErr(""); setSaving(true);
    try { await saveReview({ name:name.trim(), role:role.trim()||null, rating, text:text.trim(), user_id:user?.id||null }); setDone(true); } catch { setErr("Could not save. Please try again."); }
    setSaving(false);
  }
  if(done) return <div style={{ padding:"28px", textAlign:"center" }}><div style={{ fontSize:32, marginBottom:10 }}>🙏</div><div style={{ fontSize:16, fontWeight:700, color:C.sage, marginBottom:6 }}>Thank you!</div><div style={{ fontSize:13.5, color:C.ink2 }}>Your review will appear after manual approval.</div></div>;
  return (
    <div style={{ padding:"22px 20px", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontSize:15, fontWeight:700, color:C.ink }}>Share your experience</div>
      <div style={{ padding:"10px 14px", background:C.sageBg, borderRadius:8, fontSize:13, color:C.sage, lineHeight:1.6 }}>Reviews appear only after manual approval — we never show fake testimonials.</div>
      <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Your Name *" value={name} onChange={setName} placeholder="e.g. Rahul Kumar" maxLen={50}/>
        <Field label="College / Role" value={role} onChange={setRole} placeholder="e.g. CS Student, JNTU" maxLen={80}/>
      </div>
      <div><label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.5, textTransform:"uppercase", display:"block", marginBottom:8 }}>Rating *</label><Stars rating={rating} interactive onChange={setRating}/></div>
      <Field label="Your Review *" value={text} onChange={setText} placeholder="What did you find useful? Any specific result?" rows={4} maxLen={600}/>
      {err&&<div style={{ fontSize:13, color:C.red, padding:"8px 12px", background:C.redBg, borderRadius:7 }}>{err}</div>}
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={submit} bg={C.sage} disabled={saving}>{saving?<><Spin s={14} c="#fff"/>Saving…</>:"Submit review"}</Btn>
        {onDone&&<OutBtn onClick={onDone} size="sm">Cancel</OutBtn>}
      </div>
    </div>
  );
}

/* ─── PROFILE OPTIMIZER ──────────────────────────────────── */
function ProfileOptimizer({ resume, jd, company, role, userId, isPro, onUpgrade }) {
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [headline, setHeadline] = useState("");
  const [about,    setAbout]    = useState("");
  const [subTab,   setSubTab]   = useState("linkedin");

  async function optimise() {
    if (!resume.trim()) { setError("Please add your resume first (in the input section above)."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const raw = await callAPI("profile_optimize", { resume, jd, company, role, userId, linkedin_headline:headline, linkedin_about:about });
      const parsed = parseJSON(raw);
      parsed ? setResult(parsed) : setError("Could not parse result. Please try again.");
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  if (!isPro) return (
    <div style={{ padding:"32px 20px", textAlign:"center" }}>
      <div style={{ fontSize:44, marginBottom:14 }}>💼</div>
      <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20, color:C.ink, marginBottom:8, fontWeight:700 }}>LinkedIn & Naukri Optimiser</h3>
      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.7, marginBottom:22, maxWidth:380, margin:"0 auto 22px" }}>Get AI-written headlines, about sections, and keyword recommendations for the Indian job market. Available on Pro plan.</p>
      <Btn onClick={onUpgrade} bg={C.sage} size="lg">Upgrade to Pro →</Btn>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <Card flat style={{ padding:"16px 18px" }}>
        <div style={{ fontSize:13.5, fontWeight:700, color:C.ink, marginBottom:4 }}>Your current profile <span style={{ color:C.ink3, fontWeight:400 }}>(optional — improves accuracy)</span></div>
        <div style={{ fontSize:13, color:C.ink3, marginBottom:14, lineHeight:1.6 }}>Paste your existing headline and about to get specific improvements rather than a generic rewrite.</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
          <Field label="Current LinkedIn Headline" value={headline} onChange={setHeadline} placeholder="e.g. Computer Science Student | Seeking SDE Roles" maxLen={220}/>
          <Field label="Current About Section" value={about} onChange={setAbout} placeholder="Paste your current LinkedIn About section…" rows={4} maxLen={2000}/>
        </div>
        <Btn onClick={optimise} disabled={loading||!resume.trim()} bg={C.sage}>
          {loading?<><Spin s={15} c="#fff"/>Optimising profiles…</>:"✨ Optimise LinkedIn & Naukri"}
        </Btn>
        {!resume.trim()&&<div style={{ marginTop:8, fontSize:13, color:C.amber }}>⚠ Add your resume in the input section above first.</div>}
        {error&&<div style={{ marginTop:10, padding:"10px 14px", background:C.redBg, borderRadius:8, fontSize:13, color:C.red }}>{error}</div>}
      </Card>
      {loading&&!result&&(
        <Card flat style={{ padding:20 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}><Spin c={C.blue}/><span style={{ color:C.ink2, fontSize:14 }}>Optimising your profiles…</span></div>
          {[90,75,85,70].map((w,i)=><div key={i} style={{ marginBottom:8 }}><Skel h={14} w={`${w}%`}/></div>)}
        </Card>
      )}
      {result&&(
        <div style={{ display:"flex", flexDirection:"column", gap:12, animation:"slideUp .25s ease" }}>
          <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}` }}>
            {[["linkedin","💼 LinkedIn"],["naukri","🔍 Naukri"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setSubTab(id)} style={{ padding:"9px 14px", background:subTab===id?C.surface:"transparent", border:`1px solid ${subTab===id?C.border:"transparent"}`, borderBottom:subTab===id?`2px solid ${C.blue}`:"1px solid transparent", borderRadius:"7px 7px 0 0", marginBottom:-1, color:subTab===id?C.blue:C.ink3, fontWeight:subTab===id?700:500, fontSize:13.5, cursor:"pointer", fontFamily:"inherit", minHeight:40 }}>{lbl}</button>
            ))}
          </div>
          {subTab==="linkedin"&&result.linkedin&&(
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {result.linkedin.headline&&<Card flat style={{ overflow:"hidden" }}>
                <div style={{ padding:"10px 16px", background:C.blueBg, borderBottom:`1px solid ${C.blue}20`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11.5, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:.6 }}>Headline</span>
                  <CopyBtn text={result.linkedin.headline}/>
                </div>
                <div style={{ padding:"14px 16px" }}><p style={{ fontSize:14.5, color:C.ink, lineHeight:1.6, fontWeight:500 }}>{result.linkedin.headline}</p></div>
              </Card>}
              {result.linkedin.about&&<Card flat style={{ overflow:"hidden" }}>
                <div style={{ padding:"10px 16px", background:C.blueBg, borderBottom:`1px solid ${C.blue}20`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11.5, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:.6 }}>About section</span>
                  <CopyBtn text={result.linkedin.about}/>
                </div>
                <div style={{ padding:"14px 16px", maxHeight:300, overflowY:"auto" }}>
                  <pre style={{ fontSize:13.5, lineHeight:1.85, color:C.ink2, whiteSpace:"pre-wrap", fontFamily:"inherit", wordBreak:"break-word" }}>{result.linkedin.about}</pre>
                </div>
              </Card>}
              {result.linkedin.skills?.length>0&&<Card flat style={{ padding:"14px 16px" }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>Skills to add</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{result.linkedin.skills.map((s,i)=><Tag key={i} color={C.blue} bg={C.blueBg}>{s}</Tag>)}</div>
              </Card>}
              {result.linkedin.tips?.length>0&&<Card flat style={{ padding:"14px 16px" }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:C.sage, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>LinkedIn tips</div>
                {result.linkedin.tips.map((t,i)=><div key={i} style={{ display:"flex", gap:8, fontSize:13.5, color:C.ink2, marginBottom:8, lineHeight:1.65 }}><span style={{ color:C.sage, fontWeight:700, flexShrink:0 }}>→</span>{t}</div>)}
              </Card>}
            </div>
          )}
          {subTab==="naukri"&&result.naukri&&(
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {result.naukri.headline&&<Card flat style={{ overflow:"hidden" }}>
                <div style={{ padding:"10px 16px", background:C.amberBg, borderBottom:`1px solid ${C.amber}20`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11.5, fontWeight:700, color:C.amber, textTransform:"uppercase", letterSpacing:.6 }}>Naukri headline</span>
                  <CopyBtn text={result.naukri.headline}/>
                </div>
                <div style={{ padding:"14px 16px" }}><p style={{ fontSize:14.5, color:C.ink, lineHeight:1.6, fontWeight:500 }}>{result.naukri.headline}</p></div>
              </Card>}
              {result.naukri.keywords?.length>0&&<Card flat style={{ padding:"14px 16px" }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:C.amber, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>Key skills to add</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{result.naukri.keywords.map((k,i)=><Tag key={i} color={C.amber} bg={C.amberBg}>{k}</Tag>)}</div>
              </Card>}
              {result.naukri.tips?.length>0&&<Card flat style={{ padding:"14px 16px" }}>
                <div style={{ fontSize:11.5, fontWeight:700, color:C.sage, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>Naukri tips</div>
                {result.naukri.tips.map((t,i)=><div key={i} style={{ display:"flex", gap:8, fontSize:13.5, color:C.ink2, marginBottom:8, lineHeight:1.65 }}><span style={{ color:C.sage, fontWeight:700, flexShrink:0 }}>→</span>{t}</div>)}
              </Card>}
            </div>
          )}
          {result.missing_keywords?.length>0&&<Card flat style={{ padding:"14px 16px" }}>
            <div style={{ fontSize:11.5, fontWeight:700, color:C.red, textTransform:"uppercase", letterSpacing:.6, marginBottom:10 }}>Missing keywords for both platforms</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{result.missing_keywords.map((k,i)=><Tag key={i} color={C.red} bg={C.redBg}>{k}</Tag>)}</div>
          </Card>}
        </div>
      )}
    </div>
  );
}

/* ─── INVITE CODE MODAL ──────────────────────────────────── */
function InviteCodeModal({ user, onClose, onSuccess, toast }) {
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  async function redeem() {
    if (!code.trim()) { setError("Please enter a code."); return; }
    setLoading(true); setError("");
    const res = await redeemInviteCode(code.trim(), user.id);
    setLoading(false);
    if (res.ok) { toast("Invite code redeemed! Beta Friend access activated. 🎉","success"); onSuccess(); onClose(); }
    else setError(res.error||"Could not redeem code.");
  }
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, borderRadius:16, padding:"28px 24px", maxWidth:380, width:"100%", boxShadow:"0 20px 48px rgba(0,0,0,.18)", animation:"scaleIn .25s ease" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🎟️</div>
          <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20, color:C.ink, fontWeight:700, marginBottom:8 }}>Redeem invite code</h3>
          <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.65 }}>Enter your invite code to activate Beta Friend access with full premium features.</p>
        </div>
        <div style={{ marginBottom:14 }}>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. BETA-XXXX-YYYY"
            maxLength={20} onKeyDown={e=>e.key==="Enter"&&redeem()}
            style={{ width:"100%", padding:"13px 14px", borderRadius:9, border:`1.5px solid ${error?C.red:C.border}`, background:C.bg, fontSize:15, color:C.ink, fontFamily:"inherit", outline:"none", textTransform:"uppercase", letterSpacing:2, WebkitAppearance:"none" }}/>
          {error&&<div style={{ marginTop:7, fontSize:13, color:C.red }}>{error}</div>}
        </div>
        <Btn onClick={redeem} disabled={loading||!code.trim()} full bg={C.sage} style={{ marginBottom:10 }}>
          {loading?<><Spin s={15} c="#fff"/>Redeeming…</>:"Activate access"}
        </Btn>
        <button onClick={onClose} style={{ width:"100%", fontSize:13.5, color:C.ink3, cursor:"pointer", padding:8, minHeight:36 }}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── CONTACT FORM ───────────────────────────────────────── */
function ContactForm() {
  const [form,    setForm]    = useState({name:"", email:"", subject:"", message:""});
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [err,     setErr]     = useState("");

  async function submit() {
    if(!form.name.trim())    return setErr("Please enter your name.");
    if(!form.email.trim()||!form.email.includes("@")) return setErr("Please enter a valid email.");
    if(!form.message.trim()) return setErr("Please enter your message.");
    setSending(true); setErr("");
    try {
      // Save to Supabase feedback table (reusing existing table)
      if(sb) await sb.from("feedback").insert({
        helpful: true,
        comment: `[CONTACT FORM]
Name: ${form.name}
Email: ${form.email}
Subject: ${form.subject||"General"}
Message: ${form.message}`,
        user_id: null,
      });
      setSent(true);
    } catch(e) { setErr("Could not send message. Please email us directly at hellokrackhire@gmail.com"); }
    setSending(false);
  }

  if(sent) return (
    <div style={{ textAlign:"center", padding:"40px 20px", background:C.sageBg, borderRadius:14, border:`1px solid ${C.sage}25` }}>
      <div style={{ fontSize:40, marginBottom:14 }}>✅</div>
      <div style={{ fontSize:18, fontWeight:700, color:C.sage, marginBottom:8 }}>Message sent!</div>
      <div style={{ fontSize:14, color:C.ink2, lineHeight:1.7 }}>Thanks for reaching out. We'll get back to you within 24 hours.</div>
    </div>
  );

  return (
    <Card flat style={{ padding:"clamp(18px,4vw,28px)", border:`1px solid ${C.border}` }}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Your name *" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} placeholder="e.g. Rahul Kumar" maxLen={80}/>
          <Field label="Email address *" value={form.email} onChange={v=>setForm(p=>({...p,email:v}))} placeholder="you@email.com" type="email" maxLen={120} accent={C.blue}/>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.5, textTransform:"uppercase" }}>Subject</label>
          <select value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))} style={{ padding:"12px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:15, color:C.ink, fontFamily:"inherit", cursor:"pointer" }}>
            <option value="">Select a topic…</option>
            <option value="Support">Product support</option>
            <option value="Billing">Billing / payment</option>
            <option value="College">College partnership</option>
            <option value="Feedback">Feedback / suggestion</option>
            <option value="Other">Something else</option>
          </select>
        </div>
        <Field label="Message *" value={form.message} onChange={v=>setForm(p=>({...p,message:v}))} placeholder="Tell us how we can help…" rows={5} maxLen={1000}/>
        {err&&<div style={{ fontSize:13, color:C.red, padding:"9px 13px", background:C.redBg, borderRadius:8 }}>{err}</div>}
        <Btn onClick={submit} disabled={sending} bg={C.sage} full size="lg">
          {sending?<><Spin s={16} c="#fff"/>Sending…</>:"Send message →"}
        </Btn>
        <p style={{ fontSize:12.5, color:C.ink3, textAlign:"center", lineHeight:1.6 }}>
          Or email us directly at{" "}
          <a href="mailto:hellokrackhire@gmail.com" style={{ color:C.blue, fontWeight:600 }}>hellokrackhire@gmail.com</a>
        </p>
      </div>
    </Card>
  );
}


/* ══════════════════════════════════════════════════════════════
   PAGE SHELL — shared wrapper for all legal/info pages
══════════════════════════════════════════════════════════════ */
function PageShell({ title, tag, tagColor, tagBg, children, onBack }) {
  useEffect(()=>{ window.scrollTo({top:0,behavior:"instant"}); },[]);
  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      {/* Minimal nav */}
      <nav style={{ position:"sticky", top:0, zIndex:200, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(14px,5vw,52px)", background:"rgba(249,248,246,.97)", backdropFilter:"blur(14px)", borderBottom:`1px solid ${C.border}` }}>
        <button onClick={onBack} className="inline" style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, fontWeight:600, color:C.ink2, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>
          <span style={{ fontSize:18, lineHeight:1 }}>←</span> KrackHire
        </button>
        <Logo size="sm"/>
       <button onClick={onBack} style={{ fontSize:13.5, fontWeight:600, color:C.sage, cursor:"pointer", background:"none", fontFamily:"inherit", padding:"7px 14px", borderRadius:8, border:`1px solid ${C.sage}30` }}>
  Go to app →
</button>
      </nav>
      {/* Page header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"clamp(32px,6vw,64px) clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth:760, margin:"0 auto" }}>
          <Tag color={tagColor||C.stone} bg={tagBg}>{tag}</Tag>
          <h1 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(26px,4vw,40px)", color:C.ink, margin:"14px 0 10px", fontWeight:700, lineHeight:1.15 }}>{title}</h1>
          <p style={{ fontSize:13.5, color:C.ink3 }}>Last updated: January 2025 · www.krackhire.in</p>
        </div>
      </div>
      {/* Content */}
      <div style={{ maxWidth:760, margin:"0 auto", padding:"clamp(28px,5vw,56px) clamp(16px,5vw,52px)" }}>
        {children}
      </div>
      {/* Footer strip */}
      <div style={{ background:"#1C1917", padding:"24px clamp(16px,5vw,52px)", display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"center", gap:12 }}>
        <Logo dark size="sm"/>
        <span style={{ fontSize:12, color:"#57534E" }}>© 2025 KrackHire. All rights reserved.</span>
        <button onClick={onBack} style={{ fontSize:13, color:"#78716C", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset" }}>← Back to site</button>
      </div>
    </div>
  );
}

/* ── LEGAL SECTION BLOCK ── */
function LegalSection({ items }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      {items.map(([title, text], i) => (
        <div key={i} style={{ padding:"22px 0", borderBottom:i<items.length-1?`1px solid ${C.border}`:"none" }}>
          <div style={{ fontSize:15.5, fontWeight:700, color:C.ink, marginBottom:8 }}>{title}</div>
          <p style={{ fontSize:14.5, color:C.ink2, lineHeight:1.85 }}>{text}</p>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CONTACT PAGE
══════════════════════════════════════════════════════════════ */
function ContactPage({ onBack }) {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [subject, setSubject] = useState("General enquiry");
  const [message, setMessage] = useState("");
  const [sent,    setSent]    = useState(false);
  const [err,     setErr]     = useState("");

  function validate() {
    if (!name.trim())    { setErr("Please enter your name."); return false; }
    if (!email.trim() || !email.includes("@")) { setErr("Please enter a valid email."); return false; }
    if (!message.trim()) { setErr("Please write a message."); return false; }
    return true;
  }

  function handleSend() {
    setErr("");
    if (!validate()) return;
    const body = `Name: ${name}%0AEmail: ${email}%0ASubject: ${subject}%0A%0A${message}`;
    window.location.href = `mailto:hellokrackhire@gmail.com?subject=${encodeURIComponent(subject)}&body=${body}`;
    setSent(true);
  }

  useEffect(()=>{ window.scrollTo({top:0,behavior:"instant"}); },[]);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      {/* Nav */}
      <nav style={{ position:"sticky", top:0, zIndex:200, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(14px,5vw,52px)", background:"rgba(249,248,246,.97)", backdropFilter:"blur(14px)", borderBottom:`1px solid ${C.border}` }}>
        <button onClick={onBack} className="inline" style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, fontWeight:600, color:C.ink2, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>
          <span style={{ fontSize:18, lineHeight:1 }}>←</span> KrackHire
        </button>
        <Logo size="sm"/>
       <button onClick={onBack} style={{ fontSize:13.5, fontWeight:600, color:C.sage, cursor:"pointer", background:"none", fontFamily:"inherit", padding:"7px 14px", borderRadius:8, border:`1px solid ${C.sage}30` }}>
  Go to app →
</button>
      </nav>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"clamp(32px,6vw,64px) clamp(16px,5vw,52px)" }}>
        {/* Header */}
        <div style={{ marginBottom:40 }}>
          <Tag color={C.blue} bg={C.blueBg}>Contact</Tag>
          <h1 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(26px,4vw,40px)", color:C.ink, margin:"14px 0 10px", fontWeight:700 }}>Get in touch.</h1>
          <p style={{ fontSize:15, color:C.ink2, lineHeight:1.75, maxWidth:480 }}>We respond within 24 hours on business days. For urgent matters, email us directly.</p>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr", gap:"clamp(20px,4vw,48px)", alignItems:"start" }} className="contact-grid">
          {/* Left: contact info */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:11.5, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.8, marginBottom:2 }}>Contact details</div>
            {[
              { icon:"👤", label:"Legal Name",  value:"Mohammad Mohid" },
              { icon:"📧", label:"Email",        value:"hellokrackhire@gmail.com", href:"mailto:hellokrackhire@gmail.com" },
              { icon:"📞", label:"Phone",        value:"+91 63032 79390",          href:"tel:+916303279390" },
              { icon:"📍", label:"Address",      value:"H.No 6-57, Shimla Nagar Colony, Chattanpally Road, Shadnagar, Farooqnagar, Mahbubnagar, Telangana 509215, India" },
              { icon:"🌐", label:"Website",      value:"www.krackhire.in",          href:"https://www.krackhire.in" },
            ].map((item, i) => (
              <div key={i} style={{ display:"flex", gap:13, padding:"14px 16px", background:C.surface, borderRadius:10, border:`1px solid ${C.border}` }}>
                <span style={{ fontSize:18, flexShrink:0, marginTop:1 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize:11.5, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.4, marginBottom:3 }}>{item.label}</div>
                  {item.href
                    ? <a href={item.href} style={{ fontSize:13.5, color:C.blue, fontWeight:500, lineHeight:1.6, wordBreak:"break-word" }}>{item.value}</a>
                    : <div style={{ fontSize:13.5, color:C.ink, lineHeight:1.6 }}>{item.value}</div>
                  }
                </div>
              </div>
            ))}
            <div style={{ padding:"14px 16px", background:C.sageBg, borderRadius:10, fontSize:13, color:C.sage, lineHeight:1.65 }}>
              💬 We typically reply within 24 hours. For college tie-ups or partnerships, mention it in the subject.
            </div>
          </div>

          {/* Right: form */}
          <div>
            {sent ? (
              <div style={{ textAlign:"center", padding:"48px 24px", background:C.surface, borderRadius:14, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:44, marginBottom:16 }}>✅</div>
                <div style={{ fontSize:20, fontWeight:700, color:C.sage, marginBottom:10 }}>Email client opened!</div>
                <p style={{ fontSize:14, color:C.ink2, lineHeight:1.75 }}>Your email client should have opened with the message pre-filled. If not, email us directly at <a href="mailto:hellokrackhire@gmail.com" style={{ color:C.blue, fontWeight:600 }}>hellokrackhire@gmail.com</a></p>
                <button onClick={()=>setSent(false)} style={{ marginTop:20, fontSize:13.5, color:C.ink3, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit" }}>Send another message</button>
              </div>
            ) : (
              <Card flat style={{ padding:"clamp(20px,4vw,32px)" }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.ink, marginBottom:20 }}>Send us a message</div>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <Field label="Your Name *" value={name} onChange={v=>{setName(v);setErr("");}} placeholder="e.g. Rahul Kumar" maxLen={80}/>
                    <Field label="Your Email *" value={email} onChange={v=>{setEmail(v);setErr("");}} placeholder="you@email.com" type="email" maxLen={120} accent={C.blue}/>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.5, textTransform:"uppercase" }}>Subject</label>
                    <select value={subject} onChange={e=>setSubject(e.target.value)} style={{ padding:"12px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:15, color:C.ink, fontFamily:"inherit", cursor:"pointer", WebkitAppearance:"none", minHeight:48 }}>
                      {["General enquiry","Support / Bug report","College partnership","Business enquiry","Payment issue","Feedback"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <Field label="Message *" value={message} onChange={v=>{setMessage(v);setErr("");}} placeholder="Tell us what you need…" rows={5} maxLen={1000}/>
                  {err&&<div style={{ padding:"10px 14px", background:C.redBg, borderRadius:8, fontSize:13, color:C.red }}>{err}</div>}
                  <Btn onClick={handleSend} full bg={C.sage} style={{ fontSize:15 }}>Send message →</Btn>
                  <p style={{ fontSize:12, color:C.ink3, textAlign:"center" }}>This opens your email client with the message pre-filled.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{ background:"#1C1917", padding:"24px clamp(16px,5vw,52px)", display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"center", gap:12, marginTop:48 }}>
        <Logo dark size="sm"/>
        <span style={{ fontSize:12, color:"#57534E" }}>© 2025 KrackHire. All rights reserved.</span>
        <button onClick={onBack} style={{ fontSize:13, color:"#78716C", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset" }}>← Back to site</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PRIVACY POLICY PAGE
══════════════════════════════════════════════════════════════ */
function PrivacyPage({ onBack }) {
  return (
    <PageShell title="Privacy Policy" tag="Legal" tagColor={C.stone} onBack={onBack}>
      <LegalSection items={[
        ["Information we collect", "We collect your name and email when you sign in with Google. We also temporarily process the resume text and job descriptions you paste — these are sent to our AI provider for analysis and are not stored permanently."],
        ["How we use your data", "Your account data (name, email) is stored to maintain your session and save your analysis history. Resume and job description content is processed in real-time and not retained after analysis."],
        ["Third-party services", "We use Supabase for secure data storage, Groq for AI analysis, and PayU for payment processing. Each service has its own privacy policy and handles data according to their standards."],
        ["Payment data", "We do not store any card, UPI, or net banking details. All payment processing is handled exclusively by PayU on their secure infrastructure."],
        ["Cookies", "We use only essential cookies required for authentication and session management. No advertising or tracking cookies are used."],
        ["Data retention", "Your account data is retained as long as your account is active. Analysis history is retained to provide you with your history dashboard."],
        ["Your rights", "You may request deletion of your account and all associated data at any time by emailing hellokrackhire@gmail.com. Requests are processed within 7 business days."],
        ["Contact for privacy", "For privacy-related concerns: hellokrackhire@gmail.com · +91 63032 79390 · H.No 6-57, Shimla Nagar Colony, Shadnagar, Mahbubnagar, Telangana 509215, India"],
      ]}/>
    </PageShell>
  );
}

/* ══════════════════════════════════════════════════════════════
   TERMS OF SERVICE PAGE
══════════════════════════════════════════════════════════════ */
function TermsPage({ onBack }) {
  return (
    <PageShell title="Terms of Service" tag="Legal" tagColor={C.stone} onBack={onBack}>
      <LegalSection items={[
        ["Acceptance of terms", "By accessing or using KrackHire (www.krackhire.in), you agree to be bound by these Terms of Service. If you do not agree, please do not use the service."],
        ["Service description", "KrackHire provides AI-powered resume analysis, gap identification, and career guidance tools. All AI-generated content is for informational purposes only. We do not guarantee job placement or interview success."],
        ["Free plan", "Free users receive 3 analyses per calendar month. Each account also receives 3 lifetime premium accesses at sign-up. These are non-transferable and non-refundable once used."],
        ["Paid plans", "Paid subscriptions provide unlimited analyses for the subscription duration. Plans are billed as described at checkout. Subscriptions do not auto-renew unless explicitly stated."],
        ["Refunds", "Refund requests must be submitted within 24 hours of purchase and only if no analysis has been performed. Once an analysis is run, the plan is considered used. Contact hellokrackhire@gmail.com for refund requests."],
        ["Acceptable use", "You may not use KrackHire to: upload harmful or illegal content, attempt to bypass usage limits via multiple accounts, reverse-engineer our AI systems, or resell our outputs commercially without written permission."],
        ["Intellectual property", "KrackHire, its logo, and all platform content are owned by Mohammad Mohid. AI-generated content produced using your resume and job description belongs to you."],
        ["Limitation of liability", "KrackHire is provided on an as-is basis. We are not liable for any career decisions made based on our AI analysis. Results may vary based on input quality and job market conditions."],
        ["Modifications", "We reserve the right to modify these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms."],
        ["Governing law", "These terms are governed by the laws of India. All disputes are subject to the jurisdiction of courts in Hyderabad, Telangana."],
        ["Contact", "For terms-related queries: hellokrackhire@gmail.com · +91 63032 79390 · Mohammad Mohid, H.No 6-57, Shimla Nagar Colony, Shadnagar, Mahbubnagar, Telangana 509215, India"],
      ]}/>
    </PageShell>
  );
}

/* ══════════════════════════════════════════════════════════════
   REFUND POLICY PAGE
══════════════════════════════════════════════════════════════ */
function RefundPage({ onBack }) {
  return (
    <PageShell title="Refund Policy" tag="Legal" tagColor={C.stone} onBack={onBack}>
      <div style={{ padding:"20px 24px", background:C.amberBg, borderRadius:12, border:`1px solid ${C.amber}30`, marginBottom:28 }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.amber, marginBottom:6 }}>Summary</div>
        <p style={{ fontSize:14, color:C.ink2, lineHeight:1.75 }}>Refunds are available within 24 hours of purchase, provided no analysis has been run. Email us at <a href="mailto:hellokrackhire@gmail.com" style={{ color:C.blue, fontWeight:600 }}>hellokrackhire@gmail.com</a> with your payment details.</p>
      </div>
      <LegalSection items={[
        ["Eligibility for refund", "A full refund is available if: (1) the request is made within 24 hours of purchase, and (2) no analysis has been performed using the purchased plan."],
        ["Non-refundable situations", "Refunds will not be issued if: an analysis has been run using the plan, the 24-hour window has passed, or the request is for a free plan or lifetime access."],
        ["How to request a refund", "Email hellokrackhire@gmail.com with subject 'Refund Request' and include: your registered email, payment ID (from PayU), and reason for the request. We process within 5–7 business days."],
        ["Refund method", "Refunds are credited back to the original payment method (UPI, card, or net banking). Processing time depends on your bank or payment provider (typically 5–7 business days after approval)."],
        ["Subscription cancellation", "You may cancel your subscription at any time. Cancellation stops future billing but does not refund the current billing period."],
        ["Disputes", "If you believe a payment was made in error or you were charged incorrectly, contact us immediately at hellokrackhire@gmail.com or +91 63032 79390."],
        ["Contact for refunds", "Email: hellokrackhire@gmail.com · Phone: +91 63032 79390 · Available Mon–Sat, 10 AM – 6 PM IST"],
      ]}/>
    </PageShell>
  );
}


/* ─── WELCOME POPUP ──────────────────────────────────────── */
function WelcomePopup({ user, profile, onClose }) {
  const name = user?.user_metadata?.name?.split(" ")[0] || "there";
  const isNew = profile?.analyses_this_month === 0;

  useEffect(()=>{
    const timer = setTimeout(onClose, 8000);
    return ()=>clearTimeout(timer);
  },[]);

  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:1100, maxWidth:340, animation:"slideUp .4s ease" }}>
      <div style={{ background:C.surface, borderRadius:16, padding:"20px 22px", boxShadow:"0 8px 40px rgba(0,0,0,.14)", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:C.sageBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👋</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:C.ink }}>
                {isNew ? `Welcome, ${name}!` : `Welcome back, ${name}!`}
              </div>
              <div style={{ fontSize:12, color:C.ink3 }}>KrackHire</div>
            </div>
            
          </div>
          <button onClick={onClose} style={{ fontSize:18, color:C.ink3, cursor:"pointer", background:"none", border:"none", minHeight:"unset", minWidth:"unset", lineHeight:1, padding:2 }}>×</button>
        </div>
        {isNew ? (
          <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.7, marginBottom:14 }}>
            You have <strong>3 free analyses</strong> and <strong>3 lifetime premium accesses</strong> ready. Start by pasting your resume below! 🚀
          </p>
        ) : (
          <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.7, marginBottom:14 }}>
            Good to have you back! You have <strong>{profile?.lifetime_accesses_remaining||0} lifetime accesses</strong> remaining this month.
          </p>
        )}
        <div style={{ display:"flex", gap:8 }}>
          <Btn size="sm" bg={C.sage} onClick={onClose} full style={{ fontSize:13 }}>
            {isNew ? "Start analysing →" : "Continue →"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── ANNOUNCEMENT BANNER ────────────────────────────────── */
function AnnouncementBanner({ navigate }) {
  const [ann, setAnn] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(()=>{
    if(!sb) return;
    sb.from("announcements")
      .select("*")
      .eq("active", true)
      .order("created_at", {ascending:false})
      .limit(1)
      .single()
      .then(({data})=>{ if(data) setAnn(data); })
      .catch(()=>{});
  },[]);

  if(!ann || dismissed) return null;

  const bgClr = {info:C.blueBg, success:C.sageBg, warning:C.amberBg, promo:C.purpleBg}[ann.type]||C.blueBg;
  const txtClr = {info:C.blue, success:C.sage, warning:C.amber, promo:C.purple}[ann.type]||C.blue;

  return (
    <div style={{ background:bgClr, borderBottom:`1px solid ${txtClr}20`, padding:"10px clamp(14px,4vw,40px)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
        <span style={{ fontSize:14, color:txtClr, fontWeight:600 }}>{ann.title}</span>
        <span style={{ fontSize:13.5, color:C.ink2 }}>{ann.message}</span>
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
        {ann.cta_text&&ann.cta_action&&(
          <Btn size="sm" bg={txtClr} onClick={()=>{ if(ann.cta_action.startsWith("nav:")) navigate(ann.cta_action.slice(4)); else window.open(ann.cta_action); }}>
            {ann.cta_text}
          </Btn>
        )}
        <button onClick={()=>setDismissed(true)} style={{ fontSize:16, color:C.ink3, cursor:"pointer", background:"none", border:"none", minHeight:"unset", minWidth:"unset" }}>×</button>
      </div>
    </div>
  );
}

/* ─── STATIC DATA ────────────────────────────────────────── */
const FEATURES=[
  {icon:"🔍",title:"Resume Score /100",         desc:"Hirability score based on ATS compatibility, skill match, and clarity — specific to the job you're targeting.",color:C.sage, bg:C.sageBg},
  {icon:"📋",title:"Gap Analysis",              desc:"Exact missing skills, weak areas, and strengths — with specific advice to fix each one before you apply.",     color:C.blue, bg:C.blueBg},
  {icon:"📄",title:"ATS-Optimised Resume",       desc:"Your resume rewritten with JD keywords. ATS-safe format. Ready to paste into any application.",                 color:C.sage, bg:C.sageBg},
  {icon:"✉️",title:"Cover Letter",              desc:"Professional Indian English. Personalised to the company and role. Under 250 words. Human tone.",               color:C.amber,bg:C.amberBg},
  {icon:"📧",title:"Cold Email to HR",           desc:"Under 150 words with subject line. Confident, specific, one clear ask. Designed for Indian HR.",               color:C.stone,bg:C.bg},
  {icon:"🎯",title:"Interview Preparation",     desc:"AI coach with round-by-round guidance: OA, Technical, Advanced, HR. Questions, tips, and scoring.",            color:C.blue, bg:C.blueBg},
  {icon:"📊",title:"PDF Career Report",         desc:"Download a professional report with your full analysis, improvement plan, and LinkedIn optimisation tips.",     color:C.purple,bg:C.purpleBg},
  {icon:"📋",title:"Job Application Tracker",  desc:"Track every application with status, rounds, notes, and follow-up dates. Know exactly where you stand.",       color:C.amber,bg:C.amberBg},
];

const FAQS=[
  {q:"Is KrackHire free to use?",           a:"Yes — 3 free analyses per month, no account required. Sign in to save your history and track applications. Upgrade to Pro for unlimited analyses and PDF reports."},
  {q:"How does the Pro plan work?",         a:"Pro gives unlimited analyses at ₹49/month or ₹499/year. Payment via PayU — UPI, cards, net banking. Account upgrades instantly after payment."},
  {q:"Can I upload my resume as a PDF?",    a:"PDF and DOCX upload is coming very soon. Currently you can paste your resume text directly — copy from your PDF and paste into the field."},
  {q:"How accurate is the resume score?",   a:"The score reflects how well your resume matches the specific job description you provide. Use it as a practical guide for improvement, not a guarantee of interview success."},
  {q:"What is the PDF Career Report?",      a:"A downloadable professional report with your full analysis, missing keywords, LinkedIn optimisation tips, and a 7 or 14-day improvement plan. Available for Pro users."},
  {q:"How are reviews verified?",           a:"Every review is manually approved before appearing on this page. We do not display fake or AI-generated testimonials."},
];

/* ─── LANDING PAGE ───────────────────────────────────────── */
function Landing({ onEnter, user, profile, onShowAuth, onSignOut, onUpgrade, onProfileRefresh, toast, onAdmin, navigate, onDashboard }) {
  const [scrolled,setScrolled]=useState(false); const [menuOpen,setMenuOpen]=useState(false); const [faqOpen,setFaqOpen]=useState(null);
  const [reviews,setReviews]=useState([]); const [reviewsDone,setReviewsDone]=useState(false); const [showForm,setShowForm]=useState(false); const [page,setPage]=useState(0);
  const [showInvite,setShowInvite]=useState(false);
  const PER=3;
  useEffect(()=>{ const fn=()=>setScrolled(window.scrollY>10); window.addEventListener("scroll",fn,{passive:true}); getApprovedRevs().then(d=>{setReviews(d);setReviewsDone(true);}).catch(()=>setReviewsDone(true)); return()=>window.removeEventListener("scroll",fn); },[]);
  const visible=reviews.slice(page*PER,(page+1)*PER); const totalPages=Math.ceil(reviews.length/PER);
  const avg=reviews.length?(reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1):null;
  const navLinks=[["#how","How it works"],["#features","Features"],["#pricing","Pricing"],["#reviews","Reviews"],["#faq","FAQ"]];
  const isPro=isPremiumPlan(profile?.plan, profile?.plan_expires_at);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      {showInvite&&user&&<InviteCodeModal user={user} onClose={()=>setShowInvite(false)} onSuccess={onProfileRefresh} toast={toast}/>}
      <div className="ann-bar" style={{ background:C.sage, color:"#fff", textAlign:"center", padding:"9px 16px", fontSize:13.5, fontWeight:500, lineHeight:1.5 }}>
        KrackHire is in early beta — free to use, no account needed.{" "}
        <button onClick={onEnter} className="inline" style={{ color:"#D4E6DA", fontWeight:700, textDecoration:"underline", cursor:"pointer", background:"none", border:"none", fontSize:13.5, fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>Try it →</button>
      </div>

      <nav style={{ position:"sticky", top:0, zIndex:200, height:56, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(14px,5vw,52px)", background:scrolled?"rgba(249,248,246,.96)":"transparent", backdropFilter:"blur(14px)", borderBottom:`1px solid ${scrolled?C.border:"transparent"}`, transition:"all .3s" }}>
        <Logo/>
        <div className="desktop-only" style={{ gap:2 }}>
          {navLinks.map(([h,l])=>(
            <a key={l} href={h} style={{ padding:"6px 11px", borderRadius:7, fontSize:13.5, fontWeight:500, color:C.ink2, transition:"all .15s", minHeight:36, display:"inline-flex", alignItems:"center" }}>{l}</a>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {user?<UserMenu user={user} profile={profile} onSignOut={onSignOut} onUpgrade={onUpgrade} onInvite={()=>setShowInvite(true)} onAdmin={onAdmin} onDashboard={onDashboard}/>
               :<><OutBtn onClick={onShowAuth} size="sm" className="desktop-only">Sign in</OutBtn><Btn onClick={onEnter} size="sm" bg={C.sage}>Try free</Btn></>}
          <button className="mobile-only" onClick={()=>setMenuOpen(!menuOpen)} style={{ padding:"8px 10px", borderRadius:7, color:C.ink2, fontSize:20, lineHeight:1, minHeight:44, minWidth:44 }}>{menuOpen?"✕":"☰"}</button>
        </div>
      </nav>

      {menuOpen&&(
        <div style={{ position:"fixed", top:"calc(35px + 52px)", left:0, right:0, zIndex:199, background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"10px 14px", display:"flex", flexDirection:"column", gap:2, animation:"slideUp .2s ease", boxShadow:"0 6px 20px rgba(0,0,0,.08)" }}>
          {navLinks.map(([h,l])=><a key={l} href={h} onClick={()=>setMenuOpen(false)} style={{ padding:"12px 14px", borderRadius:8, fontSize:15, fontWeight:500, color:C.ink2, minHeight:48, display:"flex", alignItems:"center" }}>{l}</a>)}
          <div style={{ paddingTop:10, borderTop:`1px solid ${C.border}`, marginTop:6, display:"flex", flexDirection:"column", gap:8 }}>
            {!user&&<OutBtn onClick={()=>{setMenuOpen(false);onShowAuth();}} style={{ justifyContent:"center", width:"100%" }}>Sign in with Google</OutBtn>}
            <Btn onClick={()=>{setMenuOpen(false);onEnter();}} full bg={C.sage}>Open the tool</Btn>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="hero-section section-pad" style={{ maxWidth:1060, margin:"0 auto", padding:"clamp(48px,9vw,100px) clamp(16px,5vw,52px) clamp(48px,7vw,88px)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"clamp(28px,6vw,72px)", alignItems:"center" }}>
        <div>
          <Tag color={C.sage} bg={C.sageBg} style={{ marginBottom:16, display:"inline-flex" }}>Early beta — free to use</Tag>
          <h1 className="hero-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(28px,4vw,50px)", lineHeight:1.12, letterSpacing:"-.3px", color:C.ink, marginBottom:18, marginTop:12 }}>
            Understand why your resume gets rejected —<br/>
            <em style={{ fontStyle:"italic", color:C.sage }}>before you apply.</em>
          </h1>
          <p className="hero-sub" style={{ fontSize:"clamp(15px,1.7vw,17px)", color:C.ink2, lineHeight:1.85, marginBottom:28, maxWidth:500 }}>
            Paste your resume and job description. Get a clear score, gap analysis, ATS resume, cover letter, and interview preparation in 20 seconds.
          </p>
          <div className="hero-btns" style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
            <Btn onClick={onEnter} size="lg" bg={C.sage}>Open the tool — it's free</Btn>
            {!user&&<OutBtn onClick={onShowAuth} size="lg">Sign in to save</OutBtn>}
          </div>
          <div className="hero-trust" style={{ display:"flex", flexWrap:"wrap", gap:16 }}>
            {["No account needed","No credit card","Data not stored","Built for India"].map(t=>(
              <span key={t} className="inline" style={{ fontSize:13, color:C.ink3, gap:5, minHeight:"unset", minWidth:"unset" }}>
                <span style={{ color:C.sage }}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-visual" style={{ position:"relative", animation:"fadeIn 1s ease" }}>
          <Card flat style={{ overflow:"hidden", border:`1px solid ${C.border}` }}>
            <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", gap:4 }}>{["#FF5F57","#FEBC2E","#28C840"].map(c=><div key={c} style={{ width:10, height:10, borderRadius:"50%", background:c }}/>)}</div>
              <span className="inline" style={{ fontSize:12, fontWeight:500, color:C.ink3, minHeight:"unset", minWidth:"unset" }}>Example result — your results will differ</span>
            </div>
            <div style={{ padding:"18px 18px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ display:"flex", gap:16 }}>
                  <ScoreRing score={72} size={64} color={C.sage} label="Readiness"/>
                  <ScoreRing score={68} size={64} color={C.amber} label="ATS"/>
                  <ScoreRing score={74} size={64} color={C.blue} label="Skills"/>
                </div>
              </div>
              {[{t:"red",i:"✗",title:"Missing: SQL basics",sub:"Found in 4/5 similar JDs."},{t:"amber",i:"△",title:"Weak: Project impact",sub:"Add numbers to your achievements."},{t:"green",i:"✓",title:"Strong: Ops experience",sub:"Relevant. Lead with this."}].map((g,i)=>{
                const m={red:[C.red,C.redBg],amber:[C.amber,C.amberBg],green:[C.sage,C.sageBg]};
                const[clr,bg]=m[g.t];
                return <div key={i} style={{ display:"flex", gap:9, padding:"8px 11px", background:bg, borderRadius:7, borderLeft:`3px solid ${clr}`, marginBottom:7 }}>
                  <span className="inline" style={{ color:clr, fontWeight:800, fontSize:12, minHeight:"unset", minWidth:"unset" }}>{g.i}</span>
                  <div><div style={{ fontSize:12, fontWeight:700, color:clr }}>{g.title}</div><div style={{ fontSize:11.5, color:C.ink2, marginTop:1 }}>{g.sub}</div></div>
                </div>;
              })}
            </div>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="section-pad" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:"64px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth:1060, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:40 }}>
              <Tag color={C.blue} bg={C.blueBg}>How it works</Tag>
              <h2 className="section-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(24px,3.5vw,36px)", lineHeight:1.2, margin:"12px 0 10px", color:C.ink }}>Simple. Honest. Practical.</h2>
              <p className="section-sub" style={{ fontSize:15, color:C.ink2, maxWidth:380, margin:"0 auto", lineHeight:1.75 }}>No account required. Just paste and get clear feedback.</p>
            </div>
            <div className="how-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
              {[{n:"01",title:"Paste your resume",desc:"Any format. Copy the full text."},{n:"02",title:"Paste the job description",desc:"From Naukri, LinkedIn, anywhere."},{n:"03",title:"Get your score and gaps",desc:"Clear results in about 20 seconds."},{n:"04",title:"Improve and apply",desc:"Use feedback to strengthen applications."}].map((s,i)=>(
                <div key={i} style={{ padding:"24px 18px", borderRight:i<3?`1px solid ${C.border}`:"none", background:C.surface, transition:"background .18s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                  onMouseLeave={e=>e.currentTarget.style.background=C.surface}>
                  <div style={{ fontFamily:"'Lora',Georgia,serif", fontSize:32, color:C.ink4, lineHeight:1, marginBottom:10, fontWeight:700 }}>{s.n}</div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:5, color:C.ink }}>{s.title}</div>
                  <div style={{ fontSize:13, color:C.ink2, lineHeight:1.65 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign:"center", marginTop:28 }}><Btn onClick={onEnter} size="lg" bg={C.sage}>Try it now — free</Btn></div>
          </Reveal>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="section-pad" style={{ padding:"64px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth:1060, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:36 }}>
              <Tag>What you get</Tag>
              <h2 className="section-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(24px,3.5vw,36px)", lineHeight:1.2, margin:"12px 0 10px", color:C.ink }}>Eight tools in one analysis.</h2>
              <p className="section-sub" style={{ fontSize:15, color:C.ink2, maxWidth:400, margin:"0 auto", lineHeight:1.75 }}>Everything you need from score to first job, in one place.</p>
            </div>
            <div className="features-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:10 }}>
              {FEATURES.map((f,i)=>(
                <Card key={i} style={{ padding:"20px 18px" }}>
                  <div style={{ width:38, height:38, borderRadius:8, background:f.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, marginBottom:12 }}>{f.icon}</div>
                  <div style={{ fontSize:14.5, fontWeight:700, marginBottom:5, color:C.ink }}>{f.title}</div>
                  <div style={{ fontSize:13, color:C.ink2, lineHeight:1.75 }}>{f.desc}</div>
                </Card>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="section-pad" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:"64px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:36 }}>
              <Tag color={C.amber} bg={C.amberBg}>Pricing</Tag>
              <h2 className="section-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(24px,3.5vw,36px)", lineHeight:1.2, margin:"12px 0 10px", color:C.ink }}>Simple, honest pricing.</h2>
              <p className="section-sub" style={{ fontSize:15, color:C.ink2, maxWidth:380, margin:"0 auto", lineHeight:1.75 }}>Start free. Upgrade when you're ready.</p>
            </div>
            <div className="pricing-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
              <Card flat className="pricing-card" style={{ padding:"24px 20px", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.8, marginBottom:14 }}>Free</div>
                <div className="pricing-price" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:40, lineHeight:1, color:C.ink, marginBottom:3 }}>₹0</div>
                <div style={{ fontSize:13, color:C.ink3, marginBottom:20 }}>forever</div>
                <Btn onClick={onEnter} full bg={C.ink} style={{ marginBottom:20, fontSize:14 }}>Start free →</Btn>
                <div style={{ height:1, background:C.border, marginBottom:16 }}/>
                {["3 analyses / month","Resume score","Gap analysis",{dim:"Cover letter"},{dim:"PDF report"},{dim:"Job tracker"}].map((f,i)=>{ const d=typeof f==="object"; return <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:13.5, color:d?C.ink4:C.ink2, marginBottom:8 }}><span className="inline" style={{ color:d?C.ink4:C.sage, fontWeight:700, minHeight:"unset", minWidth:"unset" }}>{d?"—":"✓"}</span>{d?f.dim:f}</div>; })}
              </Card>
              <div style={{ position:"relative" }}>
                <Card flat className="pricing-card" style={{ padding:"24px 20px", border:`2px solid ${C.sage}`, boxShadow:"0 4px 20px rgba(61,107,79,.12)" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.sage, textTransform:"uppercase", letterSpacing:.8, marginBottom:14 }}>Pro Monthly</div>
                  <div className="pricing-price" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:40, lineHeight:1, color:C.sage, marginBottom:3 }}>₹49</div>
                  <div style={{ fontSize:13, color:C.ink3, marginBottom:20 }}>per month</div>
                  <Btn onClick={()=>user?onUpgrade("pro_monthly"):onShowAuth()} full bg={C.sage} style={{ marginBottom:20, fontSize:14 }}>{user?"Get Pro →":"Sign in to upgrade →"}</Btn>
                  <div style={{ height:1, background:C.border, marginBottom:16 }}/>
                  {["Unlimited analyses","PDF career reports","Job application tracker","All AI outputs","Interview prep by round","Save all analyses"].map((f,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:13.5, color:C.ink2, marginBottom:8 }}><span className="inline" style={{ color:C.sage, fontWeight:700, minHeight:"unset", minWidth:"unset" }}>✓</span>{f}</div>
                  ))}
                </Card>
              </div>
              <div style={{ position:"relative" }}>
                <div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:C.amber, color:"#fff", fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, whiteSpace:"nowrap", zIndex:1 }}>Best value for students</div>
                <Card flat className="pricing-card" style={{ padding:"24px 20px", border:`2px solid ${C.amber}30` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.amber, textTransform:"uppercase", letterSpacing:.8, marginBottom:14 }}>Pro Yearly</div>
                  <div className="pricing-price" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:40, lineHeight:1, color:C.amber, marginBottom:3 }}>₹499</div>
                  <div style={{ fontSize:13, color:C.ink3, marginBottom:4 }}>per year</div>
                  <div style={{ fontSize:12.5, color:C.sage, fontWeight:600, marginBottom:16 }}>Save ₹89 vs monthly</div>
                  <Btn onClick={()=>user?onUpgrade("pro_yearly"):onShowAuth()} full bg={C.amber} style={{ marginBottom:20, fontSize:14 }}>{user?"Get Yearly →":"Sign in to upgrade →"}</Btn>
                  <div style={{ height:1, background:C.border, marginBottom:16 }}/>
                  {["Everything in Pro Monthly","₹41.58/month effective","Perfect for placement season","Cancel anytime"].map((f,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:13.5, color:C.ink2, marginBottom:8 }}><span className="inline" style={{ color:C.amber, fontWeight:700, minHeight:"unset", minWidth:"unset" }}>✓</span>{f}</div>
                  ))}
                </Card>
              </div>
            </div>
            <p style={{ textAlign:"center", fontSize:13, color:C.ink3, marginTop:16 }}>Payments secured by PayU — UPI · Debit/Credit cards · Net Banking</p>
          </Reveal>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" className="section-pad" style={{ padding:"64px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth:1060, margin:"0 auto" }}>
          <Reveal>
            <div className="reviews-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:14, marginBottom:32 }}>
              <div>
                <Tag color={C.amber} bg={C.amberBg}>User feedback</Tag>
                <h2 className="section-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(24px,3.5vw,36px)", lineHeight:1.2, margin:"12px 0 6px", color:C.ink }}>What people are saying.</h2>
                {avg&&reviews.length>0&&<div style={{ display:"flex", alignItems:"center", gap:8 }}><Stars rating={Math.round(parseFloat(avg))}/><span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{avg}/5</span><span style={{ fontSize:13, color:C.ink3 }}>({reviews.length} verified {reviews.length===1?"review":"reviews"})</span></div>}
              </div>
              <Btn onClick={()=>{ if(!user){onShowAuth();return;} setShowForm(!showForm); }} bg={C.sage} size="sm">{showForm?"✕ Cancel":"Leave a review"}</Btn>
            </div>
            {showForm&&<Card flat style={{ marginBottom:24, border:`1px solid ${C.border}`, overflow:"hidden" }}><ReviewForm user={user} onDone={()=>setShowForm(false)}/></Card>}
            {!reviewsDone?<div className="reviews-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>{[1,2,3].map(i=><div key={i}><Skel h={130}/></div>)}</div>
             :reviews.length===0?
               <div style={{ padding:"40px 20px", textAlign:"center", background:C.bg, borderRadius:12, border:`1px solid ${C.border}` }}>
                 <div style={{ fontSize:26, marginBottom:10 }}>💬</div>
                 <div style={{ fontSize:15, fontWeight:600, color:C.ink, marginBottom:8 }}>Early beta — user reviews will appear here as people start using the product.</div>
                 <div style={{ fontSize:13.5, color:C.ink2, lineHeight:1.7, maxWidth:400, margin:"0 auto 18px" }}>We don't display fake or unverified testimonials. Reviews appear only after manual approval.</div>
                 <Btn onClick={()=>{ if(!user){onShowAuth();return;} setShowForm(true); }} bg={C.sage} size="sm">Be the first to review</Btn>
               </div>
             :<>
               <div className="reviews-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                 {visible.map((r,i)=>(
                   <Card key={i} style={{ padding:"18px 16px" }}>
                     <Stars rating={r.rating}/>
                     <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.75, margin:"10px 0 12px", fontStyle:"italic" }}>"{r.text}"</p>
                     <div style={{ display:"flex", alignItems:"center", gap:8, borderTop:`1px solid ${C.border}`, paddingTop:11 }}>
                       <div style={{ width:30, height:30, borderRadius:"50%", background:C.sageBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:C.sage, flexShrink:0 }}>{r.name[0]}</div>
                       <div><div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{r.name}</div>{r.role&&<div style={{ fontSize:11.5, color:C.ink3 }}>{r.role}</div>}</div>
                     </div>
                   </Card>
                 ))}
               </div>
               {totalPages>1&&<div style={{ display:"flex", justifyContent:"center", gap:7 }}>
                 <OutBtn onClick={()=>setPage(p=>Math.max(0,p-1))} size="sm" style={{ opacity:page===0?.4:1 }}>← Prev</OutBtn>
                 {Array.from({length:totalPages}).map((_,i)=><button key={i} onClick={()=>setPage(i)} style={{ width:36, height:36, borderRadius:7, border:`1.5px solid ${page===i?C.sage:C.border}`, background:page===i?C.sage:C.surface, color:page===i?"#fff":C.ink2, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>{i+1}</button>)}
                 <OutBtn onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} size="sm" style={{ opacity:page===totalPages-1?.4:1 }}>Next →</OutBtn>
               </div>}
             </>}
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section-pad" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"64px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth:1060, margin:"0 auto" }}>
          <Reveal>
            <div className="faq-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1.8fr", gap:"clamp(24px,6vw,64px)" }}>
              <div>
                <Tag>FAQ</Tag>
                <h2 className="section-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(22px,2.8vw,30px)", lineHeight:1.2, margin:"12px 0 10px", color:C.ink }}>Common questions.</h2>
                <p style={{ fontSize:14, color:C.ink2, lineHeight:1.75, marginBottom:20 }}>Email us at hello@krackhire.in for anything else.</p>
                <OutBtn onClick={onEnter}>Open the tool →</OutBtn>
              </div>
              <div>
                {FAQS.map((f,i)=>(
                  <div key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                    <button onClick={()=>setFaqOpen(faqOpen===i?null:i)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 0", background:"none", border:"none", cursor:"pointer", fontSize:14.5, fontWeight:600, color:C.ink, fontFamily:"inherit", textAlign:"left", gap:12, minHeight:52 }}>
                      <span>{f.q}</span>
                      <span className="inline" style={{ fontSize:20, color:C.ink3, transform:faqOpen===i?"rotate(45deg)":"none", transition:"transform .25s", flexShrink:0, minHeight:"unset", minWidth:"unset" }}>+</span>
                    </button>
                    <div style={{ overflow:"hidden", maxHeight:faqOpen===i?300:0, transition:"max-height .36s ease" }}>
                      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.8, paddingBottom:16 }}>{f.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>


      {/* CTA */}
      <section className="section-pad" style={{ background:C.sageBg, borderTop:`1px solid ${C.sage}25`, padding:"72px clamp(16px,5vw,52px)", textAlign:"center" }}>
        <Reveal>
          <h2 className="section-title" style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(24px,4vw,40px)", lineHeight:1.15, color:C.ink, marginBottom:12 }}>Start improving your applications today.</h2>
          <p style={{ fontSize:16, color:C.ink2, marginBottom:28, lineHeight:1.75, maxWidth:420, margin:"0 auto 28px" }}>No account. No credit card. Paste your resume and get honest feedback in seconds.</p>
          <Btn onClick={onEnter} size="lg" bg={C.sage}>Open KrackHire — free</Btn>
          <div style={{ marginTop:18, display:"flex", justifyContent:"center", gap:18, flexWrap:"wrap", fontSize:13, color:C.ink3 }}>
            {["No account needed","No credit card","Data not stored","Made in Hyderabad 🇮🇳"].map(t=>(
              <span key={t} className="inline" style={{ gap:4, minHeight:"unset", minWidth:"unset" }}><span style={{ color:C.sage }}>✓</span>{t}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{ background:"#1C1917", color:"#fff", padding:"44px clamp(16px,5vw,52px) 28px" }}>
        <div style={{ maxWidth:1060, margin:"0 auto" }}>
          <div className="footer-grid" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:"clamp(24px,4vw,48px)", paddingBottom:32, borderBottom:"1px solid #292524" }}>

            {/* Brand */}
            <div className="footer-brand">
              <Logo dark/>
              <p style={{ fontSize:13, color:"#78716C", lineHeight:1.8, marginTop:12, maxWidth:260 }}>
                India's AI job readiness platform for freshers and early-career professionals. Honest feedback. No hype.
              </p>
              <p style={{ fontSize:12, color:"#57534E", marginTop:8 }}>Made with care in Hyderabad, India 🇮🇳</p>
            </div>

            {/* Product */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#57534E", textTransform:"uppercase", letterSpacing:1, marginBottom:16 }}>Product</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[["#features","Features"],["#how","How it works"],["#pricing","Pricing"],["#faq","FAQ"]].map(([href,label])=>(
                  <a key={label} href={href} style={{ fontSize:13.5, color:"#78716C", lineHeight:1, display:"flex", alignItems:"center", minHeight:"unset", transition:"color .15s" }}
                    onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="#78716C"}>
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#57534E", textTransform:"uppercase", letterSpacing:1, marginBottom:16 }}>Legal & Support</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  {label:"Contact Us",     page:"contact"},
                  {label:"Privacy Policy", page:"privacy"},
                  {label:"Terms of Service",page:"terms"},
                  {label:"Refund Policy",  page:"refund"},
                ].map(({label,page})=>(
                  <button key={page} onClick={()=>navigate(page)}
                    style={{ fontSize:13.5, color:"#78716C", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", textAlign:"left", padding:0, minHeight:"unset", minWidth:"unset", display:"flex", alignItems:"center", lineHeight:1, transition:"color .15s" }}
                    onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="#78716C"}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ paddingTop:20, display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:10, fontSize:12, color:"#57534E" }}>
            <span>© 2025 KrackHire. All rights reserved.</span>
            <div style={{ display:"flex", gap:16 }}>
              <button onClick={()=>navigate("privacy")} style={{ fontSize:12, color:"#57534E", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>Privacy</button>
              <button onClick={()=>navigate("terms")} style={{ fontSize:12, color:"#57534E", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>Terms</button>
              <button onClick={()=>navigate("refund")} style={{ fontSize:12, color:"#57534E", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>Refund</button>
              <button onClick={()=>navigate("contact")} style={{ fontSize:12, color:"#57534E", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset" }}>Contact</button>
            </div>
          </div>
          {["admin","founder"].includes(profile?.role)&&(
            <div style={{paddingTop:10,textAlign:"center"}}>
              <button onClick={onAdmin} style={{fontSize:11,color:"#57534E",cursor:"pointer",background:"none",border:"none",fontFamily:"inherit",opacity:.35,minHeight:"unset",minWidth:"unset"}}>⚙ Admin</button>
            </div>
          )}
        </div>
      </footer>


      <div className="mobile-cta" style={{ display:"none", position:"fixed", bottom:0, left:0, right:0, zIndex:198, padding:"10px 16px", background:"rgba(249,248,246,.97)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.border}`, alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div><div style={{ fontSize:13, fontWeight:700, color:C.ink }}>KrackHire</div><div style={{ fontSize:11.5, color:C.ink3 }}>Free resume analysis tool</div></div>
        <Btn onClick={onEnter} size="sm" bg={C.sage}>Try free</Btn>
      </div>
    </div>
  );
}
/* ─── TOOL ───────────────────────────────────────────────── */
const TABS=[
  {id:"gap",       label:"Score & Gaps",   icon:"🔍", color:C.sage},
  {id:"resume",    label:"Resume",         icon:"📄", color:C.blue},
  {id:"cover",     label:"Cover Letter",   icon:"✉️", color:C.amber},
  {id:"email",     label:"Cold Email",     icon:"📧", color:C.stone},
  {id:"interview", label:"Interview Prep", icon:"🎯", color:C.purple},
  {id:"profile",   label:"Profile",        icon:"💼", color:C.blue},
];

function Tool({ onBack, onDashboard, user, profile, onShowAuth, onUpgrade, onProfileRefresh }) {
  const { toast, list:toastList, remove:removeToast } = useToast();
  const [resume,  setResume]  = useState("");
  const [jd,      setJd]      = useState("");
  const [company, setCompany] = useState("");
  const [role,    setRole]    = useState("");
  const [ran,     setRan]     = useState(false);
  const [tab,     setTab]     = useState("gap");
  const [results, setResults] = useState({gap:null,resume:null,cover:null,email:null});
  const [loading, setLoading] = useState({gap:false,resume:false,cover:false,email:false});
  const [errors,  setErrors]  = useState({gap:null,resume:null,cover:null,email:null});
  const [chat,    setChat]    = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [chatBusy,setChatBusy]= useState(false);
  const [showFeedback, setShowFeedback]   = useState(false);
  const [showShareCard,setShowShareCard]  = useState(false);
  const [showPDFModal, setShowPDFModal]   = useState(false);
  const [showTracker,  setShowTracker]    = useState(false);
  const [showDash,     setShowDash]       = useState(false);
  const [showInvite,   setShowInvite]     = useState(false);
  const chatEnd = useRef(null);

  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[chat]);

  const payload = { resume, jd, company, role, userId: user?.id||null };
  const setL = useCallback((k,v)=>setLoading(p=>({...p,[k]:v})),[]);
  const setR = useCallback((k,v)=>setResults(p=>({...p,[k]:v})),[]);
  const setE = useCallback((k,v)=>setErrors(p=>({...p,[k]:v})),[]);
  const isPro = isPremiumPlan(profile?.plan, profile?.plan_expires_at);
  const lifetimeLeft = profile?.lifetime_accesses_remaining ?? 0;

  const currentStep = !ran?"Upload":results.gap?"Improve":"Analyse";

 async function analyse() {
    if(!resume.trim()||!jd.trim()){ toast("Please fill in both fields.","error"); return; }
    if(resume.length>8000){ toast("Resume too long — max 8000 characters.","error"); return; }
    if(jd.length>4000)    { toast("Job description too long — max 4000 characters.","error"); return; }

    // 1. STRICT LIMIT CHECK BEFORE RUNNING
    if (!user) {
      const anonUsage = parseInt(localStorage.getItem("kh_anon_usage") || "0");
      if (anonUsage >= 3) {
        toast("Free limit reached. Please sign in to continue.","warn");
        setTimeout(onShowAuth, 1500);
        return;
      }
    } else {
      const isPro = isPremiumPlan(profile?.plan, profile?.plan_expires_at);
      const used = profile?.analyses_this_month || 0;
      const lifetime = profile?.lifetime_accesses_remaining || 0;

      if (!isPro && used >= 3 && lifetime <= 0) {
        toast("Monthly limit reached. Upgrade to Pro to continue.","warn");
        setTimeout(onUpgrade, 1500);
        return;
      }
    }

    setRan(true); setTab("gap"); setShowFeedback(false);

    setResults({gap:null,resume:null,cover:null,email:null});
    setErrors({gap:null,resume:null,cover:null,email:null});
    setLoading({gap:true,resume:true,cover:true,email:true});

    await Promise.allSettled([
      callAPI("gap",payload)
        .then(async raw=>{
        const p=parseJSON(raw);
        if(p) {
          setR("gap",p);

          // 2. STRICTLY SAVE HISTORY & DEDUCT CREDITS
          if (!user) {
             const anonUsage = parseInt(localStorage.getItem("kh_anon_usage") || "0");
             localStorage.setItem("kh_anon_usage", anonUsage + 1);
          } else if (sb) {
             // Save to History Dashboard
             await sb.from("analyses").insert({
               user_id: user.id,
               company: payload.company || null,
               role: payload.role || null,
               gap_score: p.score || p.gap_score || 0,
               ats_score: p.ats_score || 0,
               skill_score: p.skill_score || 0
             }).catch(()=>{});

             // Deduct Credit from Profile
             const isPro = isPremiumPlan(profile?.plan, profile?.plan_expires_at);
             if (!isPro) {
               if ((profile?.analyses_this_month || 0) < 3) {
                 await sb.from("profiles").update({ analyses_this_month: (profile.analyses_this_month || 0) + 1 }).eq("id", user.id);
               } else if ((profile?.lifetime_accesses_remaining || 0) > 0) {
                 await sb.from("profiles").update({ lifetime_accesses_remaining: profile.lifetime_accesses_remaining - 1 }).eq("id", user.id);
               }
             }
             onProfileRefresh(); // Update the UI numbers instantly
          }

          if(user?.email) {
            const emailKey = "analysis_"+(p?.score||0)+"_"+(payload?.role||"")+"_"+Date.now();
            if(!_emailSent.has(emailKey)) {
              _emailSent.add(emailKey);
              callEmail("analysis_done", user.id, {
                email:     user.email,
                name:      user.user_metadata?.name||user.email?.split("@")[0]||"there",
                score:     p?.score||p?.gap_score||0,
                atsScore:  p?.ats_score||null,
                skillScore:p?.skill_score||null,
                role:      payload?.role||"",
                company:   payload?.company||"",
              }).catch(()=>{});
            }
          }
        } else {
          setE("gap","Could not parse result. Please try again.");
        }
      })
        .catch(e=>{ setE("gap",e.message); if(e.message.includes("LIMIT_REACHED")){
            toast("Monthly limit reached. Upgrade to Pro.","warn");
            setTimeout(()=>onUpgrade(),1600);
          } })
        .finally(()=>{ setL("gap",false); setShowFeedback(true); }),
      callAPI("resume",payload).then(r=>setR("resume",r)).catch(e=>setE("resume",e.message)).finally(()=>setL("resume",false)),
      callAPI("cover", payload).then(r=>setR("cover", r)).catch(e=>setE("cover", e.message)).finally(()=>setL("cover", false)),
      callAPI("email", payload).then(r=>setR("email", r)).catch(e=>setE("email", e.message)).finally(()=>setL("email", false)),
    ]);

    setChat([{role:"ai",text:`Hello. I'm your interview preparation coach for the ${role||"this"} role${company?` at ${company}`:""}.

I've reviewed your resume and the job description. I'll ask you interview questions one at a time, score your answers out of 10, and show you what an ideal response looks like.

Type "start" to begin, or ask me anything about the role first.`}]);
  } 

  async function retryTab(t) {
    setE(t,null); setL(t,true);
    try {
      if(t==="gap"){ const raw=await callAPI("gap",payload); const p=parseJSON(raw); p?setR("gap",p):setE("gap","Parse error. Try again."); }
      else { const r=await callAPI(t,payload); setR(t,r); }
    } catch(e){ setE(t,e.message); }
    setL(t,false);
  }

  async function sendChat() {
    if(!chatMsg.trim()||chatBusy) return;
    const msg=chatMsg.trim(); setChatMsg("");
    const updated=[...chat,{role:"user",text:msg}];
    setChat(updated); setChatBusy(true);
    try {
      const messages=updated.slice(-12).map(m=>({role:m.role==="user"?"user":"assistant",content:m.text}));
      const reply=await callAPI("interview",{...payload,messages});
      setChat(c=>[...c,{role:"ai",text:reply}]);
    } catch(e){ setChat(c=>[...c,{role:"ai",text:"Something went wrong. Please try again."}]); }
    setChatBusy(false);
  }

  const score    = results.gap?.score??0;
  const atsScore = results.gap?.ats_score??Math.round(score*.9);
  const skillScore = results.gap?.skill_score??Math.round(score*.85);
  const scoreClr = score>=70?C.sage:score>=50?C.amber:C.red;
  const anyLoad  = Object.values(loading).some(Boolean);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Toasts list={toastList} remove={removeToast}/>

      {showShareCard&&results.gap&&<ShareScoreCard score={score} atsScore={atsScore} skillScore={skillScore} role={role} onClose={()=>setShowShareCard(false)}/>}
      {showPDFModal&&<PDFReportModal results={results} company={company} role={role} user={user} isPro={isPro} onClose={()=>setShowPDFModal(false)} onUpgrade={onUpgrade}/>}
      {showTracker&&<JobTrackerModal user={user} onClose={()=>setShowTracker(false)} toast={toast}/>}
      {showInvite&&user&&<InviteCodeModal user={user} onClose={()=>setShowInvite(false)} onSuccess={onProfileRefresh} toast={toast}/>}

      {showDash&&user&&(
        <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,.4)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowDash(false)}>
          <div onClick={e=>e.stopPropagation()} className="dashboard-inner" style={{ background:C.surface, borderRadius:16, maxWidth:520, width:"100%", maxHeight:"80vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.bg }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.ink }}>My Analyses</div>
              <button onClick={()=>setShowDash(false)} style={{ fontSize:22, color:C.ink3, cursor:"pointer", lineHeight:1, minHeight:36, minWidth:36 }}>×</button>
            </div>
            <AnalysisHistory userId={user.id} key={showDash ? "hist-open-"+Date.now() : "hist-closed"}/>
          </div>
        </div>
      )}

      <header className="tool-header" style={{ position:"sticky", top:0, zIndex:100, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(12px,4vw,32px)", background:"rgba(249,248,246,.96)", backdropFilter:"blur(14px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Logo size="sm"/>
          <Tag color={C.sage} bg={C.sageBg}>Beta</Tag>
          {anyLoad&&<span className="inline" style={{ fontSize:12, color:C.ink3, gap:5, minHeight:"unset", minWidth:"unset" }}><Spin s={12}/>Generating…</span>}
        </div>
        <div className="tool-header-actions" style={{ display:"flex", gap:6, alignItems:"center" }}>
          <OutBtn size="sm" onClick={()=>setShowTracker(true)} style={{ minWidth:"unset" }}>📋</OutBtn>
          {user&&<OutBtn size="sm" onClick={() => (onDashboard ? onDashboard() : setShowDash(true))} style={{ minWidth:"unset" }}>📊 Dashboard</OutBtn>}
          {ran&&<OutBtn size="sm" onClick={()=>{ setRan(false); setResults({gap:null,resume:null,cover:null,email:null}); setErrors({gap:null,resume:null,cover:null,email:null}); setChat([]); setShowFeedback(false); }} style={{ minWidth:"unset" }}>↺ New</OutBtn>}
          <OutBtn size="sm" onClick={onBack} style={{ minWidth:"unset" }}>← Home</OutBtn>
        </div>
      </header>

      <div style={{ maxWidth:820, margin:"0 auto", padding:"18px clamp(12px,4vw,24px) 80px" }}>

        <div style={{ marginBottom:16, overflowX:"auto" }}>
          <ProgressSteps current={currentStep}/>
        </div>

        {!ran&&(
          <div style={{ animation:"slideUp .3s ease" }}>
            <div style={{ textAlign:"center", marginBottom:22 }}>
              <h1 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"clamp(22px,3.5vw,34px)", lineHeight:1.18, letterSpacing:"-.2px", marginBottom:10, color:C.ink }}>Paste your resume and job description.</h1>
              <p style={{ fontSize:14.5, color:C.ink2, maxWidth:440, margin:"0 auto", lineHeight:1.75 }}>Get a score, gaps, cover letter, cold email, and interview preparation — all in about 20 seconds.</p>
              {user&&!isPro&&(
                <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", justifyContent:"center", gap:8 }}>
                  {(!profile?.plan||profile?.plan==="free")&&(
                    <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"7px 14px", borderRadius:99, background:C.amberBg, border:`1px solid ${C.amber}25` }}>
                      <span className="inline" style={{ fontSize:13, color:C.amber, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>{profile?.analyses_this_month||0}/3 free analyses used this month</span>
                      <button onClick={()=>onUpgrade()} style={{ fontSize:12, color:C.amber, fontWeight:700, textDecoration:"underline", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset" }}>Upgrade →</button>
                    </div>
                  )}
                  {lifetimeLeft>0&&!["admin","founder"].includes(profile?.role)&&<div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:99, background:C.purpleBg, border:`1px solid ${C.purple}25` }}><span className="inline" style={{ fontSize:13, color:C.purple, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>⚡ {lifetimeLeft} lifetime {lifetimeLeft===1?"access":"accesses"} remaining</span></div>}
                  <button onClick={()=>setShowInvite(true)} style={{ fontSize:12.5, color:C.blue, fontWeight:600, textDecoration:"underline", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset" }}>🎟️ Have an invite code?</button>
                </div>
              )}
            </div>
            <Card flat style={{ padding:"clamp(16px,3.5vw,26px)" }}>
              <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <Field label="Company name (optional)" value={company} onChange={setCompany} placeholder="e.g. Infosys, Swiggy" hint="Personalises the cover letter and email." maxLen={100}/>
                <Field label="Role / job title (optional)" value={role} onChange={setRole} placeholder="e.g. Python Developer" accent={C.blue} hint="Helps the interview coach prepare relevant questions." maxLen={100}/>
              </div>
              
              <div className="input-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <FileUpload onExtract={setResume} label="Upload Resume (PDF/DOCX)" accent={C.sage} />
                  <Field label="Your Resume *" value={resume} onChange={setResume} placeholder={"Upload your PDF/DOCX above, or paste text manually here.\n\nInclude: name, contact, education, skills, experience, and projects."} rows={11} maxLen={8000}/>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <FileUpload onExtract={setJd} label="Upload Job Description (PDF)" accent={C.blue} />
                  <Field label="Job Description *" value={jd} onChange={setJd} placeholder={"Upload a JD file above, or paste the text manually here.\n\nMore detail = more accurate results."} rows={11} accent={C.blue} maxLen={4000}/>
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                <div style={{ fontSize:12.5, color:C.ink3, lineHeight:1.7 }}>
                  <div>About 20 seconds · All outputs generated together</div>
                  <div>{user?"Analysis will be saved to your account":"Data not stored · Sign in to save analyses"}</div>
                </div>
                <Btn onClick={analyse} size="lg" bg={C.sage} disabled={!resume.trim()||!jd.trim()} style={{ minWidth:200 }}>
                  {!resume.trim()||!jd.trim()?"Fill both fields above":"Analyse my resume →"}
                </Btn>
              </div>
            </Card>
          </div>
        )}

        {ran&&(
          <div style={{ animation:"slideUp .3s ease" }}>
            <Card flat style={{ padding:"16px 20px", marginBottom:14 }}>
              {loading.gap&&!results.gap
                ?<div style={{ display:"flex", flexDirection:"column", gap:10 }}><Skel h={24} w="38%"/><Skel h={7} r={99}/><Skel h={14} w="70%"/></div>
                :results.gap?(
                  <div>
                    <div className="score-card-inner" style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap", marginBottom:12 }}>
                      <div style={{ display:"flex", gap:14, flexShrink:0 }}>
                        <ScoreRing score={score} size={72} color={scoreClr} label="Overall"/>
                        <ScoreRing score={atsScore} size={72} color={C.blue} label="ATS"/>
                        <ScoreRing score={skillScore} size={72} color={C.purple} label="Skills"/>
                      </div>
                      <div style={{ flex:1, minWidth:140 }}>
                        <div style={{ fontSize:14, color:C.ink2, lineHeight:1.65, marginBottom:10 }}>{results.gap.summary}</div>
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                          <span className="inline" style={{ fontSize:12, color:C.red, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>✗ {results.gap.missing?.length||0} gaps</span>
                          <span className="inline" style={{ fontSize:12, color:C.amber, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>△ {results.gap.weak?.length||0} weak areas</span>
                          <span className="inline" style={{ fontSize:12, color:C.sage, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>✓ {results.gap.strong?.length||0} strengths</span>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:7, flexShrink:0 }}>
                        <Btn size="sm" bg={C.sage} onClick={()=>setShowShareCard(true)}>📤 Share score</Btn>
                        <Btn size="sm" bg={isPro?C.purple:C.ink4} style={{ color:isPro?"#fff":C.ink3 }} onClick={()=>setShowPDFModal(true)}>📊 PDF Report{!isPro?" 🔒":""}</Btn>
                      </div>
                    </div>
                  </div>
                ):errors.gap?(
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span className="inline" style={{ fontSize:20, minHeight:"unset", minWidth:"unset" }}>⚠️</span>
                    <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:600, color:C.red, marginBottom:4 }}>Analysis failed</div><div style={{ fontSize:13, color:C.ink2 }}>{errors.gap}</div></div>
                    <OutBtn size="sm" onClick={()=>retryTab("gap")}>Retry</OutBtn>
                  </div>
                ):null}
            </Card>

            {showFeedback&&!anyLoad&&(
              <div style={{ marginBottom:14 }}>
                <AnalysisFeedback company={company} role={role} gapScore={results.gap?.score} userId={user?.id} onDone={()=>setShowFeedback(false)}/>
              </div>
            )}

            {!isPro&&ran&&!anyLoad&&(
              <div style={{ marginBottom:14, padding:"12px 16px", background:C.amberBg, borderRadius:10, border:`1px solid ${C.amber}25`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <div style={{ fontSize:13.5, color:C.amber, fontWeight:600 }}>⚡ Pro: PDF report, unlimited analyses, job tracker — ₹49/month</div>
                <Btn onClick={onUpgrade} bg={C.amber} size="sm">Upgrade now</Btn>
              </div>
            )}

            <div className="tabs-bar" style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14, overflowX:"auto" }}>
              {TABS.map(t=>{
                const hasErr=errors[t.id]&&t.id!=="interview"; const isDone=results[t.id]&&!loading[t.id];
                return <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{ padding:"10px 13px", background:tab===t.id?C.surface:"transparent", border:`1px solid ${tab===t.id?C.border:"transparent"}`, borderBottom:tab===t.id?`2px solid ${t.color}`:"1px solid transparent", borderRadius:"7px 7px 0 0", marginBottom:-1, color:tab===t.id?t.color:C.ink3, fontWeight:tab===t.id?700:500, fontSize:13.5, cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5, fontFamily:"inherit", minHeight:42 }}>
                  {t.icon} {t.label}
                  {loading[t.id]&&<Spin s={11} c={t.color}/>}
                  {hasErr&&<span className="inline" style={{ color:C.red, fontSize:11, minHeight:"unset", minWidth:"unset" }}>⚠</span>}
                  {isDone&&t.id!=="interview"&&t.id!=="profile"&&<span className="inline" style={{ color:C.sage, fontSize:9, minHeight:"unset", minWidth:"unset" }}>●</span>}
                  {t.id==="profile"&&!isPro&&<span className="inline" style={{ fontSize:10, color:C.ink4, minHeight:"unset", minWidth:"unset" }}>🔒</span>}
                </button>;
              })}
            </div>

            {tab==="gap"&&(
              <div style={{ animation:"slideUp .25s ease" }}>
                {loading.gap&&!results.gap&&<Card flat style={{ padding:20 }}><div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}><Spin c={C.sage}/><span style={{ color:C.ink2, fontSize:14 }}>Analysing your resume…</span></div>{[80,65,74].map((w,i)=><div key={i} style={{ marginBottom:9 }}><Skel h={48} w={`${w}%`}/></div>)}</Card>}
                {errors.gap&&<Card flat style={{ padding:20, background:C.redBg }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div><div style={{ fontSize:14, fontWeight:600, color:C.red, marginBottom:5 }}>Analysis failed</div><div style={{ fontSize:13, color:C.ink2 }}>{errors.gap}</div></div><OutBtn size="sm" onClick={()=>retryTab("gap")}>Retry</OutBtn></div></Card>}
                {results.gap&&(
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {[
                      {key:"missing",label:"Critical Gaps — fix before applying",color:C.red,bg:C.redBg,icon:"✗"},
                      {key:"weak",label:"Weak Areas — improve to stand out",color:C.amber,bg:C.amberBg,icon:"△"},
                      {key:"strong",label:"Your Strengths — lead with these",color:C.sage,bg:C.sageBg,icon:"✓"},
                    ].filter(s=>results.gap[s.key]?.length>0).map(sec=>(
                      <Card flat key={sec.key} style={{ overflow:"hidden" }}>
                        <div style={{ padding:"10px 16px", background:sec.bg, borderBottom:`1px solid ${sec.color}20` }}>
                          <span className="inline" style={{ fontSize:11.5, fontWeight:700, color:sec.color, textTransform:"uppercase", letterSpacing:.6, minHeight:"unset", minWidth:"unset" }}>{sec.label}</span>
                        </div>
                        <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:9 }}>
                          {results.gap[sec.key].map((item,i)=>(
                            <div key={i} style={{ display:"flex", gap:10, padding:"11px 13px", background:sec.bg, borderRadius:8, borderLeft:`3px solid ${sec.color}` }}>
                              <span className="inline" style={{ color:sec.color, fontWeight:800, fontSize:14, flexShrink:0, marginTop:1, minHeight:"unset", minWidth:"unset" }}>{sec.icon}</span>
                              <div><div style={{ fontSize:13.5, fontWeight:700, color:C.ink, marginBottom:3 }}>{item.title}</div><div style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{item.detail}</div></div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                    <Card flat style={{ overflow:"hidden" }}>
                      <div style={{ padding:"10px 16px", background:C.purpleBg, borderBottom:`1px solid ${C.purple}20` }}>
                        <span className="inline" style={{ fontSize:11.5, fontWeight:700, color:C.purple, textTransform:"uppercase", letterSpacing:.6, minHeight:"unset", minWidth:"unset" }}>🎯 Interview Preparation Guide</span>
                      </div>
                      <div style={{ padding:"14px 14px" }}>
                        <InterviewGuide role={role} company={company}/>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {["resume","cover","email"].includes(tab)&&(
              <div style={{ animation:"slideUp .25s ease" }}>
                {loading[tab]&&!results[tab]&&<Card flat style={{ padding:20 }}><div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}><Spin c={TABS.find(t=>t.id===tab)?.color}/><span style={{ color:C.ink2, fontSize:14 }}>Generating {tab==="resume"?"improved resume":tab==="cover"?"cover letter":"cold email"}…</span></div>{[100,90,95,85].map((w,i)=><div key={i} style={{ marginBottom:8 }}><Skel h={14} w={`${w}%`}/></div>)}</Card>}
                {errors[tab]&&<Card flat style={{ padding:20, background:C.redBg }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div><div style={{ fontSize:14, fontWeight:600, color:C.red, marginBottom:5 }}>Failed</div><div style={{ fontSize:13, color:C.ink2 }}>{errors[tab]}</div></div><OutBtn size="sm" onClick={()=>retryTab(tab)}>Retry</OutBtn></div></Card>}
                {results[tab]&&(
                  <Card flat style={{ overflow:"hidden" }}>
                    <div style={{ padding:"12px 16px", background:C.bg, borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span className="inline" style={{ fontSize:17, minHeight:"unset", minWidth:"unset" }}>{TABS.find(t=>t.id===tab)?.icon}</span>
                        <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{tab==="resume"?"Improved Resume":tab==="cover"?"Cover Letter":"Cold Email to HR"}</span>
                        <Tag color={C.sage} bg={C.sageBg}>Ready</Tag>
                      </div>
                      <CopyBtn text={results[tab]}/>
                    </div>
                    <div style={{ padding:"16px 18px", maxHeight:480, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
                      <pre style={{ fontSize:13.5, lineHeight:1.85, color:C.ink2, whiteSpace:"pre-wrap", fontFamily:"inherit", wordBreak:"break-word" }}>{results[tab]}</pre>
                    </div>
                    <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.border}`, background:C.bg }}>
                      <p style={{ fontSize:13, color:C.ink3, lineHeight:1.6 }}>
                        {tab==="resume"&&"Copy into Google Docs or Word for formatting. Keywords are ATS-safe — avoid adding tables or images."}
                        {tab==="cover" &&"Attach as PDF alongside your resume. Paste directly if the form doesn't accept attachments."}
                        {tab==="email" &&"Find HR's name on LinkedIn. Replace [HR Name] before sending."}
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {tab==="profile"&&(
              <div style={{ animation:"slideUp .25s ease" }}>
                <ProfileOptimizer resume={resume} jd={jd} company={company} role={role} userId={user?.id} isPro={isPro} onUpgrade={onUpgrade}/>
              </div>
            )}

            {tab==="interview"&&(
              <div style={{ animation:"slideUp .25s ease", display:"flex", flexDirection:"column", gap:14 }}>
                <InterviewGuide role={role} company={company}/>
                <Card flat style={{ overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", background:C.bg, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:C.purpleBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🎯</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.ink }}>AI Interview Coach</div>
                      <div style={{ fontSize:12, color:C.ink3 }}>Asks real questions · Scores /10 · Shows ideal answers</div>
                    </div>
                    <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:C.sage, animation:"pulse 2s infinite" }}/>
                      <span className="inline" style={{ fontSize:12, color:C.sage, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>Ready</span>
                    </div>
                  </div>
                  <div className="chat-messages" style={{ height:340, overflowY:"auto", padding:"14px 13px", display:"flex", flexDirection:"column", gap:12, WebkitOverflowScrolling:"touch" }}>
                    {chat.map((m,i)=>(
                      <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", gap:8, alignItems:"flex-start" }}>
                        {m.role==="ai"&&<div style={{ width:26, height:26, borderRadius:7, background:C.purpleBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginTop:2 }}>🎯</div>}
                        <div style={{ maxWidth:"82%", padding:"10px 14px", borderRadius:m.role==="user"?"14px 14px 4px 14px":"4px 14px 14px 14px", background:m.role==="user"?C.ink:C.surface, border:`1px solid ${m.role==="user"?C.ink:C.border}`, color:m.role==="user"?"#fff":C.ink, fontSize:14, lineHeight:1.75, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{m.text}</div>
                        {m.role==="user"&&<div style={{ width:26, height:26, borderRadius:7, background:C.ink, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", flexShrink:0, marginTop:2 }}>You</div>}
                      </div>
                    ))}
                    {chatBusy&&<div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:26, height:26, borderRadius:7, background:C.purpleBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>🎯</div><div style={{ padding:"10px 14px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:"4px 14px 14px 14px", display:"flex", gap:7, alignItems:"center" }}><Spin s={13} c={C.purple}/><span style={{ fontSize:13, color:C.ink3 }}>Thinking…</span></div></div>}
                    <div ref={chatEnd}/>
                  </div>
                  <div className="quick-prompts" style={{ padding:"8px 12px", borderTop:`1px solid ${C.border}`, display:"flex", gap:6, flexWrap:"wrap", background:C.bg }}>
                    {["Start interview practice","Technical questions","HR questions","Tell me about yourself"].map(p=>(
                      <button key={p} onClick={()=>setChatMsg(p)} style={{ padding:"5px 12px", borderRadius:99, border:`1px solid ${C.border}`, background:C.surface, fontSize:12.5, color:C.ink2, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", minHeight:32 }}>{p}</button>
                    ))}
                  </div>
                  <div className="chat-input-row" style={{ padding:"10px 12px", borderTop:`1px solid ${C.border}`, display:"flex", gap:8 }}>
                    <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();} }}
                      placeholder="Type your answer… (Enter to send)"
                      style={{ flex:1, padding:"11px 13px", borderRadius:8, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:15, color:C.ink, fontFamily:"inherit", outline:"none", minHeight:44, transition:"border-color .18s" }}
                      onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <Btn onClick={sendChat} disabled={!chatMsg.trim()||chatBusy} bg={C.purple} style={{ whiteSpace:"nowrap", minWidth:70 }}>
                      {chatBusy?<Spin s={15} c="#fff"/>:"Send"}
                    </Btn>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ANALYSIS HISTORY ───────────────────────────────────── */
function AnalysisHistory({ userId }) {
  const [analyses, setAnalyses] = useState([]);
  const [loading,  setLoading]  = useState(true);

  function load() {
    setLoading(true);
    getAnalyses(userId)
      .then(d => { setAnalyses(d||[]); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(()=>{ load(); }, [userId]);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:12, color:C.ink3 }}>{analyses.length} saved {analyses.length===1?"analysis":"analyses"}</span>
        <button onClick={load} style={{ fontSize:12, color:C.blue, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", minHeight:"unset", minWidth:"unset", fontWeight:600 }}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>
      {loading
        ? [1,2,3].map(i=><div key={i} style={{ marginBottom:10 }}><Skel h={54}/></div>)
        : analyses.length===0
          ? <div style={{ textAlign:"center", padding:"36px 16px", color:C.ink3 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:14, marginBottom:6 }}>No saved analyses yet.</div>
              <div style={{ fontSize:13 }}>Sign in and run an analysis to save it here.</div>
            </div>
          : analyses.map((a,i)=>{
              const clr=a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
              return (
                <div key={a.id||i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 13px", borderRadius:9, border:`1px solid ${C.border}`, marginBottom:8, background:C.bg }}>
                  <div style={{ width:42, height:42, borderRadius:8, background:clr+"15", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span className="inline" style={{ fontSize:15, fontWeight:800, color:clr, minHeight:"unset", minWidth:"unset" }}>{a.gap_score??"-"}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {a.role||"Unknown role"}{a.company?` — ${a.company}`:""}
                    </div>
                    <div style={{ fontSize:11.5, color:C.ink3, marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                      <span>{new Date(a.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</span>
                      {a.ats_score!=null&&<span>ATS: {a.ats_score}</span>}
                      {a.skill_score!=null&&<span>Skills: {a.skill_score}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:800, color:clr, flexShrink:0 }}>{a.gap_score!=null?`${a.gap_score}/100`:"-"}</div>
                </div>
              );
            })
      }
    </div>
  );
}


/* ─── COLLEGE FORM ───────────────────────────────────────── */
function CollegeForm({ onSave, initial }) {
  const [form, setForm] = useState(initial || {
    name:"", contact_name:"", contact_email:"", contact_phone:"",
    city:"", state:"", student_count:"", plan:"college_basic", status:"enquiry", notes:""
  });
  const [saving, setSaving] = useState(false);
  const F = (k) => ({ value:form[k]||"", onChange:v=>setForm(p=>({...p,[k]:v})) });

  async function save() {
    if(!form.name.trim()||!form.contact_email.trim()){ return; }
    setSaving(true);
    await onSave({...form, student_count: parseInt(form.student_count)||null });
    if(!initial) setForm({name:"",contact_name:"",contact_email:"",contact_phone:"",city:"",state:"",student_count:"",plan:"college_basic",status:"enquiry",notes:""});
    setSaving(false);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}} className="input-grid">
        <Field label="College Name *"    {...F("name")}           placeholder="ABC Engineering College" maxLen={100}/>
        <Field label="Contact Person"    {...F("contact_name")}   placeholder="Prof. Sharma" maxLen={80}/>
        <Field label="Contact Email *"   {...F("contact_email")}  placeholder="placement@college.edu" maxLen={120}/>
        <Field label="Phone"             {...F("contact_phone")}  placeholder="+91 9999999999" maxLen={15}/>
        <Field label="City"              {...F("city")}           placeholder="Hyderabad" maxLen={50}/>
        <Field label="State"             {...F("state")}          placeholder="Telangana" maxLen={50}/>
        <Field label="Student Count"     {...F("student_count")}  placeholder="500" type="number" maxLen={6}/>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          <label style={{fontSize:11.5,fontWeight:700,color:C.ink2,letterSpacing:.5,textTransform:"uppercase"}}>Plan</label>
          <select value={form.plan} onChange={e=>setForm(p=>({...p,plan:e.target.value}))} style={{padding:"12px 14px",borderRadius:9,border:`1.5px solid ${C.border}`,background:C.bg,fontSize:15,color:C.ink,fontFamily:"inherit",minHeight:48}}>
            <option value="college_basic">College Basic</option>
            <option value="college_pro">College Pro</option>
          </select>
        </div>
      </div>
      <Field label="Notes" {...F("notes")} placeholder="Any notes about this lead…" rows={2} maxLen={500}/>
      <Btn onClick={save} disabled={saving||!form.name.trim()||!form.contact_email.trim()} bg={C.purple} size="sm">
        {saving?<><Spin s={13} c="#fff"/>Saving…</>:initial?"Update college":"+ Add college"}
      </Btn>
    </div>
  );
}

/* ─── ADMIN HELPERS ──────────────────────────────────────── */
async function adminGetUsers(page=0)    { if(!sb)return[]; try{ const from=page*100; const{data}=await sb.from("profiles").select("id,email,name,role,plan,plan_expires_at,analyses_this_month,lifetime_accesses_remaining,created_at").order("created_at",{ascending:false}).range(from,from+99); return data||[]; }catch(e){return[];} }
async function adminUpdateUser(id,upd) { if(!sb)return; await sb.from("profiles").update({...upd,updated_at:new Date().toISOString()}).eq("id",id); }
async function adminGetInviteCodes()   { if(!sb)return[]; try{ const{data}=await sb.from("invite_codes").select("*").order("created_at",{ascending:false}); return data||[]; }catch(e){return[];} }
async function adminCreateCode(code,limit,days,expires){ if(!sb)return null; const{data,error}=await sb.from("invite_codes").insert({code:code.trim().toUpperCase(),usage_limit:limit,access_days:days,expires_at:expires||null}).select().single(); if(error)throw new Error(error.message); return data; }
async function adminDeleteCode(id)     { if(!sb)return; await sb.from("invite_codes").delete().eq("id",id); }
async function adminGetAnalyses()      { if(!sb)return[]; try{ const{data}=await sb.from("analyses").select("id,user_id,company,role,gap_score,ats_score,skill_score,created_at").order("created_at",{ascending:false}).limit(200); return data||[]; }catch(e){return[];} }
async function adminGetFeedback()      { if(!sb)return[]; try{ const{data}=await sb.from("feedback").select("*").order("created_at",{ascending:false}).limit(200); return data||[]; }catch(e){return[];} }
async function adminGetPendingReviews(){ if(!sb)return[]; try{ const{data}=await sb.from("reviews").select("*").eq("approved",false).order("created_at",{ascending:false}); return data||[]; }catch(e){return[];} }
async function adminGetAllReviews()    { if(!sb)return[]; try{ const{data}=await sb.from("reviews").select("*").order("created_at",{ascending:false}).limit(100); return data||[]; }catch(e){return[];} }
async function adminApproveReview(id)  { if(!sb)return; await sb.from("reviews").update({approved:true}).eq("id",id); }
async function adminDeleteReview(id)   { if(!sb)return; await sb.from("reviews").delete().eq("id",id); }
async function adminGetTransactions()  { if(!sb)return[]; try{ const{data}=await sb.from("transactions").select("*").order("created_at",{ascending:false}).limit(200); return data||[]; }catch(e){return[];} }
async function adminDeleteUser(id)     { if(!sb)return; await sb.from("profiles").delete().eq("id",id); }
async function adminGetColleges()      { if(!sb)return[]; try{ const{data}=await sb.from("colleges").select("*").order("created_at",{ascending:false}); return data||[]; }catch(e){return[];} }
async function adminGetEmailStats()    { if(!sb)return[]; try{ const{data}=await sb.from("email_logs").select("type,status,sent_at").order("sent_at",{ascending:false}).limit(200); return data||[]; }catch(e){return[];} }
async function adminSaveCollege(col)   { if(!sb)return null; const{data,error}=await sb.from("colleges").upsert({...col,updated_at:new Date().toISOString()}).select().single(); if(error)throw new Error(error.message); return data; }
async function adminCounts()           {
  if(!sb)return{totalUsers:0,totalAnalyses:0,approvedReviews:0,totalFeedback:0,plans:{},revenue:0,successTxns:0};
  try {
    const[u,a,r,f,t]=await Promise.all([
      sb.from("profiles").select("id,plan",{count:"exact"}),
      sb.from("analyses").select("id",{count:"exact"}),
      sb.from("reviews").select("id").eq("approved",true),
      sb.from("feedback").select("id",{count:"exact"}),
      sb.from("transactions").select("amount,status").eq("status","success"),
    ]);
    const plans={};
    (u.data||[]).forEach(p=>{const k=p.plan||"free";plans[k]=(plans[k]||0)+1;});
    const revenue=(t.data||[]).reduce((s,tx)=>s+(tx.amount||0),0);
    return{totalUsers:u.count||0,totalAnalyses:a.count||0,approvedReviews:(r.data||[]).length,totalFeedback:f.count||0,plans,revenue,successTxns:(t.data||[]).length};
  } catch(e){ return{totalUsers:0,totalAnalyses:0,approvedReviews:0,totalFeedback:0,plans:{},revenue:0,successTxns:0}; }
}

/* ─── ADMIN DASHBOARD ────────────────────────────────────── */
const ADMIN_PLANS=["free","starter","pro","pro_monthly","pro_yearly","early_adopter","founding_user","beta_friend","college_basic","college_pro","premium"];

function AdminDashboard({ user, profile, onBack }) {
  const [tab,         setTab]         = useState("overview");
  const [counts,      setCounts]      = useState(null);
  const [users,       setUsers]       = useState([]);
  const [analyses,    setAnalyses]    = useState([]);
  const [codes,       setCodes]       = useState([]);
  const [reviews,     setReviews]     = useState([]);
  const [allReviews,  setAllReviews]  = useState([]);
  const [feedback,    setFeedback]    = useState([]);
  const [transactions,setTransactions]= useState([]);
  const [colleges,    setColleges]    = useState([]);
  const [emailStats,  setEmailStats]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [tabLoading,  setTabLoading]  = useState(false);
  const [search,      setSearch]      = useState("");
  const [planFilter,  setPlanFilter]  = useState("all");
  const [roleFilter,  setRoleFilter]  = useState("all");
  const [newCode,     setNewCode]     = useState({code:"",limit:1,days:30,expires:""});
  const [codeErr,     setCodeErr]     = useState("");
  const [codeSaving,  setCodeSaving]  = useState(false);
  const [expandUser,  setExpandUser]  = useState(null);
  const { toast, list:toastList, remove:removeToast } = useToast();

  const planClr = {free:C.stone,starter:C.blue,pro:C.sage,pro_monthly:C.sage,pro_yearly:C.sage,founding_user:C.purple,early_adopter:C.purple,beta_friend:C.blue,college_basic:C.amber,college_pro:C.amber,premium:C.amber};

  useEffect(()=>{
    const isAdmin = ["admin","founder"].includes(profile?.role) || user?.email==="mohidmd58@gmail.com";
    if(!isAdmin){ onBack(); return; }
    loadAll();
  },[]);

  async function loadAll() {
    setLoading(true);
    try {
      const[c,u,a,cd,rv,arv,fb,txn,col,es]=await Promise.all([
        adminCounts(),adminGetUsers(),adminGetAnalyses(),adminGetInviteCodes(),
        adminGetPendingReviews(),adminGetAllReviews(),adminGetFeedback(),
        adminGetTransactions(),adminGetColleges(),adminGetEmailStats()
      ]);
      setCounts(c);setUsers(u);setAnalyses(a);setCodes(cd);
      setReviews(rv);setAllReviews(arv);setFeedback(fb);setTransactions(txn);
      setColleges(col);setEmailStats(es);
    } catch(e){ toast("Load error: "+e.message,"error"); }
    setLoading(false);
  }

  // ── User actions ──────────────────────────────────────────
  async function updateUserRole(id,role){
    await adminUpdateUser(id,{role});
    setUsers(p=>p.map(u=>u.id===id?{...u,role}:u));
    toast("Role updated ✓");
  }
  async function updateUserPlan(id,plan){
    const expires=["founding_user","early_adopter"].includes(plan)?null:new Date(Date.now()+30*86400000).toISOString();
    await adminUpdateUser(id,{plan,plan_expires_at:expires});
    setUsers(p=>p.map(u=>u.id===id?{...u,plan,plan_expires_at:expires}:u));
    toast("Plan updated ✓");
  }
  async function giveLifetimeAccess(id,count){
    await adminUpdateUser(id,{lifetime_accesses_remaining:count});
    setUsers(p=>p.map(u=>u.id===id?{...u,lifetime_accesses_remaining:count}:u));
    toast(`Gave ${count} lifetime accesses ✓`);
  }
  async function suspendUser(id){
    if(!confirm("Suspend this user? They will lose plan access."))return;
    await adminUpdateUser(id,{plan:"free",plan_expires_at:null});
    setUsers(p=>p.map(u=>u.id===id?{...u,plan:"free",plan_expires_at:null}:u));
    toast("User suspended — plan reset to free.");
  }

  // ── Code actions ──────────────────────────────────────────
  async function createCode(){
    if(!newCode.code.trim()){setCodeErr("Enter a code.");return;}
    setCodeSaving(true);setCodeErr("");
    try{
      const d=await adminCreateCode(newCode.code,newCode.limit,newCode.days,newCode.expires||null);
      setCodes(p=>[d,...p]);
      setNewCode({code:"",limit:1,days:30,expires:""});
      toast("Code created ✓");
    } catch(e){ setCodeErr(e.message); }
    setCodeSaving(false);
  }
  async function deleteCode(id){
    if(!confirm("Delete this code?"))return;
    await adminDeleteCode(id);
    setCodes(p=>p.filter(c=>c.id!==id));
    toast("Deleted.");
  }

  // ── Review actions ────────────────────────────────────────
  async function approveRev(id){ await adminApproveReview(id); setReviews(p=>p.filter(r=>r.id!==id)); setAllReviews(p=>p.map(r=>r.id===id?{...r,approved:true}:r)); toast("Approved ✓"); }
  async function deleteRev(id){ await adminDeleteReview(id); setReviews(p=>p.filter(r=>r.id!==id)); setAllReviews(p=>p.filter(r=>r.id!==id)); toast("Deleted."); }

  // ── Filtered users ────────────────────────────────────────
  const filtered = users.filter(u=>{
    const matchSearch = !search || u.id?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase()) || u.plan?.includes(search.toLowerCase());
    const matchPlan   = planFilter==="all" || u.plan===planFilter;
    const matchRole   = roleFilter==="all" || u.role===roleFilter;
    return matchSearch && matchPlan && matchRole;
  });

  // ── Tab definitions ───────────────────────────────────────
  const ATABS=[
    {id:"overview",  label:"Overview",     icon:"📊"},
    {id:"users",     label:"Users",        icon:"👥", badge:users.length},
    {id:"payments",  label:"Payments",     icon:"💰", badge:transactions.filter(t=>t.status==="success").length},
    {id:"b2b",       label:"B2B / Colleges",icon:"🏫"},
    {id:"emails",    label:"Emails",       icon:"📧", badge:emailStats.length>0?null:null},
    {id:"invites",   label:"Invite Codes", icon:"🎟️"},
    {id:"analyses",  label:"Analyses",     icon:"🔍", badge:analyses.length},
    {id:"reviews",   label:"Reviews",      icon:"⭐", badge:reviews.length>0?reviews.length:null,badgeColor:reviews.length>0?C.red:null},
    {id:"feedback",  label:"Feedback",     icon:"💬"},
  ];

  // ── Shared styles ─────────────────────────────────────────
  const A = {
    card:  { background:C.surface, border:`1px solid ${C.border}`, borderRadius:12 },
    row:   { padding:"12px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 },
    label: { fontSize:11, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.6 },
    val:   { fontSize:13.5, color:C.ink, fontWeight:500 },
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg}}>
      <Toasts list={toastList} remove={removeToast}/>

      {/* ── Header ── */}
      <header style={{position:"sticky",top:0,zIndex:200,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 clamp(12px,4vw,32px)",background:"rgba(249,248,246,.98)",backdropFilter:"blur(16px)",borderBottom:`1px solid ${C.border}`,boxShadow:"0 1px 8px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Logo size="sm"/>
          <div style={{width:1,height:20,background:C.border}}/>
          <Tag color={C.purple} bg={C.purpleBg}>Admin</Tag>
          {profile?.role==="founder"&&<Tag color={C.amber} bg={C.amberBg}>Founder</Tag>}
        </div>
        <div style={{fontSize:13,color:C.ink3,display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:C.sage,display:"inline-block",animation:"pulse 2s infinite"}}/>
          Signed in as {profile?.email||user?.email}
        </div>
        <div style={{display:"flex",gap:8}}>
          <OutBtn size="sm" onClick={loadAll} style={{minWidth:"unset"}}>↻</OutBtn>
          <OutBtn size="sm" onClick={onBack}>← Back to site</OutBtn>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div style={{borderBottom:`1px solid ${C.border}`,background:C.surface,padding:"0 clamp(12px,4vw,32px)",overflowX:"auto",display:"flex",gap:0}}>
        {ATABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"13px 16px",background:"transparent",border:"none",borderBottom:tab===t.id?`2.5px solid ${C.purple}`:"2.5px solid transparent",color:tab===t.id?C.purple:C.ink3,fontWeight:tab===t.id?700:500,fontSize:13.5,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",display:"flex",alignItems:"center",gap:7,transition:"color .15s",minHeight:"unset",minWidth:"unset"}}>
            {t.icon} {t.label}
            {t.badge!=null&&t.badge>0&&<span style={{background:t.badgeColor||C.blue+"22",color:t.badgeColor||C.blue,borderRadius:99,fontSize:11,padding:"1px 7px",fontWeight:700,minHeight:"unset",minWidth:"unset"}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"24px clamp(12px,4vw,32px) 80px"}}>
        {loading&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:80,gap:14}}><Spin s={36} c={C.purple}/><div style={{fontSize:14,color:C.ink3}}>Loading admin data…</div></div>}

        {/* ══ OVERVIEW ══ */}
        {!loading&&tab==="overview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:18}}>

            {/* Stats grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
              {[
                {label:"Total Users",    value:counts?.totalUsers||0,     color:C.blue,   icon:"👥", sub:"all time"},
                {label:"Total Analyses", value:counts?.totalAnalyses||0,  color:C.sage,   icon:"🔍", sub:"AI analyses run"},
                {label:"Revenue",        value:`₹${((counts?.revenue||0)/100).toFixed(0)}`,color:C.sage,icon:"💰",sub:`${counts?.successTxns||0} transactions`},
                {label:"Invite Codes",   value:codes.length,              color:C.purple, icon:"🎟️", sub:"active codes"},
                {label:"Reviews Live",   value:counts?.approvedReviews||0,color:C.amber,  icon:"⭐", sub:"approved"},
                {label:"Pending Reviews",value:reviews.length,            color:reviews.length>0?C.red:C.stone,icon:"⏳",sub:"awaiting approval"},
              ].map((s,i)=>(
                <Card key={i} style={{padding:"18px 20px",cursor:"default"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <span style={{fontSize:20}}>{s.icon}</span>
                    <span style={{fontSize:11,color:C.ink3,fontWeight:500}}>{s.sub}</span>
                  </div>
                  <div style={{fontSize:30,fontWeight:800,color:s.color,lineHeight:1,marginBottom:4}}>{s.value}</div>
                  <div style={{fontSize:12,color:C.ink3,fontWeight:600,textTransform:"uppercase",letterSpacing:.4}}>{s.label}</div>
                </Card>
              ))}
            </div>

            {/* Plan breakdown */}
            <Card flat style={{padding:"20px 22px"}}>
              <div style={{fontSize:13.5,fontWeight:700,color:C.ink,marginBottom:14}}>Users by plan</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {Object.entries(counts?.plans||{}).sort((a,b)=>b[1]-a[1]).map(([plan,count])=>(
                  <div key={plan} style={{padding:"8px 16px",borderRadius:99,background:(planClr[plan]||C.stone)+"15",color:planClr[plan]||C.stone,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                    <span>{planDisplayLabel(plan)}</span>
                    <span style={{background:(planClr[plan]||C.stone)+"30",borderRadius:99,padding:"1px 8px",fontSize:12}}>{count}</span>
                  </div>
                ))}
                {Object.keys(counts?.plans||{}).length===0&&<span style={{fontSize:13,color:C.ink3}}>No users yet</span>}
              </div>
            </Card>

            {/* Recent activity: analyses + transactions side by side */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}} className="input-grid">
              <Card flat style={{overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13.5,fontWeight:700,color:C.ink}}>Recent Analyses</span>
                  <Tag color={C.sage}>{analyses.length}</Tag>
                </div>
                <div style={{maxHeight:280,overflowY:"auto"}}>
                  {analyses.slice(0,8).map((a,i)=>{
                    const clr=a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
                    return <div key={i} style={{...A.row,fontSize:13}}>
                      <div style={{width:34,height:34,borderRadius:7,background:clr+"15",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:clr,fontSize:13,flexShrink:0}}>{a.gap_score??"-"}</div>
                      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.role||"?"}{a.company?` @ ${a.company}`:""}</div><div style={{fontSize:11,color:C.ink3}}>{new Date(a.created_at).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div></div>
                    </div>;
                  })}
                  {analyses.length===0&&<div style={{padding:"28px",textAlign:"center",color:C.ink3,fontSize:13}}>No analyses yet</div>}
                </div>
              </Card>

              <Card flat style={{overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13.5,fontWeight:700,color:C.ink}}>Recent Payments</span>
                  <Tag color={C.sage}>₹{((counts?.revenue||0)/100).toFixed(0)}</Tag>
                </div>
                <div style={{maxHeight:280,overflowY:"auto"}}>
                  {transactions.slice(0,8).map((t,i)=>{
                    const stClr={success:C.sage,failed:C.red,pending:C.amber,cancelled:C.stone};
                    return <div key={i} style={{...A.row,fontSize:13}}>
                      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:C.ink}}>{planDisplayLabel(t.plan_id)}</div><div style={{fontSize:11,color:C.ink3}}>{new Date(t.created_at).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div></div>
                      <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,color:t.status==="success"?C.sage:C.red}}>₹{((t.amount||0)/100).toFixed(0)}</div><Tag color={stClr[t.status]||C.stone}>{t.status}</Tag></div>
                    </div>;
                  })}
                  {transactions.length===0&&<div style={{padding:"28px",textAlign:"center",color:C.ink3,fontSize:13}}>No transactions yet</div>}
                </div>
              </Card>
            </div>

            {/* Pending reviews alert */}
            {reviews.length>0&&(
              <div style={{padding:"14px 18px",background:C.redBg,borderRadius:10,border:`1px solid ${C.red}20`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <span style={{fontSize:14,color:C.red,fontWeight:600}}>⚠️ {reviews.length} review{reviews.length>1?"s":""} pending approval</span>
                <Btn size="sm" bg={C.red} onClick={()=>setTab("reviews")}>Review now</Btn>
              </div>
            )}
          </div>
        )}

        {/* ══ USERS ══ */}
        {!loading&&tab==="users"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Filters */}
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email, ID, or plan…"
                style={{flex:1,minWidth:200,padding:"10px 14px",borderRadius:9,border:`1.5px solid ${C.border}`,background:C.surface,fontSize:14,color:C.ink,fontFamily:"inherit",outline:"none"}}/>
              <select value={planFilter} onChange={e=>setPlanFilter(e.target.value)} style={{padding:"10px 13px",borderRadius:9,border:`1.5px solid ${C.border}`,background:C.surface,fontSize:13.5,color:C.ink,fontFamily:"inherit",cursor:"pointer",minHeight:44}}>
                <option value="all">All plans</option>
                {ADMIN_PLANS.map(p=><option key={p} value={p}>{planDisplayLabel(p)}</option>)}
              </select>
              <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{padding:"10px 13px",borderRadius:9,border:`1.5px solid ${C.border}`,background:C.surface,fontSize:13.5,color:C.ink,fontFamily:"inherit",cursor:"pointer",minHeight:44}}>
                <option value="all">All roles</option>
                {["user","admin","founder"].map(r=><option key={r} value={r}>{r}</option>)}
              </select>
              <div style={{fontSize:13,color:C.ink3,whiteSpace:"nowrap",padding:"0 4px"}}>{filtered.length} / {users.length} users</div>
            </div>

            <Card flat style={{overflow:"hidden"}}>
              {/* Table header */}
              <div style={{padding:"10px 18px",background:C.bg,borderBottom:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr 140px 120px 80px",gap:12,fontSize:11,fontWeight:700,color:C.ink3,textTransform:"uppercase",letterSpacing:.6}}>
                <div>User</div><div>Plan</div><div>Role</div><div>Usage</div><div>Actions</div>
              </div>
              <div style={{maxHeight:560,overflowY:"auto"}}>
                {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.ink3}}>No users match filters</div>}
                {filtered.map((u)=>(
                  <div key={u.id}>
                    <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr 140px 120px 80px",gap:12,alignItems:"center",cursor:"pointer",transition:"background .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                      onMouseLeave={e=>e.currentTarget.style.background=""}>
                      {/* User info */}
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:600,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name||u.email?.split("@")[0]||"—"}</div>
                        <div style={{fontSize:11.5,color:C.ink3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email||u.id?.slice(0,16)+"…"}</div>
                        <div style={{fontSize:11,color:C.ink4,marginTop:2}}>{new Date(u.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                      </div>
                      {/* Plan selector */}
                      <div>
                        <select value={u.plan||"free"} onChange={e=>updateUserPlan(u.id,e.target.value)}
                          onClick={e=>e.stopPropagation()}
                          style={{padding:"5px 10px",borderRadius:7,border:`1.5px solid ${(planClr[u.plan||"free"]||C.stone)}40`,background:(planClr[u.plan||"free"]||C.stone)+"12",color:planClr[u.plan||"free"]||C.stone,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minHeight:"unset",width:"100%"}}>
                          {ADMIN_PLANS.map(p=><option key={p} value={p}>{planDisplayLabel(p)}</option>)}
                        </select>
                        {u.plan_expires_at&&!["founding_user","early_adopter"].includes(u.plan)&&<div style={{fontSize:10.5,color:C.ink3,marginTop:3}}>Exp: {new Date(u.plan_expires_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>}
                      </div>
                      {/* Role selector */}
                      <select value={u.role||"user"} onChange={e=>updateUserRole(u.id,e.target.value)}
                        onClick={e=>e.stopPropagation()}
                        style={{padding:"5px 10px",borderRadius:7,border:`1.5px solid ${C.border}`,background:u.role==="founder"?C.purpleBg:u.role==="admin"?C.blueBg:C.bg,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",color:u.role==="founder"?C.purple:u.role==="admin"?C.blue:C.ink2,minHeight:"unset"}}>
                        {["user","admin","founder"].map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                      {/* Usage */}
                      <div>
                        <div style={{fontSize:12,color:C.ink2}}>{u.analyses_this_month||0} this month</div>
                        <div style={{fontSize:11.5,color:C.ink3}}>{u.lifetime_accesses_remaining??3} lifetime left</div>
                      </div>
                      {/* Actions */}
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={e=>{e.stopPropagation();setExpandUser(expandUser===u.id?null:u.id);}}
                          style={{padding:"5px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,fontSize:11,color:C.ink2,cursor:"pointer",fontFamily:"inherit",minHeight:"unset",minWidth:"unset"}}>
                          {expandUser===u.id?"▲":"▼"}
                        </button>
                      </div>
                    </div>
                    {/* Expanded user panel */}
                    {expandUser===u.id&&(
                      <div style={{padding:"16px 18px",background:C.bg,borderBottom:`1px solid ${C.border}`,animation:"slideUp .2s ease"}}>
                        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                          <Btn size="sm" bg={C.purple} onClick={()=>giveLifetimeAccess(u.id,3)}>+3 lifetime accesses</Btn>
                          <Btn size="sm" bg={C.blue}   onClick={()=>giveLifetimeAccess(u.id,(u.lifetime_accesses_remaining||0)+1)}>+1 lifetime access</Btn>
                          <Btn size="sm" bg={C.sage}   onClick={()=>updateUserPlan(u.id,"founding_user")}>Make Founding Member</Btn>
                          <Btn size="sm" bg={C.amber}  onClick={()=>updateUserPlan(u.id,"beta_friend")}>Make Beta Friend</Btn>
                          <OutBtn size="sm" onClick={()=>suspendUser(u.id)} style={{color:C.red,borderColor:C.red+"40"}}>Suspend (reset to free)</OutBtn>
                        </div>
                        <div style={{marginTop:10,fontSize:12,color:C.ink3}}>ID: <span style={{fontFamily:"monospace"}}>{u.id}</span></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══ PAYMENTS ══ */}
        {!loading&&tab==="payments"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Revenue summary */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
              {[
                {label:"Total Revenue",  value:`₹${((counts?.revenue||0)/100).toFixed(0)}`, color:C.sage},
                {label:"Successful",     value:transactions.filter(t=>t.status==="success").length,  color:C.sage},
                {label:"Failed",         value:transactions.filter(t=>t.status==="failed").length,   color:C.red},
                {label:"Pending",        value:transactions.filter(t=>t.status==="pending").length,  color:C.amber},
                {label:"Needs Review",   value:transactions.filter(t=>t.needs_manual_review).length, color:C.red},
              ].map((s,i)=>(
                <Card key={i} style={{padding:"16px 18px"}}>
                  <div style={{fontSize:26,fontWeight:800,color:s.color,marginBottom:4}}>{s.value}</div>
                  <div style={{fontSize:11.5,color:C.ink3,fontWeight:600,textTransform:"uppercase",letterSpacing:.4}}>{s.label}</div>
                </Card>
              ))}
            </div>

            <Card flat style={{overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13.5,fontWeight:700,color:C.ink}}>All Transactions ({transactions.length})</div>
              <div style={{maxHeight:560,overflowY:"auto"}}>
                {transactions.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.ink3}}>No transactions yet</div>}
                {transactions.map((t,i)=>{
                  const stClr={success:C.sage,failed:C.red,pending:C.amber,cancelled:C.stone,tampered:C.red,refunded:C.purple};
                  return <div key={t.id} style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:13.5,fontWeight:700,color:C.ink}}>{planDisplayLabel(t.plan_id)}</span>
                        <Tag color={stClr[t.status]||C.stone}>{t.status}</Tag>
                        {t.needs_manual_review&&<Tag color={C.red} bg={C.redBg}>⚠ Manual review</Tag>}
                      </div>
                      <div style={{fontSize:11.5,color:C.ink3,marginTop:3,fontFamily:"monospace"}}>txn: {t.txn_id}</div>
                      <div style={{fontSize:11.5,color:C.ink3}}>{new Date(t.created_at).toLocaleString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                      {t.failure_reason&&<div style={{fontSize:11.5,color:C.red,marginTop:2}}>Reason: {t.failure_reason}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:18,fontWeight:800,color:t.status==="success"?C.sage:C.ink3}}>₹{((t.amount||0)/100).toFixed(0)}</div>
                      <div style={{fontSize:11,color:C.ink3}}>{t.currency}</div>
                    </div>
                  </div>;
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ══ INVITE CODES ══ */}
        {!loading&&tab==="invites"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card flat style={{padding:"20px 22px"}}>
              <div style={{fontSize:13.5,fontWeight:700,color:C.ink,marginBottom:16}}>Create new invite code</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:14}} className="input-grid">
                <Field label="Code" value={newCode.code} onChange={v=>setNewCode(p=>({...p,code:v.toUpperCase()}))} placeholder="BETA-XXXX" maxLen={30}/>
                <Field label="Usage limit" value={String(newCode.limit)} onChange={v=>setNewCode(p=>({...p,limit:parseInt(v)||1}))} type="number"/>
                <Field label="Access days" value={String(newCode.days)} onChange={v=>setNewCode(p=>({...p,days:parseInt(v)||30}))} type="number"/>
                <Field label="Expires (optional)" value={newCode.expires} onChange={v=>setNewCode(p=>({...p,expires:v}))} type="date" accent={C.purple}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <Btn onClick={createCode} disabled={codeSaving} bg={C.purple} size="sm">{codeSaving?<><Spin s={13} c="#fff"/>Creating…</>:"+ Create code"}</Btn>
                <div style={{display:"flex",gap:8}}>
                  {[["BETA30",30,30],["FRIEND7",1,7],["VIP90",5,90]].map(([c,l,d])=>(
                    <button key={c} onClick={()=>setNewCode({code:c,limit:l,days:d,expires:""})} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${C.border}`,background:C.surface,fontSize:12,color:C.ink2,cursor:"pointer",fontFamily:"inherit",minHeight:"unset",minWidth:"unset"}}>Use {c}</button>
                  ))}
                </div>
              </div>
              {codeErr&&<div style={{marginTop:10,fontSize:13,color:C.red}}>{codeErr}</div>}
            </Card>

            <Card flat style={{overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13.5,fontWeight:700,color:C.ink}}>{codes.length} invite codes</div>
              {codes.length===0?<div style={{padding:"40px",textAlign:"center",color:C.ink3}}>No codes yet. Create one above.</div>
              :codes.map((c,i)=>(
                <div key={c.id} style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontSize:15,fontWeight:700,color:C.purple,fontFamily:"monospace",letterSpacing:1.5}}>{c.code}</div>
                    <div style={{fontSize:12,color:C.ink3,marginTop:3}}>
                      Used <strong>{c.used_count||0}</strong>/{c.usage_limit} · {c.access_days} days access
                      {c.expires_at?` · Expires ${new Date(c.expires_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}`:` · No expiry`}
                    </div>
                  </div>
                  {/* Usage bar */}
                  <div style={{width:100,flexShrink:0}}>
                    <div style={{height:4,borderRadius:99,background:C.border,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:99,background:c.used_count>=(c.usage_limit||1)?C.red:C.sage,width:`${Math.min(100,((c.used_count||0)/(c.usage_limit||1))*100)}%`,transition:"width .3s"}}/>
                    </div>
                    <div style={{fontSize:11,color:C.ink3,marginTop:3}}>{Math.round(((c.used_count||0)/(c.usage_limit||1))*100)}% used</div>
                  </div>
                  <Tag color={c.used_count>=(c.usage_limit||1)?C.red:c.expires_at&&new Date(c.expires_at)<new Date()?C.stone:C.sage}>{c.used_count>=(c.usage_limit||1)?"Exhausted":c.expires_at&&new Date(c.expires_at)<new Date()?"Expired":"Active"}</Tag>
                  <div style={{display:"flex",gap:7}}>
                    <button onClick={()=>{navigator.clipboard.writeText(c.code);toast("Copied!");}} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${C.border}`,background:C.surface,fontSize:12,color:C.ink2,cursor:"pointer",fontFamily:"inherit",minHeight:"unset",minWidth:"unset"}}>Copy</button>
                    <button onClick={()=>deleteCode(c.id)} style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${C.red}30`,background:C.redBg,fontSize:12,color:C.red,cursor:"pointer",fontFamily:"inherit",minHeight:"unset",minWidth:"unset"}}>Delete</button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ══ ANALYSES ══ */}
        {!loading&&tab==="analyses"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Score distribution */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[["High (70+)",analyses.filter(a=>a.gap_score>=70).length,C.sage],["Medium (50-69)",analyses.filter(a=>a.gap_score>=50&&a.gap_score<70).length,C.amber],["Low (<50)",analyses.filter(a=>a.gap_score<50&&a.gap_score!=null).length,C.red]].map(([l,v,c])=>(
                <Card key={l} style={{padding:"16px 18px"}}>
                  <div style={{fontSize:26,fontWeight:800,color:c,marginBottom:4}}>{v}</div>
                  <div style={{fontSize:12,color:C.ink3,fontWeight:600}}>{l}</div>
                </Card>
              ))}
            </div>
            <Card flat style={{overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13.5,fontWeight:700,color:C.ink}}>{analyses.length} analyses</div>
              <div style={{maxHeight:560,overflowY:"auto"}}>
                {analyses.map((a,i)=>{
                  const clr=a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
                  return <div key={a.id} style={{padding:"11px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:8,background:clr+"15",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:clr,fontSize:14,flexShrink:0}}>{a.gap_score??"-"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:600,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.role||"Unknown"}{a.company?` @ ${a.company}`:""}</div>
                      <div style={{fontSize:11.5,color:C.ink3,marginTop:2,fontFamily:"monospace"}}>{a.user_id?.slice(0,12)}…</div>
                    </div>
                    <div style={{fontSize:12,color:C.ink3,flexShrink:0,textAlign:"right"}}>
                      <div>ATS: <strong>{a.ats_score??"-"}</strong></div>
                      <div>Skills: <strong>{a.skill_score??"-"}</strong></div>
                      <div style={{fontSize:11}}>{new Date(a.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
                    </div>
                  </div>;
                })}
                {analyses.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.ink3}}>No analyses yet</div>}
              </div>
            </Card>
          </div>
        )}

        {/* ══ REVIEWS ══ */}
        {!loading&&tab==="reviews"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {reviews.length>0&&(
              <div style={{padding:"13px 18px",background:C.amberBg,borderRadius:10,border:`1px solid ${C.amber}30`,fontSize:13.5,color:C.amber,fontWeight:600}}>
                ⏳ {reviews.length} review{reviews.length>1?"s":""} waiting for your approval
              </div>
            )}
            {/* Pending */}
            {reviews.length>0&&(
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:10}}>Pending approval</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {reviews.map((r,i)=>(
                    <Card key={r.id} flat style={{padding:"16px 18px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                            <div style={{width:32,height:32,borderRadius:"50%",background:C.sageBg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:C.sage,fontSize:14,flexShrink:0}}>{r.name?.[0]||"?"}</div>
                            <div><div style={{fontSize:13.5,fontWeight:700,color:C.ink}}>{r.name}</div>{r.role&&<div style={{fontSize:12,color:C.ink3}}>{r.role}</div>}</div>
                            <Stars rating={r.rating}/>
                          </div>
                          <p style={{fontSize:13.5,color:C.ink2,lineHeight:1.75,fontStyle:"italic",marginBottom:6}}>"{r.text}"</p>
                          <div style={{fontSize:11.5,color:C.ink3}}>{new Date(r.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <Btn size="sm" bg={C.sage} onClick={()=>approveRev(r.id)}>✓ Approve</Btn>
                          <OutBtn size="sm" onClick={()=>deleteRev(r.id)} style={{color:C.red,borderColor:C.red+"30"}}>✕ Delete</OutBtn>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {/* All reviews */}
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:10}}>All reviews ({allReviews.length})</div>
              <Card flat style={{overflow:"hidden"}}>
                <div style={{maxHeight:400,overflowY:"auto"}}>
                  {allReviews.filter(r=>r.approved).map((r,i)=>(
                    <div key={r.id} style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:13.5,fontWeight:600,color:C.ink}}>{r.name}</span>
                          {r.role&&<span style={{fontSize:12,color:C.ink3}}>{r.role}</span>}
                          <Stars rating={r.rating}/>
                          <Tag color={C.sage}>Approved</Tag>
                        </div>
                        <p style={{fontSize:13,color:C.ink2,lineHeight:1.65,fontStyle:"italic",marginTop:4}}>"{r.text?.slice(0,120)}{r.text?.length>120?"…":""}"</p>
                      </div>
                      <button onClick={()=>deleteRev(r.id)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${C.red}30`,background:C.redBg,fontSize:12,color:C.red,cursor:"pointer",fontFamily:"inherit",minHeight:"unset",minWidth:"unset",flexShrink:0}}>Delete</button>
                    </div>
                  ))}
                  {allReviews.filter(r=>r.approved).length===0&&<div style={{padding:"32px",textAlign:"center",color:C.ink3}}>No approved reviews yet</div>}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══ B2B / COLLEGES ══ */}
        {!loading&&tab==="b2b"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Summary */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
              {[
                ["Total Colleges", colleges.length, C.blue],
                ["Active",         colleges.filter(c=>c.status==="active").length, C.sage],
                ["Trial",          colleges.filter(c=>c.status==="trial").length, C.amber],
                ["Enquiries",      colleges.filter(c=>c.status==="enquiry").length, C.purple],
              ].map(([l,v,c])=>(
                <Card key={l} style={{padding:"16px 18px"}}>
                  <div style={{fontSize:26,fontWeight:800,color:c,marginBottom:4}}>{v}</div>
                  <div style={{fontSize:12,color:C.ink3,fontWeight:600}}>{l}</div>
                </Card>
              ))}
            </div>
            {/* Add college form */}
            <Card flat style={{padding:"18px 20px"}}>
              <div style={{fontSize:13.5,fontWeight:700,color:C.ink,marginBottom:14}}>Add college / B2B lead</div>
              <CollegeForm onSave={async(col)=>{ try{ const d=await adminSaveCollege(col); setColleges(p=>[d,...p.filter(c=>c.id!==d.id)]); toast("Saved ✓"); }catch(e){ toast(e.message,"error"); } }}/>
            </Card>
            {/* College list */}
            <Card flat style={{overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13.5,fontWeight:700,color:C.ink}}>{colleges.length} colleges</div>
              {colleges.length===0
                ?<div style={{padding:"40px",textAlign:"center",color:C.ink3}}>No colleges yet. Add your first B2B lead above.</div>
                :colleges.map((c,i)=>{
                  const stClr={active:C.sage,trial:C.amber,enquiry:C.purple,inactive:C.stone};
                  return <div key={c.id} style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.ink}}>{c.name}</div>
                      <div style={{fontSize:12,color:C.ink3,marginTop:2}}>{c.contact_email} · {c.city||"—"} · {c.student_count||"?"} students</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <Tag color={stClr[c.status]||C.stone}>{c.status}</Tag>
                      <select value={c.status} onChange={async e=>{ await adminSaveCollege({...c,status:e.target.value}); setColleges(p=>p.map(x=>x.id===c.id?{...x,status:e.target.value}:x)); toast("Updated ✓"); }}
                        style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:C.bg,fontSize:12,fontFamily:"inherit",cursor:"pointer",minHeight:"unset"}}>
                        {["enquiry","trial","active","inactive"].map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>;
                })
              }
            </Card>
          </div>
        )}

        {/* ══ EMAIL STATS ══ */}
        {!loading&&tab==="emails"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Email type breakdown */}
            {(() => {
              const byType = {};
              emailStats.forEach(e=>{ byType[e.type]=(byType[e.type]||{total:0,sent:0,failed:0}); byType[e.type].total++; if(e.status==="sent") byType[e.type].sent++; else byType[e.type].failed++; });
              return (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
                  {Object.entries(byType).map(([type,s])=>(
                    <Card key={type} style={{padding:"14px 16px"}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.ink3,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>{type.replace(/_/g," ")}</div>
                      <div style={{display:"flex",gap:12}}>
                        <div><div style={{fontSize:20,fontWeight:800,color:C.sage}}>{s.sent}</div><div style={{fontSize:11,color:C.ink3}}>sent</div></div>
                        {s.failed>0&&<div><div style={{fontSize:20,fontWeight:800,color:C.red}}>{s.failed}</div><div style={{fontSize:11,color:C.ink3}}>failed</div></div>}
                      </div>
                    </Card>
                  ))}
                  {Object.keys(byType).length===0&&<div style={{padding:"40px",textAlign:"center",color:C.ink3,gridColumn:"1/-1"}}>No emails sent yet. Set up BREVO_API_KEY in Vercel to enable emails.</div>}
                </div>
              );
            })()}
            {/* Recent email log */}
            <Card flat style={{overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13.5,fontWeight:700,color:C.ink}}>Recent emails ({emailStats.length})</div>
              <div style={{maxHeight:480,overflowY:"auto"}}>
                {emailStats.slice(0,50).map((e,i)=>(
                  <div key={i} style={{padding:"10px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                    <Tag color={e.status==="sent"?C.sage:C.red}>{e.status}</Tag>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.ink}}>{e.type.replace(/_/g," ")}</div></div>
                    <div style={{fontSize:11.5,color:C.ink3}}>{new Date(e.sent_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                ))}
              </div>
            </Card>
            {/* Setup guide */}
            <Card flat style={{padding:"18px 20px",background:C.amberBg,border:`1px solid ${C.amber}20`}}>
              <div style={{fontSize:13.5,fontWeight:700,color:C.amber,marginBottom:8}}>📧 Email Setup</div>
              <p style={{fontSize:13.5,color:C.ink2,lineHeight:1.75}}>
                To enable emails: <strong>1.</strong> Sign up at <a href="https://brevo.com" target="_blank" style={{color:C.blue}}>brevo.com</a> (free — 300 emails/day) <strong>2.</strong> Go to SMTP &amp; API → API Keys → Create key <strong>3.</strong> Add <code style={{background:C.bg,padding:"2px 6px",borderRadius:4}}>BREVO_API_KEY</code> to Vercel env vars <strong>4.</strong> Redeploy.
              </p>
            </Card>
          </div>
        )}

        {/* ══ FEEDBACK ══ */}
        {!loading&&tab==="feedback"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Summary */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[
                ["Total Feedback",feedback.length,C.blue],
                ["Helpful",feedback.filter(f=>f.helpful).length,C.sage],
                ["Needs Work",feedback.filter(f=>f.helpful===false).length,C.red],
              ].map(([l,v,c])=>(
                <Card key={l} style={{padding:"16px 18px"}}>
                  <div style={{fontSize:26,fontWeight:800,color:c,marginBottom:4}}>{v}</div>
                  <div style={{fontSize:12,color:C.ink3,fontWeight:600}}>{l}</div>
                </Card>
              ))}
            </div>
            <Card flat style={{overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13.5,fontWeight:700,color:C.ink}}>{feedback.length} feedback items</div>
              <div style={{maxHeight:560,overflowY:"auto"}}>
                {feedback.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.ink3}}>No feedback yet</div>}
                {feedback.map((f,i)=>(
                  <div key={f.id} style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:f.comment?8:0,flexWrap:"wrap"}}>
                      <span style={{padding:"3px 10px",borderRadius:99,background:f.helpful?C.sageBg:C.redBg,color:f.helpful?C.sage:C.red,fontSize:12,fontWeight:600}}>{f.helpful?"✓ Helpful":"✗ Needs work"}</span>
                      {f.role&&<span style={{fontSize:13,color:C.ink2,fontWeight:500}}>{f.role}{f.company?` @ ${f.company}`:""}</span>}
                      {f.gap_score!=null&&<span style={{fontSize:12,color:C.ink3}}>Score: {f.gap_score}</span>}
                      <span style={{fontSize:11.5,color:C.ink3,marginLeft:"auto"}}>{new Date(f.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>
                    </div>
                    {f.comment&&<p style={{fontSize:13.5,color:C.ink2,lineHeight:1.7,paddingLeft:4}}>{f.comment}</p>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}


/* ─── ROOT ───────────────────────────────────────────────── */
export default function KrackHire() {
  // SEO: Track page views
  usePageTracking();
  
  const [view,        setView]        = useState("landing");
  const [showWelcome, setShowWelcome] = useState(false);
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [showAuth,    setShowAuth]    = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [upgradeModal,setUpgradeModal]= useState(false);
  const [payModal,    setPayModal]    = useState(null);
  const [showInvite,  setShowInvite]  = useState(false);
  const { toast, list:toastList, remove:removeToast } = useToast();

  useEffect(()=>{
    if(!sb){ setAuthLoading(false); return; }
    sb.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user||null);
      if(session?.user) getProfile(session.user.id).then(p=>{
        if(p){
          setProfile(p);
          console.log("[KH] Profile loaded:", {role:p.role, plan:p.plan, id:p.id?.slice(0,8)});
          // Check plan expiry — send reminder if expires in ≤3 days
          if(p.plan_expires_at && !["founding_user","early_adopter","free"].includes(p.plan)) {
            const daysLeft = Math.ceil((new Date(p.plan_expires_at)-Date.now())/86400000);
            if(daysLeft > 0 && daysLeft <= 3) {
              // Only send once per day per user
              const planKey = "expiring_"+session.user.id+"_"+new Date().toDateString();
              if(!_emailSent.has(planKey)) {
                _emailSent.add(planKey);
                callEmail("plan_expiring", session.user.id, {
                  email:    session.user.email,
                  name:     session.user.user_metadata?.name||session.user.email?.split("@")[0]||"there",
                  plan:     planDisplayLabel(p.plan),
                  daysLeft,
                }).catch(()=>{});
              }
            }
          }
        } else {
          console.warn("[KH] Profile returned null for user:", session.user.id?.slice(0,8));
        }
      }).catch(e=>console.error("[KH] Profile fetch error:",e.message));
      setAuthLoading(false);
    });
    const {data:{subscription}}=sb.auth.onAuthStateChange((event,session)=>{
      // Handle session expiry and sign out
      if(event==="SIGNED_OUT" || event==="TOKEN_REFRESHED" && !session) {
        setUser(null); setProfile(null); return;
      }
      if(event==="USER_UPDATED" && session?.user) {
        getProfile(session.user.id).then(p=>{ if(p) setProfile(p); }).catch(()=>{});
        return;
      }
      setUser(session?.user||null);
      if(session?.user) {
        getProfile(session.user.id).then(p=>{ if(p) setProfile(p); }).catch(()=>{});
        // Send welcome email + show popup on sign in
        if(event==="SIGNED_IN") {
          const uid = session.user.id;
          // SIGNED_IN fires multiple times on OAuth — deduplicate
          if(!_emailSent.has("welcome_"+uid)) {
            _emailSent.add("welcome_"+uid);
            // Welcome email: only for new accounts (created < 5 min ago)
            const isNew = session.user.created_at &&
              (Date.now()-new Date(session.user.created_at).getTime()) < 5*60*1000;
            if(isNew) {
              callEmail("welcome", uid, {
                email: session.user.email,
                name:  session.user.user_metadata?.name||session.user.email?.split("@")[0]||"there",
              }).catch(()=>{});
            }
          }
          setTimeout(()=>setShowWelcome(true), 1500);
        }
        // Handle password recovery
        if(event==="PASSWORD_RECOVERY") {
          setShowAuth.bind(true);
          toast("Please enter your new password.", "info");
        }
      } else setProfile(null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  // Handle PayU return redirect (?payment=success/failed)
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const plan    = params.get("plan");
    const txn     = params.get("txn");
    if(payment === "success") {
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      setPayModal(null);
      // Refresh profile to get updated plan
      if(sb) sb.auth.getSession().then(({data:{session}})=>{
        if(session?.user) {
          getProfile(session.user.id).then(p=>{ if(p) setProfile(p); });
          setView("landing");
          // Show success toast after a brief delay
          setTimeout(()=>{ toast("🎉 Payment successful! Your plan is now active.","success"); }, 500);
        }
      });
    } else if(payment === "failed") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(()=>{ toast("Payment was not completed. Please try again.","error"); }, 300);
    } else if(payment === "tampered") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(()=>{ toast("Payment verification failed. Please contact support.","error"); }, 300);
    }
  },[]);

  // Admin: only accessible if profile.role is admin or founder (verified from DB)
  // No keyboard shortcuts, no URL hacks — role comes from Supabase only

  async function handleSignOut(){ await doSignOut(); setUser(null); setProfile(null); }
  function navigate(page){ setView(page); window.scrollTo({top:0,behavior:"instant"}); }
  function goAdmin(){
    // Check role from profile OR by email (fallback for founder)
    const isFounder = ["admin","founder"].includes(profile?.role) || 
                      user?.email === "mohidmd58@gmail.com";
    if(!isFounder){ return; }
    setView("admin");
  }
  function leaveAdmin(){ setView("landing"); }

  function handleUpgrade(planId) {
    setUpgradeModal(false);
    if(!planId){ setUpgradeModal(true); return; }
    if(!user){ setShowAuth(true); return; }
    const plans = {
      pro_monthly:  { planLabel:"Pro Monthly",     planAmount:"₹49/month"  },
      pro_yearly:   { planLabel:"Pro Yearly",       planAmount:"₹499/year"  },
      starter:      { planLabel:"Starter (7 days)", planAmount:"₹49"        },
      founding_user:{ planLabel:"Founding Member",  planAmount:"₹49/month"  },
    };
    const plan = plans[planId] || { planLabel:"Pro", planAmount:"₹49/month" };
    setPayModal({ planId, ...plan });
  }

  function handlePaymentSuccess() {
    setPayModal(null);
    toast("Payment successful! Your plan is now active. 🎉","success");
    if(user) {
      getProfile(user.id).then(p=>{
        if(p) {
          setProfile(p);
          // Send payment success email
          callEmail("payment_success", user.id, {
            email:  user.email,
            name:   user.user_metadata?.name||user.email?.split("@")[0]||"there",
            plan:   planDisplayLabel(p.plan),
            amount: payModal?.planAmount||"",
          }).catch(()=>{});
        }
      }).catch(()=>{});
    }
  }

  if(authLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:C.bg, gap:20 }}>
      <Logo size="lg"/>
      <Spin s={28} c={C.sage}/>
      <p style={{ fontSize:14, color:C.ink3, animation:"pulse 1.5s infinite" }}>Loading your account…</p>
    </div>
  );

  function refreshProfile() {
    if (user) getProfile(user.id).then(setProfile).catch(()=>{});
  }

  return (
    <HelmetProvider>
      <HomePageSEO />
      <ProductSchema />
      
      <ErrorBoundary>
        {/* CRITICAL: Show environment configuration errors if any */}
        {ENV_ERRORS.length > 0 && (
          <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:9998, background:"#C0392B", color:"#fff", padding:"12px 16px", fontSize:13.5, fontWeight:600, textAlign:"center" }}>
            ⚠️ Configuration Error: {ENV_ERRORS.join(", ")}. Contact admin@krackhire.in
          </div>
        )}
        <Toasts list={toastList} remove={removeToast}/>
        {showWelcome&&user&&profile&&<WelcomePopup user={user} profile={profile} onClose={()=>setShowWelcome(false)}/>}
        {showAuth     &&<AuthModal onClose={()=>setShowAuth(false)}/>}
        {upgradeModal &&<UpgradeModal onClose={()=>setUpgradeModal(false)} onSelectPlan={handleUpgrade} user={user}/>}
        {payModal     &&<PaymentModal {...payModal} user={user} onClose={()=>setPayModal(null)} onSuccess={handlePaymentSuccess} toast={toast}/>}
        {view==="admin"     ? <AdminDashboard user={user} profile={profile} onBack={leaveAdmin}/> :
         view==="contact"   ? <ContactPage  onBack={()=>navigate("landing")}/> :
         view==="privacy"   ? <PrivacyPage  onBack={()=>navigate("landing")}/> :
         view==="terms"     ? <TermsPage    onBack={()=>navigate("landing")}/> :
         view==="refund"    ? <RefundPage   onBack={()=>navigate("landing")}/> :
         view==="dashboard" ? (
           <UserDashboard
             user={user}
             profile={profile}
             onBack={()=>navigate("tool")}
             onSignOut={handleSignOut}
             onUpgrade={handleUpgrade}
             onInvite={()=>setShowInvite(true)}
             toast={toast}
           />
         ) :
         view==="tool"      ? <Tool onBack={()=>navigate("landing")} onDashboard={()=>navigate("dashboard")} user={user} profile={profile} onShowAuth={()=>setShowAuth(true)} onUpgrade={handleUpgrade} onProfileRefresh={refreshProfile}/> :
         <Landing onEnter={()=>navigate("tool")} user={user} profile={profile} onShowAuth={()=>setShowAuth(true)} onSignOut={handleSignOut} onUpgrade={handleUpgrade} onProfileRefresh={refreshProfile} toast={toast} onAdmin={goAdmin} navigate={navigate} onDashboard={()=>navigate("dashboard")}/>
        }
      </ErrorBoundary>
    </HelmetProvider>
  );
}
