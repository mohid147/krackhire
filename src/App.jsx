import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────
   SUPABASE
───────────────────────────────────────── */
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SITE_URL  = import.meta.env.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

const sb = SUPA_URL && SUPA_ANON
  ? createClient(SUPA_URL, SUPA_ANON, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    })
  : null;

async function signInGoogle() {
  if (!sb) return;
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: SITE_URL,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}
async function doSignOut()       { if (sb) await sb.auth.signOut(); }
async function getProfile(uid)   { if (!sb) return null; const { data } = await sb.from("profiles").select("*").eq("id", uid).single(); return data; }
async function getAnalyses(uid)  { if (!sb) return []; const { data } = await sb.from("analyses").select("id,company,role,gap_score,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(10); return data || []; }
async function getApprovedReviews() {
  if (!sb) return [];
  const { data } = await sb.from("reviews").select("*").eq("approved", true).order("created_at", { ascending: false }).limit(20);
  return data || [];
}
async function saveReviewDB(r)  { if (!sb) return; await sb.from("reviews").insert({ ...r, approved: false }); }
async function saveFeedbackDB(f){ if (!sb) return; await sb.from("feedback").insert(f).catch(() => {}); }

/* ─────────────────────────────────────────
   SECURE API
───────────────────────────────────────── */
async function callAPI(type, payload) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 50000);
  try {
    const res  = await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data.result;
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw e;
  }
}

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

/* ─────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────── */
const C = {
  bg: "#F9F8F6", surface: "#FFFFFF", ink: "#1C1917",
  ink2: "#57534E", ink3: "#A8A29E", ink4: "#E7E5E4",
  border: "#E7E5E4",
  sage: "#3D6B4F",    sageBg: "#F0F5F2",   sageMid: "#D4E6DA",
  red: "#C0392B",     redBg: "#FDF2F2",
  amber: "#B45309",   amberBg: "#FFFBEB",
  blue: "#1D4ED8",    blueBg: "#EFF6FF",
  stone: "#78716C",
};

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function ToastItem({ id, msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(() => onClose(id), 4200); return () => clearTimeout(t); }, [id, onClose]);
  const m = { success: [C.sage, C.sageBg], error: [C.red, C.redBg], info: [C.blue, C.blueBg] };
  const [clr, bg] = m[type] || m.info;
  return (
    <div style={{ padding: "12px 16px", background: bg, border: `1px solid ${clr}30`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.08)", display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: clr, fontWeight: 500, maxWidth: 340, animation: "slideUp .25s ease" }}>
      <span>{type === "success" ? "✓" : type === "error" ? "✕" : "·"}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={() => onClose(id)} style={{ opacity: .5, fontSize: 18, lineHeight: 1, color: clr, cursor: "pointer" }}>×</button>
    </div>
  );
}
function Toasts({ list, remove }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {list.map(t => <div key={t.id} style={{ pointerEvents: "all" }}><ToastItem {...t} onClose={remove} /></div>)}
    </div>
  );
}
function useToast() {
  const [list, setList] = useState([]);
  const toast  = useCallback((msg, type = "success") => { const id = `${Date.now()}-${Math.random()}`; setList(p => [...p.slice(-4), { id, msg, type }]); }, []);
  const remove = useCallback((id) => setList(p => p.filter(x => x.id !== id)), []);
  return { toast, list, remove };
}

/* ─────────────────────────────────────────
   PRIMITIVES
───────────────────────────────────────── */
const Spin = memo(({ s = 18, c = C.sage }) =>
  <span style={{ display: "inline-block", width: s, height: s, borderRadius: "50%", border: `2px solid ${c}25`, borderTopColor: c, animation: "spin .7s linear infinite", flexShrink: 0 }} />
);

const Tag = memo(({ children, color = C.sage, bg }) =>
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, background: bg || color + "15", color, fontSize: 12, fontWeight: 600, letterSpacing: .3 }}>{children}</span>
);

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 2000); }}
      style={{ padding: "5px 13px", borderRadius: 6, border: `1px solid ${ok ? C.sage : C.border}`, background: ok ? C.sage : C.surface, color: ok ? "#fff" : C.ink2, fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all .18s" }}>
      {ok ? "✓ Copied" : "Copy"}
    </button>
  );
}

function Btn({ children, onClick, disabled, size = "md", bg = C.ink, full, style: ext = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} className="kh-btn"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 8, border: "none", background: disabled ? C.ink4 : bg, color: disabled ? C.ink3 : "#fff", fontSize: size === "lg" ? 15.5 : size === "sm" ? 13 : 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", padding: size === "lg" ? "14px 32px" : size === "sm" ? "7px 15px" : "10px 22px", transition: "all .18s", width: full ? "100%" : "auto", boxShadow: disabled ? "none" : "0 1px 4px rgba(0,0,0,.10)", ...ext }}>
      {children}
    </button>
  );
}
function OutBtn({ children, onClick, size = "md", style: ext = {} }) {
  return (
    <button onClick={onClick} className="kh-out"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.ink2, fontSize: size === "sm" ? 13 : 14, fontWeight: 600, padding: size === "sm" ? "7px 15px" : "10px 22px", transition: "all .18s", cursor: "pointer", ...ext }}>
      {children}
    </button>
  );
}

function Card({ children, style: ext = {}, flat }) {
  return <div className={flat ? "" : "kh-card"} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: flat ? "none" : "0 1px 3px rgba(0,0,0,.05)", ...ext }}>{children}</div>;
}

function Field({ label, value, onChange, placeholder, rows, accent = C.sage, hint, maxLen }) {
  const [f, setF] = useState(false);
  const base = { padding: "11px 13px", borderRadius: 8, border: `1.5px solid ${f ? accent : C.border}`, background: f ? C.surface : C.bg, fontSize: 14, color: C.ink, transition: "all .18s", width: "100%", fontFamily: "inherit", outline: "none" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, letterSpacing: .5, textTransform: "uppercase" }}>{label}</label>
          {maxLen && <span style={{ fontSize: 11, color: value?.length > maxLen * .9 ? C.red : C.ink3 }}>{value?.length || 0}/{maxLen}</span>}
        </div>
      )}
      {rows
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} maxLength={maxLen} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ ...base, lineHeight: 1.75, resize: "vertical" }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLen} onFocus={() => setF(true)} onBlur={() => setF(false)} style={base} />
      }
      {hint && <span style={{ fontSize: 12, color: C.ink3 }}>{hint}</span>}
    </div>
  );
}

