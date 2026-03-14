import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════
   SECURE API CALL — calls our Vercel backend
   API key never touches the frontend
═══════════════════════════════════════════ */
async function callAPI(type, payload) {
  const res = await fetch("/api/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data.result;
}

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

/* ═══════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════ */
const C = {
  bg: "#F8F7F4", surface: "#FFFFFF", ink: "#18181B",
  ink2: "#52525B", ink3: "#A1A1AA", ink4: "#E4E4E7",
  border: "#E4E4E7",
  green: "#16A34A", greenDark: "#15803D", greenBg: "#F0FDF4", greenMid: "#DCFCE7",
  red: "#DC2626", redBg: "#FFF5F5",
  amber: "#D97706", amberBg: "#FFFBEB",
  blue: "#2563EB", blueBg: "#EFF6FF",
  purple: "#7C3AED", purpleBg: "#F5F3FF",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { font-family: 'DM Sans', system-ui, sans-serif; background: ${C.bg}; color: ${C.ink}; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  a { text-decoration: none; color: inherit; }
  button { font-family: inherit; cursor: pointer; border: none; background: none; }
  input, textarea, select { font-family: inherit; outline: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
  @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
  @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ticker { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
  .au { animation: fadeUp .55s ease both; }
  .ai { animation: fadeIn .35s ease both; }
  .d1{animation-delay:.08s} .d2{animation-delay:.16s} .d3{animation-delay:.24s} .d4{animation-delay:.32s}
  ::-webkit-scrollbar { width:5px; }
  ::-webkit-scrollbar-thumb { background:${C.ink4}; border-radius:99px; }
  ::selection { background:${C.greenMid}; color:${C.greenDark}; }
  @media(max-width:768px){
    .hide-mobile { display:none !important; }
    .show-mobile { display:flex !important; }
    .grid-1-mobile { grid-template-columns:1fr !important; }
    .grid-2-mobile { grid-template-columns:1fr 1fr !important; }
    .hero-grid { grid-template-columns:1fr !important; }
    .how-grid { grid-template-columns:1fr 1fr !important; }
    .footer-grid { grid-template-columns:1fr 1fr !important; }
    .compare-grid { grid-template-columns:1fr !important; }
    .pricing-grid { grid-template-columns:1fr !important; }
    .faq-grid { grid-template-columns:1fr !important; }
    .problem-grid { grid-template-columns:1fr !important; }
  }
`;

/* ═══════════════════════════════════════════
   LOGO — proper SVG wordmark
═══════════════════════════════════════════ */
function Logo({ dark, size = "md" }) {
  const h = size === "sm" ? 28 : size === "lg" ? 40 : 32;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      {/* Icon mark */}
      <svg width={h} height={h} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="#15803D"/>
        <rect width="40" height="40" rx="10" fill="url(#lg)"/>
        {/* K letterform */}
        <path d="M11 10H16V19L23 10H29L21.5 20L29.5 30H23.5L16 21V30H11V10Z" fill="white"/>
        {/* Checkmark tick — hiring metaphor */}
        <path d="M24 26L27 29L33 22" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#15803D"/>
            <stop offset="1" stopColor="#166534"/>
          </linearGradient>
        </defs>
      </svg>
      {/* Wordmark */}
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 700,
        fontSize: size === "sm" ? 16 : size === "lg" ? 24 : 19,
        letterSpacing: "-0.4px",
        color: dark ? "#fff" : C.ink,
        lineHeight: 1,
      }}>
        Krack<span style={{ color: C.green }}>Hire</span>
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════════ */
function Spinner({ size = 18, color = C.green }) {
  return <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", border:`2px solid ${color}22`, borderTopColor:color, animation:"spin .7s linear infinite", flexShrink:0 }} />;
}

function Pill({ children, color = C.green, bg, size = "sm" }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding: size==="sm" ? "3px 10px" : "5px 14px", borderRadius:99, background: bg || color+"15", color, fontSize: size==="sm" ? 12 : 13.5, fontWeight:600 }}>
      {children}
    </span>
  );
}

function CopyBtn({ text, color = C.green }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false),2000); }}
      style={{ padding:"5px 14px", borderRadius:6, border:`1.5px solid ${ok ? color : C.border}`, background: ok ? color : C.surface, color: ok ? "#fff" : C.ink2, fontSize:12.5, fontWeight:600, transition:"all .2s", cursor:"pointer" }}>
      {ok ? "✓ Copied" : "Copy"}
    </button>
  );
}

/* ═══════════════════════════════════════════
   TOAST SYSTEM (fixed — no hook inside hook)
═══════════════════════════════════════════ */
function ToastItem({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3800); return () => clearTimeout(t); }, []);
  const map = { success:[C.green,C.greenBg], error:[C.red,C.redBg], info:[C.blue,C.blueBg] };
  const [clr, bg] = map[type] || map.info;
  return (
    <div style={{ padding:"13px 18px", background:bg, border:`1.5px solid ${clr}30`, borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,.12)", display:"flex", alignItems:"center", gap:10, animation:"slideUp .3s ease", maxWidth:340, fontSize:14, fontWeight:500, color:clr }}>
      <span style={{ fontSize:17 }}>{type==="success"?"✓":type==="error"?"✕":"ℹ"}</span>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ color:clr, opacity:.5, fontSize:20, lineHeight:1 }}>×</button>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type="success") => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
  }, []);
  const remove = useCallback((id) => setToasts(p => p.filter(x => x.id !== id)), []);
  const Toasts = () => (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", flexDirection:"column", gap:10, pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents:"all" }}>
          <ToastItem msg={t.msg} type={t.type} onClose={() => remove(t.id)} />
        </div>
      ))}
    </div>
  );
  return { toast, Toasts };
}

/* ═══════════════════════════════════════════
   BUTTONS
═══════════════════════════════════════════ */
function Btn({ children, onClick, disabled, size="md", bg=C.ink, full, style:ext={} }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
        padding: size==="lg" ? "15px 34px" : size==="sm" ? "7px 16px" : "11px 24px",
        borderRadius:9, border:"none",
        background: disabled ? C.ink4 : bg,
        color: disabled ? C.ink3 : "#fff",
        fontSize: size==="lg" ? 16 : size==="sm" ? 13 : 14.5,
        fontWeight:700, cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : h ? "0 8px 24px rgba(0,0,0,.16)" : "0 2px 8px rgba(0,0,0,.10)",
        transform: !disabled && h ? "translateY(-1px)" : "none",
        transition:"all .18s", width: full ? "100%" : "auto", ...ext }}>
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, size="md", style:ext={} }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ display:"inline-flex", alignItems:"center", gap:8,
        padding: size==="sm" ? "7px 16px" : "11px 24px",
        borderRadius:9, border:`1.5px solid ${h ? C.ink3 : C.border}`,
        background: h ? C.bg : C.surface, color:C.ink2,
        fontSize: size==="sm" ? 13 : 14.5, fontWeight:600,
        transition:"all .18s", cursor:"pointer", ...ext }}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════
   CARD
═══════════════════════════════════════════ */
function Card({ children, style:ext={}, flat }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={()=>!flat&&setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14,
        boxShadow: h&&!flat ? "0 8px 24px rgba(0,0,0,.09)" : "0 1px 3px rgba(0,0,0,.06)",
        transform: h&&!flat ? "translateY(-2px)" : "none",
        transition:"all .22s", ...ext }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FIELD
═══════════════════════════════════════════ */
function Field({ label, value, onChange, placeholder, rows, accent=C.green, hint }) {
  const [f, setF] = useState(false);
  const base = { padding:"12px 14px", borderRadius:9, border:`1.5px solid ${f ? accent : C.border}`, background: f ? C.surface : C.bg, fontSize:14, color:C.ink, transition:"all .2s", width:"100%" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.6, textTransform:"uppercase" }}>{label}</label>}
      {rows
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{ ...base, lineHeight:1.75, resize:"vertical" }} />
        : <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base} />
      }
      {hint && <span style={{ fontSize:12, color:C.ink3 }}>{hint}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SKELETON
═══════════════════════════════════════════ */
function Skel({ h=18, w="100%", r=8 }) {
  return <div style={{ height:h, width:w, borderRadius:r, background:"linear-gradient(90deg,#efefef 25%,#e0e0e0 50%,#efefef 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }} />;
}

/* ═══════════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════════ */
function Reveal({ children, delay=0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if(e.isIntersecting){ setVis(true); obs.disconnect(); } }, { threshold:0.08 });
    if(ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis?1:0, transform: vis?"translateY(0)":"translateY(24px)", transition:`opacity .6s ${delay}s ease, transform .6s ${delay}s ease` }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   STAR RATING
═══════════════════════════════════════════ */
function Stars({ rating, interactive, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display:"flex", gap:3 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          onClick={() => interactive && onChange(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{ fontSize:20, cursor: interactive ? "pointer" : "default", color: n <= (hover||rating) ? "#F59E0B" : C.ink4, transition:"color .15s" }}>
          ★
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   REVIEW SUBMIT FORM
═══════════════════════════════════════════ */
function ReviewForm({ onSubmit }) {
  const [name, setName]       = useState("");
  const [role, setRole]       = useState("");
  const [rating, setRating]   = useState(0);
  const [text, setText]       = useState("");
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState("");

  function submit() {
    if (!name.trim()) return setErr("Please enter your name.");
    if (rating === 0) return setErr("Please select a rating.");
    if (text.trim().length < 20) return setErr("Please write at least 20 characters.");
    setErr("");
    onSubmit({ name: name.trim(), role: role.trim() || "Job Seeker", rating, text: text.trim(), date: new Date().toLocaleDateString("en-IN", { month:"short", year:"numeric" }) });
    setDone(true);
  }

  if (done) return (
    <div style={{ padding:"32px", textAlign:"center" }}>
      <div style={{ fontSize:48, marginBottom:14 }}>🎉</div>
      <div style={{ fontSize:17, fontWeight:700, color:C.green, marginBottom:8 }}>Thank you for your feedback!</div>
      <div style={{ fontSize:14, color:C.ink2 }}>Your review helps other freshers decide to try KrackHire.</div>
    </div>
  );

  return (
    <div style={{ padding:"28px 24px", display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:16, fontWeight:700, color:C.ink }}>Share your experience</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Your Name *" value={name} onChange={setName} placeholder="e.g. Rahul Kumar" />
        <Field label="Your Role / College" value={role} onChange={setRole} placeholder="e.g. CS Student, JNTU" accent={C.blue} />
      </div>
      <div>
        <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2, letterSpacing:.6, textTransform:"uppercase", display:"block", marginBottom:8 }}>Rating *</label>
        <Stars rating={rating} interactive onChange={setRating} />
      </div>
      <Field label="Your Review *" value={text} onChange={setText}
        placeholder="What did you like? What improved in your applications? How did it help?" rows={4} />
      {err && <div style={{ fontSize:13, color:C.red, padding:"8px 12px", background:C.redBg, borderRadius:8 }}>{err}</div>}
      <Btn onClick={submit} bg={C.green}>Submit Review →</Btn>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LANDING PAGE
═══════════════════════════════════════════ */
const FEATURES = [
  { icon:"🔍", title:"Gap Analysis & Score",   desc:"Hirability score /100. Exactly what's missing, what's weak, and what to push hard for this specific job.",  color:C.red,    bg:C.redBg    },
  { icon:"📄", title:"ATS-Optimised Resume",   desc:"Your resume rewritten with keywords from the JD. Passes automated filters. Gets in front of a human.",      color:C.blue,   bg:C.blueBg   },
  { icon:"✉️", title:"Cover Letter",           desc:"Personalised to the company and role. Professional Indian English. Under 250 words. Sounds human.",          color:C.green,  bg:C.greenBg  },
  { icon:"📧", title:"Cold Email to HR",       desc:"Under 150 words with subject line. Confident, specific. The kind HR managers in India actually reply to.",   color:C.amber,  bg:C.amberBg  },
  { icon:"🎯", title:"AI Interview Coach",     desc:"Live chatbot that knows your resume + JD. Real questions, scores your answers /10, shows ideal responses.",  color:C.purple, bg:C.purpleBg },
];

const HOW_STEPS = [
  { n:"01", title:"Paste your resume",          desc:"Any format. Just copy the full text." },
  { n:"02", title:"Paste the job description",  desc:"From Naukri, LinkedIn, or any company portal." },
  { n:"03", title:"AI generates all 5 outputs", desc:"Gap analysis, resume, cover letter, email, interview coach. ~60 seconds." },
  { n:"04", title:"Apply with confidence",       desc:"Send the docs. Practice the interview. Get the call." },
];

const COMPARE = [
  { label:"Know your gaps before applying",    us:true,  them:false },
  { label:"ATS-optimised resume per JD",       us:true,  them:false },
  { label:"Cover letter in Indian English",    us:true,  them:false },
  { label:"Cold email to HR included",         us:true,  them:false },
  { label:"Company-specific interview prep",  us:true,  them:false },
  { label:"All 5 outputs in one click",        us:true,  them:false },
  { label:"Time required",                     us:"~60 sec", them:"2–4 hrs" },
  { label:"Cost",                              us:"Free",    them:"Your time" },
];

const FAQS = [
  { q:"Is KrackHire really free?",                  a:"Yes — completely free during beta. No account, no credit card, no limits. When we add paid plans, free users always keep 3 applications/month." },
  { q:"Does it work for non-tech jobs?",            a:"Yes. Marketing, finance, HR, operations, sales — any job where you have a resume and a JD. The AI adapts to every industry." },
  { q:"How is it different from using ChatGPT?",   a:"ChatGPT needs clever prompting and multiple back-and-forth messages. KrackHire is purpose-built — one click, five outputs, right format, Indian professional tone." },
  { q:"Will the resume pass ATS?",                  a:"Keywords are extracted directly from your JD and inserted naturally. No tables, no images, no formatting that breaks ATS parsers." },
  { q:"Is my data private?",                        a:"Your resume and JD are processed in real-time and not stored permanently. We never sell your information to anyone." },
  { q:"What if the output isn't good enough?",     a:"It's free and unlimited in beta — run it again with more detailed context. Email us at hello@krackhire.in if something is broken." },
];

// Seed reviews — shown until real ones come in
const SEED_REVIEWS = [
  { name:"Priya S.", role:"CS Graduate, Hyderabad",        rating:5, text:"Got a call from TCS within 3 days of using the tailored resume. The gap analysis showed I was missing basic SQL — fixed it in a week and mentioned it. That one thing changed everything.", date:"Mar 2025" },
  { name:"Arjun K.", role:"Fresher, JNTU",                 rating:5, text:"Cold email to HR actually worked. The subject line was specific and the body was under 150 words. First time HR responded to me in 4 months of applying.", date:"Feb 2025" },
  { name:"Sneha R.", role:"MBA Student, Pune",             rating:4, text:"The interview coach is the best part. It asked me real questions based on the actual JD and scored my answers honestly. Much better prep than watching YouTube videos.", date:"Mar 2025" },
  { name:"Karthik M.", role:"ECE Graduate, Chennai",       rating:5, text:"Applied to Infosys with the ATS resume and cover letter. Got shortlisted. Previous 2 months of applying manually got zero responses. 60 seconds changed that.", date:"Jan 2025" },
  { name:"Aisha B.", role:"BCA Graduate, Bangalore",       rating:4, text:"Free tool that actually works. The gap analysis is brutally honest — it told me my projects had no numbers or impact. Fixed that across all my projects and immediately started getting callbacks.", date:"Feb 2025" },
  { name:"Rohit P.", role:"Engineering Student, Nagpur",   rating:5, text:"Was applying to the same 50 companies with the same resume. KrackHire showed me why I kept getting ignored. Took 2 hours to fix everything. First interview scheduled the next week.", date:"Mar 2025" },
];

function Landing({ onEnter }) {
  const [scrolled, setScrolled]       = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [faqOpen, setFaqOpen]         = useState(null);
  const [reviews, setReviews]         = useState(SEED_REVIEWS);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewPage, setReviewPage]   = useState(0);
  const REVIEWS_PER_PAGE = 3;

  useEffect(() => {
    // Load saved reviews from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem("kh_reviews") || "[]");
      if (saved.length) setReviews(p => [...saved, ...p]);
    } catch {}
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  function addReview(review) {
    const updated = [review, ...reviews];
    setReviews(updated);
    setShowReviewForm(false);
    // Save user-submitted ones
    try {
      const existing = JSON.parse(localStorage.getItem("kh_reviews") || "[]");
      localStorage.setItem("kh_reviews", JSON.stringify([review, ...existing]));
    } catch {}
  }

  const navLinks = [["#features","Features"],["#how","How it works"],["#reviews","Reviews"],["#pricing","Pricing"],["#faq","FAQ"]];
  const visibleReviews = reviews.slice(reviewPage * REVIEWS_PER_PAGE, (reviewPage+1) * REVIEWS_PER_PAGE);
  const totalPages = Math.ceil(reviews.length / REVIEWS_PER_PAGE);
  const avgRating = (reviews.reduce((s,r) => s+r.rating, 0) / reviews.length).toFixed(1);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <style>{GLOBAL_CSS}</style>

      {/* ANNOUNCEMENT BAR */}
      <div style={{ background:C.greenDark, color:"#fff", textAlign:"center", padding:"10px 16px", fontSize:13.5, fontWeight:500 }}>
        🎉 KrackHire is in <strong>free beta</strong> — no account, no card needed.{" "}
        <button onClick={onEnter} style={{ color:C.greenMid, fontWeight:700, textDecoration:"underline", cursor:"pointer", background:"none", border:"none", fontSize:13.5, fontFamily:"inherit" }}>
          Try it now →
        </button>
      </div>

      {/* NAV */}
      <nav style={{ position:"sticky", top:0, zIndex:200, height:60, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(16px,5vw,56px)", background: scrolled ? "rgba(248,247,244,.95)" : "transparent", backdropFilter:"blur(16px)", borderBottom:`1px solid ${scrolled ? C.border : "transparent"}`, transition:"all .3s" }}>
        <Logo />
        <div className="hide-mobile" style={{ display:"flex", gap:2 }}>
          {navLinks.map(([h,l]) => (
            <a key={l} href={h} style={{ padding:"6px 13px", borderRadius:8, fontSize:14, fontWeight:500, color:C.ink2, transition:"all .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.color=C.ink;e.currentTarget.style.background=C.surface;}}
              onMouseLeave={e=>{e.currentTarget.style.color=C.ink2;e.currentTarget.style.background="transparent";}}>
              {l}
            </a>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <Btn onClick={onEnter} size="sm">Try free →</Btn>
          <button className="show-mobile" onClick={()=>setMenuOpen(!menuOpen)}
            style={{ display:"none", padding:"8px", borderRadius:8, color:C.ink2, fontSize:22, lineHeight:1 }}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div style={{ position:"fixed", top:110, left:0, right:0, zIndex:199, background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"16px 20px", display:"flex", flexDirection:"column", gap:4, animation:"slideUp .2s ease", boxShadow:"0 8px 24px rgba(0,0,0,.08)" }}>
          {navLinks.map(([h,l]) => (
            <a key={l} href={h} onClick={()=>setMenuOpen(false)} style={{ padding:"12px 16px", borderRadius:8, fontSize:15, fontWeight:500, color:C.ink2 }}>{l}</a>
          ))}
          <div style={{ paddingTop:12, borderTop:`1px solid ${C.border}`, marginTop:8 }}>
            <Btn onClick={()=>{setMenuOpen(false);onEnter();}} full>Try it free — no signup →</Btn>
          </div>
        </div>
      )}

      {/* HERO */}
      <section style={{ maxWidth:1120, margin:"0 auto", padding:"clamp(64px,10vw,120px) clamp(16px,5vw,56px)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"clamp(32px,6vw,80px)", alignItems:"center" }} className="hero-grid">
        <div>
          <div className="au" style={{ marginBottom:20 }}>
            <Pill color={C.green} bg={C.greenBg} size="md">🚀 Free beta — no account needed</Pill>
          </div>
          <h1 className="au d1" style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(36px,4.5vw,58px)", lineHeight:1.08, letterSpacing:"-.5px", marginBottom:20 }}>
            Know why you'll get<br/>rejected —{" "}
            <em style={{ fontStyle:"italic", color:C.green }}>before<br/>you apply.</em>
          </h1>
          <p className="au d2" style={{ fontSize:"clamp(15px,1.8vw,17px)", color:C.ink2, lineHeight:1.8, marginBottom:36, maxWidth:460 }}>
            Paste your resume + job description. Get a gap analysis, ATS resume, cover letter, cold email to HR, and interview coach — <strong style={{ color:C.ink }}>in 60 seconds.</strong> Built for Indian freshers.
          </p>
          <div className="au d3" style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:28 }}>
            <Btn onClick={onEnter} size="lg">Try it free — no signup →</Btn>
            <GhostBtn onClick={()=>document.getElementById("how")?.scrollIntoView({behavior:"smooth"})}>How it works</GhostBtn>
          </div>
          <div className="au d4" style={{ display:"flex", flexWrap:"wrap", gap:18 }}>
            {["Free in beta","No account","No credit card","Built for India 🇮🇳"].map(t=>(
              <span key={t} style={{ fontSize:13, color:C.ink3, display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ color:C.green, fontWeight:700 }}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>

        {/* Hero Visual */}
        <div className="au d2 hide-mobile" style={{ position:"relative", animation:"float 5s ease-in-out infinite" }}>
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
                { t:"red",   i:"✗", title:"Missing: SQL basics",          sub:"Found in 4/5 similar JDs. Learn free in 2 weeks." },
                { t:"amber", i:"△", title:"Weak: Project descriptions",   sub:"Add impact — '40% faster' beats 'built a feature'." },
                { t:"green", i:"✓", title:"Strong: Sales Ops background", sub:"Rare in tech. Lead with this in every application." },
              ].map((g,i)=>{
                const m={red:[C.red,C.redBg],amber:[C.amber,C.amberBg],green:[C.green,C.greenBg]};
                const [clr,bg]=m[g.t];
                return(
                  <div key={i} style={{ display:"flex", gap:10, padding:"9px 12px", background:bg, borderRadius:8, borderLeft:`3px solid ${clr}`, marginBottom:8 }}>
                    <span style={{ color:clr, fontWeight:800, fontSize:13, flexShrink:0, marginTop:1 }}>{g.i}</span>
                    <div>
                      <div style={{ fontSize:12.5, fontWeight:700, color:clr }}>{g.title}</div>
                      <div style={{ fontSize:11.5, color:C.ink2, marginTop:2, lineHeight:1.5 }}>{g.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <div style={{ position:"absolute", bottom:-14, left:-16, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", boxShadow:"0 8px 24px rgba(0,0,0,.10)", display:"flex", alignItems:"center", gap:10, animation:"float 6s ease-in-out 1.2s infinite" }}>
            <span style={{ fontSize:22 }}>📄</span>
            <div>
              <div style={{ fontSize:12.5, fontWeight:700, color:C.ink }}>Resume generated</div>
              <div style={{ fontSize:11.5, color:C.ink3 }}>ATS-optimised · keywords matched</div>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div style={{ overflow:"hidden", borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, background:C.surface, padding:"13px 0" }}>
        <div style={{ display:"flex", width:"max-content", animation:"ticker 22s linear infinite" }}>
          {[...Array(2)].map((_,ri)=>
            ["Gap Analysis","ATS Resume","Cover Letter","Cold Email to HR","Interview Coach","Hirability Score","India-First","60 Seconds"].map((item,i)=>(
              <span key={`${ri}-${i}`} style={{ padding:"0 28px", fontSize:13, fontWeight:600, color:C.ink3, letterSpacing:.5, display:"flex", alignItems:"center", gap:20, whiteSpace:"nowrap" }}>
                {item} <span style={{ color:C.green, fontSize:10 }}>◆</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* PROBLEM */}
      <section style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr", gap:"clamp(32px,6vw,80px)", alignItems:"center" }} className="problem-grid">
              <div>
                <Pill color={C.red} bg={C.redBg}>The Real Problem</Pill>
                <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(26px,3.5vw,38px)", lineHeight:1.2, marginTop:14, color:C.ink }}>
                  Most freshers lose the job before the interview starts.
                </h2>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[
                  { icon:"😔", title:"Applying blindly",    desc:"Same resume to 50 jobs. ATS rejects it before a human sees it." },
                  { icon:"🚫", title:"Ghosted by HR",       desc:"Cold emails that say 'please find attached'. Deleted without reading." },
                  { icon:"😨", title:"Unprepared",          desc:"No idea what the company actually asks. Freezing on basic questions." },
                  { icon:"❓", title:"Don't know the gaps", desc:"You have skills but no idea which ones matter for this specific role." },
                ].map((p,i)=>(
                  <Card key={i} style={{ padding:"20px 18px" }}>
                    <div style={{ fontSize:24, marginBottom:10 }}>{p.icon}</div>
                    <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>{p.title}</div>
                    <div style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{p.desc}</div>
                  </Card>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:48 }}>
              <Pill>What you get</Pill>
              <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 12px" }}>Five tools. One click.</h2>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:420, margin:"0 auto", lineHeight:1.75 }}>Everything to go from "no replies" to "interview scheduled" — in about 60 seconds.</p>
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
              <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 12px" }}>Four steps. 60 seconds.</h2>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:420, margin:"0 auto", lineHeight:1.75 }}>No learning curve. No setup. Just paste and get results.</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }} className="how-grid">
              {HOW_STEPS.map((s,i)=>(
                <div key={i} style={{ padding:"28px 22px", borderRight: i<3 ? `1px solid ${C.border}` : "none", background:C.surface, transition:"background .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                  onMouseLeave={e=>e.currentTarget.style.background=C.surface}>
                  <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:42, color:C.ink4, lineHeight:1, marginBottom:14 }}>{s.n}</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>{s.title}</div>
                  <div style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign:"center", marginTop:36 }}>
              <Btn onClick={onEnter} size="lg">Try it now — completely free →</Btn>
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMPARE */}
      <section style={{ padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:780, margin:"0 auto" }}>
          <Reveal>
            <div style={{ textAlign:"center", marginBottom:44 }}>
              <Pill color={C.amber} bg={C.amberBg}>Why KrackHire</Pill>
              <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 12px" }}>You vs. manual applying.</h2>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:400, margin:"0 auto", lineHeight:1.75 }}>Here's what changes when you stop guessing and start using AI.</p>
            </div>
            <Card flat style={{ overflow:"hidden" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", background:C.ink, color:"#fff", padding:"14px 22px", gap:20 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#A1A1AA" }}>WHAT YOU NEED</span>
                <span style={{ fontSize:13, fontWeight:700, color:C.green, textAlign:"center" }}>KrackHire</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#71717A", textAlign:"center" }}>Manual</span>
              </div>
              {COMPARE.map((row,i)=>(
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", padding:"13px 22px", gap:20, borderBottom: i<COMPARE.length-1 ? `1px solid ${C.border}` : "none", background: i%2===0 ? C.surface : C.bg }}>
                  <span style={{ fontSize:14, color:C.ink2 }}>{row.label}</span>
                  <span style={{ textAlign:"center", fontSize:14, fontWeight:700, color:C.green }}>{typeof row.us==="boolean" ? (row.us?"✓":"✕") : row.us}</span>
                  <span style={{ textAlign:"center", fontSize:14, fontWeight:600, color:C.ink3 }}>{typeof row.them==="boolean" ? (row.them?"✓":"✕") : row.them}</span>
                </div>
              ))}
            </Card>
          </Reveal>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" style={{ background:C.surface, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:"80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <Reveal>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:44, flexWrap:"wrap", gap:16 }}>
              <div>
                <Pill color={C.purple} bg={C.purpleBg}>Reviews</Pill>
                <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,3.8vw,42px)", lineHeight:1.15, margin:"14px 0 8px" }}>What freshers say.</h2>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Stars rating={Math.round(parseFloat(avgRating))} />
                  <span style={{ fontSize:15, fontWeight:700, color:C.ink }}>{avgRating}</span>
                  <span style={{ fontSize:14, color:C.ink3 }}>({reviews.length} reviews)</span>
                </div>
              </div>
              <Btn onClick={()=>setShowReviewForm(!showReviewForm)} bg={C.purple}>
                {showReviewForm ? "✕ Cancel" : "✍ Write a Review"}
              </Btn>
            </div>

            {/* Review Form */}
            {showReviewForm && (
              <Card flat style={{ marginBottom:28, border:`1.5px solid ${C.purple}30`, overflow:"hidden" }}>
                <ReviewForm onSubmit={addReview} />
              </Card>
            )}

            {/* Reviews Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }} className="grid-1-mobile">
              {visibleReviews.map((r,i)=>(
                <Card key={i} style={{ padding:"22px 20px" }}>
                  <Stars rating={r.rating} />
                  <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.75, margin:"12px 0 16px", fontStyle:"italic" }}>"{r.text}"</p>
                  <div style={{ display:"flex", alignItems:"center", gap:10, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${C.green},#4ADE80)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff", flexShrink:0 }}>
                      {r.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize:13.5, fontWeight:700, color:C.ink }}>{r.name}</div>
                      <div style={{ fontSize:12, color:C.ink3 }}>{r.role} · {r.date}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display:"flex", justifyContent:"center", gap:8 }}>
                <GhostBtn onClick={()=>setReviewPage(p=>Math.max(0,p-1))} size="sm" style={{ opacity: reviewPage===0 ? .4 : 1 }}>← Prev</GhostBtn>
                {Array.from({length:totalPages}).map((_,i)=>(
                  <button key={i} onClick={()=>setReviewPage(i)}
                    style={{ width:36, height:36, borderRadius:8, border:`1.5px solid ${reviewPage===i ? C.green : C.border}`, background: reviewPage===i ? C.green : C.surface, color: reviewPage===i ? "#fff" : C.ink2, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>
                    {i+1}
                  </button>
                ))}
                <GhostBtn onClick={()=>setReviewPage(p=>Math.min(totalPages-1,p+1))} size="sm" style={{ opacity: reviewPage===totalPages-1 ? .4 : 1 }}>Next →</GhostBtn>
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
              <p style={{ fontSize:16, color:C.ink2, maxWidth:420, margin:"0 auto", lineHeight:1.75 }}>Free while in beta. When paid plans launch, free users always keep 3 applications/month.</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }} className="pricing-grid">
              {[
                { name:"Free", price:"₹0", period:"forever", cta:"Start free →", ctaBg:C.ink, badge:null,
                  features:["3 applications / month","Gap analysis + score","Basic resume rewrite",{dim:"Cover letter"},{dim:"Cold email"},{dim:"Interview coach"}] },
                { name:"Pro", price:"₹49", period:"per month", cta:"Get Pro →", ctaBg:C.green, badge:"Most popular",
                  features:["Unlimited applications","Full gap analysis","ATS resume rewrite","Cover letter","Cold email to HR","AI interview coach"] },
                { name:"College / Team", price:"₹999", period:"per month", cta:"Contact us →", ctaBg:C.ink, badge:null,
                  features:["Up to 30 students","Everything in Pro","Placement dashboard","Bulk applications","Progress tracking","Priority support"] },
              ].map((plan,i)=>(
                <div key={i} style={{ position:"relative" }}>
                  {plan.badge && (
                    <div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"#fff", fontSize:11, fontWeight:700, padding:"4px 14px", borderRadius:99, whiteSpace:"nowrap" }}>
                      {plan.badge}
                    </div>
                  )}
                  <Card flat style={{ padding:"28px 22px", border: plan.badge ? `1.5px solid ${C.ink}` : `1px solid ${C.border}`, boxShadow: plan.badge ? "0 8px 24px rgba(0,0,0,.10)" : undefined }}>
                    <div style={{ fontSize:11.5, fontWeight:700, color:C.ink3, textTransform:"uppercase", letterSpacing:.8, marginBottom:16 }}>{plan.name}</div>
                    <div style={{ fontFamily:"'Instrument Serif',serif", fontSize:48, lineHeight:1, color:C.ink, marginBottom:4 }}>{plan.price}</div>
                    <div style={{ fontSize:13, color:C.ink3, marginBottom:24 }}>{plan.period}</div>
                    <Btn onClick={onEnter} full bg={plan.ctaBg} style={{ marginBottom:24 }}>{plan.cta}</Btn>
                    <div style={{ height:1, background:C.border, marginBottom:20 }} />
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {plan.features.map((f,j)=>{
                        const dim = typeof f==="object";
                        return (
                          <div key={j} style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, color: dim ? C.ink4 : C.ink2 }}>
                            <span style={{ color: dim ? C.ink4 : C.green, fontWeight:700, flexShrink:0 }}>{dim?"—":"✓"}</span>
                            {dim ? f.dim : f}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
            <p style={{ textAlign:"center", fontSize:13, color:C.ink3, marginTop:20 }}>
              Payments via Razorpay — UPI, debit/credit cards accepted. Cancel anytime.
            </p>
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
                <p style={{ fontSize:15, color:C.ink2, lineHeight:1.75, marginBottom:24 }}>We're early-stage and improving daily. Email us anytime.</p>
                <GhostBtn onClick={()=>{}}>✉ hello@krackhire.in</GhostBtn>
              </div>
              <div>
                {FAQS.map((f,i)=>(
                  <div key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                    <button onClick={()=>setFaqOpen(faqOpen===i?null:i)}
                      style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 0", background:"none", border:"none", cursor:"pointer", fontSize:15, fontWeight:600, color:C.ink, fontFamily:"inherit", textAlign:"left", gap:16 }}>
                      <span>{f.q}</span>
                      <span style={{ fontSize:20, color:C.ink3, transform: faqOpen===i?"rotate(45deg)":"none", transition:"transform .28s", flexShrink:0 }}>+</span>
                    </button>
                    <div style={{ overflow:"hidden", maxHeight: faqOpen===i ? 300 : 0, transition:"max-height .38s ease" }}>
                      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.8, paddingBottom:20 }}>{f.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ background:`linear-gradient(180deg,${C.bg} 0%,${C.greenBg} 100%)`, borderTop:`1px solid ${C.border}`, padding:"100px clamp(16px,5vw,56px)", textAlign:"center" }}>
        <Reveal>
          <Pill color={C.green} bg={C.greenMid} size="md">🎉 Free while in beta</Pill>
          <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(30px,4.5vw,52px)", lineHeight:1.1, letterSpacing:"-.3px", margin:"18px 0 16px" }}>
            Stop guessing.<br/><em style={{ fontStyle:"italic", color:C.green }}>Start getting interviews.</em>
          </h2>
          <p style={{ fontSize:17, color:C.ink2, marginBottom:40, lineHeight:1.75, maxWidth:480, margin:"0 auto 40px" }}>
            No signup. No card. Paste your resume and see your hirability score in 60 seconds.
          </p>
          <Btn onClick={onEnter} size="lg">Open KrackHire — it's free →</Btn>
          <div style={{ marginTop:24, display:"flex", justifyContent:"center", gap:24, flexWrap:"wrap", fontSize:13, color:C.ink3 }}>
            {["No account needed","No credit card","UPI accepted later","Made in Hyderabad 🇮🇳"].map(t=>(
              <span key={t} style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ color:C.green }}>✓</span>{t}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{ background:C.ink, color:"#fff", padding:"56px clamp(16px,5vw,56px) 32px" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:48, paddingBottom:40, borderBottom:"1px solid #27272A" }} className="footer-grid">
            <div>
              <Logo dark />
              <p style={{ fontSize:13.5, color:"#71717A", lineHeight:1.75, marginTop:12, maxWidth:260 }}>
                India's AI job readiness platform. Built for freshers who are done getting ghosted.
              </p>
              <p style={{ fontSize:12, color:"#52525B", marginTop:10 }}>Made with ♥ in Hyderabad, India</p>
              <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                {["Twitter","LinkedIn","Instagram"].map(s=>(
                  <a key={s} href="#" style={{ fontSize:12, color:"#52525B", padding:"4px 10px", borderRadius:6, border:"1px solid #27272A", transition:"color .15s" }}
                    onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="#52525B"}>{s}</a>
                ))}
              </div>
            </div>
            {[
              { title:"Product", links:["Features","How it works","Pricing","Changelog"] },
              { title:"Company", links:["About","Blog","Careers","Contact"] },
              { title:"Legal",   links:["Privacy Policy","Terms of Service","Refund Policy"] },
            ].map(col=>(
              <div key={col.title}>
                <div style={{ fontSize:11, fontWeight:700, color:"#71717A", textTransform:"uppercase", letterSpacing:.8, marginBottom:16 }}>{col.title}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {col.links.map(l=>(
                    <a key={l} href="#" style={{ fontSize:13.5, color:"#71717A", transition:"color .15s" }}
                      onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="#71717A"}>{l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop:24, display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:12, fontSize:12.5, color:"#52525B" }}>
            <span>© 2025 KrackHire. All rights reserved.</span>
            <span>Beta — improving daily based on your feedback.</span>
          </div>
        </div>
      </footer>

      {/* Mobile sticky CTA */}
      <div className="show-mobile" style={{ display:"none", position:"fixed", bottom:0, left:0, right:0, zIndex:198, padding:"12px 16px", background:"rgba(248,247,244,.97)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.border}`, alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700 }}>KrackHire</div>
          <div style={{ fontSize:11.5, color:C.ink3 }}>Free AI job tool for Indian freshers</div>
        </div>
        <Btn onClick={onEnter} size="sm">Try free →</Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TOOL
═══════════════════════════════════════════ */
const TABS = [
  { id:"gap",       label:"Gap Analysis",    icon:"🔍", color:C.red    },
  { id:"resume",    label:"Resume",          icon:"📄", color:C.blue   },
  { id:"cover",     label:"Cover Letter",    icon:"✉️", color:C.green  },
  { id:"email",     label:"Cold Email",      icon:"📧", color:C.amber  },
  { id:"interview", label:"Interview Coach", icon:"🎯", color:C.purple },
];

function Tool({ onBack }) {
  const { toast, Toasts } = useToast();
  const [resume, setResume]   = useState("");
  const [jd, setJd]           = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole]       = useState("");
  const [ran, setRan]         = useState(false);
  const [tab, setTab]         = useState("gap");
  const [results, setResults] = useState({ gap:null, resume:null, cover:null, email:null });
  const [loading, setLoading] = useState({ gap:false, resume:false, cover:false, email:false });
  const [errors, setErrors]   = useState({ gap:null, resume:null, cover:null, email:null });
  const [chat, setChat]       = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:"smooth" }); }, [chat]);

  const setL = (k,v) => setLoading(p=>({...p,[k]:v}));
  const setR = (k,v) => setResults(p=>({...p,[k]:v}));
  const setE = (k,v) => setErrors(p=>({...p,[k]:v}));

  const payload = { resume, jd, company, role };

  async function analyse() {
    if (!resume.trim() || !jd.trim()) { toast("Please fill in both resume and job description.", "error"); return; }
    setRan(true); setTab("gap");
    setResults({ gap:null, resume:null, cover:null, email:null });
    setErrors({ gap:null, resume:null, cover:null, email:null });

    // Run all 4 in parallel
    const tasks = [
      // Gap
      (async () => {
        setL("gap",true);
        try {
          const raw = await callAPI("gap", payload);
          const parsed = parseJSON(raw);
          parsed ? setR("gap",parsed) : setE("gap","Could not parse response. Try again.");
          if(parsed) toast("Gap analysis complete ✓","success");
        } catch(e) { setE("gap",e.message); toast(e.message,"error"); }
        setL("gap",false);
      })(),
      // Resume
      (async () => {
        setL("resume",true);
        try { const r = await callAPI("resume",payload); setR("resume",r); toast("Resume generated ✓","success"); }
        catch(e) { setE("resume",e.message); toast("Resume: "+e.message,"error"); }
        setL("resume",false);
      })(),
      // Cover
      (async () => {
        setL("cover",true);
        try { const r = await callAPI("cover",payload); setR("cover",r); toast("Cover letter ready ✓","success"); }
        catch(e) { setE("cover",e.message); toast("Cover letter: "+e.message,"error"); }
        setL("cover",false);
      })(),
      // Email
      (async () => {
        setL("email",true);
        try { const r = await callAPI("email",payload); setR("email",r); toast("Cold email ready ✓","success"); }
        catch(e) { setE("email",e.message); toast("Email: "+e.message,"error"); }
        setL("email",false);
      })(),
    ];

    await Promise.allSettled(tasks);

    // Seed interview chat
    setChat([{ role:"ai", text:`Hi! I'm your interview coach for **${role||"this role"}**${company?` at **${company}**`:""}.

I've read your full resume and the job description. I know what they're looking for.

I'll ask you one real interview question at a time — technical, behavioural, situational. For each answer I'll score it /10, tell you what was good, what was missing, and show the ideal answer.

Type **"start"** when ready, or ask me anything about the role first.` }]);
  }

  async function retryTab(t) {
    setE(t,null); setL(t,true);
    try {
      if(t==="gap") {
        const raw = await callAPI("gap",payload);
        const p = parseJSON(raw);
        p ? setR("gap",p) : setE("gap","Parse error");
        if(p) toast("Gap analysis done ✓","success");
      } else {
        const r = await callAPI(t,payload);
        setR(t,r); toast(`${t} ready ✓`,"success");
      }
    } catch(e) { setE(t,e.message); toast(e.message,"error"); }
    setL(t,false);
  }

  async function sendChat() {
    if(!chatMsg.trim()||chatBusy) return;
    const userMsg = chatMsg.trim(); setChatMsg("");
    const updated = [...chat, {role:"user",text:userMsg}];
    setChat(updated); setChatBusy(true);
    try {
      // Build messages for API
      const messages = updated.slice(-12).map(m=>({ role: m.role==="user"?"user":"assistant", content:m.text }));
      const reply = await callAPI("interview", { ...payload, messages });
      setChat(c=>[...c,{role:"ai",text:reply}]);
    } catch(e) {
      setChat(c=>[...c,{role:"ai",text:"Something went wrong. Please try again."}]);
      toast(e.message,"error");
    }
    setChatBusy(false);
  }

  const score = results.gap?.score ?? 0;
  const scoreClr = score>=70 ? C.green : score>=50 ? C.amber : C.red;
  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <style>{GLOBAL_CSS}</style>
      <Toasts />

      {/* Header */}
      <header style={{ position:"sticky", top:0, zIndex:100, height:56, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(12px,4vw,40px)", background:"rgba(248,247,244,.95)", backdropFilter:"blur(16px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Logo size="sm" />
          {ran && <Pill color={C.green} bg={C.greenBg}>Beta · Groq AI</Pill>}
          {anyLoading && <span style={{ fontSize:12.5, color:C.ink3, display:"flex", alignItems:"center", gap:6 }}><Spinner size={13}/>Generating…</span>}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {ran && <GhostBtn size="sm" onClick={()=>{ setRan(false); setResults({gap:null,resume:null,cover:null,email:null}); setErrors({gap:null,resume:null,cover:null,email:null}); setChat([]); }}>New analysis</GhostBtn>}
          <GhostBtn size="sm" onClick={onBack}>← Home</GhostBtn>
        </div>
      </header>

      <div style={{ maxWidth:840, margin:"0 auto", padding:"28px clamp(12px,4vw,32px) 80px" }}>

        {/* INPUT */}
        {!ran && (
          <div className="ai">
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:"clamp(28px,4vw,42px)", lineHeight:1.15, letterSpacing:"-.3px", marginBottom:12 }}>
                Paste. Click. Get everything.
              </h1>
              <p style={{ fontSize:16, color:C.ink2, maxWidth:460, margin:"0 auto", lineHeight:1.75 }}>
                Fill in your resume and job description. All 5 AI outputs generate together in ~60 seconds.
              </p>
            </div>

            <Card flat style={{ padding:"clamp(18px,4vw,32px)" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }} className="grid-1-mobile">
                <Field label="Company Name (optional)" value={company} onChange={setCompany} placeholder="e.g. Infosys, Swiggy, TCS…" hint="Personalises the cover letter and email." />
                <Field label="Role / Job Title (optional)" value={role} onChange={setRole} placeholder="e.g. Python Developer…" accent={C.blue} hint="Helps the interview coach prepare role-specific questions." />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }} className="grid-1-mobile">
                <Field label="Your Resume *" value={resume} onChange={setResume}
                  placeholder={"Paste your full resume text here.\n\nInclude everything:\n• Name & contact\n• Education\n• Skills\n• Work experience\n• Projects"} rows={12} />
                <Field label="Job Description *" value={jd} onChange={setJd}
                  placeholder={"Paste the complete job description here.\n\nInclude:\n• Required skills\n• Responsibilities\n• Qualifications\n\nMore detail = better output."} rows={12} accent={C.blue} />
              </div>

              {/* Progress dots */}
              <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
                {[
                  {label:"Resume",          filled:!!resume.trim(), color:C.green},
                  {label:"Job Description", filled:!!jd.trim(),     color:C.blue},
                  {label:"Company",         filled:!!company.trim(), color:C.amber, opt:true},
                  {label:"Role",            filled:!!role.trim(),    color:C.purple, opt:true},
                ].map(f=>(
                  <span key={f.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12.5, color: f.filled ? f.color : C.ink3 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background: f.filled ? f.color : C.ink4, display:"inline-block" }}/>
                    {f.label}{f.opt?" (optional)":""}
                  </span>
                ))}
              </div>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                <div style={{ fontSize:13, color:C.ink3, lineHeight:1.7 }}>
                  <div>~60 seconds · All 5 outputs at once</div>
                  <div>Powered by Groq + Llama 3.3 70B · Data not stored</div>
                </div>
                <Btn onClick={analyse} size="lg" disabled={!resume.trim()||!jd.trim()}>
                  {!resume.trim()||!jd.trim() ? "Fill both fields ↑" : "⚡ Analyse & Generate All →"}
                </Btn>
              </div>
            </Card>

            <div style={{ display:"flex", justifyContent:"center", flexWrap:"wrap", gap:10, marginTop:22 }}>
              {TABS.map(t=>(
                <div key={t.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 16px", borderRadius:99, border:`1px solid ${C.border}`, background:C.surface, fontSize:13.5, color:C.ink2 }}>
                  {t.icon} {t.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS */}
        {ran && (
          <div className="ai">

            {/* Score Card */}
            <Card flat style={{ padding:"20px 24px", marginBottom:20 }}>
              {loading.gap && !results.gap ? (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <Skel h={28} w="40%"/><Skel h={8} r={99}/><Skel h={18} w="80%"/>
                </div>
              ) : results.gap ? (
                <div style={{ display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
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
              ) : errors.gap ? (
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:20 }}>⚠️</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:C.red, marginBottom:4 }}>Gap analysis failed</div>
                    <div style={{ fontSize:12.5, color:C.ink2 }}>{errors.gap}</div>
                  </div>
                  <GhostBtn size="sm" onClick={()=>retryTab("gap")}>Retry</GhostBtn>
                </div>
              ) : null}
            </Card>

            {/* Tabs */}
            <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:20, overflowX:"auto" }}>
              {TABS.map(t=>{
                const hasErr = errors[t.id] && t.id!=="interview";
                const isDone = results[t.id] && !loading[t.id] && !errors[t.id];
                return (
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    style={{ padding:"11px 16px", background: tab===t.id ? C.surface : "transparent", border:`1px solid ${tab===t.id ? C.border : "transparent"}`, borderBottom: tab===t.id ? `2px solid ${t.color}` : "1px solid transparent", borderRadius:"8px 8px 0 0", marginBottom:-1, color: tab===t.id ? t.color : C.ink3, fontWeight: tab===t.id ? 700 : 500, fontSize:13.5, cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6, transition:"color .15s", fontFamily:"inherit" }}>
                    {t.icon} {t.label}
                    {loading[t.id] && <Spinner size={12} color={t.color}/>}
                    {hasErr && <span style={{ color:C.red, fontSize:12 }}>⚠</span>}
                    {isDone && t.id!=="interview" && <span style={{ color:C.green, fontSize:10 }}>●</span>}
                  </button>
                );
              })}
            </div>

            {/* GAP */}
            {tab==="gap" && (
              <div className="ai">
                {loading.gap && !results.gap && (
                  <Card flat style={{ padding:24 }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20 }}><Spinner color={C.red}/><span style={{ color:C.ink2, fontSize:14 }}>Analysing gaps…</span></div>
                    {[80,65,75].map((w,i)=><Skel key={i} h={52} w={`${w}%`}/>)}
                  </Card>
                )}
                {errors.gap && (
                  <Card flat style={{ padding:24, background:C.redBg, border:`1px solid ${C.red}30` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:C.red, marginBottom:6 }}>⚠️ Gap analysis failed</div>
                        <div style={{ fontSize:13, color:C.ink2 }}>{errors.gap}</div>
                      </div>
                      <GhostBtn size="sm" onClick={()=>retryTab("gap")}>Retry</GhostBtn>
                    </div>
                  </Card>
                )}
                {results.gap && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    {[
                      {key:"missing", label:"Critical Gaps — fix before applying",    color:C.red,   bg:C.redBg,   icon:"✗"},
                      {key:"weak",    label:"Weak Areas — improve to stand out",       color:C.amber, bg:C.amberBg, icon:"△"},
                      {key:"strong",  label:"Your Strengths — push these hard",        color:C.green, bg:C.greenBg, icon:"✓"},
                    ].filter(s=>results.gap[s.key]?.length>0).map(section=>(
                      <Card flat key={section.key} style={{ overflow:"hidden" }}>
                        <div style={{ padding:"12px 20px", background:section.bg, borderBottom:`1px solid ${section.color}20` }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:section.color, textTransform:"uppercase", letterSpacing:.7 }}>{section.label}</span>
                        </div>
                        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:10 }}>
                          {results.gap[section.key].map((item,i)=>(
                            <div key={i} style={{ display:"flex", gap:12, padding:"12px 14px", background:section.bg, borderRadius:9, borderLeft:`3px solid ${section.color}` }}>
                              <span style={{ color:section.color, fontWeight:800, fontSize:15, flexShrink:0, marginTop:1 }}>{section.icon}</span>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:4 }}>{item.title}</div>
                                <div style={{ fontSize:13, color:C.ink2, lineHeight:1.7 }}>{item.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                    <Card flat style={{ padding:"14px 18px", background:C.greenBg, border:`1px solid ${C.greenMid}` }}>
                      <div style={{ fontSize:13, color:C.greenDark, lineHeight:1.7 }}>
                        💡 <strong>Next:</strong> Check the Resume tab for your ATS-optimised rewrite, and Cold Email to reach HR directly.
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* TEXT OUTPUTS */}
            {["resume","cover","email"].includes(tab) && (
              <div className="ai">
                {loading[tab] && !results[tab] && (
                  <Card flat style={{ padding:24 }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20 }}>
                      <Spinner color={TABS.find(t=>t.id===tab).color}/>
                      <span style={{ color:C.ink2, fontSize:14 }}>Generating {tab==="resume"?"tailored resume":tab==="cover"?"cover letter":"cold email"}…</span>
                    </div>
                    {[100,90,95,85,92].map((w,i)=><Skel key={i} h={16} w={`${w}%`} style={{ marginBottom:8 }}/>)}
                  </Card>
                )}
                {errors[tab] && (
                  <Card flat style={{ padding:24, background:C.redBg, border:`1px solid ${C.red}30` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:C.red, marginBottom:6 }}>⚠️ Generation failed</div>
                        <div style={{ fontSize:13, color:C.ink2 }}>{errors[tab]}</div>
                      </div>
                      <GhostBtn size="sm" onClick={()=>retryTab(tab)}>Retry</GhostBtn>
                    </div>
                  </Card>
                )}
                {results[tab] && (
                  <Card flat style={{ overflow:"hidden" }}>
                    <div style={{ padding:"14px 20px", background:C.bg, borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:18 }}>{TABS.find(t=>t.id===tab).icon}</span>
                        <span style={{ fontSize:14.5, fontWeight:700, color:C.ink }}>
                          {tab==="resume"?"ATS-Optimised Resume":tab==="cover"?"Cover Letter":"Cold Email to HR"}
                        </span>
                        <Pill color={C.green} bg={C.greenBg}>Ready</Pill>
                      </div>
                      <CopyBtn text={results[tab]} color={TABS.find(t=>t.id===tab).color}/>
                    </div>
                    <div style={{ padding:"20px 22px", maxHeight:520, overflowY:"auto" }}>
                      <pre style={{ fontSize:13.5, lineHeight:1.85, color:C.ink2, whiteSpace:"pre-wrap", fontFamily:"inherit" }}>{results[tab]}</pre>
                    </div>
                    <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.border}`, background: tab==="resume"?C.blueBg:tab==="cover"?C.greenBg:C.amberBg }}>
                      <p style={{ fontSize:13, color: tab==="resume"?C.blue:tab==="cover"?C.greenDark:C.amber }}>
                        {tab==="resume" && "💡 Tip: Copy into Google Docs or Word for visual formatting. Content and keywords are already ATS-safe — don't add tables or images."}
                        {tab==="cover" && "💡 Tip: Attach as PDF alongside your resume. If the form doesn't accept attachments, paste it directly."}
                        {tab==="email" && "💡 Tip: Find HR's name on LinkedIn and replace [HR Name]. Send Tuesday–Thursday, 9–11am. Personalised emails get 2× more replies."}
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* INTERVIEW */}
            {tab==="interview" && (
              <div className="ai">
                <Card flat style={{ overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", background:C.bg, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:"linear-gradient(135deg,#7C3AED,#A78BFA)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🎯</div>
                    <div>
                      <div style={{ fontSize:14.5, fontWeight:700 }}>AI Interview Coach</div>
                      <div style={{ fontSize:12, color:C.ink3 }}>{company||"Target company"} · {role||"Target role"} · Knows your resume + JD</div>
                    </div>
                    <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:C.green, animation:"pulse 2s infinite" }}/>
                      <span style={{ fontSize:12.5, color:C.green, fontWeight:600 }}>Ready</span>
                    </div>
                  </div>

                  <div style={{ height:400, overflowY:"auto", padding:"20px 18px", display:"flex", flexDirection:"column", gap:14 }}>
                    {chat.map((m,i)=>(
                      <div key={i} style={{ display:"flex", justifyContent: m.role==="user"?"flex-end":"flex-start", gap:10, alignItems:"flex-start" }}>
                        {m.role==="ai" && <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7C3AED,#A78BFA)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginTop:2 }}>🎯</div>}
                        <div style={{ maxWidth:"78%", padding:"12px 16px", borderRadius: m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px", background: m.role==="user"?C.ink:C.surface, border:`1px solid ${m.role==="user"?C.ink:C.border}`, color: m.role==="user"?"#fff":C.ink, fontSize:13.5, lineHeight:1.75, whiteSpace:"pre-wrap", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
                          {m.text}
                        </div>
                        {m.role==="user" && <div style={{ width:28, height:28, borderRadius:8, background:C.ink, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0, marginTop:2 }}>You</div>}
                      </div>
                    ))}
                    {chatBusy && (
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7C3AED,#A78BFA)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>🎯</div>
                        <div style={{ padding:"12px 16px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:"4px 16px 16px 16px", display:"flex", gap:8, alignItems:"center" }}>
                          <Spinner size={14} color={C.purple}/><span style={{ fontSize:13, color:C.ink3 }}>Thinking…</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEnd}/>
                  </div>

                  <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.border}`, display:"flex", gap:8, flexWrap:"wrap", background:C.bg }}>
                    {["Start mock interview","What questions to expect?","Salary negotiation tips","Tell me about yourself"].map(p=>(
                      <button key={p} onClick={()=>setChatMsg(p)}
                        style={{ padding:"5px 13px", borderRadius:99, border:`1px solid ${C.border}`, background:C.surface, fontSize:12.5, color:C.ink2, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}
                        onMouseEnter={e=>{e.target.style.borderColor=C.purple;e.target.style.color=C.purple;}}
                        onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.ink2;}}>
                        {p}
                      </button>
                    ))}
                  </div>

                  <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}`, display:"flex", gap:10 }}>
                    <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendChat(); }}}
                      placeholder="Type your answer or ask a question… (Enter to send)"
                      style={{ flex:1, padding:"11px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:14, color:C.ink, transition:"border-color .2s" }}
                      onFocus={e=>e.target.style.borderColor=C.purple}
                      onBlur={e=>e.target.style.borderColor=C.border}
                    />
                    <Btn onClick={sendChat} disabled={!chatMsg.trim()||chatBusy} bg={C.purple} style={{ whiteSpace:"nowrap" }}>
                      {chatBusy ? <Spinner size={16} color="#fff"/> : "Send →"}
                    </Btn>
                  </div>
                </Card>

                <Card flat style={{ padding:"14px 18px", marginTop:14, background:C.purpleBg, border:`1px solid ${C.purple}20` }}>
                  <p style={{ fontSize:13, color:C.purple, lineHeight:1.7 }}>
                    🎯 <strong>How to use:</strong> Type "start" to begin your mock interview. Answer like a real interview. Get scored /10 with the ideal answer after each response. After 5 questions you'll get an overall readiness verdict.
                  </p>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ROOT
═══════════════════════════════════════════ */
export default function KrackHire() {
  const [view, setView] = useState("landing");
  if (view === "tool") return <Tool onBack={() => setView("landing")} />;
  return <Landing onEnter={() => setView("tool")} />;
}
