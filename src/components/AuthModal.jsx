// src/components/AuthModal.jsx
// Unified Auth: Google OAuth + Email/Password (sign up, sign in, forgot password)
// Drop-in replacement for the inline AuthModal in App.jsx

import { useState } from "react";
import { C } from "../lib/design.js";
import { sb } from "../lib/supabase.js";

/* ── Supabase client (shared singleton from lib/supabase.js) ── */

/* ── Tiny primitives (self-contained so this file is portable) ── */
const Spin = ({ s = 16, c = C.sage }) => (
  <span style={{ display:"inline-block", width:s, height:s, borderRadius:"50%",
    border:`2px solid ${c}25`, borderTopColor:c,
    animation:"kh-spin .7s linear infinite", flexShrink:0 }}/>
);

function Input({ label, type="text", value, onChange, placeholder, hint, error, autoComplete }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:700, color:C.ink2,
          letterSpacing:.5, textTransform:"uppercase" }}>{label}</label>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          padding:"12px 14px", borderRadius:9,
          border:`1.5px solid ${error ? C.red : focused ? C.sage : C.border}`,
          background: focused ? C.surface : C.bg,
          fontSize:15, color:C.ink, fontFamily:"inherit",
          outline:"none", width:"100%", transition:"all .18s",
          WebkitAppearance:"none",
        }}
      />
      {hint  && !error && <span style={{ fontSize:12, color:C.ink3 }}>{hint}</span>}
      {error && <span style={{ fontSize:12, color:C.red, fontWeight:500 }}>{error}</span>}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, loading, bg=C.sage }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width:"100%", padding:"13px 20px", borderRadius:9,
        background: (disabled || loading) ? C.ink4 : bg,
        color: (disabled || loading) ? C.ink3 : "#fff",
        fontSize:15, fontWeight:700, cursor:(disabled||loading)?"not-allowed":"pointer",
        fontFamily:"inherit", border:"none", display:"flex",
        alignItems:"center", justifyContent:"center", gap:9,
        transition:"all .18s", minHeight:48,
        boxShadow:(disabled||loading)?"none":"0 1px 4px rgba(0,0,0,.12)",
      }}
    >
      {loading ? <><Spin s={16} c="#fff"/>{children}</> : children}
    </button>
  );
}

function Divider({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ flex:1, height:1, background:C.border }}/>
      <span style={{ fontSize:12, color:C.ink3, fontWeight:500, whiteSpace:"nowrap" }}>{label}</span>
      <div style={{ flex:1, height:1, background:C.border }}/>
    </div>
  );
}

/* ── Google OAuth button ── */
function GoogleBtn({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width:"100%", padding:"12px 20px", borderRadius:9,
        border:`1.5px solid ${C.border}`, background:C.surface,
        fontSize:14.5, fontWeight:600, cursor:loading?"wait":"pointer",
        fontFamily:"inherit", display:"flex", alignItems:"center",
        justifyContent:"center", gap:10, transition:"all .18s", minHeight:48,
        color:C.ink, boxShadow:"0 1px 3px rgba(0,0,0,.07)",
      }}
    >
      {loading ? <Spin s={16} c={C.ink3}/> : (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      )}
      Continue with Google
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUB-VIEWS
═══════════════════════════════════════════════════════════ */