const Skel = ({ h = 16, w = "100%", r = 6 }) =>
  <div style={{ height: h, width: w, borderRadius: r, background: "linear-gradient(90deg,#f0eeec 25%,#e8e6e3 50%,#f0eeec 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />;

function Stars({ rating, interactive, onChange }) {
  const [hov, setHov] = useState(0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => interactive && onChange(n)} onMouseEnter={() => interactive && setHov(n)} onMouseLeave={() => interactive && setHov(0)}
          style={{ fontSize: 20, cursor: interactive ? "pointer" : "default", color: n <= (hov || rating) ? "#D97706" : C.ink4, transition: "color .12s" }}>★</span>
      ))}
    </div>
  );
}

function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: .1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)", transition: `opacity .55s ${delay}s ease, transform .55s ${delay}s ease` }}>{children}</div>;
}

/* ─────────────────────────────────────────
   LOGO
───────────────────────────────────────── */
const Logo = memo(({ dark, size = "md" }) => {
  const fs = size === "sm" ? 15 : size === "lg" ? 21 : 17;
  const ws = size === "sm" ? 26 : size === "lg" ? 36 : 30;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: fs, letterSpacing: "-.3px", color: dark ? "#fff" : C.ink }}>
      <svg width={ws} height={ws} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="9" fill="#3D6B4F" />
        <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white" />
        <circle cx="31" cy="31" r="7" fill="#6EBD8A" />
        <path d="M28 31L30.5 33.5L34.5 29" stroke="#3D6B4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Krack<span style={{ color: C.sage }}>Hire</span></span>
    </div>
  );
});

