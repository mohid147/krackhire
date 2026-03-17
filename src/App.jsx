import { useState, useRef, useEffect, useCallback, useMemo, memo, Component } from "react";
import { createClient } from "@supabase/supabase-js";

/* ─── SUPABASE ───────────────────────────────────────────── */
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SITE_URL  = import.meta.env.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

const sb = SUPA_URL && SUPA_ANON
  ? createClient(SUPA_URL, SUPA_ANON, { auth:{ autoRefreshToken:true, persistSession:true, detectSessionInUrl:true }})
  : null;

/* ─── SUPABASE HELPERS ───────────────────────────────────── */
async function signInGoogle() {
  if (!sb) return;
  try {
    await sb.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:SITE_URL, queryParams:{ access_type:"offline", prompt:"consent" }}});
  } catch(e) { console.error("Sign in error:", e.message); }
}
async function doSignOut()        { if (sb) await sb.auth.signOut(); }
async function getProfile(uid)    { if (!sb) return null; try { const { data } = await sb.from("profiles").select("*").eq("id",uid).single(); return data; } catch(e) { console.error("getProfile error:", e.message); return null; } }
async function getAnalyses(uid)   { if (!sb) return []; const { data } = await sb.from("analyses").select("id,company,role,gap_score,ats_score,skill_score,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(20); return data||[]; }
async function getApprovedRevs()  { if (!sb) return []; const { data } = await sb.from("reviews").select("*").eq("approved",true).order("created_at",{ascending:false}).limit(20); return data||[]; }
async function saveReview(r)      { if (!sb) return; await sb.from("reviews").insert({...r,approved:false}); }
async function saveFeedback(f)    { if (!sb) return; await sb.from("feedback").insert(f).catch(()=>{}); }
async function getTrackerJobs(uid){ if (!sb) return []; const { data } = await sb.from("job_tracker").select("*").eq("user_id",uid).order("applied_date",{ascending:false}).limit(50); return data||[]; }
async function saveTrackerJob(uid,job){ if (!sb) return null; const { data } = await sb.from("job_tracker").insert({...job,user_id:uid}).select().single(); return data; }
async function updateTrackerJob(id,updates){ if (!sb) return; await sb.from("job_tracker").update(updates).eq("id",id); }
async function deleteTrackerJob(id){ if (!sb) return; await sb.from("job_tracker").delete().eq("id",id); }

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
  const ctrl = new AbortController();
  const tid  = setTimeout(()=>ctrl.abort(), 50000);
  try {
    const res  = await fetch("/api/analyse", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type,...payload}), signal:ctrl.signal });
    clearTimeout(tid);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error||"Request failed");
    return data.result;
  } catch(e) { clearTimeout(tid); if(e.name==="AbortError") throw new Error("Timed out. Please try again."); throw e; }
}

async function callPayment(body) {
  const res  = await fetch("/api/payment", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error||"Payment error");
  return data;
}

function parseJSON(raw) { try { return JSON.parse(raw.replace(/```json|```/g,"").trim()); } catch { return null; } }

