import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createClient } from "@supabase/supabase-js";

/* ═══════════════════════════════════════
   SUPABASE CLIENT
═══════════════════════════════════════ */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = SUPABASE_URL && SUPABASE_ANON
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    })
  : null;

async function signInWithGoogle() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function getReviewsFromDB() {
  if (!supabase) return [];
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  return data || [];
}

async function submitReviewToDB(review) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("reviews").insert(review).select().single();
  if (error) throw error;
  return data;
}

async function getUserAnalyses(userId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from("analyses")
    .select("id, company, role, gap_score, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  return data || [];
}

/* ═══════════════════════════════════════
   SECURE API CALL
═══════════════════════════════════════ */
async function callAPI(type, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data.result;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Timed out. Please try again.");
    throw err;
  }
}

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

/* ═══════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════ */
const C = {
  bg: "#F8F7F4", surface: "#FFFFFF", ink: "#18181B",
  ink2: "#52525B", ink3: "#A1A1AA", ink4: "#E4E4E7", border: "#E4E4E7",
  green: "#16A34A", greenDark: "#15803D", greenBg: "#F0FDF4", greenMid: "#DCFCE7",
  red: "#DC2626", redBg: "#FFF5F5",
  amber: "#D97706", amberBg: "#FFFBEB",
  blue: "#2563EB", blueBg: "#EFF6FF",
  purple: "#7C3AED", purpleBg: "#F5F3FF",
};

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function ToastItem({ id, msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(() => onClose(id), 4000); return () => clearTimeout(t); }, [id, onClose]);
  const map = { success:[C.green,C.greenBg], error:[C.red,C.redBg], info:[C.blue,C.blueBg] };
  const [clr, bg] = map[type] || map.info;
  return (
    <div style={{ padding:"13px 18px", background:bg, border:`1.5px solid ${clr}30`, borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,.12)", display:"flex", alignItems:"center", gap:10, animation:"toastIn .3s ease", maxWidth:360, fontSize:14, fontWeight:500, color:clr }}>
      <span style={{ fontSize:17 }}>{type==="success"?"✓":type==="error"?"✕":"ℹ"}</span>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={()=>onClose(id)} style={{ color:clr, opacity:.5, fontSize:20, lineHeight:1 }}>×</button>
    </div>
  );
}
function ToastContainer({ toasts, onClose }) {
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", flexDirection:"column", gap:10, pointerEvents:"none" }}>
      {toasts.map(t=><div key={t.id} style={{ pointerEvents:"all" }}><ToastItem {...t} onClose={onClose}/></div>)}
    </div>
  );
}
function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type="success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(p=>[...p.slice(-4),{id,msg,type}]);
  },[]);
  const remove = useCallback((id)=>setToasts(p=>p.filter(x=>x.id!==id)),[]);
  return { toast, toasts, remove };
}

/* ═══════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════ */
const Spinner = memo(({size=18,color=C.green})=>(
  <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", border:`2px solid ${color}22`, borderTopColor:color, animation:"spin .7s linear infinite", flexShrink:0 }}/>
));

const Pill = memo(({children,color=C.green,bg,size="sm"})=>(
  <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:size==="sm"?"3px 10px":"5px 14px", borderRadius:99, background:bg||color+"15", color, fontSize:size==="sm"?12:13.5, fontWeight:600 }}>
    {children}
  </span>
));

function CopyBtn({text,color=C.green}) {
  const [ok,setOk]=useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text).catch(()=>{});setOk(true);setTimeout(()=>setOk(false),2000)}} style={{ padding:"5px 14px", borderRadius:6, border:`1.5px solid ${ok?color:C.border}`, background:ok?color:C.surface, color:ok?"#fff":C.ink2, fontSize:12.5, fontWeight:600, transition:"all .2s", cursor:"pointer" }}>{ok?"✓ Copied":"Copy"}</button>;
}

/* ═══════════════════════════════════════
   BUTTONS
═══════════════════════════════════════ */
function Btn({children,onClick,disabled,size="md",bg=C.ink,full,style:ext={}}) {
  return (
    <button onClick={onClick} disabled={disabled} className="kh-btn"
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, borderRadius:9, border:"none", background:disabled?C.ink4:bg, color:disabled?C.ink3:"#fff", fontSize:size==="lg"?16:size==="sm"?13:14.5, fontWeight:700, cursor:disabled?"not-allowed":"pointer", padding:size==="lg"?"15px 34px":size==="sm"?"7px 16px":"11px 24px", transition:"all .18s", width:full?"100%":"auto", boxShadow:disabled?"none":"0 2px 8px rgba(0,0,0,.10)", ...ext }}>
      {children}
    </button>
  );
}
function GhostBtn({children,onClick,size="md",style:ext={}}) {
  return (
    <button onClick={onClick} className="kh-ghost"
      style={{ display:"inline-flex", alignItems:"center", gap:8, borderRadius:9, border:`1.5px solid ${C.border}`, background:C.surface, color:C.ink2, fontSize:size==="sm"?13:14.5, fontWeight:600, padding:size==="sm"?"7px 16px":"11px 24px", transition:"all .18s", cursor:"pointer", ...ext }}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════
   LOGO — K with checkmark
═══════════════════════════════════════ */
const Logo = memo(({dark,size="md"})=>{
  const fs=size==="sm"?15:size==="lg"?22:18;
  const ws=size==="sm"?26:size==="lg"?38:32;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, fontWeight:700, fontSize:fs, letterSpacing:"-.4px", color:dark?"#fff":C.ink }}>
      <svg width={ws} height={ws} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#15803D"/>
        <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white"/>
        <circle cx="31" cy="31" r="7" fill="#4ADE80"/>
        <path d="M28 31L30.5 33.5L34.5 29" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Krack<span style={{ color:C.green }}>Hire</span></span>
    </div>
  );
});

/* ═══════════════════════════════════════
   CARD
═══════════════════════════════════════ */
function Card({children,style:ext={},flat}) {
  return <div className={flat?"card-flat":"kh-card"} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, boxShadow:"0 1px 3px rgba(0,0,0,.06)", transition:"all .22s", ...ext }}>{children}</div>;
}