/* ─────────────────────────────────────────
   AUTH MODAL
───────────────────────────────────────── */
function AuthModal({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, padding: "36px 32px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 20px 48px rgba(0,0,0,.18)" }}>
        <Logo size="lg" />
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 22, color: C.ink, margin: "20px 0 8px", fontWeight: 700 }}>Sign in to KrackHire</h2>
        <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.7, marginBottom: 24 }}>Save your analyses, track progress, and leave a review after using the tool.</p>
        <Btn onClick={signInGoogle} full bg={C.ink} style={{ fontSize: 14.5, padding: "12px 24px", marginBottom: 16 }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </Btn>
        <p style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>Your resume data is processed in real time and not stored permanently.</p>
        <button onClick={onClose} style={{ marginTop: 14, fontSize: 13, color: C.ink3, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Continue without account →</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   USER MENU
───────────────────────────────────────── */
function UserMenu({ user, profile, onSignOut }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", fontFamily: "inherit" }}>
        {user.user_metadata?.avatar_url
          ? <img src={user.user_metadata.avatar_url} style={{ width: 24, height: 24, borderRadius: "50%" }} alt="" />
          : <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.sage, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{(user.user_metadata?.name || user.email || "U")[0].toUpperCase()}</div>
        }
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.user_metadata?.name?.split(" ")[0] || user.email?.split("@")[0]}</span>
        <span style={{ fontSize: 10, color: C.ink3 }}>▾</span>
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.10)", minWidth: 200, zIndex: 500, overflow: "hidden", animation: "slideUp .2s ease" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{user.user_metadata?.name || "User"}</div>
            <div style={{ fontSize: 12, color: C.ink3 }}>{user.email}</div>
            {profile && <div style={{ marginTop: 4 }}><Tag color={profile.plan === "pro" ? C.amber : C.stone}>{profile.plan || "free"} plan</Tag></div>}
          </div>
          <button onClick={onSignOut} style={{ width: "100%", padding: "11px 14px", textAlign: "left", fontSize: 13, color: C.red, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   ANALYSIS FEEDBACK WIDGET
   Shows after every analysis completes
───────────────────────────────────────── */
function AnalysisFeedback({ company, role, gapScore, userId, onDone }) {
  const [choice, setChoice]   = useState(null); // "yes" | "improve"
  const [text, setText]       = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await saveFeedbackDB({
      helpful: choice === "yes",
      comment: text.trim() || null,
      company: company || null,
      role: role || null,
      gap_score: gapScore || null,
      user_id: userId || null,
    });
    setLoading(false);
    setSent(true);
    setTimeout(onDone, 2000);
  }

  if (sent) return (
    <div style={{ padding: "16px 20px", background: C.sageBg, borderRadius: 10, border: `1px solid ${C.sage}25`, textAlign: "center" }}>
      <span style={{ fontSize: 14, color: C.sage, fontWeight: 600 }}>✓ Thanks for your feedback — it helps us improve.</span>
    </div>
  );

  return (
    <div style={{ padding: "18px 20px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 12 }}>Was this analysis helpful?</div>
      <div style={{ display: "flex", gap: 8, marginBottom: choice ? 14 : 0 }}>
        {[["yes", "✓  Yes, it helped"], ["improve", "↻  Needs improvement"]].map(([v, label]) => (
          <button key={v} onClick={() => setChoice(v)}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${choice === v ? C.sage : C.border}`, background: choice === v ? C.sageBg : C.surface, color: choice === v ? C.sage : C.ink2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
            {label}
          </button>
        ))}
      </div>
      {choice && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="What could we improve? (optional)" value={text} onChange={setText} placeholder="Tell us what was missing or unclear…" rows={2} maxLen={500} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={submit} disabled={loading} bg={C.sage} size="sm">{loading ? <><Spin s={14} c="#fff" /> Saving…</> : "Submit feedback"}</Btn>
            <OutBtn onClick={onDone} size="sm">Skip</OutBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   SHARE SCORE WIDGET
───────────────────────────────────────── */
function ShareScore({ score, role }) {
  const [copied, setCopied] = useState(false);
  const text = `My resume scored ${score}/100 on KrackHire${role ? ` for a ${role} role` : ""}. Still improving it. krackhire.vercel.app`;

  function share() {
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: C.bg, borderRadius: 9, border: `1px solid ${C.border}` }}>
      <div style={{ flex: 1, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
        <strong style={{ color: C.ink }}>Share your score</strong> — if you'd like to.<br />
        <span style={{ fontSize: 12, color: C.ink3 }}>"{text.slice(0, 60)}…"</span>
      </div>
      <button onClick={share}
        style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, fontSize: 13, fontWeight: 600, color: C.ink2, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all .15s" }}>
        {copied ? "✓ Copied" : "Share"}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   REVIEW FORM
───────────────────────────────────────── */
function ReviewForm({ user, onDone }) {
  const [name,   setName]   = useState(user?.user_metadata?.name || "");
  const [role,   setRole]   = useState("");
  const [rating, setRating] = useState(0);
  const [text,   setText]   = useState("");
  const [err,    setErr]    = useState("");
  const [done,   setDone]   = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim())          return setErr("Please enter your name.");
    if (rating === 0)          return setErr("Please select a star rating.");
    if (text.trim().length < 20) return setErr("Please write at least 20 characters.");
    setErr(""); setSaving(true);
    try {
      await saveReviewDB({ name: name.trim(), role: role.trim() || null, rating, text: text.trim(), user_id: user?.id || null });
      setDone(true);
    } catch { setErr("Could not save. Please try again."); }
    setSaving(false);
  }

  if (done) return (
    <div style={{ padding: "28px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🙏</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.sage, marginBottom: 6 }}>Thank you for your feedback</div>
      <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.7 }}>Your review will appear once it's been reviewed by our team. We appreciate your honesty.</div>
    </div>
  );

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Share your experience</div>
      <div style={{ padding: "10px 14px", background: C.sageBg, borderRadius: 8, fontSize: 13, color: C.sage, lineHeight: 1.6 }}>
        Reviews are shown only after manual approval. Be honest — this helps other freshers make an informed decision.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Your Name *" value={name} onChange={setName} placeholder="e.g. Rahul Kumar" maxLen={50} />
        <Field label="College / Role (optional)" value={role} onChange={setRole} placeholder="e.g. CS Student, JNTU" maxLen={80} />
      </div>
      <div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, letterSpacing: .5, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Rating *</label>
        <Stars rating={rating} interactive onChange={setRating} />
      </div>
      <Field label="Your Review *" value={text} onChange={setText} placeholder="What did you find useful? What could be better? Any specific result?" rows={4} maxLen={600} />
      {err && <div style={{ fontSize: 13, color: C.red, padding: "8px 12px", background: C.redBg, borderRadius: 7 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={submit} bg={C.sage} disabled={saving}>{saving ? <><Spin s={14} c="#fff" />Saving…</> : "Submit review"}</Btn>
        {onDone && <OutBtn onClick={onDone} size="sm">Cancel</OutBtn>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────── */
function Dashboard({ userId, onClose }) {
  const [analyses, setAnalyses] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { getAnalyses(userId).then(d => { setAnalyses(d); setLoading(false); }).catch(() => setLoading(false)); }, [userId]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 48px rgba(0,0,0,.14)" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bg }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>My Analyses</div>
          <button onClick={onClose} style={{ fontSize: 22, color: C.ink3, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? [1,2,3].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={56} /></div>)
           : analyses.length === 0
             ? <div style={{ textAlign: "center", padding: "40px 16px", color: C.ink3 }}>
                 <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
                 <div style={{ fontSize: 14 }}>No saved analyses yet.</div>
                 <div style={{ fontSize: 13, marginTop: 4 }}>Run your first analysis to see it here.</div>
               </div>
             : analyses.map((a, i) => {
                 const clr = a.gap_score >= 70 ? C.sage : a.gap_score >= 50 ? C.amber : C.red;
                 return (
                   <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 9, border: `1px solid ${C.border}`, marginBottom: 8, background: C.bg }}>
                     <div style={{ width: 40, height: 40, borderRadius: 8, background: clr + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                       <span style={{ fontSize: 14, fontWeight: 800, color: clr }}>{a.gap_score ?? "?"}</span>
                     </div>
                     <div style={{ flex: 1, minWidth: 0 }}>
                       <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.role || "Unknown role"}{a.company ? ` — ${a.company}` : ""}</div>
                       <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                     </div>
                     <div style={{ fontSize: 12, fontWeight: 700, color: clr }}>{a.gap_score}/100</div>
                   </div>
                 );
               })
          }
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   STATIC DATA
───────────────────────────────────────── */
const FEATURES = [
  { icon: "🔍", title: "Resume Score",         desc: "A score out of 100 based on how well your resume matches the job. Includes ATS compatibility, skill match, and clarity.",  color: C.sage,  bg: C.sageBg  },
  { icon: "📋", title: "Gap Analysis",         desc: "Clear list of what's missing, what's weak, and what you're doing well — specific to this job description.",               color: C.blue,  bg: C.blueBg  },
  { icon: "📄", title: "Improved Resume",      desc: "Your resume rewritten with relevant keywords from the JD. ATS-safe plain text. Ready to paste into any format.",          color: C.sage,  bg: C.sageBg  },
  { icon: "✉️", title: "Cover Letter",         desc: "A short, specific cover letter in professional Indian English. Personalised to the company and role. Under 250 words.",   color: C.amber, bg: C.amberBg },
  { icon: "📧", title: "Cold Email to HR",     desc: "A concise email with subject line. Under 150 words. Confident tone with a single clear ask.",                            color: C.stone, bg: C.bg      },
  { icon: "🎯", title: "Interview Preparation",desc: "A chatbot that knows your resume and the JD. Asks real questions, scores your answers, and shows ideal responses.",       color: C.blue,  bg: C.blueBg  },
];

const FAQS = [
  { q: "Is KrackHire free to use?",             a: "Yes — completely free during our beta phase. No account required and no credit card needed. When paid plans launch, free users will keep access to 3 analyses per month." },
  { q: "Do I need to create an account?",       a: "No. You can use the tool without signing in. Create an account to save your analyses and track your progress over time." },
  { q: "How accurate is the resume score?",     a: "The score reflects how well your resume matches the specific job description you provide. It is a practical signal, not a guarantee. Use it as a starting point for improvement." },
  { q: "Will the resume pass ATS filters?",     a: "The rewritten resume uses keywords from the job description and avoids tables, images, and unusual formatting — which are common causes of ATS rejection." },
  { q: "Is my data private?",                   a: "Your resume and job description are sent to the AI in real time to generate results. They are not stored permanently unless you are signed in and choose to save your analysis." },
  { q: "How are user reviews verified?",        a: "Every review is manually approved before appearing on this page. We do not display fake or unverified testimonials." },
];

/* ─────────────────────────────────────────
   LANDING PAGE
───────────────────────────────────────── */
function Landing({ onEnter, user, profile, onShowAuth, onSignOut }) {
  const [scrolled,    setScrolled]    = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [faqOpen,     setFaqOpen]     = useState(null);
  const [reviews,     setReviews]     = useState([]);
  const [reviewsDone, setReviewsDone] = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [page,        setPage]        = useState(0);
  const PER = 3;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    getApprovedReviews().then(data => { setReviews(data); setReviewsDone(true); }).catch(() => setReviewsDone(true));
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const visible    = reviews.slice(page * PER, (page + 1) * PER);
  const totalPages = Math.ceil(reviews.length / PER);
  const avg        = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const navLinks   = [["#how", "How it works"], ["#features", "Features"], ["#reviews", "Reviews"], ["#faq", "FAQ"]];

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>

      {/* ANNOUNCEMENT */}
      <div style={{ background: C.sage, color: "#fff", textAlign: "center", padding: "9px 16px", fontSize: 13.5, fontWeight: 500 }}>
        KrackHire is in early beta — free to use, no account needed.{" "}
        <button onClick={onEnter} style={{ color: "#D4E6DA", fontWeight: 700, textDecoration: "underline", cursor: "pointer", background: "none", border: "none", fontSize: 13.5, fontFamily: "inherit" }}>Try it →</button>
      </div>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 200, height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(16px,5vw,52px)", background: scrolled ? "rgba(249,248,246,.95)" : "transparent", backdropFilter: "blur(14px)", borderBottom: `1px solid ${scrolled ? C.border : "transparent"}`, transition: "all .3s" }}>
        <Logo />
        <div style={{ display: "flex", gap: 2 }} className="desktop-nav">
          {navLinks.map(([h, l]) => (
            <a key={l} href={h} style={{ padding: "6px 12px", borderRadius: 7, fontSize: 13.5, fontWeight: 500, color: C.ink2, transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = C.ink; e.currentTarget.style.background = C.surface; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.ink2; e.currentTarget.style.background = "transparent"; }}>
              {l}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {user
            ? <UserMenu user={user} profile={profile} onSignOut={onSignOut} />
            : <><OutBtn onClick={onShowAuth} size="sm">Sign in</OutBtn><Btn onClick={onEnter} size="sm" bg={C.sage}>Try free</Btn></>
          }
          <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)} style={{ display: "none", padding: 8, borderRadius: 7, color: C.ink2, fontSize: 22, lineHeight: 1 }}>{menuOpen ? "✕" : "☰"}</button>
        </div>
      </nav>

      {menuOpen && (
        <div style={{ position: "fixed", top: 107, left: 0, right: 0, zIndex: 199, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4, animation: "slideUp .2s ease", boxShadow: "0 6px 20px rgba(0,0,0,.07)" }}>
          {navLinks.map(([h, l]) => <a key={l} href={h} onClick={() => setMenuOpen(false)} style={{ padding: "11px 14px", borderRadius: 7, fontSize: 14.5, fontWeight: 500, color: C.ink2 }}>{l}</a>)}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}`, marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            {!user && <OutBtn onClick={() => { setMenuOpen(false); onShowAuth(); }} style={{ justifyContent: "center" }}>Sign in with Google</OutBtn>}
            <Btn onClick={() => { setMenuOpen(false); onEnter(); }} full bg={C.sage}>Open the tool</Btn>
          </div>
        </div>
      )}

      {/* HERO */}
      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "clamp(60px,10vw,110px) clamp(16px,5vw,52px) clamp(56px,8vw,96px)" }}>
        <Reveal>
          <div style={{ maxWidth: 680 }}>
            <Tag color={C.sage} bg={C.sageBg} style={{ marginBottom: 18, display: "inline-flex" }}>Early beta — free to use</Tag>
            <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(32px,4.2vw,52px)", lineHeight: 1.12, letterSpacing: "-.3px", color: C.ink, marginBottom: 20, marginTop: 14 }}>
              Understand why your resume<br />gets rejected —<br />
              <em style={{ fontStyle: "italic", color: C.sage }}>before you apply.</em>
            </h1>
            <p style={{ fontSize: "clamp(15px,1.7vw,17px)", color: C.ink2, lineHeight: 1.85, marginBottom: 32, maxWidth: 520 }}>
              Paste your resume and job description. Get a clear score, missing skills, and practical fixes in seconds. No hype. No fake results. Just honest feedback.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
              <Btn onClick={onEnter} size="lg" bg={C.sage}>Open the tool — it's free</Btn>
              {!user && <OutBtn onClick={onShowAuth} size="lg">Sign in to save analyses</OutBtn>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              {["No account needed", "No credit card", "Data not stored", "Built for India"].map(t => (
                <span key={t} style={{ fontSize: 13, color: C.ink3, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: C.sage }}>✓</span>{t}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Score preview card */}
        <Reveal delay={0.1}>
          <div style={{ marginTop: 52, maxWidth: 580 }}>
            <Card flat style={{ overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 4 }}>{["#FF5F57","#FEBC2E","#28C840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}</div>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.ink3 }}>Example result — your results will differ</span>
              </div>
              <div style={{ padding: "18px 20px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.ink3, textTransform: "uppercase", letterSpacing: .6, marginBottom: 4 }}>Resume Score</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: C.sage, lineHeight: 1, letterSpacing: -1 }}>72 <span style={{ fontSize: 16, color: C.ink3, fontWeight: 400 }}>/100</span></div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.ink3, textTransform: "uppercase", letterSpacing: .6, marginBottom: 4 }}>ATS Compatibility</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.amber }}>68%</div>
                  </div>
                </div>
                <div style={{ height: 6, background: C.bg, borderRadius: 99, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ width: "72%", height: "100%", background: `linear-gradient(90deg,${C.sage},#6EBD8A)`, borderRadius: 99 }} />
                </div>
                {[
                  { t: "red",   i: "✗", title: "Missing: SQL basics",       sub: "This skill appears in 4 out of 5 similar job descriptions." },
                  { t: "amber", i: "△", title: "Weak: Project descriptions", sub: "Achievements lack numbers. 'Reduced errors by 40%' is clearer than 'improved process'." },
                  { t: "green", i: "✓", title: "Strong: Operations experience", sub: "Relevant and specific. Make this prominent in your summary." },
                ].map((g, i) => {
                  const m = { red: [C.red, C.redBg], amber: [C.amber, C.amberBg], green: [C.sage, C.sageBg] };
                  const [clr, bg] = m[g.t];
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "9px 12px", background: bg, borderRadius: 7, borderLeft: `3px solid ${clr}`, marginBottom: 8 }}>
                      <span style={{ color: clr, fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{g.i}</span>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: clr }}>{g.title}</div>
                        <div style={{ fontSize: 12, color: C.ink2, marginTop: 2, lineHeight: 1.5 }}>{g.sub}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 12, padding: "8px 12px", background: C.bg, borderRadius: 7, fontSize: 12, color: C.ink3, fontStyle: "italic" }}>
                  This is a sample result. Your actual score and feedback will be based on your specific resume and job description.
                </div>
              </div>
            </Card>
          </div>
        </Reveal>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "72px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <Tag color={C.blue} bg={C.blueBg}>How it works</Tag>
              <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(26px,3.5vw,38px)", lineHeight: 1.2, margin: "14px 0 12px", color: C.ink }}>Simple. Honest. Practical.</h2>
              <p style={{ fontSize: 15.5, color: C.ink2, maxWidth: 420, margin: "0 auto", lineHeight: 1.75 }}>No account required. No complicated setup. Just paste and get clear feedback.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }} className="how-grid">
              {[
                { n: "01", title: "Paste your resume",          desc: "Any format. Copy the full text." },
                { n: "02", title: "Paste the job description",  desc: "From Naukri, LinkedIn, or any portal." },
                { n: "03", title: "Get your score and gaps",    desc: "Clear results in about 20 seconds." },
                { n: "04", title: "Improve and apply",         desc: "Use the feedback to strengthen your application." },
              ].map((s, i) => (
                <div key={i} style={{ padding: "26px 20px", borderRight: i < 3 ? `1px solid ${C.border}` : "none", background: C.surface, transition: "background .18s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = C.surface}>
                  <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 36, color: C.ink4, lineHeight: 1, marginBottom: 12, fontWeight: 700 }}>{s.n}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: C.ink }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}><Btn onClick={onEnter} size="lg" bg={C.sage}>Try it now — free</Btn></div>
          </Reveal>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "72px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <Tag>What you get</Tag>
              <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(26px,3.5vw,38px)", lineHeight: 1.2, margin: "14px 0 12px", color: C.ink }}>Six practical tools in one analysis.</h2>
              <p style={{ fontSize: 15.5, color: C.ink2, maxWidth: 440, margin: "0 auto", lineHeight: 1.75 }}>Everything generates together in about 20 seconds. No switching between tools.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
              {FEATURES.map((f, i) => (
                <Card key={i} style={{ padding: "22px 20px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>{f.icon}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6, color: C.ink }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.75 }}>{f.desc}</div>
                </Card>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* REVIEWS — honest section */}
      <section id="reviews" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "72px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <Reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 36 }}>
              <div>
                <Tag color={C.amber} bg={C.amberBg}>User feedback</Tag>
                <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(26px,3.5vw,38px)", lineHeight: 1.2, margin: "14px 0 8px", color: C.ink }}>What people are saying.</h2>
                {avg && reviews.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Stars rating={Math.round(parseFloat(avg))} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{avg}/5</span>
                    <span style={{ fontSize: 13, color: C.ink3 }}>({reviews.length} verified {reviews.length === 1 ? "review" : "reviews"})</span>
                  </div>
                )}
              </div>
              <Btn onClick={() => { if (!user) { onShowAuth(); return; } setShowForm(!showForm); }} bg={C.sage} size="sm">
                {showForm ? "✕ Cancel" : "Leave a review"}
              </Btn>
            </div>

            {/* Review form */}
            {showForm && (
              <Card flat style={{ marginBottom: 28, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <ReviewForm user={user} onDone={() => setShowForm(false)} />
              </Card>
            )}

            {/* Reviews or empty state */}
            {!reviewsDone ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }} className="reviews-grid">
                {[1,2,3].map(i => <div key={i}><Skel h={140} /></div>)}
              </div>
            ) : reviews.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 8 }}>Early beta — user feedback will appear here as people try the product.</div>
                <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
                  We don't display fake or unverified testimonials. Reviews appear only after manual approval. If you've used the tool, we'd love to hear from you.
                </div>
                <div style={{ marginTop: 20 }}>
                  <Btn onClick={() => { if (!user) { onShowAuth(); return; } setShowForm(true); }} bg={C.sage} size="sm">Be the first to review</Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }} className="reviews-grid">
                  {visible.map((r, i) => (
                    <Card key={i} style={{ padding: "20px 18px" }}>
                      <Stars rating={r.rating} />
                      <p style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.75, margin: "10px 0 14px", fontStyle: "italic" }}>"{r.text}"</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.sageBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.sage, flexShrink: 0 }}>{r.name[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{r.name}</div>
                          {r.role && <div style={{ fontSize: 11.5, color: C.ink3 }}>{r.role}</div>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                    <OutBtn onClick={() => setPage(p => Math.max(0, p - 1))} size="sm" style={{ opacity: page === 0 ? .4 : 1 }}>← Prev</OutBtn>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button key={i} onClick={() => setPage(i)} style={{ width: 34, height: 34, borderRadius: 7, border: `1.5px solid ${page === i ? C.sage : C.border}`, background: page === i ? C.sage : C.surface, color: page === i ? "#fff" : C.ink2, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>{i + 1}</button>
                    ))}
                    <OutBtn onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} size="sm" style={{ opacity: page === totalPages - 1 ? .4 : 1 }}>Next →</OutBtn>
                  </div>
                )}
              </>
            )}
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: "72px clamp(16px,5vw,52px)" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: "clamp(28px,6vw,72px)" }} className="faq-grid">
              <div>
                <Tag>FAQ</Tag>
                <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(22px,2.8vw,32px)", lineHeight: 1.2, margin: "14px 0 12px", color: C.ink }}>Common questions.</h2>
                <p style={{ fontSize: 14.5, color: C.ink2, lineHeight: 1.75, marginBottom: 22 }}>If your question isn't here, email us at hello@krackhire.in and we'll reply within 24 hours.</p>
                <OutBtn onClick={onEnter}>Open the tool →</OutBtn>
              </div>
              <div>
                {FAQS.map((f, i) => (
                  <div key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", background: "none", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600, color: C.ink, fontFamily: "inherit", textAlign: "left", gap: 14 }}>
                      <span>{f.q}</span>
                      <span style={{ fontSize: 20, color: C.ink3, transform: faqOpen === i ? "rotate(45deg)" : "none", transition: "transform .25s", flexShrink: 0 }}>+</span>
                    </button>
                    <div style={{ overflow: "hidden", maxHeight: faqOpen === i ? 300 : 0, transition: "max-height .36s ease" }}>
                      <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.8, paddingBottom: 18 }}>{f.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.sageBg, borderTop: `1px solid ${C.sage}25`, padding: "80px clamp(16px,5vw,52px)", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(26px,4vw,42px)", lineHeight: 1.15, color: C.ink, marginBottom: 14 }}>
            Start improving your<br />applications today.
          </h2>
          <p style={{ fontSize: 16, color: C.ink2, marginBottom: 32, lineHeight: 1.75, maxWidth: 440, margin: "0 auto 32px" }}>
            No account. No credit card. Paste your resume and get honest feedback in seconds.
          </p>
          <Btn onClick={onEnter} size="lg" bg={C.sage}>Open KrackHire — free</Btn>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap", fontSize: 13, color: C.ink3 }}>
            {["No account needed", "No credit card", "Data not stored", "Made in Hyderabad 🇮🇳"].map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: C.sage }}>✓</span>{t}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#1C1917", color: "#fff", padding: "48px clamp(16px,5vw,52px) 28px" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, paddingBottom: 36, borderBottom: "1px solid #292524" }} className="footer-grid">
            <div>
              <Logo dark />
              <p style={{ fontSize: 13, color: "#78716C", lineHeight: 1.75, marginTop: 12, maxWidth: 240 }}>A free tool to help Indian freshers understand and improve their job applications. Honest feedback. No hype.</p>
              <p style={{ fontSize: 12, color: "#57534E", marginTop: 10 }}>Made with care in Hyderabad, India</p>
            </div>
            {[
              { title: "Product",  links: ["Features", "How it works", "FAQ"] },
              { title: "Company",  links: ["About", "Blog", "Contact"] },
              { title: "Legal",    links: ["Privacy Policy", "Terms of Service"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#78716C", textTransform: "uppercase", letterSpacing: .8, marginBottom: 14 }}>{col.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map(l => <a key={l} href="#" style={{ fontSize: 13.5, color: "#78716C", transition: "color .15s" }} onMouseEnter={e => e.target.style.color = "#fff"} onMouseLeave={e => e.target.style.color = "#78716C"}>{l}</a>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 22, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#57534E" }}>
            <span>© 2025 KrackHire. All rights reserved.</span>
            <span>Early beta — we improve based on genuine feedback.</span>
          </div>
        </div>
      </footer>

      {/* Mobile CTA */}
      <div className="mobile-cta" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 198, padding: "11px 16px", background: "rgba(249,248,246,.97)", backdropFilter: "blur(12px)", borderTop: `1px solid ${C.border}`, alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div><div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>KrackHire</div><div style={{ fontSize: 11.5, color: C.ink3 }}>Free resume analysis tool</div></div>
        <Btn onClick={onEnter} size="sm" bg={C.sage}>Try free</Btn>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   TOOL
───────────────────────────────────────── */
const TABS = [
  { id: "gap",       label: "Score & Gaps",    icon: "🔍", color: C.sage  },
  { id: "resume",    label: "Resume",          icon: "📄", color: C.blue  },
  { id: "cover",     label: "Cover Letter",    icon: "✉️", color: C.amber },
  { id: "email",     label: "Cold Email",      icon: "📧", color: C.stone },
  { id: "interview", label: "Interview Prep",  icon: "🎯", color: C.blue  },
];

function Tool({ onBack, user, profile }) {
  const { toast, list: toastList, remove: removeToast } = useToast();
  const [resume,  setResume]  = useState("");
  const [jd,      setJd]      = useState("");
  const [company, setCompany] = useState("");
  const [role,    setRole]    = useState("");
  const [ran,     setRan]     = useState(false);
  const [tab,     setTab]     = useState("gap");
  const [results, setResults] = useState({ gap: null, resume: null, cover: null, email: null });
  const [loading, setLoading] = useState({ gap: false, resume: false, cover: false, email: false });
  const [errors,  setErrors]  = useState({ gap: null, resume: null, cover: null, email: null });
  const [chat,    setChat]    = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [chatBusy,setChatBusy]= useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showDash,     setShowDash]     = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const payload = useMemo(() => ({ resume, jd, company, role, userId: user?.id || null }), [resume, jd, company, role, user]);
  const setL = useCallback((k, v) => setLoading(p => ({ ...p, [k]: v })), []);
  const setR = useCallback((k, v) => setResults(p => ({ ...p, [k]: v })), []);
  const setE = useCallback((k, v) => setErrors(p => ({ ...p, [k]: v })), []);

  async function analyse() {
    if (!resume.trim() || !jd.trim()) { toast("Please fill in both fields.", "error"); return; }
    if (resume.length > 8000) { toast("Resume too long — max 8000 characters.", "error"); return; }
    if (jd.length > 4000) { toast("Job description too long — max 4000 characters.", "error"); return; }

    setRan(true); setTab("gap"); setShowFeedback(false);
    setResults({ gap: null, resume: null, cover: null, email: null });
    setErrors({ gap: null, resume: null, cover: null, email: null });
    setLoading({ gap: true, resume: true, cover: true, email: true });

    await Promise.allSettled([
      callAPI("gap", payload)
        .then(raw => { const p = parseJSON(raw); p ? setR("gap", p) : setE("gap", "Could not parse result. Please try again."); })
        .catch(e => { setE("gap", e.message); if (e.message.includes("LIMIT_REACHED")) toast("Monthly limit reached. Upgrade to Pro for unlimited analyses.", "error"); })
        .finally(() => setL("gap", false)),
      callAPI("resume", payload).then(r => setR("resume", r)).catch(e => setE("resume", e.message)).finally(() => setL("resume", false)),
      callAPI("cover",  payload).then(r => setR("cover",  r)).catch(e => setE("cover",  e.message)).finally(() => setL("cover",  false)),
      callAPI("email",  payload).then(r => setR("email",  r)).catch(e => setE("email",  e.message)).finally(() => setL("email",  false)),
    ]);

    // Show feedback widget after all done
    setShowFeedback(true);

    setChat([{ role: "ai", text: `Hello. I'm your interview preparation coach for the ${role || "this"} role${company ? ` at ${company}` : ""}.\n\nI've reviewed your resume and the job description. I'll ask you interview questions one at a time, score your answers out of 10, and show you what an ideal response looks like.\n\nType "start" when you're ready to begin, or ask me anything about the role first.` }]);
  }

  async function retryTab(t) {
    setE(t, null); setL(t, true);
    try {
      if (t === "gap") { const raw = await callAPI("gap", payload); const p = parseJSON(raw); p ? setR("gap", p) : setE("gap", "Parse error. Try again."); }
      else { const r = await callAPI(t, payload); setR(t, r); }
    } catch (e) { setE(t, e.message); }
    setL(t, false);
  }

  async function sendChat() {
    if (!chatMsg.trim() || chatBusy) return;
    const msg = chatMsg.trim(); setChatMsg("");
    const updated = [...chat, { role: "user", text: msg }];
    setChat(updated); setChatBusy(true);
    try {
      const messages = updated.slice(-12).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const reply = await callAPI("interview", { ...payload, messages });
      setChat(c => [...c, { role: "ai", text: reply }]);
    } catch (e) {
      setChat(c => [...c, { role: "ai", text: "Something went wrong. Please try again." }]);
    }
    setChatBusy(false);
  }

  const score    = results.gap?.score ?? 0;
  const scoreClr = score >= 70 ? C.sage : score >= 50 ? C.amber : C.red;
  const anyLoad  = Object.values(loading).some(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <Toasts list={toastList} remove={removeToast} />
      {showDash && user && <Dashboard userId={user.id} onClose={() => setShowDash(false)} />}

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(12px,4vw,36px)", background: "rgba(249,248,246,.95)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size="sm" />
          <Tag color={C.sage} bg={C.sageBg}>Beta</Tag>
          {anyLoad && <span style={{ fontSize: 12.5, color: C.ink3, display: "flex", alignItems: "center", gap: 5 }}><Spin s={13} />Generating…</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {user && <OutBtn size="sm" onClick={() => setShowDash(true)}>My analyses</OutBtn>}
          {ran  && <OutBtn size="sm" onClick={() => { setRan(false); setResults({ gap:null, resume:null, cover:null, email:null }); setErrors({ gap:null, resume:null, cover:null, email:null }); setChat([]); setShowFeedback(false); }}>New analysis</OutBtn>}
          <OutBtn size="sm" onClick={onBack}>← Home</OutBtn>
        </div>
      </header>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px clamp(12px,4vw,28px) 80px" }}>

        {/* INPUT */}
        {!ran && (
          <div style={{ animation: "slideUp .3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(24px,3.8vw,38px)", lineHeight: 1.15, letterSpacing: "-.2px", marginBottom: 10, color: C.ink }}>Paste your resume and job description.</h1>
              <p style={{ fontSize: 15, color: C.ink2, maxWidth: 460, margin: "0 auto", lineHeight: 1.75 }}>You'll get a score, gaps, suggested fixes, cover letter, cold email, and interview preparation — all in about 20 seconds.</p>
              {user && profile?.plan === "free" && (
                <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 99, background: C.amberBg, border: `1px solid ${C.amber}25` }}>
                  <span style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>{profile.analyses_this_month || 0}/3 free analyses used this month</span>
                </div>
              )}
            </div>

            <Card flat style={{ padding: "clamp(16px,3.5vw,28px)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }} className="input-grid">
                <Field label="Company name (optional)" value={company} onChange={setCompany} placeholder="e.g. Infosys, Swiggy" hint="Helps personalise the cover letter and email." maxLen={100} />
                <Field label="Role / job title (optional)" value={role} onChange={setRole} placeholder="e.g. Python Developer" accent={C.blue} hint="Helps the interview coach prepare relevant questions." maxLen={100} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }} className="input-grid">
                <Field label="Your Resume *" value={resume} onChange={setResume} placeholder={"Paste your full resume text here.\n\nInclude: name, contact, education, skills, experience, and projects."} rows={13} maxLen={8000} />
                <Field label="Job Description *" value={jd} onChange={setJd} placeholder={"Paste the complete job description here.\n\nThe more detail you include, the more accurate your results."} rows={13} accent={C.blue} maxLen={4000} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.7 }}>
                  <div>About 20 seconds · All outputs generated together</div>
                  <div>Powered by Groq + Llama 3.3 · {user ? "Analysis will be saved to your account" : "Data not stored"}</div>
                </div>
                <Btn onClick={analyse} size="lg" bg={C.sage} disabled={!resume.trim() || !jd.trim()}>
                  {!resume.trim() || !jd.trim() ? "Fill both fields above" : "Analyse my resume →"}
                </Btn>
              </div>
            </Card>
          </div>
        )}

        {/* RESULTS */}
        {ran && (
          <div style={{ animation: "slideUp .3s ease" }}>

            {/* Score card */}
            <Card flat style={{ padding: "18px 22px", marginBottom: 18 }}>
              {loading.gap && !results.gap
                ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><Skel h={26} w="38%" /><Skel h={7} r={99} /><Skel h={16} w="72%" /></div>
                : results.gap
                  ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink3, textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Resume Score</div>
                          <div style={{ fontSize: 46, fontWeight: 800, color: scoreClr, lineHeight: 1, letterSpacing: -2 }}>{score} <span style={{ fontSize: 16, color: C.ink3, fontWeight: 400 }}>/100</span></div>
                        </div>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ height: 7, background: C.bg, borderRadius: 99, marginBottom: 10, overflow: "hidden" }}>
                            <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg,${scoreClr},${scoreClr}88)`, borderRadius: 99, transition: "width 1.2s ease" }} />
                          </div>
                          <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.65 }}>{results.gap.summary}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5 }}>
                          <span style={{ color: C.red,   fontWeight: 600 }}>✗ {results.gap.missing?.length || 0} gaps</span>
                          <span style={{ color: C.amber, fontWeight: 600 }}>△ {results.gap.weak?.length || 0} weak areas</span>
                          <span style={{ color: C.sage,  fontWeight: 600 }}>✓ {results.gap.strong?.length || 0} strengths</span>
                        </div>
                      </div>
                      {/* Share widget */}
                      <ShareScore score={score} role={role} />
                    </div>
                  )
                  : errors.gap
                    ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 4 }}>Analysis failed</div><div style={{ fontSize: 13, color: C.ink2 }}>{errors.gap}</div></div>
                        <OutBtn size="sm" onClick={() => retryTab("gap")}>Retry</OutBtn>
                      </div>
                    )
                    : null
              }
            </Card>

            {/* Feedback widget */}
            {showFeedback && !anyLoad && (
              <div style={{ marginBottom: 18 }}>
                <AnalysisFeedback company={company} role={role} gapScore={results.gap?.score} userId={user?.id} onDone={() => setShowFeedback(false)} />
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 18, overflowX: "auto" }}>
              {TABS.map(t => {
                const hasErr = errors[t.id] && t.id !== "interview";
                const isDone = results[t.id] && !loading[t.id];
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{ padding: "10px 15px", background: tab === t.id ? C.surface : "transparent", border: `1px solid ${tab === t.id ? C.border : "transparent"}`, borderBottom: tab === t.id ? `2px solid ${t.color}` : "1px solid transparent", borderRadius: "7px 7px 0 0", marginBottom: -1, color: tab === t.id ? t.color : C.ink3, fontWeight: tab === t.id ? 700 : 500, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", transition: "color .15s" }}>
                    {t.icon} {t.label}
                    {loading[t.id] && <Spin s={12} c={t.color} />}
                    {hasErr && <span style={{ color: C.red, fontSize: 11 }}>⚠</span>}
                    {isDone && t.id !== "interview" && <span style={{ color: C.sage, fontSize: 9 }}>●</span>}
                  </button>
                );
              })}
            </div>

            {/* GAP TAB */}
            {tab === "gap" && (
              <div style={{ animation: "slideUp .25s ease" }}>
                {loading.gap && !results.gap && (
                  <Card flat style={{ padding: 22 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}><Spin c={C.sage} /><span style={{ color: C.ink2, fontSize: 14 }}>Analysing your resume against the job description…</span></div>
                    {[80, 65, 74].map((w, i) => <div key={i} style={{ marginBottom: 10 }}><Skel h={50} w={`${w}%`} /></div>)}
                  </Card>
                )}
                {errors.gap && <Card flat style={{ padding: 22, background: C.redBg }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 5 }}>Analysis failed</div><div style={{ fontSize: 13, color: C.ink2 }}>{errors.gap}</div></div><OutBtn size="sm" onClick={() => retryTab("gap")}>Retry</OutBtn></div></Card>}
                {results.gap && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {[
                      { key: "missing", label: "Gaps — missing from your resume",       color: C.red,   bg: C.redBg,   icon: "✗" },
                      { key: "weak",    label: "Weak areas — present but needs work",   color: C.amber, bg: C.amberBg, icon: "△" },
                      { key: "strong",  label: "Strengths — use these in applications", color: C.sage,  bg: C.sageBg,  icon: "✓" },
                    ].filter(s => results.gap[s.key]?.length > 0).map(sec => (
                      <Card flat key={sec.key} style={{ overflow: "hidden" }}>
                        <div style={{ padding: "10px 18px", background: sec.bg, borderBottom: `1px solid ${sec.color}20` }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: sec.color, textTransform: "uppercase", letterSpacing: .6 }}>{sec.label}</span>
                        </div>
                        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                          {results.gap[sec.key].map((item, i) => (
                            <div key={i} style={{ display: "flex", gap: 11, padding: "11px 13px", background: sec.bg, borderRadius: 8, borderLeft: `3px solid ${sec.color}` }}>
                              <span style={{ color: sec.color, fontWeight: 800, fontSize: 14, flexShrink: 0, marginTop: 1 }}>{sec.icon}</span>
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{item.title}</div>
                                <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>{item.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TEXT OUTPUT TABS */}
            {["resume", "cover", "email"].includes(tab) && (
              <div style={{ animation: "slideUp .25s ease" }}>
                {loading[tab] && !results[tab] && (
                  <Card flat style={{ padding: 22 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
                      <Spin c={TABS.find(t => t.id === tab)?.color} />
                      <span style={{ color: C.ink2, fontSize: 14 }}>Generating {tab === "resume" ? "improved resume" : tab === "cover" ? "cover letter" : "cold email"}…</span>
                    </div>
                    {[100, 90, 95, 85, 92].map((w, i) => <div key={i} style={{ marginBottom: 8 }}><Skel h={15} w={`${w}%`} /></div>)}
                  </Card>
                )}
                {errors[tab] && <Card flat style={{ padding: 22, background: C.redBg }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 5 }}>Failed</div><div style={{ fontSize: 13, color: C.ink2 }}>{errors[tab]}</div></div><OutBtn size="sm" onClick={() => retryTab(tab)}>Retry</OutBtn></div></Card>}
                {results[tab] && (
                  <Card flat style={{ overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ fontSize: 17 }}>{TABS.find(t => t.id === tab)?.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{tab === "resume" ? "Improved Resume" : tab === "cover" ? "Cover Letter" : "Cold Email to HR"}</span>
                        <Tag color={C.sage} bg={C.sageBg}>Ready</Tag>
                      </div>
                      <CopyBtn text={results[tab]} />
                    </div>
                    <div style={{ padding: "18px 20px", maxHeight: 520, overflowY: "auto" }}>
                      <pre style={{ fontSize: 13.5, lineHeight: 1.85, color: C.ink2, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{results[tab]}</pre>
                    </div>
                    <div style={{ padding: "11px 18px", borderTop: `1px solid ${C.border}`, background: C.bg }}>
                      <p style={{ fontSize: 13, color: C.ink3 }}>
                        {tab === "resume" && "Copy this into Google Docs or Word for formatting. Keywords and structure are already ATS-safe — avoid adding tables or images."}
                        {tab === "cover"  && "Attach as a PDF alongside your resume. If the application form doesn't accept attachments, paste it directly."}
                        {tab === "email"  && "Find the HR manager's name on LinkedIn before sending — replace [HR Name]. Personalised emails get significantly higher reply rates."}
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* INTERVIEW TAB */}
            {tab === "interview" && (
              <div style={{ animation: "slideUp .25s ease" }}>
                <Card flat style={{ overflow: "hidden" }}>
                  <div style={{ padding: "13px 18px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🎯</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Interview Preparation</div>
                      <div style={{ fontSize: 12, color: C.ink3 }}>{company || "Target company"} · {role || "Target role"} · Based on your resume and JD</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.sage, animation: "pulse 2s infinite" }} />
                      <span style={{ fontSize: 12, color: C.sage, fontWeight: 600 }}>Ready</span>
                    </div>
                  </div>

                  <div style={{ height: 400, overflowY: "auto", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 13 }}>
                    {chat.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap: 9, alignItems: "flex-start" }}>
                        {m.role === "ai" && <div style={{ width: 26, height: 26, borderRadius: 7, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>🎯</div>}
                        <div style={{ maxWidth: "78%", padding: "11px 15px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px", background: m.role === "user" ? C.ink : C.surface, border: `1px solid ${m.role === "user" ? C.ink : C.border}`, color: m.role === "user" ? "#fff" : C.ink, fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{m.text}</div>
                        {m.role === "user" && <div style={{ width: 26, height: 26, borderRadius: 7, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2 }}>You</div>}
                      </div>
                    ))}
                    {chatBusy && (
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎯</div>
                        <div style={{ padding: "11px 15px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px 14px 14px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                          <Spin s={13} c={C.blue} /><span style={{ fontSize: 13, color: C.ink3 }}>Thinking…</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEnd} />
                  </div>

                  <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 7, flexWrap: "wrap", background: C.bg }}>
                    {["Start interview practice", "What questions should I expect?", "How to answer 'tell me about yourself'", "Salary discussion tips"].map(p => (
                      <button key={p} onClick={() => setChatMsg(p)}
                        style={{ padding: "4px 12px", borderRadius: 99, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, color: C.ink2, cursor: "pointer", fontFamily: "inherit", transition: "all .12s" }}
                        onMouseEnter={e => { e.target.style.borderColor = C.blue; e.target.style.color = C.blue; }}
                        onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.ink2; }}>
                        {p}
                      </button>
                    ))}
                  </div>

                  <div style={{ padding: "11px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 9 }}>
                    <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      placeholder="Type your answer or ask a question… (Enter to send)"
                      style={{ flex: 1, padding: "10px 13px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 14, color: C.ink, fontFamily: "inherit", outline: "none", transition: "border-color .18s" }}
                      onFocus={e => e.target.style.borderColor = C.blue} onBlur={e => e.target.style.borderColor = C.border}
                    />
                    <Btn onClick={sendChat} disabled={!chatMsg.trim() || chatBusy} bg={C.blue} style={{ whiteSpace: "nowrap" }}>
                      {chatBusy ? <Spin s={15} c="#fff" /> : "Send"}
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

/* ─────────────────────────────────────────
   ROOT
───────────────────────────────────────── */
export default function KrackHire() {
  const [view,        setView]        = useState("landing");
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [showAuth,    setShowAuth]    = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!sb) { setAuthLoading(false); return; }
    sb.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) getProfile(session.user.id).then(setProfile).catch(() => {});
      setAuthLoading(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
      if (session?.user) getProfile(session.user.id).then(setProfile).catch(() => {});
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() { await doSignOut(); setUser(null); setProfile(null); }

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, gap: 16 }}>
      <Logo size="lg" />
      <Spin s={26} c={C.sage} />
    </div>
  );

  return (
    <>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {view === "tool"
        ? <Tool onBack={() => setView("landing")} user={user} profile={profile} />
        : <Landing onEnter={() => setView("tool")} user={user} profile={profile} onShowAuth={() => setShowAuth(true)} onSignOut={handleSignOut} />
      }
    </>
  );
}
