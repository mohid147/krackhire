// api/email.js — KrackHire Email Engine v1
// Uses Brevo (free tier: 300 emails/day, no credit card needed)
// Sign up at brevo.com → SMTP & API → API Keys → Create → add BREVO_API_KEY to Vercel env vars

import { createClient } from '@supabase/supabase-js'

function getSB() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } })
}

const BREVO_KEY   = process.env.BREVO_API_KEY || ''
const FROM_EMAIL  = { name: 'KrackHire', email: 'hellokrackhire@gmail.com' }
const SITE_URL    = process.env.VITE_SITE_URL || 'https://www.krackhire.in'

// ── Send email via Brevo (free: 300/day, no monthly cap) ────────
async function sendEmail({ to, subject, html }) {
  if (!BREVO_KEY) {
    console.warn('[email] BREVO_API_KEY not set — skipping email')
    return { ok: false, reason: 'no_key' }
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender:  FROM_EMAIL,
        to:      [{ email: to }],
        subject,
        htmlContent: html,
      }),
    })
    const data = await res.json()
    if (!res.ok) { console.error('[email] Brevo error:', data); return { ok: false, data } }
    return { ok: true, id: data.messageId }
  } catch (e) {
    console.error('[email] Send failed:', e.message)
    return { ok: false, error: e.message }
  }
}