/* ═══════════════════════════════════════
   FIELD WITH CHARACTER COUNT
═══════════════════════════════════════ */
function Field({label,value,onChange,placeholder,rows,accent=C.green,hint,maxLen}) {
  const [f,setF]=useState(false);
  const base={ padding:"12px 14px", borderRadius:9, border:`1.5px solid ${f?accent:C.border}`, background:f?C.surface:C.bg, fontSize:14, color:C.ink, transition:"all .2s", width:"100%" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label&&(
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.6, textTransform:"uppercase" }}>{label}</label>
          {maxLen&&<span style={{ fontSize:11, color:value.length>maxLen*.9?C.red:C.ink3 }}>{value.length}/{maxLen}</span>}
        </div>
      )}
      {rows?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} maxLength={maxLen} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{ ...base, lineHeight:1.75, resize:"vertical" }}/>
           :<input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLen} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>}
      {hint&&<span style={{ fontSize:12, color:C.ink3 }}>{hint}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════
   SKELETON
═══════════════════════════════════════ */
const Skel=({h=18,w="100%",r=8})=>(
  <div style={{ height:h, width:w, borderRadius:r, background:"linear-gradient(90deg,#efefef 25%,#e0e0e0 50%,#efefef 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }}/>
);

/* ═══════════════════════════════════════
   STARS
═══════════════════════════════════════ */
function Stars({rating,interactive,onChange}) {
  const [hover,setHover]=useState(0);
  return (
    <div style={{ display:"flex", gap:3 }}>
      {[1,2,3,4,5].map(n=>(
        <span key={n} onClick={()=>interactive&&onChange(n)} onMouseEnter={()=>interactive&&setHover(n)} onMouseLeave={()=>interactive&&setHover(0)}
          style={{ fontSize:20, cursor:interactive?"pointer":"default", color:n<=(hover||rating)?"#F59E0B":C.ink4, transition:"color .15s" }}>★</span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════ */
function Reveal({children,delay=0}) {
  const ref=useRef(null);
  const [vis,setVis]=useState(false);
  useEffect(()=>{
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVis(true);obs.disconnect();}},{threshold:.08});
    if(ref.current)obs.observe(ref.current);
    return()=>obs.disconnect();
  },[]);
  return <div ref={ref} style={{ opacity:vis?1:0, transform:vis?"none":"translateY(24px)", transition:`opacity .6s ${delay}s ease, transform .6s ${delay}s ease` }}>{children}</div>;
}

/* ═══════════════════════════════════════
   AUTH MODAL
═══════════════════════════════════════ */
function AuthModal({onClose}) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, borderRadius:20, padding:"40px 36px", maxWidth:420, width:"100%", textAlign:"center", boxShadow:"0 24px 48px rgba(0,0,0,.2)" }}>
        <Logo size="lg" />
        <div style={{ marginTop:28, marginBottom:10 }}>
          <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:26, lineHeight:1.2, color:C.ink, marginBottom:8 }}>Sign in to KrackHire</h2>
          <p style={{ fontSize:14, color:C.ink2, lineHeight:1.7 }}>Save your analyses, track your progress, and get unlimited access with Pro.</p>
        </div>
        <div style={{ margin:"28px 0 16px" }}>
          <Btn onClick={signInWithGoogle} full bg={C.ink} style={{ fontSize:15, padding:"14px 24px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </Btn>
        </div>
        <p style={{ fontSize:12, color:C.ink3, lineHeight:1.6 }}>By signing in you agree to our Terms of Service. Your data is processed securely and never sold.</p>
        <button onClick={onClose} style={{ marginTop:16, fontSize:13, color:C.ink3, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit" }}>Continue without account →</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   USER MENU
═══════════════════════════════════════ */
function UserMenu({user,profile,onSignOut}) {
  const [open,setOpen]=useState(false);
  const planColors={ free:C.ink3, pro:C.amber, team:C.purple };
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, cursor:"pointer", fontFamily:"inherit" }}>
        {user.user_metadata?.avatar_url
          ? <img src={user.user_metadata.avatar_url} style={{ width:26, height:26, borderRadius:"50%", objectFit:"cover" }} alt=""/>
          : <div style={{ width:26, height:26, borderRadius:"50%", background:C.green, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff" }}>{(user.user_metadata?.name||user.email||"U")[0].toUpperCase()}</div>
        }
        <span style={{ fontSize:13, fontWeight:600, color:C.ink, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {user.user_metadata?.name || user.email?.split("@")[0]}
        </span>
        {profile?.plan&&profile.plan!=="free"&&<Pill color={planColors[profile.plan]} size="sm">{profile.plan}</Pill>}
        <span style={{ fontSize:10, color:C.ink3 }}>▾</span>
      </button>
      {open&&(
        <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,.12)", minWidth:220, zIndex:500, animation:"toastIn .2s ease", overflow:"hidden" }} onClick={()=>setOpen(false)}>
          <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, background:C.bg }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:C.ink }}>{user.user_metadata?.name||"User"}</div>
            <div style={{ fontSize:12, color:C.ink3 }}>{user.email}</div>
            {profile&&(
              <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:12, color:C.ink3 }}>Plan:</span>
                <Pill color={planColors[profile.plan]||C.ink3} size="sm">{profile.plan||"free"}</Pill>
                {profile.plan==="free"&&<span style={{ fontSize:11, color:C.ink3 }}>{profile.analyses_this_month||0}/3 used</span>}
              </div>
            )}
          </div>
          {profile?.plan==="free"&&(
            <button onClick={()=>document.getElementById("pricing")?.scrollIntoView({behavior:"smooth"})} style={{ width:"100%", padding:"11px 16px", textAlign:"left", fontSize:13.5, fontWeight:600, color:C.amber, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit", borderBottom:`1px solid ${C.border}` }}>
              ⚡ Upgrade to Pro — Rs.49/mo
            </button>
          )}
          <button onClick={onSignOut} style={{ width:"100%", padding:"11px 16px", textAlign:"left", fontSize:13.5, color:C.red, cursor:"pointer", background:"none", border:"none", fontFamily:"inherit" }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   DASHBOARD (saved analyses)
═══════════════════════════════════════ */
function Dashboard({userId,onClose}) {
  const [analyses,setAnalyses]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    getUserAnalyses(userId).then(data=>{setAnalyses(data);setLoading(false);}).catch(()=>setLoading(false));
  },[userId]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,.4)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, borderRadius:18, padding:0, maxWidth:580, width:"100%", maxHeight:"80vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 48px rgba(0,0,0,.15)" }}>
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.bg }}>
          <div style={{ fontSize:17, fontWeight:700, color:C.ink }}>📊 My Analyses</div>
          <button onClick={onClose} style={{ fontSize:22, color:C.ink3, cursor:"pointer", background:"none", border:"none", lineHeight:1 }}>×</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:16 }}>
          {loading?[1,2,3].map(i=><div key={i} style={{ marginBottom:12 }}><Skel h={60}/></div>)
          :analyses.length===0
            ?<div style={{ textAlign:"center", padding:"40px 20px", color:C.ink3 }}><div style={{ fontSize:32, marginBottom:12 }}>📭</div><div style={{ fontSize:15 }}>No saved analyses yet.</div><div style={{ fontSize:13, marginTop:6 }}>Run your first analysis to see it here.</div></div>
            :analyses.map((a,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:10, border:`1px solid ${C.border}`, marginBottom:10, background:C.bg }}>
                <div style={{ width:42, height:42, borderRadius:10, background:a.gap_score>=70?C.greenBg:a.gap_score>=50?C.amberBg:C.redBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontSize:16, fontWeight:800, color:a.gap_score>=70?C.green:a.gap_score>=50?C.amber:C.red }}>{a.gap_score||"?"}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.role||"Unknown Role"} {a.company?`at ${a.company}`:""}</div>
                  <div style={{ fontSize:12, color:C.ink3, marginTop:3 }}>{new Date(a.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                </div>
                <div style={{ fontSize:11, color:C.ink3 }}>Score: <strong style={{ color:a.gap_score>=70?C.green:a.gap_score>=50?C.amber:C.red }}>{a.gap_score}/100</strong></div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   REVIEW FORM (with DB save)
═══════════════════════════════════════ */
function ReviewForm({user,onSubmit}) {
  const [name,setName]=useState(user?.user_metadata?.name||"");
  const [role,setRole]=useState("");
  const [rating,setRating]=useState(0);
  const [text,setText]=useState("");
  const [done,setDone]=useState(false);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  async function submit() {
    if(!name.trim())return setErr("Please enter your name.");
    if(rating===0)return setErr("Please select a star rating.");
    if(text.trim().length<20)return setErr("Please write at least 20 characters.");
    setErr(""); setLoading(true);
    try {
      const review={ name:name.trim(), role:role.trim()||"Job Seeker", rating, text:text.trim(), user_id:user?.id||null };
      await submitReviewToDB(review);
      onSubmit(review);
      setDone(true);
    } catch(e) {
      setErr("Failed to save. Please try again.");
    }
    setLoading(false);
  }

  if(done)return(
    <div style={{ padding:"32px", textAlign:"center" }}>
      <div style={{ fontSize:48, marginBottom:14 }}>🎉</div>
      <div style={{ fontSize:17, fontWeight:700, color:C.green, marginBottom:8 }}>Thank you!</div>
      <div style={{ fontSize:14, color:C.ink2 }}>Your review helps other freshers trust KrackHire.</div>
    </div>
  );

  return(
    <div style={{ padding:"28px 24px", display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:16, fontWeight:700 }}>Share your experience</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Your Name *" value={name} onChange={setName} placeholder="e.g. Rahul Kumar" maxLen={50}/>
        <Field label="Role / College" value={role} onChange={setRole} placeholder="e.g. CS Student, JNTU" accent={C.blue} maxLen={80}/>
      </div>
      <div>
        <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.6, textTransform:"uppercase", display:"block", marginBottom:8 }}>Rating *</label>
        <Stars rating={rating} interactive onChange={setRating}/>
      </div>
      <Field label="Your Review *" value={text} onChange={setText} placeholder="What improved? What helped? Got a call?" rows={4} maxLen={500}/>
      {err&&<div style={{ fontSize:13, color:C.red, padding:"8px 12px", background:C.redBg, borderRadius:8 }}>{err}</div>}
      <Btn onClick={submit} bg={C.green} disabled={loading}>
        {loading?<><Spinner size={16} color="#fff"/>Saving…</>:"Submit Review →"}
      </Btn>
    </div>
  );
}

