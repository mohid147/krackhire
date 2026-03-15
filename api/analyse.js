// api/analyse.js — Production + Supabase Integration
import { createClient } from '@supabase/supabase-js'

// ── SUPABASE SERVER CLIENT ────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// ── IP RATE LIMITER (for anonymous users) ─────────────────
const rateLimitMap = new Map()
function checkRateLimit(ip) {
  const now = Date.now()
  const WINDOW = 60 * 60 * 1000
  const MAX = 5
  const entry = rateLimitMap.get(ip) || { count: 0, start: now }
  if (now - entry.start > WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now })
    return { allowed: true }
  }
  if (entry.count >= MAX) return { allowed: false }
  entry.count++
  rateLimitMap.set(ip, entry)
  return { allowed: true }
}

// ── SANITIZE ──────────────────────────────────────────────
function sanitize(text, maxLen = 8000) {
  if (typeof text !== 'string') return ''
  const patterns = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /system\s+prompt/gi, /jailbreak/gi,
    /you\s+are\s+now\s+/gi,
    /<script[\s\S]*?<\/script>/gi,
    /javascript:/gi,
  ]
  let clean = text.slice(0, maxLen)
  patterns.forEach(p => { clean = clean.replace(p, '[filtered]') })
  return clean.trim()
}

// ── PROMPTS ───────────────────────────────────────────────
function getSystemPrompt(type, { company, role, jd, resume }) {
  const p = {
    gap: `You are a blunt experienced Indian tech recruiter.
CRITICAL: Return ONLY valid JSON no markdown no preamble.
Schema: {"score":<0-100>,"summary":"<2 honest sentences>","missing":[{"title":"<gap>","detail":"<fix>"}],"weak":[{"title":"<area>","detail":"<advice>"}],"strong":[{"title":"<strength>","detail":"<how to use>"}]}
Max 3 items each array.`,
    resume: `Expert ATS resume writer Indian tech market. Plain text only. No markdown no tables.
Strong action verbs. Quantify results. JD keywords inserted naturally.
Sections: SUMMARY | SKILLS | EXPERIENCE | PROJECTS | EDUCATION`,
    cover: `Expert cover letter writer Indian market. Professional Indian English. Under 250 words.
3 paragraphs: why this role/company | what you bring | clear CTA. No generic openers.`,
    email: `Write cold emails to Indian HR that get replies. Under 130 words. Confident not desperate.
Output EXACTLY:
Subject: <line>

---

Dear [HR Name],

<body>

[Your Name]
[Your Phone]`,
    interview: `Tough fair interview coach. Company: ${company||'?'} Role: ${role||'?'}
JD: ${(jd||'').slice(0,500)} Resume: ${(resume||'').slice(0,500)}
Ask ONE question at a time. Score /10. Show ideal answer in 3 bullets. Under 220 words. Never repeat questions.`,
  }
  return p[type] || p.gap
}

function getUserPrompt(type, ctx) {
  const p = {
    gap:    `Analyse resume vs job description:\n\n${ctx}`,
    resume: `Rewrite resume to match job description:\n\n${ctx}`,
    cover:  `Write cover letter for this application:\n\n${ctx}`,
    email:  `Write cold email to HR for this application:\n\n${ctx}`,
  }
  return p[type]
}

const MAX_TOKENS = { gap:900, resume:1400, cover:650, email:380, interview:550 }

// ── MAIN HANDLER ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const GROQ_KEY = process.env.GROQ_API_KEY
  if (!GROQ_KEY) return res.status(500).json({ error: 'Service unavailable.' })

  const { type, resume, jd, company, role, messages, userId } = req.body || {}

  const validTypes = ['gap','resume','cover','email','interview']
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid request type.' })
  }

  // ── USAGE LIMITS ──────────────────────────────────────────
  const supabase = getSupabase()

  if (userId && supabase && type === 'gap') {
    // Logged-in user — check monthly limit
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, analyses_this_month, month_reset')
        .eq('id', userId)
        .single()

      if (profile) {
        const LIMITS = { free:3, pro:999999, team:999999 }
        const limit  = LIMITS[profile.plan] || 3
        const lastReset  = new Date(profile.month_reset)
        const now        = new Date()
        const isNewMonth = now.getMonth() !== lastReset.getMonth() ||
                           now.getFullYear() !== lastReset.getFullYear()
        const used = isNewMonth ? 0 : profile.analyses_this_month

        if (used >= limit) {
          return res.status(403).json({
            error: `You've used all ${limit} free analyses this month. Upgrade to Pro for unlimited.`,
            code:  'LIMIT_REACHED',
            plan:  profile.plan,
            limit,
          })
        }

        // Increment
        await supabase.from('profiles').update({
          analyses_this_month: isNewMonth ? 1 : used + 1,
          month_reset: isNewMonth ? now.toISOString() : profile.month_reset,
        }).eq('id', userId)
      }
    } catch(e) {
      console.error('DB usage check failed:', e.message)
      // Non-blocking — let request through
    }
  } else if (!userId) {
    // Anonymous — IP rate limit
    const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() ||
               req.socket?.remoteAddress || 'unknown'
    const { allowed } = checkRateLimit(ip)
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit reached. Sign in for more free analyses.',
        code: 'RATE_LIMITED',
      })
    }
  }

  // ── SANITIZE ──────────────────────────────────────────────
  const safeResume  = sanitize(resume  ||'', 8000)
  const safeJd      = sanitize(jd      ||'', 4000)
  const safeCompany = sanitize(company ||'', 100)
  const safeRole    = sanitize(role    ||'', 100)

  if (type !== 'interview' && (!safeResume || !safeJd)) {
    return res.status(400).json({ error: 'Resume and job description are required.' })
  }

  const ctx = `Resume:\n${safeResume}\n\nJob Description:\n${safeJd}\nCompany: ${safeCompany||'Not specified'}\nRole: ${safeRole||'Not specified'}`

  let chatMessages
  if (type === 'interview' && Array.isArray(messages) && messages.length > 0) {
    chatMessages = messages.slice(-12).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: sanitize(String(m.content||''), 2000),
    }))
  } else {
    chatMessages = [{ role: 'user', content: getUserPrompt(type, ctx) || ctx }]
  }

  // ── CALL GROQ ─────────────────────────────────────────────
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: MAX_TOKENS[type] || 800,
        temperature: type === 'gap' ? 0.2 : 0.7,
        messages: [
          { role: 'system', content: getSystemPrompt(type, { company:safeCompany, role:safeRole, jd:safeJd, resume:safeResume }) },
          ...chatMessages,
        ],
      }),
    })

    if (groqRes.status === 429) {
      return res.status(429).json({ error: 'AI busy. Wait a moment and try again.' })
    }
    if (!groqRes.ok) {
      console.error('Groq error:', groqRes.status, await groqRes.text())
      return res.status(502).json({ error: 'AI error. Please try again.' })
    }

    const data   = await groqRes.json()
    const result = data.choices?.[0]?.message?.content || ''
    if (!result) return res.status(502).json({ error: 'Empty AI response. Try again.' })

    // ── SAVE TO DB ────────────────────────────────────────────
    if (userId && supabase && type === 'gap') {
      try {
        const parsed = JSON.parse(result.replace(/```json|```/g,'').trim())
        await supabase.from('analyses').insert({
          user_id:   userId,
          company:   safeCompany,
          role:      safeRole,
          gap_score: parsed?.score,
          gap_result: parsed,
        })
      } catch(e) {
        console.error('Save analysis failed:', e.message)
      }
    }

    return res.status(200).json({ result })

  } catch(err) {
    console.error('Handler error:', err.message)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
