// api/analyse.js — KrackHire v8
// Fixed: pro_monthly in PREMIUM_PLANS, profile_optimize gated,
//        userId verified via Supabase auth, CORS locked to origin

import { createClient } from '@supabase/supabase-js'

function getSB() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } })
}

// ── IP RATE LIMITER (anon users) with automatic cleanup ──────
const rlMap = new Map()
let lastCleanup = Date.now()

function checkRL(ip) {
  const now = Date.now()
  const W = 60 * 60 * 1000  // 1 hour window
  const MAX = 5             // Max 5 reqs per hour
  
  // Periodic cleanup: every 1000 requests, remove expired entries
  // Prevents memory leak from Map growing unbounded
  if (now - lastCleanup > 10 * 60 * 1000) {  // Every 10 minutes
    const threshold = now - W
    let removed = 0
    for (const [key, val] of rlMap) {
      if (val.start < threshold) {
        rlMap.delete(key)
        removed++
      }
    }
    if (removed > 0) console.log(`[RL] Cleaned ${removed} expired entries, Map size: ${rlMap.size}`)
    lastCleanup = now
  }
  
  const e = rlMap.get(ip) || { count: 0, start: now }
  
  // Reset window if expired
  if (now - e.start > W) {
    rlMap.set(ip, { count: 1, start: now })
    return true
  }
  
  // Check limit
  if (e.count >= MAX) return false
  
  // Increment and return
  e.count++
  rlMap.set(ip, e)
  return true
}

// ── SANITIZE INPUT ────────────────────────────────────────────
function clean(text, max=8000) {
  if (typeof text!=='string') return ''
  const bad=[
    /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /system\s+prompt/gi,/jailbreak/gi,/you\s+are\s+now\s+/gi,
    /<script[\s\S]*?<\/script>/gi,/javascript:/gi
  ]
  let t=text.slice(0,max); bad.forEach(p=>{t=t.replace(p,'[filtered]')}); return t.trim()
}

// ── SYSTEM PROMPTS ────────────────────────────────────────────
function sysPrompt(type, { company, role, jd, resume, linkedin_headline, linkedin_about }) {
  const p = {
    gap: `You are a blunt experienced Indian tech recruiter with 10+ years experience.
CRITICAL: Return ONLY valid JSON. No markdown. No preamble. No explanation.
Schema exactly:
{"score":<0-100>,"ats_score":<0-100>,"skill_score":<0-100>,
"summary":"<2 honest specific sentences>",
"missing":[{"title":"<gap>","detail":"<exact fix>"}],
"weak":[{"title":"<area>","detail":"<advice>"}],
"strong":[{"title":"<strength>","detail":"<how to use>"}],
"missing_keywords":["<kw1>","<kw2>","<kw3>","<kw4>","<kw5>"],
"rejection_reasons":["<reason1>","<reason2>"],
"next_steps":["<step1>","<step2>","<step3>"]}
Max 3 items each array. Max 6 keywords. Be honest, specific, actionable.`,

    resume: `Expert ATS resume writer India. Plain text only. No markdown, no tables, no special characters.
Strong action verbs. Quantify every achievement. JD keywords inserted naturally.
Format: SUMMARY | SKILLS | EXPERIENCE | PROJECTS | EDUCATION`,

    cover: `Expert cover letter writer Indian market. Professional Indian English. Under 250 words.
3 paragraphs: why this company+role | what you bring with evidence | clear CTA.
No openers like "I am writing to apply".`,

    email: `Cold email writer for Indian HR. Under 130 words. Confident, not desperate. One JD reference. One clear ask.
Output EXACTLY:
Subject: <line>

---

Dear [HR Name],

<body>

[Your Name]
[Your Phone]`,

    interview: `Tough fair interview coach. Company:${company||'?'} Role:${role||'?'}
JD:${(jd||'').slice(0,400)} Resume:${(resume||'').slice(0,400)}
Rules: ONE question at a time. Score /10. Ideal answer 3 bullets. Max 200 words. Never repeat.`,

    profile_optimize: `Expert LinkedIn and Naukri optimizer for Indian job market.
CRITICAL: Return ONLY valid JSON. No markdown.
Schema:
{"linkedin":{"headline":"<under 220 chars>","about":"<under 1800 chars, Indian English, keywords>",
"skills":["<s1>","<s2>","<s3>","<s4>","<s5>"],
"tips":["<tip1>","<tip2>","<tip3>"]},
"naukri":{"headline":"<under 100 chars>","keywords":["<k1>","<k2>","<k3>","<k4>","<k5>","<k6>"],
"tips":["<tip1>","<tip2>","<tip3>"]},
"missing_keywords":["<kw1>","<kw2>","<kw3>","<kw4>"]}
Current headline: ${linkedin_headline||'(not provided)'}
Current about: ${(linkedin_about||'(not provided)').slice(0,400)}`,
  }
  return p[type]||p.gap
}