// ── Email Templates ───────────────────────────────────────────
const T = {
  base: (content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Sans',system-ui,sans-serif;background:#F9F8F6;color:#1C1917}
  .wrap{max-width:560px;margin:0 auto;padding:32px 16px}
  .card{background:#fff;border-radius:16px;padding:32px;border:1px solid #E7E5E4}
  .logo{display:flex;align-items:center;gap:8px;margin-bottom:28px}
  .logo-box{width:36px;height:36px;background:#3D6B4F;border-radius:8px;display:flex;align-items:center;justify-content:center}
  .logo-text{font-size:18px;font-weight:700;color:#1C1917}
  .logo-text span{color:#3D6B4F}
  h1{font-size:22px;font-weight:700;color:#1C1917;margin-bottom:12px;line-height:1.3}
  p{font-size:15px;color:#57534E;line-height:1.75;margin-bottom:16px}
  .btn{display:inline-block;padding:14px 28px;background:#3D6B4F;color:#fff;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;margin:8px 0 16px}
  .divider{height:1px;background:#E7E5E4;margin:24px 0}
  .small{font-size:13px;color:#A8A29E;line-height:1.6}
  .highlight{background:#F0F5F2;border-radius:10px;padding:16px 20px;margin:16px 0;border-left:3px solid #3D6B4F}
  .badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700}
  .badge-green{background:#F0F5F2;color:#3D6B4F}
  .badge-amber{background:#FFFBEB;color:#B45309}
  .footer{text-align:center;padding:24px 0 0;font-size:13px;color:#A8A29E}
  .footer a{color:#3D6B4F;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="logo">
      <div class="logo-box">
        <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
          <path d="M11 10H16V19L23 10H29.5L21.5 20L30 30H23.5L16 21V30H11V10Z" fill="white"/>
        </svg>
      </div>
      <div class="logo-text">Krack<span>Hire</span></div>
    </div>
    ${content}
  </div>
  <div class="footer">
    <p>© 2025 KrackHire · <a href="${SITE_URL}">www.krackhire.in</a> · Made in Hyderabad 🇮🇳</p>
    <p style="margin-top:6px"><a href="${SITE_URL}/contact">Contact us</a> · <a href="${SITE_URL}/privacy">Privacy</a></p>
  </div>
</div>
</body>
</html>`,

  welcome: (name) => T.base(`
    <h1>Welcome to KrackHire, ${name}! 🎉</h1>
    <p>You've just taken the first step toward landing your dream job. KrackHire uses AI to help you understand exactly why your resume gets rejected — and how to fix it.</p>
    <div class="highlight">
      <strong>You get for free:</strong><br/>
      ✓ 3 resume analyses per month<br/>
      ✓ 3 lifetime premium accesses<br/>
      ✓ Gap analysis, cover letter, cold email<br/>
      ✓ Interview prep coach
    </div>
    <a href="${SITE_URL}" class="btn">Start your first analysis →</a>
    <div class="divider"></div>
    <p class="small">Tip: Paste the full job description for the most accurate results. The more detail you give, the better the analysis.</p>
  `),

  payment_success: (name, plan, amount) => T.base(`
    <h1>Payment successful! ✅</h1>
    <p>Hi ${name}, your payment of <strong>${amount}</strong> was successful.</p>
    <div class="highlight">
      <strong>Your plan:</strong> <span class="badge badge-green">${plan}</span><br/>
      <strong>Access:</strong> Unlimited analyses, PDF reports, all features<br/>
      <strong>Support:</strong> hellokrackhire@gmail.com
    </div>
    <a href="${SITE_URL}" class="btn">Go to KrackHire →</a>
    <div class="divider"></div>
    <p class="small">Keep your payment ID for records. If you have any issues, reply to this email or contact us at hellokrackhire@gmail.com</p>
  `),

  payment_failed: (name, plan, amount) => T.base(`
    <h1>Payment not completed 😔</h1>
    <p>Hi ${name}, your payment of <strong>${amount}</strong> for <strong>${plan}</strong> was not completed.</p>
    <p>This can happen due to:</p>
    <ul style="margin:0 0 16px 20px;color:#57534E;font-size:15px;line-height:2">
      <li>Insufficient balance</li>
      <li>Bank declined the transaction</li>
      <li>Payment timeout</li>
      <li>Network issue during payment</li>
    </ul>
    <a href="${SITE_URL}" class="btn">Try again →</a>
    <div class="divider"></div>
    <p class="small">No money has been deducted. If you see a deduction, contact us immediately at hellokrackhire@gmail.com or +91 63032 79390</p>
  `),

  limit_reached: (name, used) => T.base(`
    <h1>You've used all ${used} free analyses this month 📊</h1>
    <p>Hi ${name}, you've been using KrackHire actively — that's great!</p>
    <p>To continue improving your job applications, upgrade to Pro for just <strong>₹49/month</strong>.</p>
    <div class="highlight">
      <strong>Pro plan includes:</strong><br/>
      ✓ Unlimited analyses<br/>
      ✓ PDF career reports<br/>
      ✓ LinkedIn & Naukri optimizer<br/>
      ✓ Job application tracker
    </div>
    <a href="${SITE_URL}" class="btn">Upgrade to Pro — ₹49/month →</a>
    <div class="divider"></div>
    <p class="small">Your free analyses reset on the 1st of every month. Or use one of your 3 lifetime premium accesses if you have them.</p>
  `),

  plan_expiring: (name, plan, daysLeft) => T.base(`
    <h1>Your ${plan} plan expires in ${daysLeft} days ⏰</h1>
    <p>Hi ${name}, your KrackHire Pro access expires in <strong>${daysLeft} days</strong>.</p>
    <p>Renew now to keep your unlimited analyses, PDF reports, and all premium features.</p>
    <a href="${SITE_URL}" class="btn">Renew my plan →</a>
    <div class="divider"></div>
    <p class="small">After expiry, your account moves to the free plan (3 analyses/month). Your history and data are always saved.</p>
  `),

  inactive_reminder: (name, daysSince) => T.base(`
    <h1>Your resume is waiting, ${name} 👋</h1>
    <p>It's been ${daysSince} days since you last used KrackHire. Job hunting is tough — but you don't have to figure it out alone.</p>
    <div class="highlight">
      Come back and:<br/>
      ✓ Check your resume against new job descriptions<br/>
      ✓ Improve your LinkedIn profile<br/>
      ✓ Practice interview questions with AI
    </div>
    <a href="${SITE_URL}" class="btn">Pick up where you left off →</a>
    <div class="divider"></div>
    <p class="small">You still have free analyses available this month. Use them before they reset.</p>
  `),

  analysis_done: (name, score, role, company) => T.base(`
    <h1>Your analysis is ready! 📊</h1>
    <p>Hi ${name}, here's a quick summary of your KrackHire analysis${role ? ` for <strong>${role}</strong>` : ''}${company ? ` at <strong>${company}</strong>` : ''}:</p>
    <div class="highlight" style="text-align:center">
      <div style="font-size:48px;font-weight:800;color:${score>=70?'#3D6B4F':score>=50?'#B45309':'#C0392B'}">${score}</div>
      <div style="font-size:14px;color:#57534E;margin-top:4px">Job Readiness Score / 100</div>
    </div>
    <p>${score>=70 ? 'Great score! You\'re well-positioned for this role. Focus on the gap areas to maximise your chances.' : score>=50 ? 'Good start. With a few targeted improvements you can significantly boost your chances.' : 'Your resume needs work before applying. Check the gap analysis for specific fixes.'}</p>
    <a href="${SITE_URL}" class="btn">View full analysis →</a>
  `),

  college_enquiry: (collegeName, contactName, email, phone, students) => T.base(`
    <h1>New college partnership enquiry 🏫</h1>
    <div class="highlight">
      <strong>College:</strong> ${collegeName}<br/>
      <strong>Contact:</strong> ${contactName}<br/>
      <strong>Email:</strong> ${email}<br/>
      <strong>Phone:</strong> ${phone||'Not provided'}<br/>
      <strong>Students:</strong> ${students||'Not specified'}
    </div>
    <a href="mailto:${email}" class="btn">Reply to enquiry →</a>
  `),
}

// ── Log email to DB ───────────────────────────────────────────
async function logEmail(sb, { userId, type, to, status, error }) {
  if (!sb) return
  await sb.from('email_logs').insert({
    user_id: userId || null,
    type,
    to,
    status,
    error: error || null,
    sent_at: new Date().toISOString(),
  }).catch(e => console.error('[email] Log error:', e.message))
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' })

  const { type, userId, data } = req.body || {}
  if (!type) return res.status(400).json({ success:false, message:'Missing type' })

  const sb = getSB()
  let result

  try {
    switch (type) {

      case 'welcome': {
        const { email, name } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `Welcome to KrackHire, ${name||'friend'}! 🎉`,
          html: T.welcome(name||'there'),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'payment_success': {
        const { email, name, plan, amount } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `Payment confirmed — ${plan} is active ✅`,
          html: T.payment_success(name||'there', plan, amount),
        })
        // Also notify admin
        await sendEmail({
          to: 'hellokrackhire@gmail.com',
          subject: `💰 New payment: ${amount} for ${plan}`,
          html: T.base(`<h1>New payment received!</h1><div class="highlight"><strong>User:</strong> ${email}<br/><strong>Plan:</strong> ${plan}<br/><strong>Amount:</strong> ${amount}</div>`),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'payment_failed': {
        const { email, name, plan, amount } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `Payment not completed — please try again`,
          html: T.payment_failed(name||'there', plan, amount),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'limit_reached': {
        const { email, name, used } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `You've used all your free analyses — upgrade for unlimited access`,
          html: T.limit_reached(name||'there', used||3),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'plan_expiring': {
        const { email, name, plan, daysLeft } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `Your ${plan} plan expires in ${daysLeft} days`,
          html: T.plan_expiring(name||'there', plan, daysLeft),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'inactive_reminder': {
        const { email, name, daysSince } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `${name||'Hey'}, your resume is waiting 👋`,
          html: T.inactive_reminder(name||'there', daysSince||7),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'analysis_done': {
        const { email, name, score, role, company } = data || {}
        if (!email) return res.status(400).json({ success:false, message:'Missing email' })
        result = await sendEmail({
          to: email,
          subject: `Your analysis is ready — Score: ${score}/100`,
          html: T.analysis_done(name||'there', score, role, company),
        })
        await logEmail(sb, { userId, type, to:email, status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'college_enquiry': {
        const { collegeName, contactName, email, phone, students } = data || {}
        result = await sendEmail({
          to: 'hellokrackhire@gmail.com',
          subject: `🏫 New college partnership: ${collegeName}`,
          html: T.college_enquiry(collegeName, contactName, email, phone, students),
        })
        await logEmail(sb, { userId:null, type, to:'hellokrackhire@gmail.com', status: result.ok?'sent':'failed', error: result.error })
        break
      }

      case 'bulk_inactive': {
        // Called by a cron job — send reminders to inactive users
        if (!sb) return res.status(500).json({ success:false, message:'DB unavailable' })
        const cutoff = new Date(Date.now() - 7*86400000).toISOString()
        const { data: inactive } = await sb
          .from('profiles')
          .select('id, email, name')
          .lt('updated_at', cutoff)
          .eq('plan', 'free')
          .limit(50)

        let sent = 0
        for (const u of inactive || []) {
          if (!u.email) continue
          // Check not already emailed recently
          const { data: recent } = await sb
            .from('email_logs')
            .select('id')
            .eq('user_id', u.id)
            .eq('type', 'inactive_reminder')
            .gte('sent_at', cutoff)
            .single()
          if (recent) continue

          const r = await sendEmail({
            to: u.email,
            subject: `${u.name||'Hey'}, your resume is waiting 👋`,
            html: T.inactive_reminder(u.name||'there', 7),
          })
          await logEmail(sb, { userId:u.id, type:'inactive_reminder', to:u.email, status:r.ok?'sent':'failed' })
          if (r.ok) sent++
          // Rate limit: 1 per 100ms
          await new Promise(r => setTimeout(r, 100))
        }
        return res.status(200).json({ success:true, message:`Sent ${sent} reminders` })
      }

      case 'bulk_expiring': {
        // Send plan expiry reminders
        if (!sb) return res.status(500).json({ success:false, message:'DB unavailable' })
        const in3days  = new Date(Date.now() + 3*86400000).toISOString()
        const now      = new Date().toISOString()
        const { data: expiring } = await sb
          .from('profiles')
          .select('id, email, name, plan, plan_expires_at')
          .neq('plan', 'free')
          .neq('plan', 'founding_user')
          .neq('plan', 'early_adopter')
          .lte('plan_expires_at', in3days)
          .gte('plan_expires_at', now)
          .limit(50)

        let sent = 0
        for (const u of expiring || []) {
          if (!u.email) continue
          const daysLeft = Math.ceil((new Date(u.plan_expires_at) - new Date()) / 86400000)
          const r = await sendEmail({
            to: u.email,
            subject: `Your ${u.plan} plan expires in ${daysLeft} days`,
            html: T.plan_expiring(u.name||'there', u.plan, daysLeft),
          })
          await logEmail(sb, { userId:u.id, type:'plan_expiring', to:u.email, status:r.ok?'sent':'failed' })
          if (r.ok) sent++
          await new Promise(r => setTimeout(r, 100))
        }
        return res.status(200).json({ success:true, message:`Sent ${sent} expiry reminders` })
      }

      default:
        return res.status(400).json({ success:false, message:`Unknown email type: ${type}` })
    }

    return res.status(200).json({ success: result?.ok||false, message: result?.ok ? 'Email sent' : 'Email failed' })

  } catch (err) {
    console.error('[email] Handler error:', err.message)
    return res.status(500).json({ success:false, message:'Email service error' })
  }
}