/* ─── ERROR BOUNDARY ─────────────────────────────────────── */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error) { return { hasError:true, error }; }
  componentDidCatch(error, info) { console.error("KrackHire Error:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#F9F8F6", padding:24, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#1C1917", marginBottom:8 }}>Something went wrong</div>
          <div style={{ fontSize:14, color:"#57534E", marginBottom:24, maxWidth:400, lineHeight:1.7 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </div>
          <button onClick={()=>window.location.reload()} style={{ padding:"11px 24px", borderRadius:9, background:"#3D6B4F", color:"#fff", fontSize:14.5, fontWeight:600, cursor:"pointer", border:"none" }}>
            Reload page
          </button>
          <div style={{ marginTop:12, fontSize:12, color:"#A8A29E" }}>
            If this keeps happening, clear your browser cache and try again.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

/* ─── DESIGN TOKENS ──────────────────────────────────────── */
const C = {
  bg:"#F9F8F6", surface:"#FFFFFF", ink:"#1C1917",
  ink2:"#57534E", ink3:"#A8A29E", ink4:"#E7E5E4", border:"#E7E5E4",
  sage:"#3D6B4F", sageBg:"#F0F5F2", sageMid:"#D4E6DA",
  red:"#C0392B",   redBg:"#FDF2F2",
  amber:"#B45309", amberBg:"#FFFBEB",
  blue:"#1D4ED8",  blueBg:"#EFF6FF",
  purple:"#5B21B6",purpleBg:"#F5F3FF",
  stone:"#78716C",
};

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
  const shareText=`My Job Readiness Score: ${score}/100 on KrackHire${role?` for ${role} role`:""}\nATS: ${atsScore||"–"}/100 | Skills: ${skillScore||"–"}/100\nStill improving. krackhire.vercel.app`;

  function share(platform) {
    if(platform==="copy") { navigator.clipboard.writeText(shareText).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2500); return; }
    if(platform==="whatsapp") { window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`,"_blank"); return; }
    if(platform==="linkedin") { window.open(`https://www.linkedin.com/sharing/share-offsite/?url=krackhire.vercel.app&summary=${encodeURIComponent(shareText)}`,"_blank"); return; }
    if(platform==="telegram") { window.open(`https://t.me/share/url?url=krackhire.vercel.app&text=${encodeURIComponent(shareText)}`,"_blank"); return; }
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
          <div style={{ marginTop:14, fontSize:11, opacity:.6 }}>krackhire.vercel.app</div>
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

/* ─── PDF REPORT MODAL ───────────────────────────────────── */
function PDFReportModal({ results, company, role, user, onClose, isPro, onUpgrade }) {
  const [generating, setGenerating] = useState(false);
  const [plan7, setPlan7] = useState(true);

  if (!isPro) return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="report-modal-inner" style={{ background:C.surface, borderRadius:16, padding:"28px 24px", maxWidth:400, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:36, marginBottom:14 }}>📊</div>
        <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20, color:C.ink, marginBottom:8, fontWeight:700 }}>PDF Career Report</h3>
        <p style={{ fontSize:14, color:C.ink2, lineHeight:1.7, marginBottom:20 }}>Get a professional downloadable career report with your full analysis, 7-day improvement plan, and actionable recommendations. Available in Pro plan.</p>
        <Btn onClick={()=>{ onClose(); onUpgrade(); }} full bg={C.sage}>Upgrade to Pro →</Btn>
        <button onClick={onClose} style={{ marginTop:12, fontSize:13.5, color:C.ink3, cursor:"pointer", minHeight:36, width:"100%" }}>Not now</button>
      </div>
    </div>
  );

  function generateReport() {
    setGenerating(true);
    // Build report HTML and trigger print
    const gap = results.gap;
    const score = gap?.score || 0;
    const ats   = gap?.ats_score || Math.round(score * 0.9);
    const skill = gap?.skill_score || Math.round(score * 0.85);
    const userName = user?.user_metadata?.name || "Job Seeker";

    const improvPlan = plan7 ? [
      { day:"Day 1–2", task:"Add missing keywords from the JD to your resume Skills section. Keep language natural.", icon:"📝" },
      { day:"Day 3",   task:"Rewrite your Summary/Objective with the target role title and 2 key achievements.", icon:"✍️" },
      { day:"Day 4",   task:"Quantify at least 3 bullet points in Experience section with numbers and percentages.", icon:"📊" },
      { day:"Day 5",   task:"Update LinkedIn headline, about section, and skills to match JD keywords.", icon:"💼" },
      { day:"Day 6",   task:"Practice answering 5 common interview questions for this role using the coach.", icon:"🎯" },
      { day:"Day 7",   task:"Do a final review of resume, send cold email to HR, and submit your application.", icon:"🚀" },
    ] : [
      { day:"Week 1",  task:"Fix resume: keywords, quantified achievements, clear formatting, ATS-safe structure.", icon:"📝" },
      { day:"Week 2",  task:"Optimise LinkedIn and Naukri profiles. Connect with 10 relevant professionals.", icon:"💼" },
      { day:"Week 3",  task:"Research 5 target companies. Customise your resume and cover letter for each.", icon:"🏢" },
      { day:"Week 4",  task:"Apply to 15 roles, track all applications, practise mock interviews daily.", icon:"📋" },
      { day:"Week 5–6",task:"Follow up on applications. Prepare for assessment tests. Update skills on LinkedIn.", icon:"🔄" },
      { day:"Week 7–8",task:"Interview preparation: technical questions, HR rounds, salary discussion.", icon:"🎯" },
    ];

    const html = `<!DOCTYPE html><html><head><title>KrackHire Career Report — ${userName}</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:#fff;color:#1C1917;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:794px;margin:0 auto}
  /* Cover */
  .cover{background:linear-gradient(135deg,#3D6B4F,#2D5240);color:#fff;padding:60px 48px;min-height:200px;border-radius:0}
  .cover h1{font-family:'Lora',serif;font-size:36px;margin-bottom:6px}
  .cover .sub{font-size:15px;opacity:.8;margin-bottom:28px}
  .cover .meta{display:flex;gap:32px;flex-wrap:wrap}
  .cover .meta div{text-align:center}
  .cover .meta .num{font-size:36px;font-weight:700}
  .cover .meta .lbl{font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:1px}
  /* Sections */
  .section{padding:32px 48px;border-bottom:1px solid #E7E5E4}
  .section h2{font-family:'Lora',serif;font-size:20px;color:#3D6B4F;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #D4E6DA}
  /* Score bars */
  .score-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .score-bar-bg{flex:1;height:8px;background:#E7E5E4;border-radius:99px;overflow:hidden}
  .score-bar{height:100%;border-radius:99px;background:#3D6B4F}
  .score-val{font-size:14px;font-weight:700;color:#3D6B4F;width:50px;text-align:right}
  /* Gap items */
  .gap-item{padding:10px 14px;border-radius:8px;margin-bottom:8px;border-left:3px solid}
  .gap-missing{background:#FDF2F2;border-color:#C0392B}
  .gap-weak{background:#FFFBEB;border-color:#B45309}
  .gap-strong{background:#F0F5F2;border-color:#3D6B4F}
  .gap-title{font-weight:700;font-size:13px;margin-bottom:3px}
  .gap-detail{font-size:12px;color:#57534E;line-height:1.6}
  /* Plan */
  .plan-row{display:flex;gap:14px;margin-bottom:12px;align-items:flex-start}
  .plan-day{background:#3D6B4F;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;margin-top:2px}
  .plan-text{font-size:13px;color:#57534E;line-height:1.65}
  /* Keywords */
  .kw-list{display:flex;flex-wrap:wrap;gap:7px}
  .kw{background:#F0F5F2;color:#3D6B4F;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600}
  /* Footer */
  .footer{background:#F9F8F6;padding:20px 48px;text-align:center;font-size:12px;color:#A8A29E}
  @media print{@page{margin:0;size:A4}}
</style></head>
<body><div class="page">
  <div class="cover">
    <h1>Career Readiness Report</h1>
    <div class="sub">Prepared for ${userName}${role?` · ${role} Role`:""}</div>
    <div class="meta">
      <div><div class="num">${score}</div><div class="lbl">Readiness Score /100</div></div>
      <div><div class="num">${ats}</div><div class="lbl">ATS Score /100</div></div>
      <div><div class="num">${skill}</div><div class="lbl">Skill Match /100</div></div>
      ${company?`<div><div class="num" style="font-size:18px">${company}</div><div class="lbl">Target Company</div></div>`:""}
    </div>
  </div>

  <div class="section">
    <h2>Score Summary</h2>
    ${[["Overall Readiness",score],["ATS Compatibility",ats],["Skill Match",skill]].map(([l,v])=>`
      <div class="score-row"><span style="font-size:13px;font-weight:600;color:#1C1917;width:160px">${l}</span>
      <div class="score-bar-bg"><div class="score-bar" style="width:${v}%;background:${v>=70?"#3D6B4F":v>=50?"#B45309":"#C0392B"}"></div></div>
      <span class="score-val">${v}/100</span></div>`).join("")}
    ${gap?.summary?`<p style="margin-top:14px;font-size:13.5px;color:#57534E;line-height:1.75;padding:12px 16px;background:#F0F5F2;border-radius:8px">${gap.summary}</p>`:""}
  </div>

  ${gap?.missing?.length?`<div class="section">
    <h2>Critical Gaps — Fix Before Applying</h2>
    ${gap.missing.map(g=>`<div class="gap-item gap-missing"><div class="gap-title" style="color:#C0392B">✗ ${g.title}</div><div class="gap-detail">${g.detail}</div></div>`).join("")}
  </div>`:""}

  ${gap?.weak?.length?`<div class="section">
    <h2>Weak Areas — Improve to Stand Out</h2>
    ${gap.weak.map(g=>`<div class="gap-item gap-weak"><div class="gap-title" style="color:#B45309">△ ${g.title}</div><div class="gap-detail">${g.detail}</div></div>`).join("")}
  </div>`:""}

  ${gap?.strong?.length?`<div class="section">
    <h2>Your Strengths — Lead With These</h2>
    ${gap.strong.map(g=>`<div class="gap-item gap-strong"><div class="gap-title" style="color:#3D6B4F">✓ ${g.title}</div><div class="gap-detail">${g.detail}</div></div>`).join("")}
  </div>`:""}

  ${gap?.missing_keywords?.length?`<div class="section">
    <h2>Missing Keywords</h2>
    <div class="kw-list">${gap.missing_keywords.map(k=>`<span class="kw">${k}</span>`).join("")}</div>
  </div>`:""}

  <div class="section">
    <h2>${plan7?"7-Day Improvement Plan":"14-Day Career Roadmap"}</h2>
    ${improvPlan.map(p=>`<div class="plan-row"><span class="plan-day">${p.day}</span><div class="plan-text">${p.icon} ${p.task}</div></div>`).join("")}
  </div>

  <div class="section">
    <h2>LinkedIn & Naukri Improvement Tips</h2>
    ${["Update your headline to include your target job title and 2 key skills",
       "Write your About section with role-specific keywords from the JD",
       "Add all relevant skills from the job description to your Skills section",
       "Include quantified achievements in each experience entry",
       "Set your Naukri profile to 'Actively looking' and fill the key skills field",
       "Upload your updated resume in both DOC and PDF format on Naukri"].map(t=>`<div style="padding:8px 0;border-bottom:1px solid #E7E5E4;font-size:13px;color:#57534E">→ ${t}</div>`).join("")}
  </div>

  <div class="footer">
    Generated by KrackHire · krackhire.vercel.app · Made in Hyderabad, India 🇮🇳<br/>
    This report is based on the resume and job description you provided. Results may vary. Always tailor your application to the specific role.
  </div>
</div></body></html>`;

    const win = window.open("","_blank");
    win.document.write(html);
    win.document.close();
    setTimeout(()=>{ win.print(); setGenerating(false); }, 600);
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="report-modal-inner" style={{ background:C.surface, borderRadius:16, padding:"28px 24px", maxWidth:440, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
          <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:22, color:C.ink, marginBottom:6, fontWeight:700 }}>PDF Career Report</h3>
          <p style={{ fontSize:14, color:C.ink2, lineHeight:1.65 }}>A professional downloadable report with your full analysis and personalised improvement plan.</p>
        </div>

        <div style={{ background:C.sageBg, borderRadius:10, padding:"14px 16px", marginBottom:18 }}>
          {["Cover page with your scores","Gap analysis with specific fixes","Missing keywords list","LinkedIn & Naukri optimisation tips","Day-by-day improvement plan","Interview preparation topics"].map((f,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:13.5, color:C.ink2, marginBottom:i<5?7:0 }}>
              <span className="inline" style={{ color:C.sage, fontWeight:700, minHeight:"unset", minWidth:"unset" }}>✓</span>{f}
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:10, marginBottom:18 }}>
          {[[true,"7-Day Plan"],[false,"14-Day Plan"]].map(([v,l])=>(
            <button key={l} onClick={()=>setPlan7(v)} style={{ flex:1, padding:"10px", borderRadius:8, border:`2px solid ${plan7===v?C.sage:C.border}`, background:plan7===v?C.sageBg:C.surface, color:plan7===v?C.sage:C.ink2, fontWeight:600, fontSize:13.5, cursor:"pointer", fontFamily:"inherit", minHeight:44 }}>{l}</button>
          ))}
        </div>

        <Btn onClick={generateReport} disabled={generating} full bg={C.sage} style={{ marginBottom:10, fontSize:15 }}>
          {generating?<><Spin s={16} c="#fff"/>Generating…</>:"⬇ Download PDF Report"}
        </Btn>
        <button onClick={onClose} style={{ width:"100%", fontSize:13.5, color:C.ink3, cursor:"pointer", padding:8, minHeight:36 }}>Cancel</button>
        <p style={{ fontSize:11.5, color:C.ink3, textAlign:"center", marginTop:10 }}>Opens print dialog — save as PDF or print.</p>
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
            <div style={{ fontSize:12, color:C.ink3 }}>{jobs.length} applications tracked</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn size="sm" bg={C.sage} onClick={()=>{ resetForm(); setEditId(null); setShowAdd(!showAdd); }}>+ Add Job</Btn>
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
  const [loading,setLoading]=useState(false);
  async function startPayment() {
    if(!user){ toast("Please sign in to upgrade.","error"); return; }
    setLoading(true);
    try {
      if(!window.Razorpay) {
        await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://checkout.razorpay.com/v1/checkout.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      }
      const order = await callPayment({ action:"create_order", planId, userId:user.id });
      const rzp = new window.Razorpay({
        key:order.keyId, amount:order.amount, currency:order.currency,
        name:"KrackHire", description:order.description, order_id:order.orderId,
        prefill:{ name:user.user_metadata?.name||"", email:user.email||"" },
        theme:{ color:C.sage },
        handler: async(response)=>{
          try {
            const verify = await callPayment({ action:"verify_payment", planId, userId:user.id, orderId:response.razorpay_order_id, paymentId:response.razorpay_payment_id, signature:response.razorpay_signature });
            if(verify.success) onSuccess(verify);
          } catch(e){ toast(e.message,"error"); }
        },
        modal:{ ondismiss:()=>setLoading(false) },
      });
      rzp.open();
    } catch(e){ toast(e.message,"error"); setLoading(false); }
  }
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="payment-modal-inner" style={{ background:C.surface, borderRadius:16, padding:"28px 24px", maxWidth:400, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <Logo size="md"/>
          <h2 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:22, color:C.ink, margin:"16px 0 6px", fontWeight:700 }}>Upgrade to {planLabel}</h2>
          <div style={{ fontSize:36, fontWeight:800, color:C.sage, marginBottom:4 }}>{planAmount}</div>
          <div style={{ fontSize:13, color:C.ink3 }}>{planId==="pro_yearly"?"per year — best value":"per month"}</div>
        </div>
        <div style={{ background:C.sageBg, borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
          {["Unlimited resume analyses","PDF career reports with improvement plans","Job application tracker","All 5 AI outputs: resume, cover letter, email","Interview preparation by round","Save all analyses & history"].map((f,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:13.5, color:C.ink2, marginBottom:i<5?8:0 }}>
              <span className="inline" style={{ color:C.sage, fontWeight:700, minHeight:"unset", minWidth:"unset" }}>✓</span>{f}
            </div>
          ))}
        </div>
        <Btn onClick={startPayment} disabled={loading} full bg={C.sage} style={{ marginBottom:12, fontSize:15 }}>
          {loading?<><Spin s={16} c="#fff"/>Processing…</>:`Pay ${planAmount} — UPI / Card / Net Banking`}
        </Btn>
        <button onClick={onClose} style={{ width:"100%", textAlign:"center", fontSize:13.5, color:C.ink3, cursor:"pointer", padding:8, minHeight:36 }}>Cancel</button>
        <p style={{ marginTop:12, fontSize:11.5, color:C.ink3, textAlign:"center" }}>Secured by Razorpay · UPI · Cards · Net Banking</p>
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

/* ─── AUTH MODAL ─────────────────────────────────────────── */
function AuthModal({ onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.45)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="auth-modal-inner" style={{ background:C.surface, borderRadius:16, padding:"32px 28px", maxWidth:380, width:"100%", textAlign:"center" }}>
        <Logo size="lg"/>
        <h2 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:21, color:C.ink, margin:"18px 0 8px", fontWeight:700 }}>Sign in to KrackHire</h2>
        <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.7, marginBottom:22 }}>Save analyses, track applications, download reports, and get your complete job readiness profile.</p>
        <Btn onClick={signInGoogle} full bg={C.ink} style={{ fontSize:14.5, marginBottom:14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </Btn>
        <p style={{ fontSize:12, color:C.ink3, lineHeight:1.6, marginBottom:12 }}>Your resume is processed in real time and not stored permanently.</p>
        <button onClick={onClose} style={{ fontSize:13.5, color:C.ink3, cursor:"pointer", padding:8, minHeight:36 }}>Continue without account →</button>
      </div>
    </div>
  );
}

/* ─── USER MENU ──────────────────────────────────────────── */
function UserMenu({ user, profile, onSignOut, onUpgrade, onInvite }) {
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
            {!isPro&&lifetimeLeft>0&&<div style={{ marginTop:6, fontSize:12, color:C.purple, fontWeight:600 }}>⚡ {lifetimeLeft} lifetime {lifetimeLeft===1?"access":"accesses"} remaining</div>}
            {isPro&&profile?.plan_expires_at&&profile?.plan!=="founding_user"&&<div style={{ marginTop:5, fontSize:11.5, color:C.ink3 }}>Active until {new Date(profile.plan_expires_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>}
          </div>
          {!isPro&&<button onClick={onUpgrade} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, fontWeight:600, color:C.amber, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}`, minHeight:44 }}>⚡ Upgrade to Pro</button>}
          {!isPro&&<button onClick={onInvite} style={{ width:"100%", padding:"11px 14px", textAlign:"left", fontSize:13.5, fontWeight:600, color:C.blue, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}`, minHeight:44 }}>🎟️ Enter invite code</button>}
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
  {q:"How does the Pro plan work?",         a:"Pro gives unlimited analyses at ₹49/month or ₹499/year. Payment via Razorpay — UPI, cards, net banking. Account upgrades instantly after payment."},
  {q:"Can I upload my resume as a PDF?",    a:"PDF and DOCX upload is coming very soon. Currently you can paste your resume text directly — copy from your PDF and paste into the field."},
  {q:"How accurate is the resume score?",   a:"The score reflects how well your resume matches the specific job description you provide. Use it as a practical guide for improvement, not a guarantee of interview success."},
  {q:"What is the PDF Career Report?",      a:"A downloadable professional report with your full analysis, missing keywords, LinkedIn optimisation tips, and a 7 or 14-day improvement plan. Available for Pro users."},
  {q:"How are reviews verified?",           a:"Every review is manually approved before appearing on this page. We do not display fake or AI-generated testimonials."},
];

