import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════ */
async function ai(prompt, system, maxTokens = 1400) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || "";
}

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

/* ═══════════════════════════════════════════════════
   TOKENS
═══════════════════════════════════════════════════ */
const C = {
  bg: "#F8F7F4", surface: "#FFFFFF", ink: "#18181B",
  ink2: "#52525B", ink3: "#A1A1AA", ink4: "#E4E4E7",
  border: "#E4E4E7", borderHover: "#A1A1AA",
  green: "#16A34A", greenDark: "#15803D", greenBg: "#F0FDF4", greenMid: "#DCFCE7",
  red: "#DC2626", redBg: "#FFF5F5",
  amber: "#D97706", amberBg: "#FFFBEB",
  blue: "#2563EB", blueBg: "#EFF6FF",
  purple: "#7C3AED", purpleBg: "#F5F3FF",
};

/* ═══════════════════════════════════════════════════
   SHARED ATOMS
═══════════════════════════════════════════════════ */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; font-size: 16px; }
  body { font-family: 'DM Sans', system-ui, sans-serif; background: ${C.bg}; color: ${C.ink}; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  a { text-decoration: none; color: inherit; }
  button { font-family: inherit; cursor: pointer; border: none; background: none; }
  input, textarea { font-family: inherit; outline: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  .anim-up { animation: fadeUp .55s ease both; }
  .anim-in { animation: fadeIn .4s ease both; }
  .d1 { animation-delay: .08s; } .d2 { animation-delay: .16s; } .d3 { animation-delay: .24s; } .d4 { animation-delay: .32s; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-thumb { background: ${C.ink4}; border-radius: 99px; }
  ::selection { background: ${C.greenMid}; color: ${C.greenDark}; }
`;

function Spinner({ size = 18, color = C.green }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `2px solid ${color}22`, borderTopColor: color, animation: "spin .7s linear infinite", flexShrink: 0 }} />;
}

function Pill({ children, color = C.green, bg, size = "sm" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: size === "sm" ? "3px 10px" : "5px 14px", borderRadius: 99, background: bg || color + "15", color, fontSize: size === "sm" ? 12 : 13.5, fontWeight: 600, letterSpacing: .2 }}>
      {children}
    </span>
  );
}

function CopyBtn({ text, color = C.green }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      style={{ padding: "5px 14px", borderRadius: 6, border: `1.5px solid ${ok ? color : C.border}`, background: ok ? color : C.surface, color: ok ? "#fff" : C.ink2, fontSize: 12.5, fontWeight: 600, transition: "all .2s", cursor: "pointer" }}>
      {ok ? "✓ Copied" : "Copy"}
    </button>
  );
}

function Toast({ msg, type = "success", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const colors = { success: [C.green, C.greenBg], error: [C.red, C.redBg], info: [C.blue, C.blueBg] };
  const [clr, bg] = colors[type] || colors.info;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "14px 20px", background: bg, border: `1.5px solid ${clr}30`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)", display: "flex", alignItems: "center", gap: 10, animation: "slideDown .3s ease", maxWidth: 340, fontSize: 14, fontWeight: 500, color: clr }}>
      <span style={{ fontSize: 18 }}>{type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span>
      {msg}
      <button onClick={onClose} style={{ marginLeft: "auto", color: clr, opacity: .6, fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
  }, []);
  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const ToastContainer = () => (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map(t => <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => remove(t.id)} />)}
    </div>
  );
  return { add, ToastContainer };
}

/* ═══════════════════════════════════════════════════
   BUTTONS
═══════════════════════════════════════════════════ */
function PrimaryBtn({ children, onClick, disabled, size = "md", bg = C.ink, fullWidth, style: ext = {} }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: size === "lg" ? "15px 34px" : size === "sm" ? "7px 16px" : "11px 24px",
        borderRadius: 9, border: "none",
        background: disabled ? C.ink4 : bg,
        color: disabled ? C.ink3 : "#fff",
        fontSize: size === "lg" ? 16 : size === "sm" ? 13 : 14.5,
        fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : hov ? "0 8px 24px rgba(0,0,0,.16)" : "0 2px 8px rgba(0,0,0,.10)",
        transform: !disabled && hov ? "translateY(-1px)" : "none",
        transition: "all .18s", width: fullWidth ? "100%" : "auto",
        ...ext,
      }}>
      {children}
    </button>
  );
}

function OutlineBtn({ children, onClick, style: ext = {}, size = "md" }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: size === "sm" ? "7px 16px" : "11px 24px",
        borderRadius: 9, border: `1.5px solid ${hov ? C.borderHover : C.border}`,
        background: hov ? C.bg : C.surface, color: C.ink2,
        fontSize: size === "sm" ? 13 : 14.5, fontWeight: 600,
        transition: "all .18s", cursor: "pointer", ...ext,
      }}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   FORM ATOMS
═══════════════════════════════════════════════════ */
function Field({ label, value, onChange, placeholder, rows, accent = C.green, hint }) {
  const [f, setF] = useState(false);
  const base = { padding: "12px 14px", borderRadius: 9, border: `1.5px solid ${f ? accent : C.border}`, background: f ? C.surface : C.bg, fontSize: 14, color: C.ink, transition: "all .2s", width: "100%" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, letterSpacing: .6, textTransform: "uppercase" }}>{label}</label>}
      {rows
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ ...base, lineHeight: 1.75, resize: "vertical" }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onFocus={() => setF(true)} onBlur={() => setF(false)} style={base} />
      }
      {hint && <span style={{ fontSize: 12, color: C.ink3 }}>{hint}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CARD
═══════════════════════════════════════════════════ */
function Card({ children, style: ext = {}, hover = true, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => hover && setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: h && hover ? "0 8px 24px rgba(0,0,0,.09)" : "0 1px 3px rgba(0,0,0,.06)", transform: h && hover ? "translateY(-2px)" : "none", transition: "all .22s", cursor: onClick ? "pointer" : "default", ...ext }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LOGO
═══════════════════════════════════════════════════ */
function Logo({ dark, size = "md" }) {
  const fs = size === "sm" ? 15 : 17;
  const ws = size === "sm" ? 26 : 30;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: fs, letterSpacing: "-.3px", color: dark ? "#fff" : C.ink }}>
      <div style={{ width: ws, height: ws, borderRadius: 8, background: "linear-gradient(135deg,#15803D,#4ADE80)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: fs - 2, boxShadow: "0 2px 8px rgba(21,128,61,.3)" }}>C</div>
      KrackHire
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SKELETON LOADER
═══════════════════════════════════════════════════ */
function Skeleton({ h = 20, w = "100%", radius = 8 }) {
  return <div style={{ height: h, width: w, borderRadius: radius, background: "linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />;
}

/* ═══════════════════════════════════════════════════
   SECTION HEADER
═══════════════════════════════════════════════════ */
function SectionHeader({ eyebrow, title, sub, center = true }) {
  return (
    <div style={{ textAlign: center ? "center" : "left", marginBottom: 52 }}>
      {eyebrow && <div style={{ marginBottom: 12 }}><Pill>{eyebrow}</Pill></div>}
      <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "clamp(28px,3.8vw,42px)", lineHeight: 1.15, letterSpacing: "-.3px", color: C.ink, marginBottom: sub ? 14 : 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 16, color: C.ink2, maxWidth: 500, margin: center ? "0 auto" : "0", lineHeight: 1.75 }}>{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   USE REVEAL (scroll animation)
═══════════════════════════════════════════════════ */
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, style: { opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: "opacity .6s ease, transform .6s ease" } };
}

/* ═══════════════════════════════════════════════════
   LANDING PAGE
═══════════════════════════════════════════════════ */
const FEATURES = [
  { icon: "🔍", title: "Gap Analysis & Score", desc: "A hirability score out of 100 with a full breakdown — exactly what's missing, what's weak, and what to push hard for this specific job. Know before you apply.", color: C.red, bg: C.redBg },
  { icon: "📄", title: "ATS-Optimised Resume", desc: "Your resume rewritten with keywords pulled directly from the JD. Passes automated filters. Gets in front of a human. Tailored every single time.", color: C.blue, bg: C.blueBg },
  { icon: "✉️", title: "Cover Letter", desc: "Personalised to the company and role. Professional Indian English. Under 250 words. Reads like a human wrote it — because the AI was given full context.", color: C.green, bg: C.greenBg },
  { icon: "📧", title: "Cold Email to HR", desc: "Under 150 words with a subject line. Confident, specific, one clear ask. The kind Indian HR managers actually open and reply to.", color: C.amber, bg: C.amberBg },
  { icon: "🎯", title: "AI Interview Coach", desc: "A live chatbot that knows your resume and the JD. Asks real questions, scores your answers out of 10, shows the ideal response. Company-specific prep.", color: C.purple, bg: C.purpleBg },
];

const HOW_STEPS = [
  { n: "01", title: "Paste your resume", desc: "Any format. Just copy the full text. Name, contact, education, skills, experience, projects — everything." },
  { n: "02", title: "Paste the job description", desc: "From Naukri, LinkedIn, or any company portal. The more detail you paste, the better the output." },
  { n: "03", title: "AI generates all 5 outputs", desc: "Gap analysis, ATS resume, cover letter, cold email, interview coach — all in one click. ~60 seconds." },
  { n: "04", title: "Apply with confidence", desc: "Send the tailored documents. Practice with the interview coach. Walk into every application prepared." },
];

const COMPARE_ROWS = [
  { label: "Know your gaps before applying", us: true, them: false },
  { label: "ATS-optimised resume per JD", us: true, them: false },
  { label: "Cover letter in Indian English", us: true, them: false },
  { label: "Cold email to HR with subject line", us: true, them: false },
  { label: "Company-specific interview prep", us: true, them: false },
  { label: "All 5 outputs in one click", us: true, them: false },
  { label: "Time required", us: "~60 seconds", them: "2–4 hours" },
  { label: "Cost", us: "Free (Beta)", them: "Your time" },
];

const FAQS = [
  { q: "Is KrackHire really free?", a: "Yes — completely free during our beta. No account, no credit card, no limits. We're proving the product works before asking anyone to pay. When we introduce paid plans, free users will always get 3 applications per month." },
  { q: "Does it work for non-tech jobs?", a: "Absolutely. Marketing, finance, HR, operations, sales — any job where you can paste a resume and job description. The AI adapts to every industry and every role level." },
  { q: "How is this different from just using ChatGPT?", a: "ChatGPT requires you to write clever prompts and do multiple back-and-forth sessions. KrackHire is purpose-built — one click, five outputs, right format, Indian professional tone, no prompting skills needed." },
  { q: "Will the resume actually pass ATS filters?", a: "Yes. Keywords are extracted directly from your job description and inserted naturally into the rewritten resume. No tables, no images, no unusual formatting that breaks ATS parsing." },
  { q: "Is my data safe?", a: "Your resume and JD are processed in real-time to generate outputs and not stored permanently on our servers. We never sell or share your personal information with third parties." },
  { q: "What if the output isn't good enough?", a: "You can paste more detailed context and run it again — it's free and unlimited in beta. If something is genuinely broken, email us at hello@krackhire.in and we'll fix it fast." },
];

function Landing({ onEnter }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(null);
  const r1 = useReveal(), r2 = useReveal(), r3 = useReveal(), r4 = useReveal(), r5 = useReveal(), r6 = useReveal(), r7 = useReveal();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const navLinks = [["#features", "Features"], ["#how", "How it works"], ["#compare", "Why us"], ["#faq", "FAQ"]];

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{GLOBAL_CSS}</style>

      {/* ANNOUNCEMENT BAR */}
      <div style={{ background: C.greenDark, color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: 13.5, fontWeight: 500, letterSpacing: .2 }}>
        🎉 KrackHire is in <strong>free beta</strong> — no account needed. Try it right now →{" "}
        <button onClick={onEnter} style={{ color: C.greenMid, fontWeight: 700, textDecoration: "underline", cursor: "pointer", background: "none", border: "none", fontSize: 13.5, fontFamily: "inherit" }}>Open the tool</button>
      </div>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 200, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(16px,5vw,56px)", background: scrolled ? "rgba(248,247,244,.94)" : "transparent", backdropFilter: "blur(16px)", borderBottom: `1px solid ${scrolled ? C.border : "transparent"}`, transition: "all .3s" }}>
        <Logo />
        <div style={{ display: "flex", gap: 2, alignItems: "center" }} className="desktop-nav">
          {navLinks.map(([h, l]) => (
            <a key={l} href={h} onClick={() => setMobileMenuOpen(false)} style={{ padding: "6px 13px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: C.ink2, transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = C.ink; e.currentTarget.style.background = C.surface; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.ink2; e.currentTarget.style.background = "transparent"; }}>
              {l}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PrimaryBtn onClick={onEnter} size="sm">Try free →</PrimaryBtn>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ display: "none", padding: 8, borderRadius: 8, color: C.ink2, fontSize: 22 }} className="mobile-menu-btn">☰</button>
        </div>
      </nav>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <div style={{ position: "fixed", top: 110, left: 0, right: 0, zIndex: 199, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, animation: "slideDown .2s ease", boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}>
          {navLinks.map(([h, l]) => (
            <a key={l} href={h} onClick={() => setMobileMenuOpen(false)} style={{ padding: "12px 16px", borderRadius: 8, fontSize: 15, fontWeight: 500, color: C.ink2 }}>{l}</a>
          ))}
          <div style={{ paddingTop: 12, borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
            <PrimaryBtn onClick={() => { setMobileMenuOpen(false); onEnter(); }} fullWidth>Try it free — no signup →</PrimaryBtn>
          </div>
        </div>
      )}

      {/* HERO */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(64px,10vw,120px) clamp(16px,5vw,56px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(32px,6vw,80px)", alignItems: "center" }}>
        <div>
          <div className="anim-up" style={{ marginBottom: 20 }}>
            <Pill color={C.green} bg={C.greenBg} size="md">🚀 Free beta — no account or card needed</Pill>
          </div>
          <h1 className="anim-up d1" style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(36px,4.5vw,58px)", lineHeight: 1.08, letterSpacing: "-.5px", marginBottom: 20, color: C.ink }}>
            Know why you'll get<br />rejected —{" "}
            <em style={{ fontStyle: "italic", color: C.green }}>before<br />you apply.</em>
          </h1>
          <p className="anim-up d2" style={{ fontSize: "clamp(15px,1.8vw,17px)", color: C.ink2, lineHeight: 1.8, marginBottom: 36, maxWidth: 460 }}>
            Paste your resume + job description. Get a gap analysis, ATS resume, cover letter, cold email to HR, and interview coach — <strong style={{ color: C.ink }}>in 60 seconds.</strong> Built for Indian freshers.
          </p>
          <div className="anim-up d3" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <PrimaryBtn onClick={onEnter} size="lg" bg={C.ink}>Try it free → no signup needed</PrimaryBtn>
            <OutlineBtn onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>How it works</OutlineBtn>
          </div>
          <div className="anim-up d4" style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {["Free in beta", "No account", "No credit card", "Built for India 🇮🇳"].map(t => (
              <span key={t} style={{ fontSize: 13, color: C.ink3, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: C.green, fontWeight: 700 }}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>

        {/* HERO VISUAL */}
        <div className="anim-up d2" style={{ position: "relative", animation: "float 5s ease-in-out infinite" }}>
          <Card hover={false} style={{ overflow: "hidden" }}>
            <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "11px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 5 }}>{["#FF5F56", "#FFBD2E", "#27C93F"].map(c => <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />)}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.ink3 }}>krackhire.in — Gap Analysis</span>
            </div>
            <div style={{ padding: "20px 20px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: C.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: .6 }}>Hirability Score</span>
                <span style={{ fontSize: 30, fontWeight: 800, color: C.green, letterSpacing: -1 }}>72<span style={{ fontSize: 14, color: C.ink3, fontWeight: 400 }}>/100</span></span>
              </div>
              <div style={{ height: 7, background: C.bg, borderRadius: 99, marginBottom: 18, overflow: "hidden" }}>
                <div style={{ width: "72%", height: "100%", background: `linear-gradient(90deg,${C.green},#4ADE80)`, borderRadius: 99 }} />
              </div>
              {[
                { type: "red", icon: "✗", title: "Missing: SQL basics", sub: "Found in 4 of 5 similar JDs. Learn free in 2 weeks." },
                { type: "amber", icon: "△", title: "Weak: Project descriptions", sub: "Add impact — '40% faster' beats 'built feature'." },
                { type: "green", icon: "✓", title: "Strong: Sales Ops background", sub: "Rare in tech profiles. Lead with this." },
              ].map((g, i) => {
                const map = { red: [C.red, C.redBg], amber: [C.amber, C.amberBg], green: [C.green, C.greenBg] };
                const [clr, bg] = map[g.type];
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "9px 12px", background: bg, borderRadius: 8, borderLeft: `3px solid ${clr}`, marginBottom: 8 }}>
                    <span style={{ color: clr, fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{g.icon}</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: clr }}>{g.title}</div>
                      <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 2, lineHeight: 1.5 }}>{g.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          {/* Floating badge */}
          <div style={{ position: "absolute", bottom: -14, left: -16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.10)", display: "flex", alignItems: "center", gap: 10, animation: "float 6s ease-in-out 1.2s infinite" }}>
            <span style={{ fontSize: 22 }}>📄</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Resume generated</div>
              <div style={{ fontSize: 11.5, color: C.ink3 }}>ATS-optimised · keywords matched</div>
            </div>
          </div>
        </div>
      </section>

      {/* SCROLLING FEATURE TICKER */}
      <div style={{ overflow: "hidden", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "13px 0" }}>
        <div style={{ display: "flex", width: "max-content", animation: "ticker 22s linear infinite" }}>
          {[...Array(2)].map((_, ri) =>
            ["Gap Analysis", "ATS Resume", "Cover Letter", "Cold Email to HR", "Interview Coach", "Hirability Score", "India-First Design", "60 Seconds"].map((item, i) => (
              <span key={`${ri}-${i}`} style={{ padding: "0 28px", fontSize: 13, fontWeight: 600, color: C.ink3, letterSpacing: .5, display: "flex", alignItems: "center", gap: 20, whiteSpace: "nowrap" }}>
                {item} <span style={{ color: C.green, fontSize: 10 }}>◆</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* PROBLEM SECTION */}
      <section style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div ref={r1.ref} style={r1.style}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "clamp(32px,6vw,80px)", alignItems: "center" }}>
              <div>
                <Pill color={C.red} bg={C.redBg}>The Real Problem</Pill>
                <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(26px,3.5vw,38px)", lineHeight: 1.2, marginTop: 14, color: C.ink }}>
                  Most freshers lose the job before the interview starts.
                </h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { icon: "😔", title: "Applying blindly", desc: "Same resume to 50 jobs. ATS rejects it before a human sees it. No replies." },
                  { icon: "🚫", title: "Ghosted by HR", desc: "Cold emails that say 'please find attached'. HR gets 200 of these. Yours gets deleted." },
                  { icon: "😨", title: "Unprepared interviews", desc: "No idea what the company actually asks. Freezing on basic questions you could've nailed." },
                  { icon: "❓", title: "Don't know what's missing", desc: "You have skills but no idea which ones matter for this specific role right now." },
                ].map((p, i) => (
                  <Card key={i} style={{ padding: "20px 18px" }}>
                    <div style={{ fontSize: 24, marginBottom: 10 }}>{p.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: C.ink }}>{p.title}</div>
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>{p.desc}</div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div ref={r2.ref} style={r2.style}>
            <SectionHeader eyebrow="What you get" title={<>Five tools.<br />One click.</>} sub="Everything to go from 'no replies' to 'interview scheduled' — generated together in about 60 seconds." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 14 }}>
              {FEATURES.map((f, i) => (
                <Card key={i} style={{ padding: "26px 22px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 18 }}>{f.icon}</div>
                  <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8, color: C.ink }}>{f.title}</div>
                  <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.75 }}>{f.desc}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div ref={r3.ref} style={r3.style}>
            <SectionHeader eyebrow="How it works" title="Four steps. 60 seconds." sub="No learning curve. No complicated setup. Just paste and get results." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
              {HOW_STEPS.map((s, i) => (
                <div key={i} style={{ padding: "28px 22px", borderRight: i < 3 ? `1px solid ${C.border}` : "none", background: C.surface, transition: "background .2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = C.surface}>
                  <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 42, color: C.ink4, lineHeight: 1, marginBottom: 14 }}>{s.n}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: C.ink }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 36 }}>
              <PrimaryBtn onClick={onEnter} size="lg">Try it now — completely free →</PrimaryBtn>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARE */}
      <section id="compare" style={{ padding: "80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div ref={r4.ref} style={r4.style}>
            <SectionHeader eyebrow="Why KrackHire" title="You vs. manual applying." sub="Here's what changes when you stop guessing and start using AI." />
            <Card hover={false} style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", background: C.ink, color: "#fff", padding: "14px 20px", gap: 20 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#A1A1AA" }}>WHAT YOU NEED</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green, textAlign: "center" }}>KrackHire</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#71717A", textAlign: "center" }}>Manual</span>
              </div>
              {COMPARE_ROWS.map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "14px 20px", gap: 20, borderBottom: i < COMPARE_ROWS.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 === 0 ? C.surface : C.bg }}>
                  <span style={{ fontSize: 14, color: C.ink2 }}>{row.label}</span>
                  <span style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: C.green }}>
                    {typeof row.us === "boolean" ? (row.us ? "✓" : "✕") : row.us}
                  </span>
                  <span style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: C.ink3 }}>
                    {typeof row.them === "boolean" ? (row.them ? "✓" : "✕") : row.them}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div ref={r5.ref} style={r5.style}>
            <SectionHeader eyebrow="Pricing" title="Honest pricing. No tricks." sub="Free while we're in beta. When paid plans launch, free users always keep 3 applications per month." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {[
                {
                  name: "Free", price: "₹0", period: "forever", cta: "Start free →", ctaVariant: "outline", badge: null,
                  features: ["3 applications / month", "Gap analysis + score", "Basic resume rewrite", { dim: "Cover letter" }, { dim: "Cold email to HR" }, { dim: "Interview coach" }],
                },
                {
                  name: "Pro", price: "₹49", period: "per month", cta: "Get Pro →", ctaVariant: "green", badge: "Most popular",
                  features: ["Unlimited applications", "Full gap analysis", "ATS resume rewrite", "Cover letter", "Cold email to HR", "AI interview coach"],
                },
                {
                  name: "College / Team", price: "₹999", period: "per month", cta: "Contact us →", ctaVariant: "outline", badge: null,
                  features: ["Up to 30 students", "Everything in Pro", "Placement dashboard", "Bulk applications", "Progress tracking", "Priority support"],
                },
              ].map((plan, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {plan.badge && (
                    <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 99, whiteSpace: "nowrap", letterSpacing: .3 }}>
                      {plan.badge}
                    </div>
                  )}
                  <Card style={{ padding: "28px 22px", border: plan.badge ? `1.5px solid ${C.ink}` : `1px solid ${C.border}`, boxShadow: plan.badge ? "0 8px 24px rgba(0,0,0,.10)" : undefined }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink3, textTransform: "uppercase", letterSpacing: .8, marginBottom: 16 }}>{plan.name}</div>
                    <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 48, lineHeight: 1, color: C.ink, marginBottom: 4 }}>{plan.price}</div>
                    <div style={{ fontSize: 13, color: C.ink3, marginBottom: 24 }}>{plan.period}</div>
                    <PrimaryBtn onClick={onEnter} fullWidth bg={plan.ctaVariant === "green" ? C.green : C.ink} style={{ marginBottom: 24, border: plan.ctaVariant === "outline" ? `1.5px solid ${C.border}` : "none", background: plan.ctaVariant === "outline" ? C.surface : plan.ctaVariant === "green" ? C.green : C.ink, color: plan.ctaVariant === "outline" ? C.ink2 : "#fff", boxShadow: "none" }}>
                      {plan.cta}
                    </PrimaryBtn>
                    <div style={{ height: 1, background: C.border, marginBottom: 20 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {plan.features.map((f, j) => {
                        const dim = typeof f === "object";
                        const text = dim ? f.dim : f;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: dim ? C.ink4 : C.ink2 }}>
                            <span style={{ color: dim ? C.ink4 : C.green, fontWeight: 700, flexShrink: 0 }}>{dim ? "—" : "✓"}</span>
                            {text}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: 13, color: C.ink3, marginTop: 20 }}>
              Payments via Razorpay — UPI, debit cards, credit cards accepted. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: "80px clamp(16px,5vw,56px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div ref={r6.ref} style={r6.style}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: "clamp(32px,6vw,80px)" }}>
              <div>
                <Pill>FAQ</Pill>
                <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(24px,3vw,36px)", lineHeight: 1.2, margin: "14px 0 14px", color: C.ink }}>Questions?</h2>
                <p style={{ fontSize: 15, color: C.ink2, lineHeight: 1.75, marginBottom: 24 }}>
                  We're in early beta and moving fast. If something breaks or you need help, email us directly.
                </p>
                <OutlineBtn onClick={() => {}}>
                  <span>✉</span> hello@krackhire.in
                </OutlineBtn>
              </div>
              <div>
                {FAQS.map((f, i) => (
                  <div key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0", background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.ink, fontFamily: "inherit", textAlign: "left", gap: 16 }}>
                      <span>{f.q}</span>
                      <span style={{ fontSize: 20, color: C.ink3, transform: faqOpen === i ? "rotate(45deg)" : "none", transition: "transform .28s", flexShrink: 0 }}>+</span>
                    </button>
                    <div style={{ overflow: "hidden", maxHeight: faqOpen === i ? 300 : 0, transition: "max-height .38s ease" }}>
                      <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.8, paddingBottom: 20 }}>{f.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.greenBg} 100%)`, borderTop: `1px solid ${C.border}`, padding: "100px clamp(16px,5vw,56px)", textAlign: "center" }}>
        <div ref={r7.ref} style={r7.style}>
          <Pill color={C.green} bg={C.greenMid} size="md">🎉 Free while in beta</Pill>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(30px,4.5vw,52px)", lineHeight: 1.1, letterSpacing: "-.3px", margin: "18px 0 16px", color: C.ink }}>
            Stop guessing.<br />
            <em style={{ fontStyle: "italic", color: C.green }}>Start getting interviews.</em>
          </h2>
          <p style={{ fontSize: 17, color: C.ink2, marginBottom: 40, lineHeight: 1.75, maxWidth: 480, margin: "0 auto 40px" }}>
            No signup. No card. Paste your resume and see your hirability score in 60 seconds.
          </p>
          <PrimaryBtn onClick={onEnter} size="lg">Open KrackHire — it's free →</PrimaryBtn>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", fontSize: 13, color: C.ink3 }}>
            {["No account needed", "No credit card", "UPI accepted when paid plans launch", "Made in Hyderabad 🇮🇳"].map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: C.green }}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: C.ink, color: "#fff", padding: "56px clamp(16px,5vw,56px) 32px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 48, paddingBottom: 40, borderBottom: "1px solid #27272A" }}>
            <div>
              <Logo dark />
              <p style={{ fontSize: 13.5, color: "#71717A", lineHeight: 1.75, marginTop: 12, maxWidth: 260 }}>
                India's AI job readiness platform. Built for freshers who are done getting ghosted.
              </p>
              <p style={{ fontSize: 12, color: "#52525B", marginTop: 10 }}>Made with ♥ in Hyderabad, India</p>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                {["Twitter / X", "LinkedIn", "Instagram"].map(s => (
                  <a key={s} href="#" style={{ fontSize: 12, color: "#52525B", padding: "4px 10px", borderRadius: 6, border: "1px solid #27272A", transition: "color .15s" }}
                    onMouseEnter={e => e.target.style.color = "#fff"} onMouseLeave={e => e.target.style.color = "#52525B"}>{s}</a>
                ))}
              </div>
            </div>
            {[
              { title: "Product", links: ["Features", "How it works", "Pricing", "Changelog"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
              { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Refund Policy", "Security"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: .8, marginBottom: 16 }}>{col.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map(l => (
                    <a key={l} href="#" style={{ fontSize: 13.5, color: "#71717A", transition: "color .15s" }}
                      onMouseEnter={e => e.target.style.color = "#fff"} onMouseLeave={e => e.target.style.color = "#71717A"}>{l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 24, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 12.5, color: "#52525B" }}>
            <span>© 2025 KrackHire. All rights reserved.</span>
            <span>Beta product — we improve based on every piece of feedback.</span>
          </div>
        </div>
      </footer>

      {/* STICKY BOTTOM CTA (mobile) */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 198, padding: "12px 16px", background: "rgba(248,247,244,.97)", backdropFilter: "blur(12px)", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }} className="mobile-sticky-cta">
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>KrackHire</div>
          <div style={{ fontSize: 11.5, color: C.ink3 }}>Free AI job tool for Indian freshers</div>
        </div>
        <PrimaryBtn onClick={onEnter} size="sm">Try free →</PrimaryBtn>
      </div>

      <style>{`
        @media(min-width:769px){ .mobile-sticky-cta{display:none!important} .mobile-menu-btn{display:none!important} }
        @media(max-width:768px){
          .desktop-nav{display:none!important}
          section > div > div[style*="grid-template-columns: 1fr 1fr"], section > div > div[style*="grid-template-columns: 1fr 1.6fr"], section > div > div[style*="grid-template-columns: 1fr 1.8fr"], section > div[style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr!important}
          div[style*="grid-template-columns: repeat(4, 1fr)"]{grid-template-columns:1fr 1fr!important}
          div[style*="grid-template-columns: 1fr 1fr 1fr"]{grid-template-columns:1fr!important}
          div[style*="grid-template-columns: 2fr 1fr 1fr 1fr"]{grid-template-columns:1fr 1fr!important}
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TOOL
═══════════════════════════════════════════════════ */
const TABS = [
  { id: "gap", label: "Gap Analysis", icon: "🔍", color: C.red },
  { id: "resume", label: "Resume", icon: "📄", color: C.blue },
  { id: "cover", label: "Cover Letter", icon: "✉️", color: C.green },
  { id: "email", label: "Cold Email", icon: "📧", color: C.amber },
  { id: "interview", label: "Interview Coach", icon: "🎯", color: C.purple },
];

function Tool({ onBack }) {
  const { add: toast, ToastContainer } = useToast();
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [ran, setRan] = useState(false);
  const [tab, setTab] = useState("gap");
  const [results, setResults] = useState({ gap: null, resume: null, cover: null, email: null });
  const [loading, setLoading] = useState({ gap: false, resume: false, cover: false, email: false });
  const [errors, setErrors] = useState({ gap: null, resume: null, cover: null, email: null });
  const [chat, setChat] = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const ctx = `Candidate Resume:\n${resume}\n\nJob Description:\n${jd}\nTarget Company: ${company || "Not specified"}\nTarget Role: ${role || "Not specified"}`;

  const setL = (k, v) => setLoading(p => ({ ...p, [k]: v }));
  const setR = (k, v) => setResults(p => ({ ...p, [k]: v }));
  const setE = (k, v) => setErrors(p => ({ ...p, [k]: v }));

  async function analyse() {
    if (!resume.trim() || !jd.trim()) {
      toast("Please fill in both fields before running the analysis.", "error");
      return;
    }
    setRan(true);
    setTab("gap");
    setResults({ gap: null, resume: null, cover: null, email: null });
    setErrors({ gap: null, resume: null, cover: null, email: null });

    // 1. Gap Analysis
    setL("gap", true);
    try {
      const raw = await ai(
        `Analyse this resume against the job description. Return ONLY valid JSON, no markdown, no extra text:\n{"score":<integer 0-100>,"summary":"<2 honest, specific sentences>","missing":[{"title":"<skill/gap name>","detail":"<specific advice to fix it>"}],"weak":[{"title":"<area name>","detail":"<practical improvement advice>"}],"strong":[{"title":"<strength name>","detail":"<how to leverage it in the application>"}]}\nLimit: max 3 in each array. Be honest and actionable — no fluff.\n\n${ctx}`,
        "You are a blunt, experienced Indian tech recruiter with 10 years experience. Be specific and honest. Return ONLY valid JSON."
      );
      const parsed = parseJSON(raw);
      if (parsed) { setR("gap", parsed); toast("Gap analysis complete!", "success"); }
      else { setE("gap", "Could not parse response. Try again."); toast("Gap analysis failed — try again", "error"); }
    } catch (e) {
      setE("gap", e.message);
      toast("Gap analysis error: " + e.message, "error");
    }
    setL("gap", false);

    // 2. Resume
    setL("resume", true);
    try {
      const r = await ai(
        `Rewrite this resume to perfectly match the job description. Use this format:\n\n[FULL NAME]\n[Email] | [Phone] | [LinkedIn]\n\nSUMMARY\n<2-3 lines tailored to this exact role>\n\nSKILLS\n<comma-separated, JD keywords prioritised>\n\nEXPERIENCE\n<each role with strong action verbs and quantified results>\n\nPROJECTS\n<relevant projects with tech stack and measurable outcomes>\n\nEDUCATION\n<degree, college, year>\n\nRules: ATS-safe plain text, no tables, no bullets with special chars, JD keywords inserted naturally, strong action verbs, quantify where possible.\n\n${ctx}`,
        "Expert resume writer specialising in Indian tech job market. ATS-optimised, keyword-matched, compelling. Plain text output only."
      );
      setR("resume", r);
      toast("Resume generated!", "success");
    } catch (e) {
      setE("resume", e.message);
      toast("Resume generation error", "error");
    }
    setL("resume", false);

    // 3. Cover Letter
    setL("cover", true);
    try {
      const r = await ai(
        `Write a cover letter for this application. Structure:\n\nParagraph 1 (2-3 sentences): Why this specific company and role excites you. Reference something real from the JD.\nParagraph 2 (3-4 sentences): Your most relevant experience and what you bring. Use specific examples.\nParagraph 3 (1-2 sentences): Clear call to action — keen to discuss further.\n\nRules: Under 250 words total. Professional Indian English. Human and warm tone. No generic phrases like 'I am writing to apply'. Use the candidate's actual background.\n\n${ctx}`,
        "Expert cover letter writer for Indian job market. Warm, specific, professional. Makes HR want to read the resume next."
      );
      setR("cover", r);
      toast("Cover letter generated!", "success");
    } catch (e) {
      setE("cover", e.message);
      toast("Cover letter error", "error");
    }
    setL("cover", false);

    // 4. Cold Email
    setL("email", true);
    try {
      const r = await ai(
        `Write a cold email to the HR manager or hiring manager. EXACT format:\n\nSubject: <subject line here>\n\n---\n\nDear [HR Name],\n\n<email body — 3-4 short sentences max>\n\n[Your Name]\n[Your Phone]\n\nRules: Under 130 words total (excluding subject). Confident tone, not desperate or begging. Reference the specific role and ONE specific thing from the JD. One clear ask: a 15-minute call or to be considered. Professional Indian English. Use [HR Name] and [Your Name] as placeholders.\n\n${ctx}`,
        "You write cold emails that get replies. Short, specific, confident. Indian corporate communication. No cringe, no desperation."
      );
      setR("email", r);
      toast("Cold email generated!", "success");
    } catch (e) {
      setE("email", e.message);
      toast("Cold email error", "error");
    }
    setL("email", false);

    // 5. Seed interview coach
    setChat([{
      role: "ai",
      text: `Hey! I'm your interview coach for the **${role || "this role"}**${company ? ` at **${company}**` : ""}.\n\nI've read both your resume and the job description in full. I know what they're looking for and I know your background.\n\nI'll ask you real interview questions one at a time — a mix of technical, behavioural, and situational. For each answer you give, I'll:\n- Score it out of 10\n- Tell you what was good\n- Tell you what was missing\n- Show you the ideal answer structure\n\nType **"start"** when you're ready for your first question, or ask me anything about the role, the company, or what to expect in the process first.`,
    }]);
  }

  async function sendChat() {
    if (!chatMsg.trim() || chatBusy) return;
    const userMsg = chatMsg.trim();
    setChatMsg("");
    const updated = [...chat, { role: "user", text: userMsg }];
    setChat(updated);
    setChatBusy(true);
    try {
      const history = updated.slice(-12).map(m => `${m.role === "user" ? "CANDIDATE" : "COACH"}: ${m.text}`).join("\n\n");
      const reply = await ai(userMsg,
        `You are an expert interview coach. You are conducting a mock interview for this specific context:\n\nCompany: ${company || "not specified"}\nRole: ${role || "not specified"}\nJob Description Summary: ${jd.slice(0, 800)}\nCandidate Resume Summary: ${resume.slice(0, 800)}\n\nYour behavior rules:\n1. Ask ONE interview question at a time. Mix: technical (based on JD skills), behavioural (STAR format), situational, and HR questions.\n2. When the candidate answers a question: give a score out of 10, acknowledge what was good, clearly state what was missing or could be stronger, then write the ideal answer in 3-4 bullet points.\n3. After giving feedback, automatically move to the next question.\n4. After 5 questions, give an overall readiness verdict with a summary score.\n5. If asked about the company, role, culture, or process — answer helpfully based on the JD context.\n6. Keep each response under 220 words.\n7. Be honest and demanding but not discouraging.\n8. Never repeat a question you've already asked.\n\nConversation so far:\n${history}`
      );
      setChat(c => [...c, { role: "ai", text: reply }]);
    } catch (e) {
      setChat(c => [...c, { role: "ai", text: "Something went wrong. Please try again." }]);
      toast("Interview coach error", "error");
    }
    setChatBusy(false);
  }

  function retryTab(tabId) {
    setE(tabId, null);
    // Re-run just that tab
    const map = {
      gap: async () => {
        setL("gap", true);
        try {
          const raw = await ai(`Analyse resume vs JD. Return ONLY JSON:\n{"score":<0-100>,"summary":"<2 sentences>","missing":[{"title":"","detail":""}],"weak":[{"title":"","detail":""}],"strong":[{"title":"","detail":""}]}\n${ctx}`, "Senior Indian recruiter. Return valid JSON only.");
          const p = parseJSON(raw);
          if (p) { setR("gap", p); toast("Gap analysis done!", "success"); } else setE("gap", "Parse error, try again.");
        } catch (e) { setE("gap", e.message); }
        setL("gap", false);
      },
      resume: async () => {
        setL("resume", true);
        try { const r = await ai(`Rewrite this resume to match the JD perfectly. Plain text, ATS-safe.\n${ctx}`, "Expert resume writer, Indian tech market."); setR("resume", r); toast("Resume ready!", "success"); } catch (e) { setE("resume", e.message); }
        setL("resume", false);
      },
      cover: async () => {
        setL("cover", true);
        try { const r = await ai(`Write a cover letter under 250 words for this application. Indian professional English.\n${ctx}`, "Expert cover letter writer, Indian market."); setR("cover", r); toast("Cover letter ready!", "success"); } catch (e) { setE("cover", e.message); }
        setL("cover", false);
      },
      email: async () => {
        setL("email", true);
        try { const r = await ai(`Write a cold email to HR. Format: Subject line then body. Under 130 words. Use [HR Name] and [Your Name].\n${ctx}`, "You write cold emails that get replies."); setR("email", r); toast("Email ready!", "success"); } catch (e) { setE("email", e.message); }
        setL("email", false);
      },
    };
    map[tabId]?.();
  }

  const score = results.gap?.score ?? 0;
  const scoreColor = score >= 70 ? C.green : score >= 50 ? C.amber : C.red;
  const isAnyLoading = Object.values(loading).some(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{GLOBAL_CSS}</style>
      <ToastContainer />

      {/* App Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(12px,4vw,40px)", background: "rgba(248,247,244,.94)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size="sm" />
          <Pill color={C.green} bg={C.greenBg}>Beta</Pill>
          {isAnyLoading && <span style={{ fontSize: 12.5, color: C.ink3, display: "flex", alignItems: "center", gap: 6 }}><Spinner size={13} />Generating…</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {ran && (
            <OutlineBtn onClick={() => { setRan(false); setResults({ gap: null, resume: null, cover: null, email: null }); setErrors({ gap: null, resume: null, cover: null, email: null }); setChat([]); }} size="sm">
              ← New analysis
            </OutlineBtn>
          )}
          <OutlineBtn onClick={onBack} size="sm">← Home</OutlineBtn>
        </div>
      </header>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "28px clamp(12px,4vw,32px) 80px" }}>

        {/* ── INPUT SCREEN ── */}
        {!ran && (
          <div className="anim-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.15, letterSpacing: "-.3px", marginBottom: 12, color: C.ink }}>
                Paste. Click. Get everything.
              </h1>
              <p style={{ fontSize: 16, color: C.ink2, maxWidth: 460, margin: "0 auto", lineHeight: 1.75 }}>
                Fill in your resume and the job description. All 5 AI outputs generate together in ~60 seconds.
              </p>
            </div>

            <Card hover={false} style={{ padding: "clamp(18px,4vw,32px)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <Field label="Company Name (optional)" value={company} onChange={setCompany} placeholder="e.g. Infosys, Swiggy, TCS…" hint="Helps personalise the cover letter and email." />
                <Field label="Role / Job Title (optional)" value={role} onChange={setRole} placeholder="e.g. Python Developer, Data Analyst…" accent={C.blue} hint="Helps the interview coach prepare role-specific questions." />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                <Field label="Your Resume *" value={resume} onChange={setResume}
                  placeholder={"Paste your full resume text here.\n\nInclude everything:\n• Name & contact details\n• Education\n• Skills\n• Work experience\n• Projects\n\nFormat doesn't matter — just the text."} rows={12}
                />
                <Field label="Job Description *" value={jd} onChange={setJd}
                  placeholder={"Paste the complete job description here.\n\nInclude:\n• Required skills\n• Responsibilities\n• Qualifications\n• Company info\n\nMore detail = better output."} rows={12} accent={C.blue}
                />
              </div>

              {/* Progress indicators */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { label: "Resume", filled: !!resume.trim(), color: C.green },
                  { label: "Job Description", filled: !!jd.trim(), color: C.blue },
                  { label: "Company", filled: !!company.trim(), color: C.amber, optional: true },
                  { label: "Role", filled: !!role.trim(), color: C.purple, optional: true },
                ].map(f => (
                  <span key={f.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: f.filled ? (f.optional ? C.amber : C.green) : C.ink3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.filled ? (f.optional ? C.amber : C.green) : C.ink4, display: "inline-block" }} />
                    {f.label}{f.optional ? " (optional)" : ""}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>
                  <div>~60 seconds · All 5 outputs at once</div>
                  <div>Your data is not stored permanently</div>
                </div>
                <PrimaryBtn onClick={analyse} size="lg" disabled={!resume.trim() || !jd.trim()}>
                  {!resume.trim() || !jd.trim() ? "Fill both required fields ↑" : "⚡ Analyse & Generate All →"}
                </PrimaryBtn>
              </div>
            </Card>

            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
              {TABS.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 99, border: `1px solid ${C.border}`, background: C.surface, fontSize: 13.5, color: C.ink2 }}>
                  {t.icon} {t.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS SCREEN ── */}
        {ran && (
          <div className="anim-in">

            {/* Score Card */}
            <Card hover={false} style={{ padding: "20px 24px", marginBottom: 20 }}>
              {loading.gap && !results.gap
                ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Skeleton h={28} w="40%" />
                    <Skeleton h={8} radius={99} />
                    <Skeleton h={18} w="80%" />
                  </div>
                )
                : results.gap
                  ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                      <div style={{ textAlign: "center", minWidth: 60 }}>
                        <div style={{ fontSize: 50, fontWeight: 800, color: scoreColor, lineHeight: 1, letterSpacing: -2 }}>{score}</div>
                        <div style={{ fontSize: 11, color: C.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: .6 }}>/ 100</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.ink3, textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>Hirability Score</div>
                        <div style={{ height: 7, background: C.bg, borderRadius: 99, marginBottom: 12, overflow: "hidden" }}>
                          <div style={{ width: `${score}%`, height: "100%", background: `linear-gradient(90deg,${scoreColor},${scoreColor}88)`, borderRadius: 99, transition: "width 1.2s ease" }} />
                        </div>
                        <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.65 }}>{results.gap.summary}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                        <span style={{ color: C.red, fontWeight: 600 }}>✗ {results.gap.missing?.length || 0} critical gaps</span>
                        <span style={{ color: C.amber, fontWeight: 600 }}>△ {results.gap.weak?.length || 0} weak areas</span>
                        <span style={{ color: C.green, fontWeight: 600 }}>✓ {results.gap.strong?.length || 0} strengths</span>
                      </div>
                    </div>
                  )
                  : errors.gap
                    ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 4 }}>Gap analysis failed</div>
                          <div style={{ fontSize: 12.5, color: C.ink2 }}>{errors.gap}</div>
                        </div>
                        <OutlineBtn onClick={() => retryTab("gap")} size="sm">Retry</OutlineBtn>
                      </div>
                    )
                    : null
              }
            </Card>

            {/* Tab Bar */}
            <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 20, overflowX: "auto", paddingBottom: 0 }}>
              {TABS.map(t => {
                const hasError = errors[t.id] && t.id !== "interview";
                const isDone = (results[t.id] || t.id === "interview") && !loading[t.id] && !errors[t.id];
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{ padding: "11px 16px", background: tab === t.id ? C.surface : "transparent", border: `1px solid ${tab === t.id ? C.border : "transparent"}`, borderBottom: tab === t.id ? `2px solid ${t.color}` : "1px solid transparent", borderRadius: "8px 8px 0 0", marginBottom: -1, color: tab === t.id ? t.color : C.ink3, fontWeight: tab === t.id ? 700 : 500, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, transition: "color .15s", fontFamily: "inherit" }}>
                    {t.icon} {t.label}
                    {loading[t.id] && <Spinner size={12} color={t.color} />}
                    {hasError && <span style={{ color: C.red, fontSize: 12 }}>⚠</span>}
                    {isDone && t.id !== "interview" && <span style={{ color: C.green, fontSize: 10 }}>●</span>}
                  </button>
                );
              })}
            </div>

            {/* ── GAP ANALYSIS ── */}
            {tab === "gap" && (
              <div className="anim-in">
                {loading.gap && !results.gap && (
                  <Card hover={false} style={{ padding: 24 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}><Spinner color={C.red} /><span style={{ color: C.ink2, fontSize: 14 }}>Running gap analysis against the job description…</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[80, 65, 75].map((w, i) => <Skeleton key={i} h={52} w={`${w}%`} />)}</div>
                  </Card>
                )}
                {errors.gap && (
                  <Card hover={false} style={{ padding: 24, background: C.redBg, border: `1px solid ${C.red}30` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠️ Gap analysis failed</div>
                        <div style={{ fontSize: 13, color: C.ink2 }}>{errors.gap}</div>
                      </div>
                      <OutlineBtn onClick={() => retryTab("gap")} size="sm">Retry</OutlineBtn>
                    </div>
                  </Card>
                )}
                {results.gap && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {[
                      { key: "missing", label: "Critical Gaps — fix these before applying", color: C.red, bg: C.redBg, icon: "✗", borderColor: C.red },
                      { key: "weak", label: "Weak Areas — improve to stand out", color: C.amber, bg: C.amberBg, icon: "△", borderColor: C.amber },
                      { key: "strong", label: "Your Strengths — push these hard in applications", color: C.green, bg: C.greenBg, icon: "✓", borderColor: C.green },
                    ].filter(s => results.gap[s.key]?.length > 0).map(section => (
                      <Card key={section.key} hover={false} style={{ overflow: "hidden" }}>
                        <div style={{ padding: "12px 20px", background: section.bg, borderBottom: `1px solid ${section.borderColor}20` }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: section.color, textTransform: "uppercase", letterSpacing: .7 }}>{section.label}</span>
                        </div>
                        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                          {results.gap[section.key].map((item, i) => (
                            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", background: section.bg, borderRadius: 9, borderLeft: `3px solid ${section.borderColor}` }}>
                              <span style={{ color: section.color, fontWeight: 800, fontSize: 15, flexShrink: 0, marginTop: 1 }}>{section.icon}</span>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{item.title}</div>
                                <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>{item.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                    <Card hover={false} style={{ padding: "14px 18px", background: C.greenBg, border: `1px solid ${C.greenMid}` }}>
                      <div style={{ fontSize: 13, color: C.greenDark, lineHeight: 1.7 }}>
                        💡 <strong>Next step:</strong> Check the Resume tab for your ATS-optimised rewrite, and the Cold Email tab to reach out to the hiring manager directly.
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* ── TEXT OUTPUT TABS ── */}
            {["resume", "cover", "email"].includes(tab) && (
              <div className="anim-in">
                {loading[tab] && !results[tab] && (
                  <Card hover={false} style={{ padding: 24 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
                      <Spinner color={TABS.find(t => t.id === tab).color} />
                      <span style={{ color: C.ink2, fontSize: 14 }}>Generating {tab === "resume" ? "your tailored resume" : tab === "cover" ? "cover letter" : "cold email to HR"}…</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[100, 90, 95, 85, 92].map((w, i) => <Skeleton key={i} h={16} w={`${w}%`} />)}</div>
                  </Card>
                )}
                {errors[tab] && (
                  <Card hover={false} style={{ padding: 24, background: C.redBg, border: `1px solid ${C.red}30` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠️ Generation failed</div>
                        <div style={{ fontSize: 13, color: C.ink2 }}>{errors[tab]}</div>
                      </div>
                      <OutlineBtn onClick={() => retryTab(tab)} size="sm">Retry</OutlineBtn>
                    </div>
                  </Card>
                )}
                {results[tab] && (
                  <Card hover={false} style={{ overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{TABS.find(t => t.id === tab).icon}</span>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                          {tab === "resume" ? "ATS-Optimised Resume" : tab === "cover" ? "Cover Letter" : "Cold Email to HR"}
                        </span>
                        <Pill color={C.green} bg={C.greenBg}>Ready</Pill>
                      </div>
                      <CopyBtn text={results[tab]} color={TABS.find(t => t.id === tab).color} />
                    </div>
                    <div style={{ padding: "20px 22px", maxHeight: 520, overflowY: "auto" }}>
                      <pre style={{ fontSize: 13.5, lineHeight: 1.85, color: C.ink2, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{results[tab]}</pre>
                    </div>
                    {tab === "resume" && (
                      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: C.blueBg }}>
                        <p style={{ fontSize: 13, color: C.blue }}>💡 <strong>Tip:</strong> Copy this into Google Docs or MS Word and add your preferred visual formatting. The content and keywords are already ATS-optimised — don't add tables or images.</p>
                      </div>
                    )}
                    {tab === "cover" && (
                      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: C.greenBg }}>
                        <p style={{ fontSize: 13, color: C.greenDark }}>💡 <strong>Tip:</strong> Attach this as a PDF alongside your resume. Paste it in the application form if they don't accept attachments.</p>
                      </div>
                    )}
                    {tab === "email" && (
                      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: C.amberBg }}>
                        <p style={{ fontSize: 13, color: C.amber }}>💡 <strong>Tip:</strong> Find the HR manager's name on LinkedIn before sending. Replace [HR Name] — personalised emails get 2× higher reply rates. Send on Tuesday–Thursday, 9–11am.</p>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}

            {/* ── INTERVIEW COACH ── */}
            {tab === "interview" && (
              <div className="anim-in">
                <Card hover={false} style={{ overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ padding: "14px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>AI Interview Coach</div>
                      <div style={{ fontSize: 12, color: C.ink3 }}>{company || "Target company"} · {role || "Target role"} · Knows your full resume + JD</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
                      <span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>Ready</span>
                    </div>
                  </div>

                  {/* Messages */}
                  <div style={{ height: 400, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {chat.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-start" }}>
                        {m.role === "ai" && (
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>🎯</div>
                        )}
                        <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px", background: m.role === "user" ? C.ink : C.surface, border: `1px solid ${m.role === "user" ? C.ink : C.border}`, color: m.role === "user" ? "#fff" : C.ink, fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                          {m.text}
                        </div>
                        {m.role === "user" && (
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0, marginTop: 2 }}>You</div>
                        )}
                      </div>
                    ))}
                    {chatBusy && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎯</div>
                        <div style={{ padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px 16px 16px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                          <Spinner size={14} color={C.purple} /><span style={{ fontSize: 13, color: C.ink3 }}>Thinking…</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Quick prompts */}
                  <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", background: C.bg }}>
                    {["Start mock interview", "What questions will they ask?", "Salary negotiation tips", "How to answer 'tell me about yourself'"].map(p => (
                      <button key={p} onClick={() => setChatMsg(p)}
                        style={{ padding: "5px 13px", borderRadius: 99, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12.5, color: C.ink2, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}
                        onMouseEnter={e => { e.target.style.borderColor = C.purple; e.target.style.color = C.purple; }}
                        onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.ink2; }}>
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
                    <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      placeholder="Type your answer or ask a question… (Enter to send)"
                      style={{ flex: 1, padding: "11px 14px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 14, color: C.ink, transition: "border-color .2s" }}
                      onFocus={e => e.target.style.borderColor = C.purple}
                      onBlur={e => e.target.style.borderColor = C.border}
                    />
                    <PrimaryBtn onClick={sendChat} disabled={!chatMsg.trim() || chatBusy} bg={C.purple} style={{ whiteSpace: "nowrap" }}>
                      {chatBusy ? <Spinner size={16} color="#fff" /> : "Send →"}
                    </PrimaryBtn>
                  </div>
                </Card>

                <Card hover={false} style={{ padding: "14px 18px", marginTop: 14, background: C.purpleBg, border: `1px solid ${C.purple}20` }}>
                  <p style={{ fontSize: 13, color: C.purple, lineHeight: 1.7 }}>
                    🎯 <strong>How to use:</strong> Type "start" to begin your mock interview. Answer each question as you would in a real interview. Get scored out of 10 with feedback and the ideal answer after each response. After 5 questions you'll get an overall readiness verdict.
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

/* ═══════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════ */
export default function KrackHire() {
  const [view, setView] = useState("landing");
  if (view === "tool") return <Tool onBack={() => setView("landing")} />;
  return <Landing onEnter={() => setView("tool")} />;
}
