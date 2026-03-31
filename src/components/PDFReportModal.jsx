// src/components/PDFReportModal.jsx
// Enhanced PDF Report using jsPDF + html2canvas
// Drop-in replacement for the inline PDFReportModal in App.jsx
//
// INSTALL DEPS FIRST:
//   npm install jspdf html2canvas

import { useRef, useState } from "react";

/* ── Design tokens ── */
const C = {
  bg:"#F9F8F6", surface:"#FFFFFF", ink:"#1C1917",
  ink2:"#57534E", ink3:"#A8A29E", ink4:"#E7E5E4", border:"#E7E5E4",
  sage:"#3D6B4F", sageBg:"#F0F5F2",
  red:"#C0392B", redBg:"#FDF2F2",
  amber:"#B45309", amberBg:"#FFFBEB",
  blue:"#1D4ED8", blueBg:"#EFF6FF",
  purple:"#5B21B6", purpleBg:"#F5F3FF",
};

const Spin = ({ s=16, c=C.sage }) => (
  <span style={{ display:"inline-block", width:s, height:s, borderRadius:"50%",
    border:`2px solid ${c}25`, borderTopColor:c,
    animation:"kh-spin .7s linear infinite", flexShrink:0 }}/>
);

/* ── The hidden report template that gets captured ── */
function ReportTemplate({ results, company, role, user, plan7 }) {
  const gap        = results?.gap;
  const score      = gap?.score ?? 0;
  const ats        = gap?.ats_score ?? Math.round(score * .9);
  const skill      = gap?.skill_score ?? Math.round(score * .85);
  const scoreColor = score >= 70 ? "#3D6B4F" : score >= 50 ? "#B45309" : "#C0392B";
  const userName   = user?.user_metadata?.name || "Job Seeker";

  const improvPlan = plan7 ? [
    { day:"Day 1–2", task:"Add missing keywords from the JD to your resume Skills section. Keep language natural.", icon:"📝" },
    { day:"Day 3",   task:"Rewrite your Summary/Objective with the target role title and 2 key achievements.",   icon:"✍️" },
    { day:"Day 4",   task:"Quantify at least 3 bullet points in Experience with numbers and percentages.",         icon:"📊" },
    { day:"Day 5",   task:"Update LinkedIn headline, About, and Skills to match JD keywords.",                    icon:"💼" },
    { day:"Day 6",   task:"Practice answering 5 common interview questions with the AI coach.",                   icon:"🎯" },
    { day:"Day 7",   task:"Final review, send cold email to HR, and submit your application.",                    icon:"🚀" },
  ] : [
    { day:"Week 1",  task:"Fix resume: keywords, quantified achievements, ATS-safe formatting.",                  icon:"📝" },
    { day:"Week 2",  task:"Optimise LinkedIn and Naukri. Connect with 10 relevant professionals.",                icon:"💼" },
    { day:"Week 3",  task:"Research 5 target companies. Customise resume and cover letter for each.",             icon:"🏢" },
    { day:"Week 4",  task:"Apply to 15 roles, track all applications, practise mock interviews daily.",           icon:"📋" },
    { day:"Week 5–6",task:"Follow up on applications. Prepare for assessment tests.",                             icon:"🔄" },
    { day:"Week 7–8",task:"Interview preparation: technical, HR rounds, salary discussion.",                     icon:"🎯" },
  ];

  return (
    <div id="kh-report-template" style={{
      width:794, background:"#fff", fontFamily:"'DM Sans','Helvetica Neue',sans-serif",
      color:"#1C1917", position:"fixed", left:-9999, top:0, zIndex:-1,
    }}>
      {/* Cover */}
      <div style={{ background:"linear-gradient(135deg,#3D6B4F,#2D5240)", color:"#fff",
        padding:"48px 48px 40px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:"rgba(255,255,255,.15)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:18, fontWeight:800, color:"#fff" }}>K</div>
          <span style={{ fontSize:18, fontWeight:700, letterSpacing:"-.3px" }}>KrackHire</span>
        </div>
        <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:2, opacity:.65, marginBottom:10 }}>
          Career Readiness Report
        </div>
        <h1 style={{ fontSize:34, fontWeight:800, lineHeight:1.1, marginBottom:6,
          fontFamily:"Georgia,serif" }}>
          {userName}
        </h1>
        {(role || company) && (
          <div style={{ fontSize:15, opacity:.8, marginBottom:32 }}>
            {[role, company].filter(Boolean).join(" at ")}
          </div>
        )}
        {/* Scores row */}
        <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
          {[["Readiness", score, scoreColor], ["ATS Score", ats, "#6EBD8A"], ["Skill Match", skill, "#93C5FD"]].map(([l,v,c]) => (
            <div key={l} style={{ background:"rgba(255,255,255,.12)", borderRadius:12,
              padding:"16px 20px", minWidth:110, backdropFilter:"blur(4px)" }}>
              <div style={{ fontSize:32, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:10, opacity:.7, textTransform:"uppercase",
                letterSpacing:1, marginTop:4 }}>{l} /100</div>
            </div>
          ))}
          <div style={{ background:"rgba(255,255,255,.12)", borderRadius:12,
            padding:"16px 20px", backdropFilter:"blur(4px)" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#fff", opacity:.85 }}>
              {new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}
            </div>
            <div style={{ fontSize:10, opacity:.65, textTransform:"uppercase",
              letterSpacing:1, marginTop:4 }}>Generated on</div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {gap?.summary && (
        <Section title="Summary">
          <p style={{ fontSize:14, color:"#57534E", lineHeight:1.85,
            padding:"14px 16px", background:"#F0F5F2", borderRadius:9,
            borderLeft:"3px solid #3D6B4F" }}>{gap.summary}</p>
        </Section>
      )}

      {/* Score bars */}
      <Section title="Score Breakdown">
        {[["Overall Readiness", score, scoreColor],
          ["ATS Compatibility", ats, "#1D4ED8"],
          ["Skill Match",       skill,"#5B21B6"]].map(([l,v,c]) => (
          <div key={l} style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              fontSize:13, fontWeight:600, color:"#1C1917", marginBottom:5 }}>
              <span>{l}</span><span style={{ color:c }}>{v}/100</span>
            </div>
            <div style={{ height:8, borderRadius:99, background:"#E7E5E4", overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:99, background:c, width:`${v}%` }}/>
            </div>
          </div>
        ))}
      </Section>

      {/* Gaps */}
      {gap?.missing?.length > 0 && (
        <Section title="Critical Gaps — Fix Before Applying">
          {gap.missing.map((g,i) => (
            <GapItem key={i} icon="✗" title={g.title} detail={g.detail}
              color="#C0392B" bg="#FDF2F2"/>
          ))}
        </Section>
      )}

      {gap?.weak?.length > 0 && (
        <Section title="Weak Areas — Improve to Stand Out">
          {gap.weak.map((g,i) => (
            <GapItem key={i} icon="△" title={g.title} detail={g.detail}
              color="#B45309" bg="#FFFBEB"/>
          ))}
        </Section>
      )}

      {gap?.strong?.length > 0 && (
        <Section title="Your Strengths — Lead With These">
          {gap.strong.map((g,i) => (
            <GapItem key={i} icon="✓" title={g.title} detail={g.detail}
              color="#3D6B4F" bg="#F0F5F2"/>
          ))}
        </Section>
      )}

      {/* Missing keywords */}
      {gap?.missing_keywords?.length > 0 && (
        <Section title="Missing Keywords to Add">
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {gap.missing_keywords.map((k,i) => (
              <span key={i} style={{ padding:"5px 14px", borderRadius:99,
                background:"#F0F5F2", color:"#3D6B4F", fontSize:12.5,
                fontWeight:600, border:"1px solid #D4E6DA" }}>{k}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Improvement plan */}
      <Section title={plan7 ? "7-Day Improvement Plan" : "14-Day Career Roadmap"}>
        {improvPlan.map((p,i) => (
          <div key={i} style={{ display:"flex", gap:14, marginBottom:12,
            alignItems:"flex-start" }}>
            <span style={{ background:"#3D6B4F", color:"#fff", borderRadius:6,
              padding:"3px 10px", fontSize:11, fontWeight:700, whiteSpace:"nowrap",
              flexShrink:0, marginTop:2 }}>{p.day}</span>
            <span style={{ fontSize:13.5, color:"#57534E", lineHeight:1.7 }}>{p.icon} {p.task}</span>
          </div>
        ))}
      </Section>

      {/* LinkedIn tips */}
      <Section title="LinkedIn & Naukri Quick Wins">
        {["Update headline with target role title + 2 key skills",
          "Add all JD keywords to your Skills section",
          "Write About section with role-specific keywords",
          "Include quantified achievements in each experience entry",
          "Set Naukri profile to 'Actively looking'",
          "Upload updated resume in both DOC and PDF on Naukri"].map((t,i) => (
          <div key={i} style={{ padding:"9px 0", borderBottom:i<5?"1px solid #E7E5E4":"none",
            fontSize:13.5, color:"#57534E", display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ color:"#3D6B4F", fontWeight:700, flexShrink:0 }}>→</span>{t}
          </div>
        ))}
      </Section>

      {/* Footer */}
      <div style={{ background:"#1C1917", padding:"22px 48px",
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13, color:"#78716C" }}>
          Generated by KrackHire · www.krackhire.in
        </div>
        <div style={{ fontSize:13, color:"#78716C" }}>
          Made in Hyderabad, India 🇮🇳
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ padding:"26px 48px", borderBottom:"1px solid #E7E5E4" }}>
      <h2 style={{ fontFamily:"Georgia,serif", fontSize:17, color:"#3D6B4F",
        fontWeight:700, marginBottom:14, paddingBottom:8,
        borderBottom:"2px solid #D4E6DA" }}>{title}</h2>
      {children}
    </div>
  );
}