/* ── Sign In ── */
function SignInView({ onSwitch, onClose, onGoogleClick, googleLoading }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [fieldErr, setFieldErr] = useState({});

  function validate() {
    const e = {};
    if (!email.trim() || !email.includes("@")) e.email = "Enter a valid email.";
    if (!password)                              e.password = "Enter your password.";
    setFieldErr(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setLoading(true); setError("");
    const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) {
      if (err.message.includes("Invalid login credentials"))
        setError("Wrong email or password. Try again, or reset your password.");
      else if (err.message.includes("Email not confirmed"))
        setError("Please verify your email first. Check your inbox.");
      else
        setError(err.message);
    } else {
      onClose();
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <GoogleBtn onClick={onGoogleClick} loading={googleLoading}/>
      <Divider label="or sign in with email"/>
      <Input label="Email" type="email" value={email} onChange={v=>{setEmail(v);setFieldErr(p=>({...p,email:""}));}}
        placeholder="you@email.com" autoComplete="email" error={fieldErr.email}/>
      <div>
        <Input label="Password" type="password" value={password}
          onChange={v=>{setPassword(v);setFieldErr(p=>({...p,password:""}));}}
          placeholder="Your password" autoComplete="current-password" error={fieldErr.password}/>
        <button onClick={()=>onSwitch("forgot")}
          style={{ marginTop:7, fontSize:13, color:C.blue, fontWeight:600,
            cursor:"pointer", background:"none", border:"none", fontFamily:"inherit",
            padding:0, textDecoration:"underline" }}>
          Forgot password?
        </button>
      </div>
      {error && (
        <div style={{ padding:"10px 13px", background:C.redBg, borderRadius:8,
          fontSize:13, color:C.red, lineHeight:1.6 }}>{error}</div>
      )}
      <PrimaryBtn onClick={submit} loading={loading}>Sign in</PrimaryBtn>
      <p style={{ textAlign:"center", fontSize:13.5, color:C.ink3 }}>
        Don't have an account?{" "}
        <button onClick={()=>onSwitch("signup")}
          style={{ color:C.sage, fontWeight:700, cursor:"pointer", background:"none",
            border:"none", fontFamily:"inherit", fontSize:13.5, textDecoration:"underline" }}>
          Sign up free
        </button>
      </p>
    </div>
  );
}

/* ── Sign Up ── */
function SignUpView({ onSwitch, onClose, onGoogleClick, googleLoading }) {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [fieldErr, setFieldErr] = useState({});
  const [done,     setDone]     = useState(false);

  function validate() {
    const e = {};
    if (!name.trim())                              e.name     = "Enter your name.";
    if (!email.trim() || !email.includes("@"))     e.email    = "Enter a valid email.";
    if (password.length < 8)                       e.password = "At least 8 characters.";
    if (password !== confirm)                      e.confirm  = "Passwords don't match.";
    setFieldErr(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setLoading(true); setError("");
    const { error: err } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    setLoading(false);
    if (err) {
      if (err.message.includes("already registered"))
        setError("This email is already registered. Try signing in instead.");
      else
        setError(err.message);
    } else {
      setDone(true);
    }
  }

  if (done) return (
    <div style={{ textAlign:"center", padding:"24px 0" }}>
      <div style={{ fontSize:48, marginBottom:18 }}>📬</div>
      <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20,
        color:C.ink, fontWeight:700, marginBottom:10 }}>Check your inbox!</h3>
      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.8, marginBottom:20, maxWidth:320, margin:"0 auto 20px" }}>
        We've sent a verification link to <strong>{email}</strong>.
        Click it to activate your account, then come back and sign in.
      </p>
      <div style={{ padding:"12px 16px", background:C.sageBg, borderRadius:9,
        fontSize:13.5, color:C.sage, lineHeight:1.65, marginBottom:20 }}>
        💡 Check your spam folder if you don't see it in 2 minutes.
      </div>
      <button onClick={()=>onSwitch("signin")}
        style={{ fontSize:14, color:C.blue, fontWeight:600, cursor:"pointer",
          background:"none", border:"none", fontFamily:"inherit", textDecoration:"underline" }}>
        Back to sign in →
      </button>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <GoogleBtn onClick={onGoogleClick} loading={googleLoading}/>
      <Divider label="or sign up with email"/>
      <Input label="Your Name" value={name} onChange={v=>{setName(v);setFieldErr(p=>({...p,name:""}));}}
        placeholder="e.g. Rahul Kumar" autoComplete="name" error={fieldErr.name}/>
      <Input label="Email" type="email" value={email} onChange={v=>{setEmail(v);setFieldErr(p=>({...p,email:""}));}}
        placeholder="you@email.com" autoComplete="email" error={fieldErr.email}/>
      <Input label="Password" type="password" value={password}
        onChange={v=>{setPassword(v);setFieldErr(p=>({...p,password:""}));}}
        placeholder="Min 8 characters" autoComplete="new-password" error={fieldErr.password}
        hint="Use letters, numbers, and a symbol for a strong password."/>
      <Input label="Confirm Password" type="password" value={confirm}
        onChange={v=>{setConfirm(v);setFieldErr(p=>({...p,confirm:""}));}}
        placeholder="Repeat your password" autoComplete="new-password" error={fieldErr.confirm}/>
      {error && (
        <div style={{ padding:"10px 13px", background:C.redBg, borderRadius:8,
          fontSize:13, color:C.red, lineHeight:1.6 }}>{error}</div>
      )}
      <PrimaryBtn onClick={submit} loading={loading}>Create free account</PrimaryBtn>
      <p style={{ fontSize:11.5, color:C.ink3, textAlign:"center", lineHeight:1.65 }}>
        By signing up you agree to our{" "}
        <a href="/terms" style={{ color:C.blue }}>Terms</a> and{" "}
        <a href="/privacy" style={{ color:C.blue }}>Privacy Policy</a>.
      </p>
      <p style={{ textAlign:"center", fontSize:13.5, color:C.ink3 }}>
        Already have an account?{" "}
        <button onClick={()=>onSwitch("signin")}
          style={{ color:C.sage, fontWeight:700, cursor:"pointer", background:"none",
            border:"none", fontFamily:"inherit", fontSize:13.5, textDecoration:"underline" }}>
          Sign in
        </button>
      </p>
    </div>
  );
}