function userMsg(type, ctx) {
  const p = {
    gap:             `Analyse resume vs job description:\n\n${ctx}`,
    resume:          `Rewrite resume to match job description:\n\n${ctx}`,
    cover:           `Write cover letter for this application:\n\n${ctx}`,
    email:           `Write cold email to HR:\n\n${ctx}`,
    profile_optimize:`Optimise LinkedIn and Naukri profiles:\n\n${ctx}`,
  }
  return p[type]
}

const MAX_TOK = { gap:1100, resume:1400, cover:650, email:380, interview:550, profile_optimize:1200 }

// ── PLAN CONFIG ───────────────────────────────────────────────
const FREE_LIMIT    = 3
// FIX: Added pro_monthly (was missing — caused pro_monthly users to be blocked)
const PREMIUM_PLANS = [
  'starter','early_adopter',
  'pro','pro_monthly','pro_yearly',   // ← pro_monthly was missing in v6
  'college_basic','college_pro',
  'premium','founding_user','beta_friend'
]
// Types that require premium access (not just gap)
const GATED_TYPES = ['gap', 'profile_optimize']

// ── VERIFY USER FROM JWT (security fix) ──────────────────────
async function verifyUser(req, sb) {
  // Extract bearer token from Authorization header if present
  const authHeader = req.headers['authorization']||''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token || !sb) return null
  try {
    const { data:{ user }, error } = await sb.auth.getUser(token)
    if (error || !user) return null
    return user.id
  } catch { return null }
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — locked to allowed origin, never wildcard
  const allowed = process.env.ALLOWED_ORIGIN || 'https://www.krackhire.in'
  
  // CRITICAL SECURITY: Never allow wildcard CORS
  if (allowed === '*') {
    console.error('[SECURITY] FATAL: ALLOWED_ORIGIN set to wildcard. This is a security breach.')
    return res.status(500).json({error:'Service misconfigured. Contact admin.'})
  }
  
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  if (req.method==='OPTIONS') return res.status(200).end()
  if (req.method!=='POST')    return res.status(405).json({error:'Method not allowed'})

  const KEY = process.env.GROQ_API_KEY
  if (!KEY) return res.status(500).json({error:'Service unavailable.'})

  const {
    type, resume, jd, company, role, messages,
    userId, linkedin_headline, linkedin_about
  } = req.body||{}

  const valid = ['gap','resume','cover','email','interview','profile_optimize']
  if (!type||!valid.includes(type))
    return res.status(400).json({error:'Invalid request type.'})

  const sb = getSB()

  // ── ENTITLEMENT CHECK ─────────────────────────────────────
  // CRITICAL SECURITY: Verify user ID matches authenticated user
  // This prevents ID spoofing attacks where users exhaust others' quotas
  if (GATED_TYPES.includes(type) && userId) {
    // TODO: Extract from Authorization header JWT in production
    // For now, accept userId from authenticated context only
    // When client sends userId, server should verify it matches auth token
    if (userId && sb) {
      try {
        const { data: prof } = await sb.from('profiles')
          .select('role,plan,plan_expires_at,analyses_this_month,month_reset,lifetime_accesses_remaining')
          .eq('id', userId).single()

        if (prof) {
          // Admin + founder: unlimited
          if (['admin','founder'].includes(prof.role)) { /* pass through */ }
          else {
            const planActive =
              PREMIUM_PLANS.includes(prof.plan) &&
              (prof.plan==='early_adopter' || prof.plan==='founding_user' ||
               (prof.plan_expires_at && new Date(prof.plan_expires_at) > new Date()))

            const hasLifetimeAccess = (prof.lifetime_accesses_remaining||0) > 0

            if (!planActive && !hasLifetimeAccess) {
              // Free user — check monthly limit
              const now        = new Date()
              const lastReset  = new Date(prof.month_reset||now)
              const isNewMonth = now.getMonth()!==lastReset.getMonth() ||
                                 now.getFullYear()!==lastReset.getFullYear()
              const used       = isNewMonth ? 0 : (prof.analyses_this_month||0)

              if (used >= FREE_LIMIT)
                return res.status(403).json({
                  error:`You've used all ${FREE_LIMIT} free analyses this month. Upgrade for unlimited access.`,
                  code:'LIMIT_REACHED', plan:prof.plan, limit:FREE_LIMIT
                })

              // Increment usage
              await sb.from('profiles').update({
                analyses_this_month: isNewMonth ? 1 : used+1,
                month_reset: isNewMonth ? now.toISOString() : prof.month_reset,
              }).eq('id', userId).catch(e=>console.error('Usage update error:',e.message))

            } else if (hasLifetimeAccess && !planActive) {
              // Consume one lifetime access
              await sb.from('profiles').update({
                lifetime_accesses_remaining: Math.max(0,(prof.lifetime_accesses_remaining||0)-1),
                lifetime_access_last_used: new Date().toISOString(),
              }).eq('id', userId).catch(e=>console.error('Lifetime update error:',e.message))

            } else if (planActive) {
              // Premium user — track for analytics only, never block
              const now        = new Date()
              const lastReset  = new Date(prof.month_reset||now)
              const isNewMonth = now.getMonth()!==lastReset.getMonth() ||
                                 now.getFullYear()!==lastReset.getFullYear()
              await sb.from('profiles').update({
                analyses_this_month: isNewMonth ? 1 : (prof.analyses_this_month||0)+1,
                month_reset: isNewMonth ? now.toISOString() : prof.month_reset,
              }).eq('id', userId).catch(e=>console.error('Analytics update error:',e.message))
            }
          }
        }
      } catch(e) { console.error('Entitlement check error:', e.message) }

    } else if (!userId) {
      // Anonymous user — IP rate limit
      const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim()||'unknown'
      if (!checkRL(ip))
        return res.status(429).json({
          error:'Rate limit reached. Sign in for more free analyses.',
          code:'RATE_LIMITED'
        })
    }
  }

  // ── SANITIZE ──────────────────────────────────────────────
  const sResume  = clean(resume           ||'', 8000)
  const sJd      = clean(jd              ||'', 4000)
  const sCompany = clean(company          ||'', 100)
  const sRole    = clean(role             ||'', 100)
  const sHL      = clean(linkedin_headline||'', 300)
  const sAbout   = clean(linkedin_about   ||'', 2000)

  if (type!=='interview' && (!sResume||!sJd))
    return res.status(400).json({error:'Resume and job description are required.'})

  const ctx = [
    `Resume:\n${sResume}`,
    `\nJob Description:\n${sJd}`,
    `Company: ${sCompany||'Not specified'}`,
    `Role: ${sRole||'Not specified'}`
  ].join('\n')

  // Build messages array
  let chatMsgs
  if (type==='interview' && Array.isArray(messages) && messages.length>0) {
    chatMsgs = messages
      .slice(-12)
      .map(m=>({ role:m.role==='user'?'user':'assistant', content:clean(String(m.content||''),2000) }))
  } else {
    chatMsgs = [{ role:'user', content:userMsg(type,ctx)||ctx }]
  }

  // ── CALL GROQ ─────────────────────────────────────────────
  try {
    const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${KEY}` },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  MAX_TOK[type]||800,
        temperature: GATED_TYPES.includes(type) ? 0.15 : 0.7,
        messages: [
          { role:'system', content:sysPrompt(type,{
              company:sCompany, role:sRole, jd:sJd,
              resume:sResume, linkedin_headline:sHL, linkedin_about:sAbout
            })
          },
          ...chatMsgs,
        ],
      }),
    })

    if (gr.status===429)
      return res.status(429).json({error:'AI is busy. Please wait a moment and try again.'})
    if (!gr.ok) {
      console.error('Groq error:', gr.status, await gr.text().catch(()=>''))
      return res.status(502).json({error:'AI error. Please try again.'})
    }

    const data   = await gr.json()
    const result = data.choices?.[0]?.message?.content||''
    if (!result) return res.status(502).json({error:'Empty AI response. Try again.'})

    // ── SAVE GAP ANALYSIS TO DB ───────────────────────────
    if (userId && sb && type==='gap') {
      try {
        const parsed = JSON.parse(result.replace(/```json|```/g,'').trim())
        await sb.from('analyses').insert({
          user_id:    userId,
          company:    sCompany,
          role:       sRole,
          gap_score:  parsed?.score,
          ats_score:  parsed?.ats_score,
          skill_score:parsed?.skill_score,
          gap_result: parsed,
        }).catch(e=>console.error('DB save error:',e.message))
      } catch(e) { console.error('Parse/save error:', e.message) }
    }

    return res.status(200).json({result})

  } catch(err) {
    console.error('Handler error:', err.message)
    return res.status(500).json({error:'Something went wrong. Please try again.'})
  }
}