/* ─── LANDING PAGE ───────────────────────────────────────── */
function Landing({ onEnter, user, profile, onShowAuth, onSignOut, onUpgrade, onProfileRefresh, toast, onAdmin }) {
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
          {user?<UserMenu user={user} profile={profile} onSignOut={onSignOut} onUpgrade={onUpgrade} onInvite={()=>setShowInvite(true)}/>
               :<><OutBtn onClick={onShowAuth} size="sm" className="desktop-only" style={{ display:"none" }}>Sign in</OutBtn><Btn onClick={onEnter} size="sm" bg={C.sage}>Try free</Btn></>}
          <button className="mobile-only" onClick={()=>setMenuOpen(!menuOpen)} style={{ padding:"8px 10px", borderRadius:7, color:C.ink2, fontSize:20, lineHeight:1, minHeight:44, minWidth:44 }}>{menuOpen?"✕":"☰"}</button>
        </div>
      </nav>

      {menuOpen&&(
        <div style={{ position:"fixed", top:106, left:0, right:0, zIndex:199, background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"10px 14px", display:"flex", flexDirection:"column", gap:2, animation:"slideUp .2s ease", boxShadow:"0 6px 20px rgba(0,0,0,.08)" }}>
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
            <p style={{ textAlign:"center", fontSize:13, color:C.ink3, marginTop:16 }}>Payments via Razorpay — UPI · Debit/Credit cards · Net Banking · Secure checkout</p>
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
          <div className="footer-grid" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:36, paddingBottom:32, borderBottom:"1px solid #292524" }}>
            <div className="footer-brand">
              <Logo dark/>
              <p style={{ fontSize:13, color:"#78716C", lineHeight:1.75, marginTop:10, maxWidth:240 }}>India's AI job readiness platform for freshers. Honest feedback. No hype.</p>
              <p style={{ fontSize:12, color:"#57534E", marginTop:8 }}>Made with care in Hyderabad, India</p>
            </div>
            {[{title:"Product",links:["Features","How it works","Pricing","FAQ"]},{title:"Company",links:["About","Blog","Contact"]},{title:"Legal",links:["Privacy Policy","Terms of Service"]}].map(col=>(
              <div key={col.title}>
                <div style={{ fontSize:11, fontWeight:700, color:"#78716C", textTransform:"uppercase", letterSpacing:.8, marginBottom:12 }}>{col.title}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {col.links.map(l=><a key={l} href="#" style={{ fontSize:13, color:"#78716C", minHeight:32, display:"flex", alignItems:"center" }}>{l}</a>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop:20, display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:10, fontSize:12, color:"#57534E" }}>
            <span>© 2025 KrackHire. All rights reserved.</span>
            <span>Early beta — improving based on genuine feedback.</span>
          </div>
          {["admin","founder"].includes(profile?.role)&&(
            <div style={{ paddingTop:12, textAlign:"center" }}>
              <button onClick={onAdmin} style={{ fontSize:11.5, color:"#3D3B38", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", opacity:.5, minHeight:"unset" }}>⚙ Admin</button>
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

function Tool({ onBack, user, profile, onShowAuth, onUpgrade, onProfileRefresh }) {
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

  const payload  = useMemo(()=>({resume,jd,company,role,userId:user?.id||null}),[resume,jd,company,role,user]);
  const setL = useCallback((k,v)=>setLoading(p=>({...p,[k]:v})),[]);
  const setR = useCallback((k,v)=>setResults(p=>({...p,[k]:v})),[]);
  const setE = useCallback((k,v)=>setErrors(p=>({...p,[k]:v})),[]);
  const isPro = isPremiumPlan(profile?.plan, profile?.plan_expires_at);
  const lifetimeLeft = profile?.lifetime_accesses_remaining ?? 0;

  /* Progress steps state */
  const currentStep = !ran?"Upload":results.gap?"Improve":"Analyse";

  async function analyse() {
    if(!resume.trim()||!jd.trim()){ toast("Please fill in both fields.","error"); return; }
    if(resume.length>8000){ toast("Resume too long — max 8000 characters.","error"); return; }
    if(jd.length>4000)    { toast("Job description too long — max 4000 characters.","error"); return; }

    setRan(true); setTab("gap"); setShowFeedback(false);
    setResults({gap:null,resume:null,cover:null,email:null});
    setErrors({gap:null,resume:null,cover:null,email:null});
    setLoading({gap:true,resume:true,cover:true,email:true});

    await Promise.allSettled([
      callAPI("gap",payload)
        .then(raw=>{ const p=parseJSON(raw); p?setR("gap",p):setE("gap","Could not parse result. Please try again."); })
        .catch(e=>{ setE("gap",e.message); if(e.message.includes("LIMIT_REACHED")){ toast("Monthly limit reached. Upgrade to Pro.","warn"); setTimeout(()=>onUpgrade(),1600); } })
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

      {/* Feature modals */}
      {showShareCard&&results.gap&&<ShareScoreCard score={score} atsScore={atsScore} skillScore={skillScore} role={role} onClose={()=>setShowShareCard(false)}/>}
      {showPDFModal&&<PDFReportModal results={results} company={company} role={role} user={user} isPro={isPro} onClose={()=>setShowPDFModal(false)} onUpgrade={onUpgrade}/>}
      {showTracker&&<JobTrackerModal user={user} onClose={()=>setShowTracker(false)} toast={toast}/>}
      {showInvite&&user&&<InviteCodeModal user={user} onClose={()=>setShowInvite(false)} onSuccess={onProfileRefresh} toast={toast}/>}

      {/* Dashboard */}
      {showDash&&user&&(
        <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,.4)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setShowDash(false)}>
          <div onClick={e=>e.stopPropagation()} className="dashboard-inner" style={{ background:C.surface, borderRadius:16, maxWidth:520, width:"100%", maxHeight:"80vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.bg }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.ink }}>My Analyses</div>
              <button onClick={()=>setShowDash(false)} style={{ fontSize:22, color:C.ink3, cursor:"pointer", lineHeight:1, minHeight:36, minWidth:36 }}>×</button>
            </div>
            <AnalysisHistory userId={user.id}/>
          </div>
        </div>
      )}

      {/* TOOL HEADER */}
      <header className="tool-header" style={{ position:"sticky", top:0, zIndex:100, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(12px,4vw,32px)", background:"rgba(249,248,246,.96)", backdropFilter:"blur(14px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Logo size="sm"/>
          <Tag color={C.sage} bg={C.sageBg}>Beta</Tag>
          {anyLoad&&<span className="inline" style={{ fontSize:12, color:C.ink3, gap:5, minHeight:"unset", minWidth:"unset" }}><Spin s={12}/>Generating…</span>}
        </div>
        <div className="tool-header-actions" style={{ display:"flex", gap:7, alignItems:"center" }}>
          <OutBtn size="sm" onClick={()=>setShowTracker(true)}>📋 Tracker</OutBtn>
          {user&&<OutBtn size="sm" onClick={()=>setShowDash(true)}>History</OutBtn>}
          {ran&&<OutBtn size="sm" onClick={()=>{ setRan(false); setResults({gap:null,resume:null,cover:null,email:null}); setErrors({gap:null,resume:null,cover:null,email:null}); setChat([]); setShowFeedback(false); }}>New</OutBtn>}
          <OutBtn size="sm" onClick={onBack}>← Home</OutBtn>
        </div>
      </header>

      <div style={{ maxWidth:820, margin:"0 auto", padding:"18px clamp(12px,4vw,24px) 80px" }}>

        {/* Progress steps */}
        <div style={{ marginBottom:16, overflowX:"auto" }}>
          <ProgressSteps current={currentStep}/>
        </div>

        {/* INPUT */}
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
                  {lifetimeLeft>0&&<div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:99, background:C.purpleBg, border:`1px solid ${C.purple}25` }}><span className="inline" style={{ fontSize:13, color:C.purple, fontWeight:600, minHeight:"unset", minWidth:"unset" }}>⚡ {lifetimeLeft} lifetime {lifetimeLeft===1?"access":"accesses"} remaining</span></div>}
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
                <Field label="Your Resume *" value={resume} onChange={setResume} placeholder={"Paste your full resume text here.\n\nInclude: name, contact, education, skills, experience, and projects."} rows={12} maxLen={8000}/>
                <Field label="Job Description *" value={jd} onChange={setJd} placeholder={"Paste the complete job description here.\n\nMore detail = more accurate results."} rows={12} accent={C.blue} maxLen={4000}/>
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

        {/* RESULTS */}
        {ran&&(
          <div style={{ animation:"slideUp .3s ease" }}>

            {/* Score card */}
            <Card flat style={{ padding:"16px 20px", marginBottom:14 }}>
              {loading.gap&&!results.gap
                ?<div style={{ display:"flex", flexDirection:"column", gap:10 }}><Skel h={24} w="38%"/><Skel h={7} r={99}/><Skel h={14} w="70%"/></div>
                :results.gap?(
                  <div>
                    <div className="score-card-inner" style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap", marginBottom:12 }}>
                      {/* Three score rings */}
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
                      {/* Action buttons */}
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

            {/* Feedback widget */}
            {showFeedback&&!anyLoad&&(
              <div style={{ marginBottom:14 }}>
                <AnalysisFeedback company={company} role={role} gapScore={results.gap?.score} userId={user?.id} onDone={()=>setShowFeedback(false)}/>
              </div>
            )}

            {/* Upgrade banner */}
            {!isPro&&ran&&!anyLoad&&(
              <div style={{ marginBottom:14, padding:"12px 16px", background:C.amberBg, borderRadius:10, border:`1px solid ${C.amber}25`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <div style={{ fontSize:13.5, color:C.amber, fontWeight:600 }}>⚡ Pro: PDF report, unlimited analyses, job tracker — ₹49/month</div>
                <Btn onClick={onUpgrade} bg={C.amber} size="sm">Upgrade now</Btn>
              </div>
            )}

            {/* TABS */}
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

            {/* GAP TAB */}
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
                    {/* Interview Guide inline */}
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

            {/* TEXT OUTPUT TABS */}
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

            {/* PROFILE OPTIMIZER TAB */}
            {tab==="profile"&&(
              <div style={{ animation:"slideUp .25s ease" }}>
                <ProfileOptimizer resume={resume} jd={jd} company={company} role={role} userId={user?.id} isPro={isPro} onUpgrade={onUpgrade}/>
              </div>
            )}

            {/* INTERVIEW TAB */}
            {tab==="interview"&&(
              <div style={{ animation:"slideUp .25s ease", display:"flex", flexDirection:"column", gap:14 }}>
                {/* Round guide */}
                <InterviewGuide role={role} company={company}/>
                {/* AI Chat */}
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
  const [analyses,setAnalyses]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{ getAnalyses(userId).then(d=>{setAnalyses(d);setLoading(false);}).catch(()=>setLoading(false)); },[userId]);
  return (
    <div style={{ flex:1, overflowY:"auto", padding:14 }}>
      {loading?[1,2,3].map(i=><div key={i} style={{ marginBottom:10 }}><Skel h={54}/></div>)
       :analyses.length===0?<div style={{ textAlign:"center", padding:"36px 16px", color:C.ink3 }}><div style={{ fontSize:28, marginBottom:8 }}>📭</div><div style={{ fontSize:14 }}>No saved analyses yet.</div></div>
       :analyses.map((a,i)=>{
         const clr=a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
         return <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 13px", borderRadius:9, border:`1px solid ${C.border}`, marginBottom:8, background:C.bg }}>
           <div style={{ width:40, height:40, borderRadius:8, background:clr+"15", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
             <span className="inline" style={{ fontSize:14, fontWeight:800, color:clr, minHeight:"unset", minWidth:"unset" }}>{a.gap_score??"?"}</span>
           </div>
           <div style={{ flex:1, minWidth:0 }}>
             <div style={{ fontSize:13.5, fontWeight:700, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.role||"Unknown role"}{a.company?` — ${a.company}`:""}</div>
             <div style={{ fontSize:11.5, color:C.ink3, marginTop:2 }}>{new Date(a.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
           </div>
           <div style={{ fontSize:12, fontWeight:700, color:clr, flexShrink:0 }}>{a.gap_score}/100</div>
         </div>;
       })}
    </div>
  );
}


/* ─── ADMIN HELPERS ──────────────────────────────────────── */
async function adminGetUsers()         { if(!sb)return[]; const{data}=await sb.from("profiles").select("id,role,plan,plan_expires_at,analyses_this_month,lifetime_accesses_remaining,created_at").order("created_at",{ascending:false}).limit(200); return data||[]; }
async function adminUpdateUser(id,upd) { if(!sb)return; await sb.from("profiles").update(upd).eq("id",id); }
async function adminGetInviteCodes()   { if(!sb)return[]; const{data}=await sb.from("invite_codes").select("*").order("created_at",{ascending:false}); return data||[]; }
async function adminCreateCode(code,limit,days,expires){ if(!sb)return null; const{data,error}=await sb.from("invite_codes").insert({code:code.trim().toUpperCase(),usage_limit:limit,access_days:days,expires_at:expires||null}).select().single(); if(error)throw new Error(error.message); return data; }
async function adminDeleteCode(id)     { if(!sb)return; await sb.from("invite_codes").delete().eq("id",id); }
async function adminGetAnalyses()      { if(!sb)return[]; const{data}=await sb.from("analyses").select("id,user_id,company,role,gap_score,ats_score,skill_score,created_at").order("created_at",{ascending:false}).limit(100); return data||[]; }
async function adminGetFeedback()      { if(!sb)return[]; const{data}=await sb.from("feedback").select("*").order("created_at",{ascending:false}).limit(100); return data||[]; }
async function adminGetPendingReviews(){ if(!sb)return[]; const{data}=await sb.from("reviews").select("*").eq("approved",false).order("created_at",{ascending:false}); return data||[]; }
async function adminApproveReview(id)  { if(!sb)return; await sb.from("reviews").update({approved:true}).eq("id",id); }
async function adminDeleteReview(id)   { if(!sb)return; await sb.from("reviews").delete().eq("id",id); }
async function adminCounts()           { if(!sb)return{}; const[u,a,r,f]=await Promise.all([sb.from("profiles").select("id,plan",{count:"exact"}),sb.from("analyses").select("id",{count:"exact"}),sb.from("reviews").select("id").eq("approved",true),sb.from("feedback").select("id",{count:"exact"})]); const plans={}; (u.data||[]).forEach(p=>{plans[p.plan||"free"]=(plans[p.plan||"free"]||0)+1;}); return{totalUsers:u.count||0,totalAnalyses:a.count||0,approvedReviews:(r.data||[]).length,totalFeedback:f.count||0,plans}; }

/* ─── ADMIN DASHBOARD ────────────────────────────────────── */
const ADMIN_PLANS = ["free","starter","pro","pro_monthly","pro_yearly","early_adopter","founding_user","beta_friend","college_basic","college_pro","premium"];

function AdminDashboard({ user, profile, onBack }) {
  const [tab, setTab]           = useState("overview");
  const [counts, setCounts]     = useState(null);
  const [users,  setUsers]      = useState([]);
  const [analyses,setAnalyses]  = useState([]);
  const [codes,  setCodes]      = useState([]);
  const [reviews,setReviews]    = useState([]);
  const [feedback,setFeedback]  = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState("");
  const [newCode, setNewCode]   = useState({ code:"", limit:1, days:30, expires:"" });
  const [codeErr, setCodeErr]   = useState("");
  const [codeSaving,setCodeSaving] = useState(false);
  const { toast, list:toastList, remove:removeToast } = useToast();

  useEffect(()=>{
    if(!["admin","founder"].includes(profile?.role)){ onBack(); return; }
    load();
  },[]);

  async function load() {
    setLoading(true);
    try {
      const [c,u,a,cd,rv,fb] = await Promise.all([
        adminCounts(), adminGetUsers(), adminGetAnalyses(),
        adminGetInviteCodes(), adminGetPendingReviews(), adminGetFeedback()
      ]);
      setCounts(c); setUsers(u); setAnalyses(a); setCodes(cd); setReviews(rv); setFeedback(fb);
    } catch(e){ toast("Load error: "+e.message,"error"); }
    setLoading(false);
  }

  async function updateUserRole(id, role) {
    await adminUpdateUser(id,{role});
    setUsers(p=>p.map(u=>u.id===id?{...u,role}:u));
    toast("Role updated ✓");
  }

  async function updateUserPlan(id, plan) {
    const expires = plan==="founding_user"||plan==="early_adopter" ? null : new Date(Date.now()+30*86400000).toISOString();
    await adminUpdateUser(id,{plan, plan_expires_at:expires});
    setUsers(p=>p.map(u=>u.id===id?{...u,plan,plan_expires_at:expires}:u));
    toast("Plan updated ✓");
  }

  async function createCode() {
    if(!newCode.code.trim()){ setCodeErr("Enter a code."); return; }
    setCodeSaving(true); setCodeErr("");
    try {
      const created = await adminCreateCode(newCode.code,newCode.limit,newCode.days,newCode.expires||null);
      setCodes(p=>[created,...p]);
      setNewCode({ code:"", limit:1, days:30, expires:"" });
      toast("Invite code created ✓");
    } catch(e){ setCodeErr(e.message); }
    setCodeSaving(false);
  }

  async function deleteCode(id) {
    if(!confirm("Delete this invite code?")) return;
    await adminDeleteCode(id);
    setCodes(p=>p.filter(c=>c.id!==id));
    toast("Code deleted.");
  }

  async function approveReview(id) {
    await adminApproveReview(id);
    setReviews(p=>p.filter(r=>r.id!==id));
    toast("Review approved ✓");
  }

  async function deleteRev(id) {
    await adminDeleteReview(id);
    setReviews(p=>p.filter(r=>r.id!==id));
    toast("Review deleted.");
  }

  const filteredUsers = users.filter(u=>
    !search || u.id?.includes(search) || u.plan?.includes(search) || u.role?.includes(search)
  );

  const TABS_ADMIN = [
    {id:"overview",  label:"Overview",   icon:"📊"},
    {id:"users",     label:"Users",      icon:"👥"},
    {id:"invites",   label:"Invite Codes",icon:"🎟️"},
    {id:"analyses",  label:"Analyses",   icon:"🔍"},
    {id:"reviews",   label:"Reviews",    icon:"⭐"},
    {id:"feedback",  label:"Feedback",   icon:"💬"},
  ];

  const planClr = {free:C.stone,starter:C.blue,pro:C.sage,pro_monthly:C.sage,pro_yearly:C.sage,founding_user:C.purple,early_adopter:C.purple,beta_friend:C.blue,premium:C.amber};

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Toasts list={toastList} remove={removeToast}/>

      {/* Header */}
      <header style={{ position:"sticky", top:0, zIndex:100, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(12px,4vw,32px)", background:"rgba(249,248,246,.97)", backdropFilter:"blur(14px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Logo size="sm"/>
          <Tag color={C.purple} bg={C.purpleBg}>Admin</Tag>
          {profile?.role==="founder"&&<Tag color={C.amber} bg={C.amberBg}>Founder</Tag>}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <OutBtn size="sm" onClick={load}>↻ Refresh</OutBtn>
          <OutBtn size="sm" onClick={onBack}>← Back to site</OutBtn>
        </div>
      </header>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px clamp(12px,4vw,24px) 80px" }}>

        {/* Tabs */}
        <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:20, overflowX:"auto" }}>
          {TABS_ADMIN.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ padding:"10px 14px", background:tab===t.id?C.surface:"transparent", border:`1px solid ${tab===t.id?C.border:"transparent"}`, borderBottom:tab===t.id?`2px solid ${C.purple}`:"1px solid transparent", borderRadius:"7px 7px 0 0", marginBottom:-1, color:tab===t.id?C.purple:C.ink3, fontWeight:tab===t.id?700:500, fontSize:13.5, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", minHeight:42, display:"flex", alignItems:"center", gap:6 }}>
              {t.icon} {t.label}
              {t.id==="reviews"&&reviews.length>0&&<span style={{ background:C.red, color:"#fff", borderRadius:99, fontSize:10, padding:"1px 6px", fontWeight:700 }}>{reviews.length}</span>}
            </button>
          ))}
        </div>

        {loading&&<div style={{ display:"flex", justifyContent:"center", padding:60 }}><Spin s={32} c={C.purple}/></div>}

        {/* OVERVIEW */}
        {!loading&&tab==="overview"&&counts&&(
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Stat cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
              {[
                {label:"Total Users",    value:counts.totalUsers,    color:C.blue,   icon:"👥"},
                {label:"Total Analyses", value:counts.totalAnalyses, color:C.sage,   icon:"🔍"},
                {label:"Reviews Live",   value:counts.approvedReviews,color:C.amber, icon:"⭐"},
                {label:"Feedback Items", value:counts.totalFeedback, color:C.stone,  icon:"💬"},
                {label:"Invite Codes",   value:codes.length,         color:C.purple, icon:"🎟️"},
                {label:"Pending Reviews",value:reviews.length,       color:C.red,    icon:"⏳"},
              ].map((s,i)=>(
                <Card key={i} style={{ padding:"16px 18px" }}>
                  <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
                  <div style={{ fontSize:28, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:12, color:C.ink3, marginTop:4, fontWeight:600 }}>{s.label}</div>
                </Card>
              ))}
            </div>

            {/* Plan breakdown */}
            <Card flat style={{ padding:"18px 20px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:14 }}>Users by plan</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.entries(counts.plans||{}).sort((a,b)=>b[1]-a[1]).map(([plan,count])=>(
                  <div key={plan} style={{ padding:"8px 14px", borderRadius:99, background:(planClr[plan]||C.stone)+"15", color:planClr[plan]||C.stone, fontSize:13, fontWeight:600 }}>
                    {planDisplayLabel(plan)}: {count}
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent analyses */}
            <Card flat style={{ overflow:"hidden" }}>
              <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:700, color:C.ink }}>Recent analyses</div>
              <div style={{ maxHeight:300, overflowY:"auto" }}>
                {analyses.slice(0,10).map((a,i)=>(
                  <div key={i} style={{ padding:"10px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12, fontSize:13 }}>
                    <div style={{ width:36, height:36, borderRadius:7, background:((a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red)+"15"), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red, flexShrink:0 }}>{a.gap_score??"-"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.role||"?"}{a.company?` @ ${a.company}`:""}</div>
                      <div style={{ fontSize:11.5, color:C.ink3 }}>{new Date(a.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                    <div style={{ fontSize:11.5, color:C.ink3, flexShrink:0 }}>ATS:{a.ats_score??"-"} · Sk:{a.skill_score??"-"}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* USERS */}
        {!loading&&tab==="users"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter by plan, role, or ID…"
                style={{ flex:1, padding:"10px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:14, color:C.ink, fontFamily:"inherit", outline:"none" }}/>
              <div style={{ fontSize:13, color:C.ink3, whiteSpace:"nowrap" }}>{filteredUsers.length} users</div>
            </div>
            <Card flat style={{ overflow:"hidden" }}>
              <div style={{ maxHeight:600, overflowY:"auto" }}>
                {filteredUsers.map((u,i)=>(
                  <div key={u.id} style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontSize:12, color:C.ink3, fontFamily:"monospace" }}>{u.id?.slice(0,18)}…</div>
                      <div style={{ fontSize:11.5, color:C.ink3, marginTop:2 }}>
                        Joined {new Date(u.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} · {u.analyses_this_month||0} analyses this month · {u.lifetime_accesses_remaining??3} lifetime left
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      {/* Plan selector */}
                      <select value={u.plan||"free"} onChange={e=>updateUserPlan(u.id,e.target.value)}
                        style={{ padding:"6px 10px", borderRadius:7, border:`1.5px solid ${(planClr[u.plan||"free"]||C.stone)}30`, background:(planClr[u.plan||"free"]||C.stone)+"12", color:planClr[u.plan||"free"]||C.stone, fontSize:12, fontWeight:600, fontFamily:"inherit", cursor:"pointer", minHeight:"unset" }}>
                        {ADMIN_PLANS.map(p=><option key={p} value={p}>{planDisplayLabel(p)}</option>)}
                      </select>
                      {/* Role selector */}
                      <select value={u.role||"user"} onChange={e=>updateUserRole(u.id,e.target.value)}
                        style={{ padding:"6px 10px", borderRadius:7, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:12, fontWeight:600, fontFamily:"inherit", cursor:"pointer", color:u.role==="founder"?C.purple:u.role==="admin"?C.blue:C.ink2, minHeight:"unset" }}>
                        {["user","admin","founder"].map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* INVITE CODES */}
        {!loading&&tab==="invites"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Create form */}
            <Card flat style={{ padding:"18px 20px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:14 }}>Create new invite code</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginBottom:12 }} className="input-grid">
                <Field label="Code" value={newCode.code} onChange={v=>setNewCode(p=>({...p,code:v.toUpperCase()}))} placeholder="BETA-XXXX" maxLen={30}/>
                <Field label="Usage limit" value={String(newCode.limit)} onChange={v=>setNewCode(p=>({...p,limit:parseInt(v)||1}))} type="number"/>
                <Field label="Access days" value={String(newCode.days)} onChange={v=>setNewCode(p=>({...p,days:parseInt(v)||30}))} type="number"/>
                <Field label="Expires (optional)" value={newCode.expires} onChange={v=>setNewCode(p=>({...p,expires:v}))} type="date" accent={C.purple}/>
              </div>
              {codeErr&&<div style={{ fontSize:13, color:C.red, marginBottom:8 }}>{codeErr}</div>}
              <Btn onClick={createCode} disabled={codeSaving} bg={C.purple} size="sm">
                {codeSaving?<><Spin s={13} c="#fff"/>Creating…</>:"+ Create code"}
              </Btn>
            </Card>

            {/* Existing codes */}
            <Card flat style={{ overflow:"hidden" }}>
              <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:700, color:C.ink }}>{codes.length} invite codes</div>
              {codes.length===0?<div style={{ padding:"32px 20px", textAlign:"center", color:C.ink3 }}>No invite codes yet.</div>
              :codes.map((c,i)=>(
                <div key={c.id} style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.purple, fontFamily:"monospace", letterSpacing:1 }}>{c.code}</div>
                    <div style={{ fontSize:12, color:C.ink3, marginTop:3 }}>
                      Used {c.used_count||0}/{c.usage_limit} · {c.access_days} days access
                      {c.expires_at?` · Expires ${new Date(c.expires_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}`:" · No expiry"}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ padding:"4px 12px", borderRadius:99, background:c.used_count>=(c.usage_limit||1)?C.redBg:C.sageBg, color:c.used_count>=(c.usage_limit||1)?C.red:C.sage, fontSize:12, fontWeight:600 }}>
                      {c.used_count>=(c.usage_limit||1)?"Exhausted":"Active"}
                    </div>
                    <button onClick={()=>{ navigator.clipboard.writeText(c.code); toast("Code copied!"); }} style={{ padding:"6px 12px", borderRadius:7, border:`1px solid ${C.border}`, background:C.surface, fontSize:12, color:C.ink2, cursor:"pointer", fontFamily:"inherit", minHeight:"unset" }}>Copy</button>
                    <button onClick={()=>deleteCode(c.id)} style={{ padding:"6px 12px", borderRadius:7, border:`1px solid ${C.red}30`, background:C.redBg, fontSize:12, color:C.red, cursor:"pointer", fontFamily:"inherit", minHeight:"unset" }}>Delete</button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ANALYSES */}
        {!loading&&tab==="analyses"&&(
          <Card flat style={{ overflow:"hidden" }}>
            <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:700, color:C.ink }}>{analyses.length} recent analyses</div>
            <div style={{ maxHeight:600, overflowY:"auto" }}>
              {analyses.map((a,i)=>{
                const clr=a.gap_score>=70?C.sage:a.gap_score>=50?C.amber:C.red;
                return(
                  <div key={a.id} style={{ padding:"11px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:8, background:clr+"15", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:clr, fontSize:15, flexShrink:0 }}>{a.gap_score??"-"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, fontWeight:600, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.role||"Unknown role"}{a.company?` @ ${a.company}`:""}</div>
                      <div style={{ fontSize:11.5, color:C.ink3, marginTop:2 }}>{new Date(a.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                    <div style={{ fontSize:12, color:C.ink3, flexShrink:0, textAlign:"right" }}>
                      <div>ATS: {a.ats_score??"-"}</div>
                      <div>Skills: {a.skill_score??"-"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* REVIEWS */}
        {!loading&&tab==="reviews"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {reviews.length===0
              ?<div style={{ padding:"48px 20px", textAlign:"center", color:C.ink3, background:C.surface, borderRadius:12, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:28, marginBottom:10 }}>✅</div>
                <div style={{ fontSize:14 }}>No pending reviews.</div>
              </div>
              :reviews.map((r,i)=>(
                <Card key={r.id} flat style={{ padding:"16px 18px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                        <div style={{ width:32, height:32, borderRadius:"50%", background:C.sageBg, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:C.sage, flexShrink:0 }}>{r.name?.[0]}</div>
                        <div>
                          <div style={{ fontSize:13.5, fontWeight:700, color:C.ink }}>{r.name}</div>
                          {r.role&&<div style={{ fontSize:12, color:C.ink3 }}>{r.role}</div>}
                        </div>
                        <Stars rating={r.rating}/>
                      </div>
                      <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.75, fontStyle:"italic" }}>"{r.text}"</p>
                      <div style={{ fontSize:11.5, color:C.ink3, marginTop:8 }}>{new Date(r.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <Btn size="sm" bg={C.sage} onClick={()=>approveReview(r.id)}>✓ Approve</Btn>
                      <OutBtn size="sm" onClick={()=>deleteRev(r.id)} style={{ color:C.red, borderColor:C.red+"30" }}>✕ Delete</OutBtn>
                    </div>
                  </div>
                </Card>
              ))
            }
          </div>
        )}

        {/* FEEDBACK */}
        {!loading&&tab==="feedback"&&(
          <Card flat style={{ overflow:"hidden" }}>
            <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, fontSize:13, fontWeight:700, color:C.ink }}>{feedback.length} feedback items</div>
            <div style={{ maxHeight:600, overflowY:"auto" }}>
              {feedback.length===0?<div style={{ padding:"32px 20px", textAlign:"center", color:C.ink3 }}>No feedback yet.</div>
              :feedback.map((f,i)=>(
                <div key={f.id} style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:f.comment?8:0 }}>
                    <span style={{ padding:"3px 10px", borderRadius:99, background:f.helpful?C.sageBg:C.redBg, color:f.helpful?C.sage:C.red, fontSize:12, fontWeight:600 }}>{f.helpful?"Helpful":"Needs work"}</span>
                    {f.role&&<span style={{ fontSize:13, color:C.ink2, fontWeight:500 }}>{f.role}{f.company?` @ ${f.company}`:""}</span>}
                    {f.gap_score&&<span style={{ fontSize:12, color:C.ink3 }}>Score: {f.gap_score}</span>}
                    <span style={{ fontSize:11.5, color:C.ink3, marginLeft:"auto" }}>{new Date(f.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>
                  </div>
                  {f.comment&&<p style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{f.comment}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}

/* ─── ROOT ───────────────────────────────────────────────── */
export default function KrackHire() {
  const [view,        setView]        = useState("landing");
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [showAuth,    setShowAuth]    = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [upgradeModal,setUpgradeModal]= useState(false);
  const [payModal,    setPayModal]    = useState(null);
  const { toast, list:toastList, remove:removeToast } = useToast();

  useEffect(()=>{
    if(!sb){ setAuthLoading(false); return; }
    sb.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user||null);
      if(session?.user) getProfile(session.user.id).then(setProfile).catch(()=>{});
      setAuthLoading(false);
    });
    const {data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user||null);
      if(session?.user) getProfile(session.user.id).then(setProfile).catch(()=>{});
      else setProfile(null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  async function handleSignOut(){ await doSignOut(); setUser(null); setProfile(null); }

  function handleUpgrade(planId) {
    setUpgradeModal(false);
    if(!planId){ setUpgradeModal(true); return; }
    if(!user){ setShowAuth(true); return; }
    const plans = { pro_monthly:{planLabel:"Pro Monthly",planAmount:"₹49/month"}, pro_yearly:{planLabel:"Pro Yearly",planAmount:"₹499/year"} };
    setPayModal({ planId, ...plans[planId] });
  }

  function handlePaymentSuccess() {
    setPayModal(null);
    toast("Payment successful! Access is now active. 🎉","success");
    if(user) getProfile(user.id).then(setProfile).catch(()=>{});
  }

  if(authLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:C.bg, gap:16 }}>
      <Logo size="lg"/>
      <Spin s={26} c={C.sage}/>
    </div>
  );

  function refreshProfile() {
    if (user) getProfile(user.id).then(setProfile).catch(()=>{});
  }

  // Admin access: navigate to /#admin or press Ctrl+Shift+A
  useEffect(()=>{
    // Check on mount
    if(window.location.hash==="#admin") setView("admin");
    function onHash() { if(window.location.hash==="#admin") setView("admin"); else if(window.location.hash===""&&view==="admin") setView("landing"); }
    function onKey(e) { if(e.ctrlKey&&e.shiftKey&&e.key==="A"){ window.location.hash="#admin"; setView("admin"); } }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return()=>{ window.removeEventListener("hashchange",onHash); window.removeEventListener("keydown",onKey); };
  },[]);

  function goAdmin() { window.location.hash="#admin"; setView("admin"); }
  function leaveAdmin() { window.location.hash=""; setView("landing"); }

  return (
    <>
      <Toasts list={toastList} remove={removeToast}/>
      {showAuth     &&<AuthModal onClose={()=>setShowAuth(false)}/>}
      {upgradeModal &&<UpgradeModal onClose={()=>setUpgradeModal(false)} onSelectPlan={handleUpgrade} user={user}/>}
      {payModal     &&<PaymentModal {...payModal} user={user} onClose={()=>setPayModal(null)} onSuccess={handlePaymentSuccess} toast={toast}/>}
      {view==="admin"
        ? <AdminDashboard user={user} profile={profile} onBack={leaveAdmin}/>
        : view==="tool"
          ? <Tool onBack={()=>setView("landing")} user={user} profile={profile} onShowAuth={()=>setShowAuth(true)} onUpgrade={handleUpgrade} onProfileRefresh={refreshProfile}/>
          : <Landing onEnter={()=>setView("tool")} user={user} profile={profile} onShowAuth={()=>setShowAuth(true)} onSignOut={handleSignOut} onUpgrade={handleUpgrade} onProfileRefresh={refreshProfile} toast={toast} onAdmin={goAdmin}/>
      }
    </>
  );
}
