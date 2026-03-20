// api/email.js — KrackHire Email Engine v2 (Premium Templates)
// Uses Brevo — sign up at brevo.com, add BREVO_API_KEY to Vercel env vars

import { createClient } from '@supabase/supabase-js'

function getSB() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } })
}

const BREVO_KEY = process.env.BREVO_API_KEY || ''
const FROM      = { name: 'KrackHire', email: 'hellokrackhire@gmail.com' }
const SITE      = process.env.VITE_SITE_URL || 'https://www.krackhire.in'

// ── Send via Brevo ────────────────────────────────────────────
async function send({ to, subject, html }) {
  if (!BREVO_KEY) { console.warn('[email] BREVO_API_KEY missing'); return { ok:false } }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: html }),
    })
    const data = await res.json()
    if (!res.ok) { console.error('[email] Brevo error:', data); return { ok:false, data } }
    return { ok:true, id: data.messageId }
  } catch(e) { console.error('[email] Send error:', e.message); return { ok:false } }
}

// ── Log to DB (fully silent — never crashes main flow) ──────────
async function log(sb, { userId, type, to, status, error }) {
  if (!sb) return
  try {
    await sb.from('email_logs').insert({
      user_id:   userId||null,
      type:      type,
      recipient: to,
      status:    status,
      error:     error||null,
      sent_at:   new Date().toISOString(),
    })
  } catch(e) {
    console.warn('[email] Log failed (non-critical):', e.message)
  }
}

// ══════════════════════════════════════════════════════════════
// EMAIL TEMPLATES — Premium SaaS quality
// ══════════════════════════════════════════════════════════════

const css = `
  /* System fonts only — no external requests */
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#F4F4F0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  .outer { background:#F4F4F0; padding:40px 16px; }
  .card  { background:#FFFFFF; border-radius:20px; max-width:560px; margin:0 auto;
           overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.06); }
  .header { background:#1A1A1A; padding:28px 36px; display:flex; align-items:center; gap:12px; }
  .logo-box { width:38px; height:38px; background:#4CAF82; border-radius:9px;
              display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
  .logo-name { color:#FFFFFF; font-size:20px; font-weight:700; letter-spacing:-.3px; }
  .logo-name span { color:#4CAF82; }
  .body { padding:36px 36px 28px; }
  .body h1 { font-size:24px; font-weight:700; color:#111111; line-height:1.25; margin-bottom:14px; letter-spacing:-.4px; }
  .body p  { font-size:15px; color:#555555; line-height:1.75; margin-bottom:16px; }
  .btn { display:inline-block; background:#4CAF82; color:#FFFFFF !important; text-decoration:none;
         font-size:15px; font-weight:600; padding:14px 28px; border-radius:10px; margin:8px 0 20px; }
  .btn-outline { display:inline-block; border:2px solid #E0E0E0; color:#333333 !important;
                 text-decoration:none; font-size:14px; font-weight:500; padding:11px 24px; border-radius:9px; margin:0 0 20px; }
  .divider { height:1px; background:#F0F0F0; margin:24px 0; }
  .highlight { background:#F6FBF8; border-radius:12px; padding:20px 22px; margin:18px 0; border-left:3px solid #4CAF82; }
  .highlight strong { color:#222; }
  .check-row { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; font-size:14.5px; color:#444; line-height:1.5; }
  .check-icon { color:#4CAF82; font-weight:700; font-size:15px; flex-shrink:0; margin-top:1px; }
  .score-box { text-align:center; padding:28px; background:linear-gradient(135deg,#1A1A1A 0%,#2D2D2D 100%);
               border-radius:14px; margin:20px 0; }
  .score-num { font-size:64px; font-weight:800; line-height:1; letter-spacing:-2px; }
  .score-label { font-size:13px; color:#999; margin-top:6px; text-transform:uppercase; letter-spacing:1px; }
  .score-sub { font-size:15px; color:#ccc; margin-top:10px; }
  .stat-row { display:flex; gap:16px; margin:16px 0; }
  .stat-box { flex:1; background:#F8F8F8; border-radius:10px; padding:14px 16px; text-align:center; }
  .stat-num { font-size:22px; font-weight:700; color:#222; }
  .stat-lbl { font-size:12px; color:#888; margin-top:3px; }
  .alert { background:#FFF8F0; border-radius:10px; padding:16px 20px; border-left:3px solid #F59E0B; margin:16px 0; }
  .alert p { color:#92400E; margin:0; font-size:14.5px; }
  .fail-box { background:#FEF2F2; border-radius:12px; padding:20px 22px; margin:18px 0; border-left:3px solid #EF4444; }
  .footer { background:#F9F9F9; padding:24px 36px; border-top:1px solid #F0F0F0; }
  .footer p { font-size:12.5px; color:#AAAAAA; line-height:1.7; margin:0; }
  .footer a { color:#4CAF82; text-decoration:none; }
  @media(max-width:600px){
    .body { padding:24px 20px 20px; }
    .header { padding:22px 22px; }
    .footer { padding:20px 22px; }
    .stat-row { flex-direction:column; gap:10px; }
  }
`