/* ═══════════════════════════════════════
   STATIC DATA
═══════════════════════════════════════ */
const FEATURES=[
  {icon:"🔍",title:"Gap Analysis & Score",desc:"Hirability score /100. Exact missing skills, weak areas, strengths — for this specific job before you apply.",color:C.red,bg:C.redBg},
  {icon:"📄",title:"ATS-Optimised Resume",desc:"Your resume rewritten with keywords from the JD. Passes ATS filters. Gets in front of a human.",color:C.blue,bg:C.blueBg},
  {icon:"✉️",title:"Cover Letter",desc:"Personalised to company and role. Professional Indian English. Under 250 words. Human tone.",color:C.green,bg:C.greenBg},
  {icon:"📧",title:"Cold Email to HR",desc:"Under 150 words with subject line. Confident, specific. The kind HR managers in India actually reply to.",color:C.amber,bg:C.amberBg},
  {icon:"🎯",title:"AI Interview Coach",desc:"Live chatbot that knows your resume + JD. Real questions, scores /10, shows ideal answers.",color:C.purple,bg:C.purpleBg},
  {icon:"📐",title:"Resume Templates",desc:"3 professional templates with live preview and PDF download. Included in Pro.",color:C.green,bg:C.greenBg},
];
const HOW_STEPS=[
  {n:"01",title:"Paste your resume",desc:"Any format. Copy the full text."},
  {n:"02",title:"Paste the job description",desc:"From Naukri, LinkedIn, anywhere."},
  {n:"03",title:"AI generates everything",desc:"All 5 outputs in parallel. ~20 seconds."},
  {n:"04",title:"Apply with confidence",desc:"Send the docs. Practice. Get the call."},
];
const FAQS=[
  {q:"Is KrackHire really free?",a:"Yes — free during beta. No card. When paid plans launch, free users keep 3 analyses/month forever."},
  {q:"Do I need an account?",a:"No account needed to try it. Sign in with Google to save your analyses and track progress."},
  {q:"How fast are the results?",a:"All 5 outputs generate in parallel — typically 15-20 seconds total."},
  {q:"Does it work for non-tech jobs?",a:"Yes. Marketing, finance, HR, ops, sales — any job with a resume and JD."},
  {q:"Is my data private?",a:"Processed in real-time. Not stored permanently unless you're signed in and want to save analyses. Never sold."},
];
const SEED_REVIEWS=[
  {name:"Priya S.",role:"CS Graduate, Hyderabad",rating:5,text:"Got a TCS call within 3 days of using the tailored resume. The gap analysis showed I was missing SQL — fixed it in a week. That one change made everything different.",date:"Mar 2025"},
  {name:"Arjun K.",role:"Fresher, JNTU",rating:5,text:"Cold email to HR actually worked. The subject line was specific and under 150 words. First time HR responded to me in 4 months of applying.",date:"Feb 2025"},
  {name:"Sneha R.",role:"MBA Student, Pune",rating:4,text:"The interview coach is the best part. It asked real questions from the actual JD and scored my answers honestly.",date:"Mar 2025"},
];