/* ── Forgot Password ── */
function ForgotView({ onSwitch }) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function submit() {
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email."); return; }
    setLoading(true); setError("");
    const { error: err } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}?reset=1`,
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  if (sent) return (
    <div style={{ textAlign:"center", padding:"24px 0" }}>
      <div style={{ fontSize:48, marginBottom:18 }}>📧</div>
      <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20,
        color:C.ink, fontWeight:700, marginBottom:10 }}>Reset link sent!</h3>
      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.8, maxWidth:300, margin:"0 auto 20px" }}>
        Check your inbox at <strong>{email}</strong> for a password reset link. It expires in 1 hour.
      </p>
      <button onClick={()=>onSwitch("signin")}
        style={{ fontSize:14, color:C.blue, fontWeight:600, cursor:"pointer",
          background:"none", border:"none", fontFamily:"inherit", textDecoration:"underline" }}>
        Back to sign in →
      </button>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <p style={{ fontSize:14, color:C.ink2, lineHeight:1.75 }}>
        Enter the email you signed up with. We'll send a reset link instantly.
      </p>
      <Input label="Email" type="email" value={email} onChange={v=>{setEmail(v);setError("");}}
        placeholder="you@email.com" autoComplete="email"
        error={error}/>
      <PrimaryBtn onClick={submit} loading={loading}>Send reset link</PrimaryBtn>
      <button onClick={()=>onSwitch("signin")}
        style={{ fontSize:13.5, color:C.ink3, cursor:"pointer", background:"none",
          border:"none", fontFamily:"inherit", textAlign:"center" }}>
        ← Back to sign in
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT — drop-in replacement for your existing AuthModal
═══════════════════════════════════════════════════════════ */
export default function AuthModal({ onClose, initialView = "signin" }) {
  const [view, setView] = useState(initialView); // "signin" | "signup" | "forgot"
  const [googleLoading, setGoogleLoading] = useState(false);

  const SITE_URL = import.meta.env.VITE_SITE_URL || "https://www.krackhire.in";

  async function handleGoogle() {
    if (!sb) return;
    setGoogleLoading(true);
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: SITE_URL,
        queryParams: { access_type:"offline", prompt:"consent" },
      },
    });
    // page redirects — no need to setGoogleLoading(false)
  }

  const titles = {
    signin: "Sign in to KrackHire",
    signup: "Create your free account",
    forgot: "Reset your password",
  };

  const subtitles = {
    signin: "Save analyses, track applications, and download reports.",
    signup: "3 free analyses/month + 3 lifetime premium accesses on sign-up.",
    forgot: "",
  };

  return (
    <>
      {/* Keyframe injection */}
      <style>{`@keyframes kh-spin{to{transform:rotate(360deg)}}@keyframes kh-scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position:"fixed", inset:0, zIndex:1200,
          background:"rgba(0,0,0,.45)", backdropFilter:"blur(4px)" }}
      />

      {/* Modal */}
      <div
        style={{
          position:"fixed", inset:0, zIndex:1201,
          display:"flex", alignItems:"center", justifyContent:"center", padding:16,
          pointerEvents:"none",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background:C.surface, borderRadius:16, padding:"32px 28px",
            maxWidth:420, width:"100%", pointerEvents:"all",
            boxShadow:"0 20px 60px rgba(0,0,0,.18)",
            animation:"kh-scaleIn .25s ease",
            maxHeight:"90vh", overflowY:"auto",
          }}
        >
          {/* Logo */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, fontWeight:700,
              fontSize:16, color:C.ink, letterSpacing:"-.3px" }}>
              <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="9" fill="#3D6B4F"/>
                <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white"/>
                <circle cx="31" cy="31" r="7" fill="#6EBD8A"/>
                <path d="M28 31L30.5 33.5L34.5 29" stroke="#3D6B4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Krack<span style={{ color:C.sage }}>Hire</span>
            </div>
            <button onClick={onClose}
              style={{ fontSize:22, color:C.ink3, cursor:"pointer", lineHeight:1,
                background:"none", border:"none", minHeight:"unset", minWidth:"unset",
                padding:"4px 8px", borderRadius:6 }}>×</button>
          </div>

          {/* Header */}
          <div style={{ marginBottom:24 }}>
            <h2 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:22,
              color:C.ink, fontWeight:700, marginBottom:6 }}>
              {titles[view]}
            </h2>
            {subtitles[view] && (
              <p style={{ fontSize:13.5, color:C.ink2, lineHeight:1.65 }}>{subtitles[view]}</p>
            )}
          </div>

          {/* View */}
          {view === "signin"  && <SignInView  onSwitch={setView} onClose={onClose} onGoogleClick={handleGoogle} googleLoading={googleLoading}/>}
          {view === "signup"  && <SignUpView  onSwitch={setView} onClose={onClose} onGoogleClick={handleGoogle} googleLoading={googleLoading}/>}
          {view === "forgot"  && <ForgotView  onSwitch={setView}/>}

          {/* Trust badges */}
          {view !== "forgot" && (
            <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${C.border}`,
              display:"flex", flexWrap:"wrap", gap:10, justifyContent:"center" }}>
              {["No spam","Data not stored","Free to start"].map(t => (
                <span key={t} style={{ fontSize:12, color:C.ink3, display:"flex",
                  alignItems:"center", gap:4 }}>
                  <span style={{ color:C.sage }}>✓</span>{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