function base(content, footerNote='') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>KrackHire</title>
<style>${css}</style>
</head>
<body>
<div class="outer">
  <div class="card">
    <div class="header">
      <div class="logo-box">
        <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
          <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white"/>
        </svg>
      </div>
      <div class="logo-name">Krack<span>Hire</span></div>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>
        ${footerNote ? footerNote + '<br/>' : ''}
        © 2025 KrackHire &nbsp;·&nbsp; <a href="${SITE}">www.krackhire.in</a>
        &nbsp;·&nbsp; <a href="mailto:hellokrackhire@gmail.com">hellokrackhire@gmail.com</a>
      </p>
      <p style="margin-top:6px">
        Made with ❤️ in Hyderabad, India 🇮🇳
      </p>
    </div>
  </div>
</div>
</body>
</html>`
}

// ── 1. WELCOME ────────────────────────────────────────────────
function tplWelcome(name) {
  return base(`
    <h1>Welcome to KrackHire, ${name}! 🎉</h1>
    <p>You just made a smart move. KrackHire uses AI to show you <strong>exactly</strong> why your resume gets rejected — and how to fix it before you apply.</p>

    <div class="highlight">
      <div class="check-row"><span class="check-icon">✓</span><span><strong>3 free analyses</strong> every month — no credit card needed</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>3 lifetime premium accesses</strong> already in your account</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span>Resume rewrite, cover letter &amp; cold email — all AI-powered</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span>Interview prep coach &amp; LinkedIn profile optimizer</span></div>
    </div>

    <p>Most job seekers apply blindly. You're about to know exactly what recruiters see.</p>

    <a href="${SITE}" class="btn">Start your first analysis →</a>

    <div class="divider"></div>
    <p style="font-size:14px;color:#888">
      <strong>Pro tip:</strong> Paste the full job description along with your resume for the most accurate results. The more detail you give, the better the analysis.
    </p>
  `, 'You\'re receiving this because you signed up at KrackHire.')
}

// ── 2. PAYMENT SUCCESS ────────────────────────────────────────
function tplPaymentSuccess(name, plan, amount, txnId) {
  return base(`
    <h1>You're all set, ${name}! ✅</h1>
    <p>Your payment was successful and your <strong>${plan}</strong> plan is now active.</p>

    <div class="highlight">
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Plan:</strong> ${plan}</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Amount paid:</strong> ${amount}</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Status:</strong> Active</span></div>
      ${txnId ? `<div class="check-row"><span class="check-icon">✓</span><span><strong>Transaction ID:</strong> ${txnId}</span></div>` : ''}
    </div>

    <p>You now have <strong>unlimited analyses</strong>, PDF career reports, job tracker, and all premium features.</p>

    <a href="${SITE}" class="btn">Go to KrackHire →</a>

    <div class="divider"></div>
    <p style="font-size:14px;color:#888">
      Keep this email for your records. For any billing issues, reply to this email or contact us at
      <a href="mailto:hellokrackhire@gmail.com" style="color:#4CAF82">hellokrackhire@gmail.com</a>
    </p>
  `, 'This is a payment confirmation from KrackHire.')
}

// ── 3. PAYMENT FAILED ─────────────────────────────────────────
function tplPaymentFailed(name, plan, amount) {
  return base(`
    <h1>Payment not completed</h1>
    <p>Hi ${name}, your payment of <strong>${amount}</strong> for <strong>${plan}</strong> was not completed.</p>

    <div class="fail-box">
      <p>Don't worry — <strong>no money has been deducted</strong> from your account. This happens sometimes due to a bank timeout, network issue, or insufficient balance.</p>
    </div>

    <p>The good news? You can try again in seconds:</p>

    <a href="${SITE}" class="btn">Try payment again →</a>
    <br/>
    <a href="mailto:hellokrackhire@gmail.com?subject=Payment%20issue" class="btn-outline">Contact support</a>

    <div class="divider"></div>
    <p style="font-size:14px;color:#888">
      Common reasons for payment failure: insufficient balance, bank declined the transaction, or session timeout.
      If money was deducted, contact us immediately at
      <a href="mailto:hellokrackhire@gmail.com" style="color:#4CAF82">hellokrackhire@gmail.com</a>
      or <a href="tel:+916303279390" style="color:#4CAF82">+91 63032 79390</a>.
    </p>
  `, 'This is an automated payment notification from KrackHire.')
}

// ── 4. ANALYSIS DONE ─────────────────────────────────────────
function tplAnalysisDone(name, score, atsScore, skillScore, role, company) {
  const scoreColor = score >= 70 ? '#4CAF82' : score >= 50 ? '#F59E0B' : '#EF4444'
  const scoreMsg   = score >= 70
    ? 'Strong score! Focus on the gap areas to maximise your chances.'
    : score >= 50
    ? 'Good start. A few targeted improvements can significantly boost your chances.'
    : 'Your resume needs work before applying. Check the detailed analysis for specific fixes.'

  return base(`
    <h1>Your analysis is ready 📊</h1>
    <p>Hi ${name}, here's a summary of your KrackHire analysis${role ? ` for <strong>${role}</strong>` : ''}${company ? ` at <strong>${company}</strong>` : ''}.</p>

    <div class="score-box">
      <div class="score-num" style="color:${scoreColor}">${score}</div>
      <div class="score-label">Job Readiness Score</div>
      <div class="score-sub">${scoreMsg}</div>
    </div>

    ${(atsScore || skillScore) ? `
    <div class="stat-row">
      ${atsScore ? `<div class="stat-box"><div class="stat-num" style="color:#4CAF82">${atsScore}</div><div class="stat-lbl">ATS Score</div></div>` : ''}
      ${skillScore ? `<div class="stat-box"><div class="stat-num" style="color:#6366F1">${skillScore}</div><div class="stat-lbl">Skills Score</div></div>` : ''}
    </div>` : ''}

    <p>Your full analysis — including resume rewrite, cover letter, and interview prep — is ready on KrackHire.</p>

    <a href="${SITE}" class="btn">View full analysis →</a>

    <div class="divider"></div>
    <p style="font-size:14px;color:#888">
      <strong>Next step:</strong> Use the Resume tab to get an ATS-optimised version of your resume tailored to this specific job.
    </p>
  `, 'You\'re receiving this because you ran an analysis on KrackHire.')
}

// ── 5. LIMIT REACHED ─────────────────────────────────────────
function tplLimitReached(name) {
  return base(`
    <h1>You've used all your free analyses 🚀</h1>
    <p>Hi ${name}, you've been using KrackHire actively this month — that tells us you're serious about your job search.</p>

    <p>Your free analyses reset on the 1st of next month. But if you can't wait, upgrade to Pro for unlimited access.</p>

    <div class="highlight">
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Unlimited</strong> resume analyses</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>PDF career reports</strong> with detailed improvement plans</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>LinkedIn &amp; Naukri</strong> profile optimizer</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Job tracker</strong> to manage all applications</span></div>
    </div>

    <a href="${SITE}" class="btn">Upgrade to Pro — ₹49/month →</a>

    <div class="divider"></div>
    <div class="alert">
      <p>💡 You still have <strong>lifetime premium accesses</strong> available. Check your account — you may be able to run more analyses right now without upgrading.</p>
    </div>
  `, 'You\'re receiving this because you reached your monthly analysis limit on KrackHire.')
}

// ── 6. PLAN EXPIRING ─────────────────────────────────────────
function tplPlanExpiring(name, plan, daysLeft) {
  return base(`
    <h1>Your ${plan} plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} ⏰</h1>
    <p>Hi ${name}, just a heads up — your KrackHire <strong>${plan}</strong> plan expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>

    <p>Renew now to keep your unlimited access, PDF reports, and all premium features without interruption.</p>

    <a href="${SITE}" class="btn">Renew my plan →</a>

    <div class="divider"></div>
    <p style="font-size:14px;color:#888">
      After expiry, your account automatically moves to the free plan (3 analyses/month).
      Your analysis history and data are always saved — you won't lose anything.
    </p>
  `, 'You\'re receiving this as a reminder about your KrackHire subscription.')
}

// ── 7. INACTIVE REMINDER ─────────────────────────────────────
function tplInactiveReminder(name, daysSince) {
  return base(`
    <h1>Still looking for that job, ${name}? 👋</h1>
    <p>It's been ${daysSince} days since you last used KrackHire. Job hunting can be tough — but you don't have to figure it out alone.</p>

    <div class="highlight">
      <div class="check-row"><span class="check-icon">→</span><span>Check your resume against new job descriptions</span></div>
      <div class="check-row"><span class="check-icon">→</span><span>Improve your LinkedIn headline and About section</span></div>
      <div class="check-row"><span class="check-icon">→</span><span>Practice interview questions with the AI coach</span></div>
      <div class="check-row"><span class="check-icon">→</span><span>Track all your applications in one place</span></div>
    </div>

    <p>You still have free analyses available this month. Use them before they reset.</p>

    <a href="${SITE}" class="btn">Pick up where you left off →</a>
  `, 'You\'re receiving this because you have an account on KrackHire.')
}

// ── 8. COLLEGE ENQUIRY (admin notification) ──────────────────
function tplCollegeEnquiry(collegeName, contactName, email, phone, students) {
  return base(`
    <h1>New B2B enquiry 🏫</h1>
    <p>A new college partnership enquiry has been submitted on KrackHire.</p>

    <div class="highlight">
      <div class="check-row"><span class="check-icon">🏫</span><span><strong>College:</strong> ${collegeName}</span></div>
      <div class="check-row"><span class="check-icon">👤</span><span><strong>Contact:</strong> ${contactName||'—'}</span></div>
      <div class="check-row"><span class="check-icon">📧</span><span><strong>Email:</strong> <a href="mailto:${email}" style="color:#4CAF82">${email}</a></span></div>
      <div class="check-row"><span class="check-icon">📞</span><span><strong>Phone:</strong> ${phone||'Not provided'}</span></div>
      <div class="check-row"><span class="check-icon">👥</span><span><strong>Students:</strong> ${students||'Not specified'}</span></div>
    </div>

    <a href="mailto:${email}?subject=KrackHire%20College%20Partnership" class="btn">Reply to enquiry →</a>
  `)
}

// ── 9. ADMIN: new payment notification ───────────────────────
function tplAdminNewPayment(userEmail, plan, amount, txnId) {
  return base(`
    <h1>💰 New payment received!</h1>

    <div class="highlight">
      <div class="check-row"><span class="check-icon">✓</span><span><strong>User:</strong> ${userEmail}</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Plan:</strong> ${plan}</span></div>
      <div class="check-row"><span class="check-icon">✓</span><span><strong>Amount:</strong> ${amount}</span></div>
      ${txnId ? `<div class="check-row"><span class="check-icon">✓</span><span><strong>Txn ID:</strong> ${txnId}</span></div>` : ''}
    </div>

    <a href="${SITE}" class="btn">Open admin panel →</a>
  `)
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN||'https://www.krackhire.in')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' })

  let body = {}
  try { body = req.body || {} } catch(e) {}
  const { type, userId, data, _secret } = body
  if (!type) return res.status(400).json({ success:false, message:'Missing type' })
  // Basic auth: either internal call (no secret needed for bulk) or verify secret
  const EMAIL_SECRET = process.env.EMAIL_SECRET || ''
  const isInternal = req.headers['x-internal'] === EMAIL_SECRET || !EMAIL_SECRET
  if (!isInternal && !['welcome','payment_success','payment_failed','analysis_done','limit_reached','plan_expiring'].includes(type)) {
    // Bulk endpoints require auth
    return res.status(401).json({ success:false, message:'Unauthorized' })
  }

  let sb = null
  try { sb = getSB() } catch(e) { console.warn('[email] DB init failed:', e.message) }
  let result

  try {
    switch(type) {

      case 'welcome': {
        const { email, name } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: `Welcome to KrackHire, ${name||'friend'}! 🎉`,
          html: tplWelcome(name||'there'),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'payment_success': {
        const { email, name, plan, amount, txnId } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        // Email user
        result = await send({
          to: email,
          subject: `Payment confirmed — ${plan} is now active ✅`,
          html: tplPaymentSuccess(name||'there', plan, amount, txnId),
        })
        // Notify admin
        await send({
          to: FROM.email,
          subject: `💰 New payment: ${amount} for ${plan}`,
          html: tplAdminNewPayment(email, plan, amount, txnId),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'payment_failed': {
        const { email, name, plan, amount } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: `Payment not completed — please try again`,
          html: tplPaymentFailed(name||'there', plan, amount),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'analysis_done': {
        const { email, name, score, atsScore, skillScore, role, company } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: `Your analysis is ready — Score: ${score}/100 📊`,
          html: tplAnalysisDone(name||'there', score, atsScore, skillScore, role, company),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'limit_reached': {
        const { email, name } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: `You've used all your free analyses this month`,
          html: tplLimitReached(name||'there'),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'plan_expiring': {
        const { email, name, plan, daysLeft } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: `Your ${plan} plan expires in ${daysLeft} day${daysLeft===1?'':'s'} ⏰`,
          html: tplPlanExpiring(name||'there', plan, daysLeft),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'inactive_reminder': {
        const { email, name, daysSince } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: `${name||'Hey'}, still looking for that job? 👋`,
          html: tplInactiveReminder(name||'there', daysSince||7),
        })
        await log(sb, { userId, type, to:email, status:result.ok?'sent':'failed' })
        break
      }

      case 'college_enquiry': {
        const { collegeName, contactName, email, phone, students } = data||{}
        result = await send({
          to: FROM.email,
          subject: `🏫 New college partnership: ${collegeName}`,
          html: tplCollegeEnquiry(collegeName, contactName, email, phone, students),
        })
        await log(sb, { userId:null, type, to:FROM.email, status:result.ok?'sent':'failed' })
        break
      }

      // Bulk jobs (called by cron)
      case 'bulk_inactive': {
        if (!sb) return res.status(500).json({ success:false, message:'DB unavailable' })
        const cutoff = new Date(Date.now()-7*86400000).toISOString()
        const { data: inactive } = await sb.from('profiles').select('id,email,name')
          .lt('updated_at', cutoff).eq('plan','free').limit(50)
        let sent = 0
        for (const u of inactive||[]) {
          if (!u.email) continue
          const { data: recent } = await sb.from('email_logs').select('id')
            .eq('user_id',u.id).eq('type','inactive_reminder').gte('sent_at',cutoff).single()
          if (recent) continue
          const r = await send({ to:u.email, subject:`${u.name||'Hey'}, still looking for that job? 👋`, html:tplInactiveReminder(u.name||'there',7) })
          await log(sb, { userId:u.id, type:'inactive_reminder', to:u.email, status:r.ok?'sent':'failed' })
          if (r.ok) sent++
          await new Promise(r=>setTimeout(r,120))
        }
        return res.status(200).json({ success:true, message:`Sent ${sent} reminders` })
      }

      case 'bulk_expiring': {
        if (!sb) return res.status(500).json({ success:false, message:'DB unavailable' })
        const in3 = new Date(Date.now()+3*86400000).toISOString()
        const now = new Date().toISOString()
        const { data: expiring } = await sb.from('profiles').select('id,email,name,plan,plan_expires_at')
          .neq('plan','free').neq('plan','founding_user').neq('plan','early_adopter')
          .lte('plan_expires_at',in3).gte('plan_expires_at',now).limit(50)
        let sent = 0
        for (const u of expiring||[]) {
          if (!u.email) continue
          const daysLeft = Math.ceil((new Date(u.plan_expires_at)-new Date())/86400000)
          const r = await send({ to:u.email, subject:`Your ${u.plan} expires in ${daysLeft} day${daysLeft===1?'':'s'} ⏰`, html:tplPlanExpiring(u.name||'there',u.plan,daysLeft) })
          await log(sb, { userId:u.id, type:'plan_expiring', to:u.email, status:r.ok?'sent':'failed' })
          if (r.ok) sent++
          await new Promise(r=>setTimeout(r,120))
        }
        return res.status(200).json({ success:true, message:`Sent ${sent} expiry reminders` })
      }

      case 'test': {
        // Test endpoint - call /api/email with {type:"test",data:{email:"your@email.com"}}
        const { email } = data||{}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await send({
          to: email,
          subject: 'KrackHire email test ✅',
          html: `<div style="font-family:sans-serif;padding:32px;max-width:500px;margin:0 auto">
            <h2 style="color:#4CAF82">✅ Email is working!</h2>
            <p>Your KrackHire email system is configured correctly.</p>
            <p>Brevo API key: working ✓<br/>Sender verified: working ✓</p>
          </div>`,
        })
        await log(sb, { userId:null, type:'test', to:email, status:result.ok?'sent':'failed' })
        break
      }

      default:
        return res.status(400).json({ success:false, message:`Unknown type: ${type}` })
    }

    return res.status(200).json({ success: result?.ok||false, message: result?.ok ? 'Email sent' : 'Email failed' })

  } catch(err) {
    console.error('[email] Handler error:', err.message)
    return res.status(500).json({ success:false, message:'Email service error' })
  }
}