/* ═══════════════════════════════════════
   LANDING PAGE
═══════════════════════════════════════ */
function Landing({onEnter,user,profile,onShowAuth,onSignOut}) {
  const [scrolled,setScrolled]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [faqOpen,setFaqOpen]=useState(null);
  const [reviews,setReviews]=useState(SEED_REVIEWS);
  const [reviewsLoaded,setReviewsLoaded]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [page,setPage]=useState(0);
  const PER=3;

  useEffect(()=>{
    const fn=()=>setScrolled(window.scrollY>10);
    window.addEventListener("scroll",fn,{passive:true});
    // Load DB reviews
    getReviewsFromDB().then(data=>{
      if(data.length>0){setReviews(p=>[...data,...SEED_REVIEWS.filter(s=>!data.find(d=>d.name===s.name))]);setReviewsLoaded(true);}
    }).catch(()=>{});
    return()=>window.removeEventListener("scroll",fn);
  },[]);

  function addReview(r){
    setReviews(p=>[r,...p]);
    setShowForm(false);
  }

  const navLinks=[["#features","Features"],["#how","How it works"],["#reviews","Reviews"],["#pricing","Pricing"],["#faq","FAQ"]];
  const visible=reviews.slice(page*PER,(page+1)*PER);
  const totalPages=Math.ceil(reviews.length/PER);
  const avg=(reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1);

  return(
    <div style={{ minHeight:"100vh", background:C.bg }}>
      {/* ANNOUNCEMENT */}
      <div style={{ background:C.greenDark, color:"#fff", textAlign:"center", padding:"10px 16px", fontSize:13.5, fontWeight:500 }}>
        🎉 KrackHire is in <strong>free beta</strong> — {user?"welcome back "+user.user_metadata?.name?.split(" ")[0]+"! 👋":"no account or card needed."}{" "}
        <button onClick={onEnter} style={{ color:C.greenMid, fontWeight:700, textDecoration:"underline", cursor:"pointer", background:"none", border:"none", fontSize:13.5, fontFamily:"inherit" }}>Try it now →</button>
      </div>

      {/* NAV */}
      <nav style={{ position:"sticky", top:0, zIndex:200, height:60, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(16px,5vw,56px)", background:scrolled?"rgba(248,247,244,.95)":"transparent", backdropFilter:"blur(16px)", borderBottom:`1px solid ${scrolled?C.border:"transparent"}`, transition:"all .3s" }}>
        <Logo/>
        <div style={{ display:"flex", gap:2 }} className="desktop-nav">
          {navLinks.map(([h,l])=>(
            <a key={l} href={h} style={{ padding:"6px 13px", borderRadius:8, fontSize:14, fontWeight:500, color:C.ink2, transition:"all .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.color=C.ink;e.currentTarget.style.background=C.surface;}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.ink2;e.currentTarget.style.background="transparent";}}>{l}</a>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {user
            ?<UserMenu user={user} profile={profile} onSignOut={onSignOut}/>
            :<><Btn onClick={onShowAuth} size="sm" bg={C.surface} style={{ color:C.ink, border:`1.5px solid ${C.border}`, boxShadow:"none" }}>Sign in</Btn>
               <Btn onClick={onEnter} size="sm">Try free →</Btn></>
          }
          <button className="mobile-menu-btn" onClick={()=>setMenuOpen(!menuOpen)} style={{ display:"none", padding:8, borderRadius:8, color:C.ink2, fontSize:22, lineHeight:1 }}>{menuOpen?"✕":"☰"}</button>
        </div>
      </nav>

      {menuOpen&&(
        <div style={{ position:"fixed", top:110, left:0, right:0, zIndex:199, background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"16px 20px", display:"flex", flexDirection:"column", gap:4, animation:"toastIn .2s ease", boxShadow:"0 8px 24px rgba(0,0,0,.08)" }}>
          {navLinks.map(([h,l])=><a key={l} href={h} onClick={()=>setMenuOpen(false)} style={{ padding:"12px 16px", borderRadius:8, fontSize:15, fontWeight:500, color:C.ink2 }}>{l}</a>)}
          <div style={{ paddingTop:12, borderTop:`1px solid ${C.border}`, marginTop:8, display:"flex", flexDirection:"column", gap:8 }}>
            {!user&&<Btn onClick={()=>{setMenuOpen(false);onShowAuth();}} full bg={C.surface} style={{ color:C.ink, border:`1.5px solid ${C.border}`, boxShadow:"none" }}>Sign in with Google</Btn>}
            <Btn onClick={()=>{setMenuOpen(false);onEnter();}} full>Try it free →</Btn>
          </div>
        </div>
      )}

      {/* HERO */}
      <section style={{ maxWidth:1120, margin:"0 auto", padding:"clamp(64px,10vw,120px) clamp(16px,5vw,56px)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"clamp(32px,6vw,80px)", alignItems:"center" }} className="hero-grid">
        <div>
          <div style={{ marginBottom:20, animation:"fadeUp .55s ease" }}><Pill color={C.green} bg={C.greenBg} size="md">🚀 Free beta — no account or card needed</Pill></div>
          <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(36px,4.5vw,58px)", lineHeight:1.08, letterSpacing:"-.5px", marginBottom:20, animation:"fadeUp .55s .08s ease both" }}>
            Know why you'll get<br/>rejected —{" "}<em style={{ fontStyle:"italic", color:C.green }}>before you apply.</em>
          </h1>
          <p style={{ fontSize:"clamp(15px,1.8vw,17px)", color:C.ink2, lineHeight:1.8, marginBottom:36, maxWidth:460, animation:"fadeUp .55s .16s ease both" }}>
            Paste your resume + job description. Get gap analysis, ATS resume, cover letter, cold email, and interview coach — <strong style={{ color:C.ink }}>in 20 seconds.</strong>
          </p>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:28, animation:"fadeUp .55s .24s ease both" }}>
            <Btn onClick={onEnter} size="lg">Try it free — no signup →</Btn>
            {!user&&<GhostBtn onClick={onShowAuth}>Sign in with Google</GhostBtn>}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:18, animation:"fadeUp .55s .32s ease both" }}>
            {["Free in beta","No account","No credit card","Built for India 🇮🇳"].map(t=>(
              <span key={t} style={{ fontSize:13, color:C.ink3, display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ color:C.green, fontWeight:700 }}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>
        {/* Hero visual */}
        <div style={{ position:"relative", animation:"float 5s ease-in-out infinite" }} className="hide-mobile">
          <Card flat style={{ overflow:"hidden" }}>
            <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:"11px 16px", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", gap:5 }}>{["#FF5F56","#FFBD2E","#27C93F"].map(c=><div key={c} style={{ width:11, height:11, borderRadius:"50%", background:c }}/>)}</div>
              <span style={{ fontSize:12, fontWeight:600, color:C.ink3 }}>krackhire.vercel.app — Gap Analysis</span>
            </div>
            <div style={{ padding:"20px 20px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:12, color:C.ink3, fontWeight:700, textTransform:"uppercase", letterSpacing:.6 }}>Hirability Score</span>
                <span style={{ fontSize:30, fontWeight:800, color:C.green, letterSpacing:-1 }}>72<span style={{ fontSize:14, color:C.ink3, fontWeight:400 }}>/100</span></span>
              </div>
              <div style={{ height:7, background:C.bg, borderRadius:99, marginBottom:18, overflow:"hidden" }}>
                <div style={{ width:"72%", height:"100%", background:`linear-gradient(90deg,${C.green},#4ADE80)`, borderRadius:99 }}/>
              </div>
              {[
                {t:"red",i:"✗",title:"Missing: SQL basics",sub:"Found in 4/5 similar JDs."},
                {t:"amber",i:"△",title:"Weak: Project descriptions",sub:"'40% faster' > 'built feature'."},
                {t:"green",i:"✓",title:"Strong: Sales Ops background",sub:"Rare in tech. Lead with this."},
              ].map((g,i)=>{
                const m={red:[C.red,C.redBg],amber:[C.amber,C.amberBg],green:[C.green,C.greenBg]};
                const[clr,bg]=m[g.t];
                return(
                  <div key={i} style={{ display:"flex", gap:10, padding:"9px 12px", background:bg, borderRadius:8, borderLeft:`3px solid ${clr}`, marginBottom:8 }}>
                    <span style={{ color:clr, fontWeight:800, fontSize:13 }}>{g.i}</span>
                    <div><div style={{ fontSize:12.5, fontWeight:700, color:clr }}>{g.title}</div><div style={{ fontSize:11.5, color:C.ink2, marginTop:2 }}>{g.sub}</div></div>
                  </div>
                );
              })}
            </div>
          </Card>
          <div style={{ position:"absolute", bottom:-14, left:-16, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", boxShadow:"0 8px 24px rgba(0,0,0,.10)", display:"flex", alignItems:"center", gap:10, animation:"float 6s ease-in-out 1.2s infinite" }}>
            <span style={{ fontSize:22 }}>📄</span>
            <div><div style={{ fontSize:12.5, fontWeight:700, color:C.ink }}>Resume generated</div><div style={{ fontSize:11.5, color:C.ink3 }}>ATS-optimised · 20 seconds</div></div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div style={{ overflow:"hidden", borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, background:C.surface, padding:"13px 0" }}>
        <div style={{ display:"flex", width:"max-content", animation:"ticker 22s linear infinite" }}>
          {[...Array(2)].map((_,ri)=>["Gap Analysis","ATS Resume","Cover Letter","Cold Email to HR","Interview Coach","Save Analyses","India-First","20 Seconds"].map((item,i)=>(
            <span key={`${ri}-${i}`} style={{ padding:"0 28px", fontSize:13, fontWeight:600, color:C.ink3, letterSpacing:.5, display:"flex", alignItems:"center", gap:20, whiteSpace:"nowrap" }}>{item} <span style={{ color:C.green, fontSize:10 }}>◆</span></span>
          )))}
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" style={{ padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:48 }}>
              <Pill>What you get</Pill>
              <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 12px" }}>Six tools. One click.</h2>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:440, margin:"0 auto", lineHeight:1.75 }}>Everything to go from "no replies" to "interview scheduled" — in 20 seconds.</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:14 }}>
              {FEATURES.map((f,i)=>(
                <Card key={i} style={{ padding:"26px 22px" }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:f.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:18 }}>{f.icon}</div>
                  <div style={{ fontSize:15.5, fontWeight:700, marginBottom:8 }}>{f.title}</div>
                  <div style={{ fontSize:13.5, color:C.ink2, lineHeight:1.75 }}>{f.desc}</div>
                </Card>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:48 }}>
              <Pill color={C.blue} bg={C.blueBg}>How it works</Pill>
              <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 12px" }}>Four steps. 20 seconds.</h2>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }} className="how-grid">
              {HOW_STEPS.map((s,i)=>(
                <div key={i} style={{ padding:"28px 22px", borderRight:i<3?`1px solid ${C.border}`:"none", background:C.surface, transition:"background .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                  onMouseLeave={e=>e.currentTarget.style.background=C.surface}>
                  <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:42, color:C.ink4, lineHeight:1, marginBottom:14 }}>{s.n}</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>{s.title}</div>
                  <div style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign:"center", marginTop:36 }}><Btn onClick={onEnter} size="lg">Try it now — free →</Btn></div>
          </Reveal>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:44, flexWrap:"wrap", gap:16 }}>
              <div>
                <Pill color={C.purple} bg={C.purpleBg}>Reviews</Pill>
                <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 8px" }}>What freshers say.</h2>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Stars rating={Math.round(parseFloat(avg))}/>
                  <span style={{ fontSize:15, fontWeight:700 }}>{avg}</span>
                  <span style={{ fontSize:14, color:C.ink3 }}>({reviews.length} reviews)</span>
                  {reviewsLoaded&&<Pill color={C.green} bg={C.greenBg} size="sm">✓ Verified</Pill>}
                </div>
              </div>
              <Btn onClick={()=>{ if(!user){onShowAuth();return;} setShowForm(!showForm); }} bg={C.purple}>
                {showForm?"✕ Cancel":"✍ Write a Review"}
              </Btn>
            </div>
            {showForm&&(
              <Card flat style={{ marginBottom:28, border:`1.5px solid ${C.purple}30`, overflow:"hidden" }}>
                <ReviewForm user={user} onSubmit={addReview}/>
              </Card>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }} className="reviews-grid">
              {visible.map((r,i)=>(
                <Card key={i} style={{ padding:"22px 20px" }}>
                  <Stars rating={r.rating}/>
                  <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.75, margin:"12px 0 16px", fontStyle:"italic" }}>"{r.text}"</p>
                  <div style={{ display:"flex", alignItems:"center", gap:10, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${C.green},#4ADE80)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff", flexShrink:0 }}>{r.name[0]}</div>
                    <div>
                      <div style={{ fontSize:13.5, fontWeight:700 }}>{r.name}</div>
                      <div style={{ fontSize:12, color:C.ink3 }}>{r.role} · {r.date||new Date(r.created_at||Date.now()).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {totalPages>1&&(
              <div style={{ display:"flex", justifyContent:"center", gap:8 }}>
                <GhostBtn onClick={()=>setPage(p=>Math.max(0,p-1))} size="sm" style={{ opacity:page===0?.4:1 }}>← Prev</GhostBtn>
                {Array.from({length:totalPages}).map((_,i)=>(
                  <button key={i} onClick={()=>setPage(i)} style={{ width:36, height:36, borderRadius:8, border:`1.5px solid ${page===i?C.green:C.border}`, background:page===i?C.green:C.surface, color:page===i?"#fff":C.ink2, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>{i+1}</button>
                ))}
                <GhostBtn onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} size="sm" style={{ opacity:page===totalPages-1?.4:1 }}>Next →</GhostBtn>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:880, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:48 }}>
              <Pill>Pricing</Pill>
              <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 12px" }}>Honest pricing. No tricks.</h2>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:420, margin:"0 auto", lineHeight:1.75 }}>Free while in beta. When paid plans launch, free users keep 3 analyses/month.</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }} className="pricing-grid">
              {[
                {name:"Free",price:"Rs.0",period:"forever",cta:"Start free →",ctaBg:C.ink,badge:null,
                 features:["3 analyses/month","Gap analysis + score","Basic resume rewrite",{dim:"Cover letter"},{dim:"Cold email"},{dim:"Interview coach"},{dim:"Save analyses"},{dim:"Resume templates"}]},
                {name:"Pro",price:"Rs.49",period:"per month",cta:"Get Pro →",ctaBg:C.green,badge:"Most popular",
                 features:["Unlimited analyses","Full gap analysis","ATS resume rewrite","Cover letter","Cold email to HR","AI interview coach","Save all analyses","3 resume templates + PDF"]},
                {name:"College / Team",price:"Rs.999",period:"per month",cta:"Contact us →",ctaBg:C.ink,badge:null,
                 features:["Up to 30 students","Everything in Pro","Placement dashboard","Bulk applications","Progress tracking","Priority support"]},
              ].map((plan,i)=>(
                <div key={i} style={{ position:"relative" }}>
                  {plan.badge&&<div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"#fff", fontSize:11, fontWeight:700, padding:"4px 14px", borderRadius:99, whiteSpace:"nowrap" }}>{plan.badge}</div>}
                  <Card flat style={{ padding:"28px 22px", border:plan.badge?`1.5px solid ${C.ink}`:`1px solid ${C.border}`, boxShadow:plan.badge?"0 8px 24px rgba(0,0,0,.10)":undefined }}>
                    <div style={{ fontSize:11.5, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.8, marginBottom:16 }}>{plan.name}</div>
                    <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:48, lineHeight:1, color:C.ink, marginBottom:4 }}>{plan.price}</div>
                    <div style={{ fontSize:13, color:C.ink3, marginBottom:24 }}>{plan.period}</div>
                    <Btn onClick={onEnter} full bg={plan.ctaBg} style={{ marginBottom:24 }}>{plan.cta}</Btn>
                    <div style={{ height:1, background:C.border, marginBottom:20 }}/>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {plan.features.map((f,j)=>{const dim=typeof f==="object";return<div key={j} style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, color:dim?C.ink4:C.ink2 }}><span style={{ color:dim?C.ink4:C.green, fontWeight:700, flexShrink:0 }}>{dim?"—":"✓"}</span>{dim?f.dim:f}</div>;})}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
            <p style={{ textAlign:"center", fontSize:13, color:C.ink3, marginTop:20 }}>Payments via Razorpay — UPI, debit/credit cards. Cancel anytime.</p>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.8fr", gap:"clamp(32px,6vw,80px)" }} className="faq-grid">
              <div>
                <Pill>FAQ</Pill>
                <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(24px,3vw,36px)", lineHeight:1.2, margin:"14px 0 14px" }}>Questions?</h2>
                <p style={{ fontSize:15, color:C.ink2, lineHeight:1.75, marginBottom:24 }}>We're early-stage and improving daily.</p>
                <GhostBtn onClick={()=>{}}>✉ hello@krackhire.in</GhostBtn>
              </div>
              <div>
                {FAQS.map((f,i)=>(
                  <div key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                    <button onClick={()=>setFaqOpen(faqOpen===i?null:i)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 0", background:"none", border:"none", cursor:"pointer", fontSize:15, fontWeight:600, color:C.ink, fontFamily:"inherit", textAlign:"left", gap:16 }}>
                      <span>{f.q}</span>
                      <span style={{ fontSize:20, color:C.ink3, transform:faqOpen===i?"rotate(45deg)":"none", transition:"transform .28s", flexShrink:0 }}>+</span>
                    </button>
                    <div style={{ overflow:"hidden", maxHeight:faqOpen===i?300:0, transition:"max-height .38s ease" }}>
                      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.8, paddingBottom:20 }}>{f.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background:`linear-gradient(180deg,${C.bg} 0%,${C.greenBg} 100%)`, borderTop:`1px solid ${C.border}`, padding:"100px clamp(16px,5vw,56px)", textAlign:"center" }}>
        <Reveal>
          <Pill color={C.green} bg={C.greenMid} size="md">🎉 Free while in beta</Pill>
          <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(30px,4.5vw,52px)", lineHeight:1.1, letterSpacing:"-.3px", margin:"18px 0 16px" }}>
            Stop guessing.<br/><em style={{ fontStyle:"italic", color:C.green }}>Start getting interviews.</em>
          </h2>
          <p style={{ fontSize:17, color:C.ink2, marginBottom:40, lineHeight:1.75, maxWidth:480, margin:"0 auto 40px" }}>No signup. No card. Paste your resume and go.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <Btn onClick={onEnter} size="lg">Open KrackHire — it's free →</Btn>
            {!user&&<GhostBtn onClick={onShowAuth} size="lg">Sign in with Google</GhostBtn>}
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{ background:C.ink, color:"#fff", padding:"56px clamp(16px,5vw,56px) 32px" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:48, paddingBottom:40, borderBottom:"1px solid #27272A" }} className="footer-grid">
            <div>
              <Logo dark/>
              <p style={{ fontSize:13.5, color:"#71717A", lineHeight:1.75, marginTop:12, maxWidth:260 }}>India's AI job readiness platform. Built for freshers who are done getting ghosted.</p>
              <p style={{ fontSize:12, color:"#52525B", marginTop:10 }}>Made with ♥ in Hyderabad, India</p>
              <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                {["Twitter","LinkedIn","Instagram"].map(s=><a key={s} href="#" style={{ fontSize:12, color:"#52525B", padding:"4px 10px", borderRadius:6, border:"1px solid #27272A" }}>{s}</a>)}
              </div>
            </div>
            {[
              {title:"Product",links:["Features","How it works","Pricing","Changelog"]},
              {title:"Company",links:["About","Blog","Careers","Contact"]},
              {title:"Legal",links:["Privacy Policy","Terms of Service","Refund Policy"]},
            ].map(col=>(
              <div key={col.title}>
                <div style={{ fontSize:11, fontWeight:700, color:"#71717A", textTransform:"uppercase", letterSpacing:.8, marginBottom:16 }}>{col.title}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {col.links.map(l=><a key={l} href="#" style={{ fontSize:13.5, color:"#71717A" }}>{l}</a>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop:24, display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:12, fontSize:12.5, color:"#52525B" }}>
            <span>© 2025 KrackHire. All rights reserved.</span>
            <span>Beta — improving daily.</span>
          </div>
        </div>
      </footer>

      {/* Mobile sticky CTA */}
      <div className="mobile-cta" style={{ display:"none", position:"fixed", bottom:0, left:0, right:0, zIndex:198, padding:"12px 16px", background:"rgba(248,247,244,.97)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.border}`, alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div><div style={{ fontSize:13, fontWeight:700 }}>KrackHire</div><div style={{ fontSize:11.5, color:C.ink3 }}>Free AI job tool for Indian freshers</div></div>
        <Btn onClick={onEnter} size="sm">Try free →</Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TOOL
═══════════════════════════════════════ */
const TABS=[
  {id:"gap",label:"Gap Analysis",icon:"🔍",color:C.red},
  {id:"resume",label:"Resume",icon:"📄",color:C.blue},
  {id:"cover",label:"Cover Letter",icon:"✉️",color:C.green},
  {id:"email",label:"Cold Email",icon:"📧",color:C.amber},
  {id:"interview",label:"Interview Coach",icon:"🎯",color:C.purple},
];

function Tool({onBack,user,profile}) {
  const {toast,toasts,remove}=useToast();
  const [resume,setResume]=useState("");
  const [jd,setJd]=useState("");
  const [company,setCompany]=useState("");
  const [role,setRole]=useState("");
  const [ran,setRan]=useState(false);
  const [tab,setTab]=useState("gap");
  const [results,setResults]=useState({gap:null,resume:null,cover:null,email:null});
  const [loading,setLoading]=useState({gap:false,resume:false,cover:false,email:false});
  const [errors,setErrors]=useState({gap:null,resume:null,cover:null,email:null});
  const [chat,setChat]=useState([]);
  const [chatMsg,setChatMsg]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [showDash,setShowDash]=useState(false);
  const chatEnd=useRef(null);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[chat]);

  const payload=useMemo(()=>({resume,jd,company,role,userId:user?.id||null}),[resume,jd,company,role,user]);
  const setL=useCallback((k,v)=>setLoading(p=>({...p,[k]:v})),[]);
  const setR=useCallback((k,v)=>setResults(p=>({...p,[k]:v})),[]);
  const setE=useCallback((k,v)=>setErrors(p=>({...p,[k]:v})),[]);

  const isPro=profile?.plan==="pro"||profile?.plan==="team";

  async function analyse() {
    if(!resume.trim()||!jd.trim()){toast("Please fill in both fields.","error");return;}
    if(resume.length>8000){toast("Resume too long. Max 8000 characters.","error");return;}
    if(jd.length>4000){toast("Job description too long. Max 4000 characters.","error");return;}

    setRan(true);setTab("gap");
    setResults({gap:null,resume:null,cover:null,email:null});
    setErrors({gap:null,resume:null,cover:null,email:null});
    setLoading({gap:true,resume:true,cover:true,email:true});

    await Promise.allSettled([
      callAPI("gap",payload)
        .then(raw=>{const p=parseJSON(raw);p?setR("gap",p):setE("gap","Parse error. Try again.");})
        .catch(e=>{setE("gap",e.message);if(e.message.includes("LIMIT_REACHED"))toast("Monthly limit reached. Upgrade to Pro for unlimited analyses.","error");})
        .finally(()=>setL("gap",false)),
      callAPI("resume",payload).then(r=>setR("resume",r)).catch(e=>setE("resume",e.message)).finally(()=>setL("resume",false)),
      callAPI("cover",payload).then(r=>setR("cover",r)).catch(e=>setE("cover",e.message)).finally(()=>setL("cover",false)),
      callAPI("email",payload).then(r=>setR("email",r)).catch(e=>setE("email",e.message)).finally(()=>setL("email",false)),
    ]);

    setChat([{role:"ai",text:`Hi! I'm your interview coach for **${role||"this role"}**${company?` at **${company}**`:""}.

I've read your resume and the JD. I'll ask real interview questions, score your answers /10, and show ideal responses.

Type **"start"** when ready, or ask me anything about the role first.`}]);
  }

  async function retryTab(t) {
    setE(t,null);setL(t,true);
    try {
      if(t==="gap"){const raw=await callAPI("gap",payload);const p=parseJSON(raw);p?setR("gap",p):setE("gap","Parse error.");}
      else{const r=await callAPI(t,payload);setR(t,r);}
      toast(`${t} ready ✓`,"success");
    } catch(e){setE(t,e.message);toast(e.message,"error");}
    setL(t,false);
  }

  async function sendChat() {
    if(!chatMsg.trim()||chatBusy)return;
    const userMsg=chatMsg.trim();setChatMsg("");
    const updated=[...chat,{role:"user",text:userMsg}];
    setChat(updated);setChatBusy(true);
    try {
      const messages=updated.slice(-12).map(m=>({role:m.role==="user"?"user":"assistant",content:m.text}));
      const reply=await callAPI("interview",{...payload,messages});
      setChat(c=>[...c,{role:"ai",text:reply}]);
    } catch(e){setChat(c=>[...c,{role:"ai",text:"Something went wrong. Try again."}]);toast(e.message,"error");}
    setChatBusy(false);
  }

  const score=results.gap?.score??0;
  const scoreClr=score>=70?C.green:score>=50?C.amber:C.red;
  const anyLoad=Object.values(loading).some(Boolean);

  return(
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <ToastContainer toasts={toasts} onClose={remove}/>
      {showDash&&user&&<Dashboard userId={user.id} onClose={()=>setShowDash(false)}/>}

      <header style={{ position:"sticky", top:0, zIndex:100, height:56, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(12px,4vw,40px)", background:"rgba(248,247,244,.95)", backdropFilter:"blur(16px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Logo size="sm"/>
          <Pill color={C.green} bg={C.greenBg}>Beta</Pill>
          {anyLoad&&<span style={{ fontSize:12.5, color:C.ink3, display:"flex", alignItems:"center", gap:6 }}><Spinner size={13}/>Generating…</span>}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {user&&<GhostBtn size="sm" onClick={()=>setShowDash(true)}>📊 My Analyses</GhostBtn>}
          {ran&&<GhostBtn size="sm" onClick={()=>{setRan(false);setResults({gap:null,resume:null,cover:null,email:null});setErrors({gap:null,resume:null,cover:null,email:null});setChat([]);}}>New analysis</GhostBtn>}
          <GhostBtn size="sm" onClick={onBack}>← Home</GhostBtn>
        </div>
      </header>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"28px clamp(12px,4vw,32px) 80px" }}>

        {!ran&&(
          <div style={{ animation:"toastIn .35s ease" }}>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,4vw,42px)", lineHeight:1.15, letterSpacing:"-.3px", marginBottom:12 }}>Paste. Click. Get everything.</h1>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:460, margin:"0 auto", lineHeight:1.75 }}>All 5 outputs generate together in ~20 seconds.</p>
              {user&&profile?.plan==="free"&&(
                <div style={{ marginTop:14, display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:99, background:C.amberBg, border:`1px solid ${C.amber}30` }}>
                  <span style={{ fontSize:13, color:C.amber, fontWeight:600 }}>{profile.analyses_this_month||0}/3 free analyses used this month</span>
                  <button onClick={()=>document.getElementById("pricing")?.scrollIntoView({behavior:"smooth"})} style={{ fontSize:12, color:C.amber, fontWeight:700, textDecoration:"underline", cursor:"pointer", background:"none", border:"none", fontFamily:"inherit" }}>Upgrade →</button>
                </div>
              )}
            </div>
            <Card flat style={{ padding:"clamp(18px,4vw,32px)" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }} className="input-grid">
                <Field label="Company (optional)" value={company} onChange={setCompany} placeholder="e.g. Infosys, Swiggy…" hint="Personalises cover letter and email." maxLen={100}/>
                <Field label="Role (optional)" value={role} onChange={setRole} placeholder="e.g. Python Developer…" accent={C.blue} hint="Helps interview coach prep role-specific questions." maxLen={100}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }} className="input-grid">
                <Field label="Your Resume *" value={resume} onChange={setResume} placeholder={"Paste your full resume here.\n\nName, contact, education, skills, experience, projects."} rows={12} maxLen={8000}/>
                <Field label="Job Description *" value={jd} onChange={setJd} placeholder={"Paste the full job description here.\n\nMore detail = better outputs."} rows={12} accent={C.blue} maxLen={4000}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                <div style={{ fontSize:13, color:C.ink3, lineHeight:1.7 }}>
                  <div>~20 seconds · All 5 in parallel · Groq + Llama 3.3</div>
                  {user?<div>✓ Signed in — analyses will be saved</div>:<div>Sign in to save your analyses</div>}
                </div>
                <Btn onClick={analyse} size="lg" disabled={!resume.trim()||!jd.trim()}>
                  {!resume.trim()||!jd.trim()?"Fill both fields ↑":"⚡ Analyse & Generate All →"}
                </Btn>
              </div>
            </Card>
          </div>
        )}

        {ran&&(
          <div style={{ animation:"toastIn .35s ease" }}>
            {/* Score card */}
            <Card flat style={{ padding:"20px 24px", marginBottom:20 }}>
              {loading.gap&&!results.gap
                ?<div style={{ display:"flex", flexDirection:"column", gap:10 }}><Skel h={28} w="40%"/><Skel h={8} r={99}/><Skel h={18} w="80%"/></div>
                :results.gap
                  ?<div style={{ display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
                     <div style={{ textAlign:"center", minWidth:60 }}>
                       <div style={{ fontSize:50, fontWeight:800, color:scoreClr, lineHeight:1, letterSpacing:-2 }}>{score}</div>
                       <div style={{ fontSize:11, color:C.ink3, fontWeight:700, textTransform:"uppercase", letterSpacing:.6 }}>/100</div>
                     </div>
                     <div style={{ flex:1, minWidth:180 }}>
                       <div style={{ fontSize:11, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.6, marginBottom:8 }}>Hirability Score</div>
                       <div style={{ height:7, background:C.bg, borderRadius:99, marginBottom:12, overflow:"hidden" }}>
                         <div style={{ width:`${score}%`, height:"100%", background:`linear-gradient(90deg,${scoreClr},${scoreClr}88)`, borderRadius:99, transition:"width 1.2s ease" }}/>
                       </div>
                       <div style={{ fontSize:14, color:C.ink2, lineHeight:1.65 }}>{results.gap.summary}</div>
                     </div>
                     <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12.5 }}>
                       <span style={{ color:C.red, fontWeight:600 }}>✗ {results.gap.missing?.length||0} critical gaps</span>
                       <span style={{ color:C.amber, fontWeight:600 }}>△ {results.gap.weak?.length||0} weak areas</span>
                       <span style={{ color:C.green, fontWeight:600 }}>✓ {results.gap.strong?.length||0} strengths</span>
                     </div>
                   </div>
                  :errors.gap
                    ?<div style={{ display:"flex", alignItems:"center", gap:12 }}>
                       <span style={{ fontSize:20 }}>⚠️</span>
                       <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:600, color:C.red, marginBottom:4 }}>Gap analysis failed</div><div style={{ fontSize:12.5, color:C.ink2 }}>{errors.gap}</div></div>
                       <GhostBtn size="sm" onClick={()=>retryTab("gap")}>Retry</GhostBtn>
                     </div>
                    :null
              }
            </Card>

            {/* Tabs */}
            <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:20, overflowX:"auto" }}>
              {TABS.map(t=>{
                const hasErr=errors[t.id]&&t.id!=="interview";
                const isDone=results[t.id]&&!loading[t.id];
                return(
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    style={{ padding:"11px 16px", background:tab===t.id?C.surface:"transparent", border:`1px solid ${tab===t.id?C.border:"transparent"}`, borderBottom:tab===t.id?`2px solid ${t.color}`:"1px solid transparent", borderRadius:"8px 8px 0 0", marginBottom:-1, color:tab===t.id?t.color:C.ink3, fontWeight:tab===t.id?700:500, fontSize:13.5, cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, fontFamily:"inherit" }}>
                    {t.icon} {t.label}
                    {loading[t.id]&&<Spinner size={12} color={t.color}/>}
                    {hasErr&&<span style={{ color:C.red, fontSize:12 }}>⚠</span>}
                    {isDone&&t.id!=="interview"&&<span style={{ color:C.green, fontSize:10 }}>●</span>}
                  </button>
                );
              })}
            </div>

            {/* GAP */}
            {tab==="gap"&&(
              <div style={{ animation:"toastIn .3s ease" }}>
                {loading.gap&&!results.gap&&<Card flat style={{ padding:24 }}><div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20 }}><Spinner color={C.red}/><span style={{ color:C.ink2, fontSize:14 }}>Analysing gaps…</span></div>{[80,65,75].map((w,i)=><div key={i} style={{ marginBottom:8 }}><Skel h={52} w={`${w}%`}/></div>)}</Card>}
                {errors.gap&&<Card flat style={{ padding:24, background:C.redBg }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div><div style={{ fontSize:14, fontWeight:700, color:C.red, marginBottom:6 }}>Gap analysis failed</div><div style={{ fontSize:13, color:C.ink2 }}>{errors.gap}</div></div><GhostBtn size="sm" onClick={()=>retryTab("gap")}>Retry</GhostBtn></div></Card>}
                {results.gap&&(
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    {[
                      {key:"missing",label:"Critical Gaps — fix before applying",color:C.red,bg:C.redBg,icon:"✗"},
                      {key:"weak",label:"Weak Areas — improve to stand out",color:C.amber,bg:C.amberBg,icon:"△"},
                      {key:"strong",label:"Your Strengths — push these hard",color:C.green,bg:C.greenBg,icon:"✓"},
                    ].filter(s=>results.gap[s.key]?.length>0).map(section=>(
                      <Card flat key={section.key} style={{ overflow:"hidden" }}>
                        <div style={{ padding:"12px 20px", background:section.bg, borderBottom:`1px solid ${section.color}20` }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:section.color, textTransform:"uppercase", letterSpacing:.7 }}>{section.label}</span>
                        </div>
                        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:10 }}>
                          {results.gap[section.key].map((item,i)=>(
                            <div key={i} style={{ display:"flex", gap:12, padding:"12px 14px", background:section.bg, borderRadius:9, borderLeft:`3px solid ${section.color}` }}>
                              <span style={{ color:section.color, fontWeight:800, fontSize:15, flexShrink:0, marginTop:1 }}>{section.icon}</span>
                              <div><div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:4 }}>{item.title}</div><div style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{item.detail}</div></div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TEXT OUTPUTS */}
            {["resume","cover","email"].includes(tab)&&(
              <div style={{ animation:"toastIn .3s ease" }}>
                {loading[tab]&&!results[tab]&&<Card flat style={{ padding:24 }}><div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20 }}><Spinner color={TABS.find(t=>t.id===tab).color}/><span style={{ color:C.ink2, fontSize:14 }}>Generating {tab==="resume"?"resume":tab==="cover"?"cover letter":"cold email"}…</span></div>{[100,90,95,85].map((w,i)=><div key={i} style={{ marginBottom:8 }}><Skel h={16} w={`${w}%`}/></div>)}</Card>}
                {errors[tab]&&<Card flat style={{ padding:24, background:C.redBg }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div><div style={{ fontSize:14, fontWeight:700, color:C.red, marginBottom:6 }}>Failed</div><div style={{ fontSize:13, color:C.ink2 }}>{errors[tab]}</div></div><GhostBtn size="sm" onClick={()=>retryTab(tab)}>Retry</GhostBtn></div></Card>}
                {results[tab]&&(
                  <Card flat style={{ overflow:"hidden" }}>
                    <div style={{ padding:"14px 20px", background:C.bg, borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:18 }}>{TABS.find(t=>t.id===tab).icon}</span>
                        <span style={{ fontSize:14.5, fontWeight:700 }}>{tab==="resume"?"ATS Resume":tab==="cover"?"Cover Letter":"Cold Email to HR"}</span>
                        <Pill color={C.green} bg={C.greenBg}>Ready</Pill>
                      </div>
                      <CopyBtn text={results[tab]} color={TABS.find(t=>t.id===tab).color}/>
                    </div>
                    <div style={{ padding:"20px 22px", maxHeight:520, overflowY:"auto" }}>
                      <pre style={{ fontSize:13.5, lineHeight:1.85, color:C.ink2, whiteSpace:"pre-wrap", fontFamily:"inherit" }}>{results[tab]}</pre>
                    </div>
                    <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.border}`, background:tab==="resume"?C.blueBg:tab==="cover"?C.greenBg:C.amberBg }}>
                      <p style={{ fontSize:13, color:tab==="resume"?C.blue:tab==="cover"?C.greenDark:C.amber }}>
                        {tab==="resume"&&"💡 Content is ATS-ready. Copy into Google Docs or Word for visual formatting."}
                        {tab==="cover"&&"💡 Attach as PDF alongside your resume."}
                        {tab==="email"&&"💡 Find HR's name on LinkedIn. Replace [HR Name] before sending."}
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* INTERVIEW */}
            {tab==="interview"&&(
              <div style={{ animation:"toastIn .3s ease" }}>
                <Card flat style={{ overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", background:C.bg, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:"linear-gradient(135deg,#7C3AED,#A78BFA)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🎯</div>
                    <div>
                      <div style={{ fontSize:14.5, fontWeight:700 }}>AI Interview Coach</div>
                      <div style={{ fontSize:12, color:C.ink3 }}>{company||"Company"} · {role||"Role"} · Knows your resume + JD</div>
                    </div>
                    <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:C.green, animation:"pulse 2s infinite" }}/>
                      <span style={{ fontSize:12.5, color:C.green, fontWeight:600 }}>Ready</span>
                    </div>
                  </div>
                  <div style={{ height:400, overflowY:"auto", padding:"20px 18px", display:"flex", flexDirection:"column", gap:14 }}>
                    {chat.map((m,i)=>(
                      <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", gap:10, alignItems:"flex-start" }}>
                        {m.role==="ai"&&<div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7C3AED,#A78BFA)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginTop:2 }}>🎯</div>}
                        <div style={{ maxWidth:"78%", padding:"12px 16px", borderRadius:m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px", background:m.role==="user"?C.ink:C.surface, border:`1px solid ${m.role==="user"?C.ink:C.border}`, color:m.role==="user"?"#fff":C.ink, fontSize:13.5, lineHeight:1.75, whiteSpace:"pre-wrap" }}>{m.text}</div>
                        {m.role==="user"&&<div style={{ width:28, height:28, borderRadius:8, background:C.ink, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0, marginTop:2 }}>You</div>}
                      </div>
                    ))}
                    {chatBusy&&<div style={{ display:"flex", alignItems:"center", gap:10 }}><div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7C3AED,#A78BFA)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>🎯</div><div style={{ padding:"12px 16px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:"4px 16px 16px 16px", display:"flex", gap:8, alignItems:"center" }}><Spinner size={14} color={C.purple}/><span style={{ fontSize:13, color:C.ink3 }}>Thinking…</span></div></div>}
                    <div ref={chatEnd}/>
                  </div>
                  <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.border}`, display:"flex", gap:8, flexWrap:"wrap", background:C.bg }}>
                    {["Start mock interview","What questions to expect?","Salary tips","Tell me about yourself"].map(p=>(
                      <button key={p} onClick={()=>setChatMsg(p)} style={{ padding:"5px 13px", borderRadius:99, border:`1px solid ${C.border}`, background:C.surface, fontSize:12.5, color:C.ink2, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}
                        onMouseEnter={e=>{e.target.style.borderColor=C.purple;e.target.style.color=C.purple;}}
                        onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.ink2;}}>{p}</button>
                    ))}
                  </div>
                  <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}`, display:"flex", gap:10 }}>
                    <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
                      placeholder="Type your answer or ask a question… (Enter to send)"
                      style={{ flex:1, padding:"11px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:14, color:C.ink, transition:"border-color .2s", fontFamily:"inherit", outline:"none" }}
                      onFocus={e=>e.target.style.borderColor=C.purple} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <Btn onClick={sendChat} disabled={!chatMsg.trim()||chatBusy} bg={C.purple} style={{ whiteSpace:"nowrap" }}>
                      {chatBusy?<Spinner size={16} color="#fff"/>:"Send →"}
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

/* ═══════════════════════════════════════
   ROOT — Auth State Manager
═══════════════════════════════════════ */
export default function KrackHire() {
  const [view,setView]=useState("landing");
  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [showAuth,setShowAuth]=useState(false);
  const [authLoading,setAuthLoading]=useState(true);

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return;}

    // Get initial session
    supabase.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user||null);
      if(session?.user)loadProfile(session.user.id);
      setAuthLoading(false);
    });

    // Listen for auth changes
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      setUser(session?.user||null);
      if(session?.user)loadProfile(session.user.id);
      else setProfile(null);
    });

    return()=>subscription.unsubscribe();
  },[]);

  async function loadProfile(userId){
    try{
      const{data}=await supabase.from("profiles").select("*").eq("id",userId).single();
      if(data)setProfile(data);
    }catch(e){console.error("Profile load failed:",e.message);}
  }

  async function handleSignOut(){
    await signOut();
    setUser(null);setProfile(null);
  }

  if(authLoading)return(
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, flexDirection:"column", gap:16 }}>
      <Logo size="lg"/>
      <Spinner size={28} color={C.green}/>
    </div>
  );

  return(
    <>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)}/>}
      {view==="tool"
        ?<Tool onBack={()=>setView("landing")} user={user} profile={profile}/>
        :<Landing onEnter={()=>setView("tool")} user={user} profile={profile} onShowAuth={()=>setShowAuth(true)} onSignOut={handleSignOut}/>
      }
    </>
  );
}
