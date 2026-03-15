// api/analyse.js — Production + Supabase + Subscription check
import { createClient } from '@supabase/supabase-js'

function getSB() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── IP RATE LIMITER (anonymous users) ─────────────────────
const rlMap = new Map()
function checkRL(ip) {
  const now = Date.now(), W = 60*60*1000, MAX = 5
  const e = rlMap.get(ip) || { count: 0, start: now }
  if (now - e.start > W) { rlMap.set(ip, { count: 1, start: now }); return true }
  if (e.count >= MAX) return false
  e.count++; rlMap.set(ip, e); return true
}

// ── SANITIZE ──────────────────────────────────────────────
function clean(text, max = 8000) {
  if (typeof text !== 'string') return ''
  const bad = [/ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,/system\s+prompt/gi,/jailbreak/gi,/you\s+are\s+now\s+/gi,/<script[\s\S]*?<\/script>/gi,/javascript:/gi]
  let t = text.slice(0, max)
  bad.forEach(p => { t = t.replace(p, '[filtered]') })
  return t.trim()
}

// ── PROMPTS ───────────────────────────────────────────────
function sysPrompt(type, { company, role, jd, resume }) {
  const p = {
    gap: `You are a blunt experienced Indian tech recruiter.
CRITICAL: Return ONLY valid JSON, no markdown, no preamble.
Schema: {"score":<0-100>,"summary":"<2 honest sentences>","missing":[{"title":"<gap>","detail":"<fix>"}],"weak":[{"title":"<area>","detail":"<advice>"}],"strong":[{"title":"<strength>","detail":"<how to use>"}]}
Max 3 items per array. Be specific and honest.`,
    resume: `Expert ATS resume writer Indian tech market. Plain text only. No markdown no tables.
Strong action verbs. Quantify results. JD keywords inserted naturally.
Sections: SUMMARY | SKILLS | EXPERIENCE | PROJECTS | EDUCATION`,
    cover: `Expert cover letter writer Indian market. Professional Indian English. Under 250 words.
3 paragraphs: why this role/company | what you bring | clear CTA. No generic openers.`,
    email: `Write cold emails to Indian HR that get replies. Under 130 words. Confident.
Output EXACTLY:
Subject: <line>

---

Dear [HR Name],

<body>

[Your Name]
[Your Phone]`,
    interview: `Tough fair interview coach. Company: ${company||'?'} Role: ${role||'?'}
JD: ${(jd||'').slice(0,500)} Resume: ${(resume||'').slice(0,500)}
Ask ONE question at a time. Score /10. Ideal answer in 3 bullets. Under 220 words. Never repeat.`,
  }
  return p[type] || p.gap
}

function userPrompt(type, ctx) {
  const p = {
    gap:    `Analyse resume vs job description:\n\n${ctx}`,
    resume: `Rewrite resume to match job description:\n\n${ctx}`,
    cover:  `Write cover letter for this application:\n\n${ctx}`,
    email:  `Write cold email to HR for this application:\n\n${ctx}`,
  }
  return p[type]
}

const MAX_TOK = { gap: 900, resume: 1400, cover: 650, email: 380, interview: 550 }

// ── MAIN HANDLER ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const KEY = process.env.GROQ_API_KEY
  if (!KEY) return res.status(500).json({ error: 'Service unavailable.' })

  const { type, resume, jd, company, role, messages, userId } = req.body || {}

  if (!['gap','resume','cover','email','interview'].includes(type))
    return res.status(400).json({ error: 'Invalid request type.' })

  // ── SUBSCRIPTION / USAGE CHECK ────────────────────────────
  const sb = getSB()

  if (userId && sb && type === 'gap') {
    try {
      const { data: prof } = await sb.from('profiles')
        .select('plan, plan_expires_at, analyses_this_month, month_reset')
        .eq('id', userId).single()

      if (prof) {
        // Check if pro plan has expired
        const isPro = prof.plan === 'pro' &&
          prof.plan_expires_at &&
          new Date(prof.plan_expires_at) > new Date()

        // Downgrade if expired
        if (prof.plan === 'pro' && !isPro) {
          await sb.from('profiles').update({ plan: 'free' }).eq('id', userId)
        }

        const LIMIT = isPro ? 999999 : 3
        const lastReset  = new Date(prof.month_reset || new Date())
        const now        = new Date()
        const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()
        const used       = isNewMonth ? 0 : (prof.analyses_this_month || 0)

        if (!isPro && used >= LIMIT) {
          return res.status(403).json({
            error: `You've used all ${LIMIT} free analyses this month.`,
            code: 'LIMIT_REACHED',
            plan: prof.plan,
            limit: LIMIT,
          })
        }

        // Increment usage
        await sb.from('profiles').update({
          analyses_this_month: isNewMonth ? 1 : used + 1,
          month_reset: isNewMonth ? now.toISOString() : prof.month_reset,
        }).eq('id', userId)
      }
    } catch (e) {
      console.error('Usage check error:', e.message)
      // Non-blocking — let request through
    }
  } else if (!userId) {
    // Anonymous — IP rate limit
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
    if (!checkRL(ip)) {
      return res.status(429).json({
        error: 'Rate limit reached. Sign in for more free analyses.',
        code: 'RATE_LIMITED',
      })
    }
  }

  // ── SANITIZE ──────────────────────────────────────────────
  const safeResume  = clean(resume  || '', 8000)
  const safeJd      = clean(jd      || '', 4000)
  const safeCompany = clean(company || '', 100)
  const safeRole    = clean(role    || '', 100)

  if (type !== 'interview' && (!safeResume || !safeJd))
    return res.status(400).json({ error: 'Resume and job description are required.' })

  const ctx = `Resume:\n${safeResume}\n\nJob Description:\n${safeJd}\nCompany: ${safeCompany||'Not specified'}\nRole: ${safeRole||'Not specified'}`

  let chatMsgs
  if (type === 'interview' && Array.isArray(messages) && messages.length > 0) {
    chatMsgs = messages.slice(-12).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: clean(String(m.content || ''), 2000),
    }))
  } else {
    chatMsgs = [{ role: 'user', content: userPrompt(type, ctx) || ctx }]
  }

  // ── CALL GROQ ─────────────────────────────────────────────
  try {
    const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: MAX_TOK[type] || 800,
        temperature: type === 'gap' ? 0.2 : 0.7,
        messages: [{ role: 'system', content: sysPrompt(type, { company: safeCompany, role: safeRole, jd: safeJd, resume: safeResume }) }, ...chatMsgs],
      }),
    })

    if (gr.status === 429) return res.status(429).json({ error: 'AI busy. Wait a moment and try again.' })
    if (!gr.ok) { console.error('Groq error:', gr.status); return res.status(502).json({ error: 'AI error. Please try again.' }) }

    const data   = await gr.json()
    const result = data.choices?.[0]?.message?.content || ''
    if (!result) return res.status(502).json({ error: 'Empty AI response. Try again.' })

    // Save gap analysis to DB if user is logged in
    if (userId && sb && type === 'gap') {
      try {
        const parsed = JSON.parse(result.replace(/```json|```/g, '').trim())
        await sb.from('analyses').insert({
          user_id: userId, company: safeCompany, role: safeRole,
          gap_score: parsed?.score, gap_result: parsed,
        })
      } catch (e) { console.error('Save error:', e.message) }
    }

    return res.status(200).json({ result })

  } catch (err) {
    console.error('Handler error:', err.message)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