function GapItem({ icon, title, detail, color, bg }) {
  return (
    <div style={{ display:"flex", gap:10, padding:"11px 14px", background:bg,
      borderRadius:8, borderLeft:`3px solid ${color}`, marginBottom:8 }}>
      <span style={{ color, fontWeight:800, fontSize:14, flexShrink:0, marginTop:1 }}>{icon}</span>
      <div>
        <div style={{ fontSize:13.5, fontWeight:700, color:"#1C1917", marginBottom:3 }}>{title}</div>
        <div style={{ fontSize:13, color:"#57534E", lineHeight:1.7 }}>{detail}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════════ */
export default function PDFReportModal({ results, company, role, user, onClose, isPro, onUpgrade }) {
  const [generating, setGenerating] = useState(false);
  const [plan7,      setPlan7]      = useState(true);
  const [progress,   setProgress]   = useState("");
  const [showTemplate, setShowTemplate] = useState(false);
  const templateRef = useRef(null);

  /* ── Gate: non-Pro users see upgrade prompt ── */
  if (!isPro) return (
    <>
      <style>{`@keyframes kh-spin{to{transform:rotate(360deg)}}@keyframes kh-scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:1200,
        background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)" }}/>
      <div style={{ position:"fixed", inset:0, zIndex:1201, display:"flex",
        alignItems:"center", justifyContent:"center", padding:16, pointerEvents:"none" }}>
        <div onClick={e=>e.stopPropagation()} style={{ background:C.surface,
          borderRadius:16, padding:"32px 28px", maxWidth:400, width:"100%",
          textAlign:"center", pointerEvents:"all",
          boxShadow:"0 20px 60px rgba(0,0,0,.18)", animation:"kh-scaleIn .25s ease" }}>
          <div style={{ fontSize:44, marginBottom:14 }}>📊</div>
          <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:20, color:C.ink,
            marginBottom:8, fontWeight:700 }}>PDF Career Report</h3>
          <p style={{ fontSize:14, color:C.ink2, lineHeight:1.7, marginBottom:22 }}>
            Get a professional downloadable report with your full analysis,
            improvement plan, and keyword recommendations. Available on Pro.
          </p>
          <button onClick={()=>{ onClose(); onUpgrade(); }}
            style={{ width:"100%", padding:"13px 20px", borderRadius:9,
              background:C.sage, color:"#fff", fontSize:15, fontWeight:700,
              cursor:"pointer", border:"none", fontFamily:"inherit", marginBottom:12, minHeight:48 }}>
            Upgrade to Pro →
          </button>
          <button onClick={onClose}
            style={{ fontSize:13.5, color:C.ink3, cursor:"pointer",
              background:"none", border:"none", fontFamily:"inherit" }}>Not now</button>
        </div>
      </div>
    </>
  );

  /* ── PDF generation ── */
  async function generate() {
    setGenerating(true);
    setShowTemplate(true);

    try {
      // Wait for the hidden template to fully render
      setProgress("Rendering report layout…");
      await new Promise(r => setTimeout(r, 600));

      const el = document.getElementById("kh-report-template");
      if (!el) throw new Error("Report template not found.");

      setProgress("Capturing design…");

      // Dynamic import so it doesn't bloat initial bundle
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const canvas = await html2canvas(el, {
        scale:       2,          // retina quality
        useCORS:     true,
        logging:     false,
        windowWidth: 794,
        backgroundColor: "#ffffff",
        imageTimeout: 0,
        allowTaint:  false,
      });

      setProgress("Generating PDF…");

      const imgData = canvas.toDataURL("image/png", 1.0);

      // A4 dimensions in mm
      const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
      const pageW = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297mm

      const imgW  = pageW;
      const imgH  = (canvas.height * pageW) / canvas.width;

      let yOffset = 0;
      let page    = 0;

      // Multi-page: slice the canvas across A4 pages
      while (yOffset < imgH) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgW, imgH, undefined, "FAST");
        yOffset += pageH;
        page++;
      }

      const filename = [
        "KrackHire-Report",
        user?.user_metadata?.name?.replace(/\s+/g,"-") || "Report",
        role?.replace(/\s+/g,"-") || "",
        new Date().toISOString().slice(0,10),
      ].filter(Boolean).join("_") + ".pdf";

      pdf.save(filename);
      setProgress("Done!");
      setTimeout(() => { setGenerating(false); setShowTemplate(false); setProgress(""); }, 500);

    } catch (err) {
      console.error("[PDFReport] error:", err);
      setProgress("");
      setGenerating(false);
      setShowTemplate(false);
      alert("PDF generation failed. Please try again.\n" + err.message);
    }
  }

  const features = [
    "Cover page with your scores",
    "Gap analysis with specific fixes",
    "Missing keywords list",
    "LinkedIn & Naukri optimisation tips",
    `${plan7?"7":"14"}-day improvement plan`,
    "Professional A4 PDF, print-ready",
  ];

  return (
    <>
      <style>{`@keyframes kh-spin{to{transform:rotate(360deg)}}@keyframes kh-scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>

      {/* Hidden template rendered off-screen for capture */}
      {showTemplate && (
        <ReportTemplate
          ref={templateRef}
          results={results}
          company={company}
          role={role}
          user={user}
          plan7={plan7}
        />
      )}

      {/* Backdrop */}
      <div onClick={generating ? undefined : onClose}
        style={{ position:"fixed", inset:0, zIndex:1200,
          background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)" }}/>

      {/* Modal */}
      <div style={{ position:"fixed", inset:0, zIndex:1201,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:16, pointerEvents:"none" }}>
        <div onClick={e=>e.stopPropagation()}
          style={{ background:C.surface, borderRadius:16, padding:"28px 24px",
            maxWidth:440, width:"100%", pointerEvents:"all",
            boxShadow:"0 20px 60px rgba(0,0,0,.18)",
            animation:"kh-scaleIn .25s ease",
            maxHeight:"90vh", overflowY:"auto" }}>

          <div style={{ textAlign:"center", marginBottom:22 }}>
            <div style={{ fontSize:44, marginBottom:12 }}>📊</div>
            <h3 style={{ fontFamily:"'Lora',Georgia,serif", fontSize:22,
              color:C.ink, fontWeight:700, marginBottom:6 }}>PDF Career Report</h3>
            <p style={{ fontSize:14, color:C.ink2, lineHeight:1.65 }}>
              A professional A4 report capturing your full analysis, gaps, and personalised improvement plan.
            </p>
          </div>

          {/* Features list */}
          <div style={{ background:C.sageBg, borderRadius:10, padding:"14px 16px", marginBottom:18 }}>
            {features.map((f,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:9,
                fontSize:13.5, color:C.ink2, marginBottom:i<features.length-1?7:0 }}>
                <span style={{ color:C.sage, fontWeight:700 }}>✓</span>{f}
              </div>
            ))}
          </div>

          {/* Plan toggle */}
          <div style={{ display:"flex", gap:10, marginBottom:18 }}>
            {[[true,"7-Day Plan"],[false,"14-Day Plan"]].map(([v,l]) => (
              <button key={l} onClick={()=>{ if(!generating) setPlan7(v); }}
                style={{ flex:1, padding:"10px", borderRadius:8,
                  border:`2px solid ${plan7===v?C.sage:C.border}`,
                  background:plan7===v?C.sageBg:C.surface,
                  color:plan7===v?C.sage:C.ink2, fontWeight:600, fontSize:13.5,
                  cursor:generating?"not-allowed":"pointer",
                  fontFamily:"inherit", minHeight:44, transition:"all .18s" }}>{l}</button>
            ))}
          </div>

          {/* Progress bar */}
          {generating && progress && (
            <div style={{ padding:"10px 14px", background:C.blueBg, borderRadius:8,
              marginBottom:14, fontSize:13, color:C.blue,
              display:"flex", alignItems:"center", gap:10 }}>
              <Spin s={14} c={C.blue}/>{progress}
            </div>
          )}

          <button onClick={generate} disabled={generating}
            style={{ width:"100%", padding:"14px 20px", borderRadius:9,
              background:generating?C.ink4:C.sage, color:generating?C.ink3:"#fff",
              fontSize:15, fontWeight:700, cursor:generating?"not-allowed":"pointer",
              border:"none", fontFamily:"inherit", marginBottom:10, minHeight:48,
              display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              transition:"all .18s", boxShadow:generating?"none":"0 1px 4px rgba(0,0,0,.12)" }}>
            {generating
              ? <><Spin s={16} c={C.ink3}/>Generating PDF…</>
              : "⬇ Download PDF Report"}
          </button>

          <button onClick={generating?undefined:onClose}
            style={{ width:"100%", fontSize:13.5, color:C.ink3,
              cursor:generating?"not-allowed":"pointer",
              background:"none", border:"none", fontFamily:"inherit",
              padding:"8px", opacity:generating?.4:1 }}>
            Cancel
          </button>

          <p style={{ fontSize:11.5, color:C.ink3, textAlign:"center", marginTop:10 }}>
            Saves directly as <strong>{user?.user_metadata?.name||"Report"}.pdf</strong> to your Downloads folder.
          </p>
        </div>
      </div>
    </>
  );
}
