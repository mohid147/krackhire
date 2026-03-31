// api/payment.js — KrackHire PayU Integration v2
// Full PayU redirect flow: create → redirect → verify → update DB
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/* ── Supabase (service role) ─────────────────────── */
function getSB() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } })
}

/* ── PayU config ─────────────────────────────────── */
const PAYU_KEY    = process.env.PAYU_KEY    || ''
const PAYU_SALT   = process.env.PAYU_SALT   || ''
const PAYU_BASE   = process.env.PAYU_ENV === 'production'
  ? 'https://secure.payu.in'
  : 'https://test.payu.in'
const SITE_URL    = process.env.VITE_SITE_URL || 'https://www.krackhire.in'

/* ── Plans ───────────────────────────────────────── */
const PLANS = {
  pro_monthly:  { label:'Pro Monthly',     amount:4900,  currency:'INR', days:30  },
  pro_yearly:   { label:'Pro Yearly',      amount:49900, currency:'INR', days:365 },
  starter:      { label:'Starter 7 Days',  amount:4900,  currency:'INR', days:7   },
  founding_user:{ label:'Founding Member', amount:4900,  currency:'INR', days:36500 },
}

/* ── Hash generation (PayU SHA512) ──────────────── */
// PayU hash: key|txnid|amount|productinfo|firstname|email|udf1-5||SALT
function generateHash(params) {
  const str = [
    PAYU_KEY,
    params.txnid,
    params.amount,
    params.productinfo,
    params.firstname,
    params.email,
    params.udf1 || '',
    params.udf2 || '',
    params.udf3 || '',
    params.udf4 || '',
    params.udf5 || '',
    '', '', '', '', '', // udf6-10 empty
    PAYU_SALT,
  ].join('|')
  return crypto.createHash('sha512').update(str).digest('hex')
}

/* ── Verify PayU response hash ───────────────────── */
// Reverse hash: SALT|status||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
function verifyHash(params) {
  const str = [
    PAYU_SALT,
    params.status,
    '', '', '', '', '',       // udf6-10
    params.udf5 || '',
    params.udf4 || '',
    params.udf3 || '',
    params.udf2 || '',
    params.udf1 || '',
    params.email,
    params.firstname,
    params.productinfo,
    params.amount,
    params.txnid,
    PAYU_KEY,
  ].join('|')
  const expected = crypto.createHash('sha512').update(str).digest('hex')
  return expected === params.hash
}

/* ── Generate transaction ID ─────────────────────── */
function generateTxnId(userId, planId) {
  const ts  = Date.now().toString(36).toUpperCase()
  const uid = userId.slice(0, 6).toUpperCase()
  return `KH${uid}${ts}`.slice(0, 20)
}

/* ── CORS helper ─────────────────────────────────── */
function setCORS(res) {
  const origin = process.env.ALLOWED_ORIGIN || 'https://www.krackhire.in'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
}

/* ── Main handler ────────────────────────────────── */
export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // PayU sends success/failure as POST form data — handle separately
  if (req.method === 'POST' && req.body?.txnid && req.body?.status) {
    return handlePayUCallback(req, res)
  }

  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' })

  const { action } = req.body || {}

  try {
    switch (action) {
      case 'initiate':   return await initiatePayment(req, res)
      case 'verify':     return await verifyPayment(req, res)
      case 'status':     return await getPaymentStatus(req, res)
      default:
        return res.status(400).json({ success:false, message:'Invalid action' })
    }
  } catch (err) {
    console.error('[payment] Unhandled error:', err.message)
    return res.status(500).json({ success:false, message:'Payment service error. Please try again.' })
  }
}

/* ── 1. INITIATE PAYMENT ─────────────────────────── */
async function initiatePayment(req, res) {
  const { planId, userId, userEmail, userName } = req.body || {}

  // Validate inputs
  if (!planId || !userId || !userEmail) {
    return res.status(400).json({ success:false, message:'Missing required fields.' })
  }

  const plan = PLANS[planId]
  if (!plan) {
    return res.status(400).json({ success:false, message:'Invalid plan.' })
  }

  if (!PAYU_KEY || !PAYU_SALT) {
    return res.status(500).json({ success:false, message:'Payment not configured.' })
  }

  const sb = getSB()
  if (!sb) return res.status(500).json({ success:false, message:'DB not available.' })

  // CRITICAL: Check for existing payment within last 30 min
  // Uses select with limit to avoid race condition of simultaneous requests
  const { data: existing, error: checkErr } = await sb
    .from('transactions')
    .select('id, status, txn_id, payu_params')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 30*60*1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (existing && existing.length > 0) {
    // Reuse existing transaction to prevent double charges
    const txn = existing[0]
    if (txn?.payu_params) {
      return res.status(200).json({ success:true, data:{ payuParams: txn.payu_params, payuUrl: PAYU_BASE + '/_payment' }})
    }
  }

  // Generate transaction
  const txnId     = generateTxnId(userId, planId)
  const amount    = (plan.amount / 100).toFixed(2)
  const firstname = (userName || userEmail.split('@')[0] || 'User').split(' ')[0].slice(0, 20)
  const email     = userEmail.slice(0, 50)

  const payuParams = {
    key:         PAYU_KEY,
    txnid:       txnId,
    amount:      amount,
    productinfo: `KrackHire ${plan.label}`,
    firstname:   firstname,
    email:       email,
    phone:       '9999999999', // required by PayU, user can update
    surl:        `${SITE_URL}/api/payment?action=success_redirect`,
    furl:        `${SITE_URL}/api/payment?action=failure_redirect`,
    udf1:        userId,
    udf2:        planId,
    udf3:        '',
    udf4:        '',
    udf5:        '',
    service_provider: 'payu_paisa',
  }
  payuParams.hash = generateHash(payuParams)

  // Save transaction to DB
  const { error: insertErr } = await sb.from('transactions').insert({
    txn_id:    txnId,
    user_id:   userId,
    plan_id:   planId,
    amount:    plan.amount,
    currency:  plan.currency,
    status:    'pending',
    payu_params: payuParams,
    created_at: new Date().toISOString(),
  })

  if (insertErr) {
    console.error('[payment] Insert error:', insertErr.message)
    return res.status(500).json({ success:false, message:'Could not create transaction.' })
  }

  return res.status(200).json({
    success: true,
    data: {
      payuParams,
      payuUrl: PAYU_BASE + '/_payment',
    }
  })
}

/* ── 2. PAYU CALLBACK (success/failure POST) ─────── */
async function handlePayUCallback(req, res) {
  const params = req.body
  const { txnid, status, hash, udf1: userId, udf2: planId, amount, email, firstname, productinfo } = params

  const sb = getSB()
  const siteUrl = SITE_URL

  // CRITICAL SECURITY: Verify PayU response hash before processing
  // This prevents attackers from faking successful payments
  if (!params.hash || typeof params.hash !== 'string') {
    console.error('[payment] Missing hash in callback')
    return res.status(400).json({ success: false, message: 'Invalid payment response' })
  }

  const hashValid = verifyHash({ ...params, status, hash })

  if (!hashValid) {
    console.error('[payment] SECURITY ALERT: Hash mismatch! Possible tampering. txnid:', txnid)
    // Log the attempted attack
    if (sb) {
      await sb.from('transactions').update({
        status:    'tampered',
        payu_response: params,
        updated_at: new Date().toISOString(),
      }).eq('txn_id', txnid).catch(()=>{})
    }
    return res.redirect(302, `${siteUrl}?payment=tampered`)
  }

  if (!sb) return res.redirect(302, `${siteUrl}?payment=error`)

  if (status === 'success') {
    // Double-check with PayU (verify API) — prevents fake success POSTs
    const verifyResult = await verifyWithPayU(txnid)

    if (!verifyResult.ok) {
      await sb.from('transactions').update({
        status: 'failed',
        payu_response: params,
        failure_reason: 'PayU verification failed',
        updated_at: new Date().toISOString(),
      }).eq('txn_id', txnid).catch(()=>{})
      return res.redirect(302, `${siteUrl}?payment=failed&txn=${txnid}`)
    }

    const plan = PLANS[planId]
    if (!plan) return res.redirect(302, `${siteUrl}?payment=error`)

    const expiresAt = new Date(Date.now() + plan.days * 86400000).toISOString()

    // Update transaction
    await sb.from('transactions').update({
      status:       'success',
      payu_txn_id:  params.mihpayid,
      payu_response: params,
      updated_at:   new Date().toISOString(),
    }).eq('txn_id', txnid)

    // Update user profile — grant plan
    const { error: profileErr } = await sb.from('profiles').update({
      plan:            planId,
      plan_expires_at: ['founding_user','early_adopter'].includes(planId) ? null : expiresAt,
    }).eq('id', userId)

    if (profileErr) {
      console.error('[payment] Profile update failed:', profileErr.message)
      // Transaction succeeded but profile update failed — flag for manual review
      await sb.from('transactions').update({
        needs_manual_review: true,
        updated_at: new Date().toISOString(),
      }).eq('txn_id', txnid)
    }

    return res.redirect(302, `${siteUrl}?payment=success&plan=${planId}&txn=${txnid}`)
  }

  // Payment failed or cancelled
  await sb.from('transactions').update({
    status:         status === 'failure' ? 'failed' : 'cancelled',
    payu_response:  params,
    failure_reason: params.error_Message || params.field9 || 'User cancelled',
    updated_at:     new Date().toISOString(),
  }).eq('txn_id', txnid).catch(()=>{})

  return res.redirect(302, `${siteUrl}?payment=failed&txn=${txnid}`)
}

/* ── 3. VERIFY WITH PAYU API ─────────────────────── */
async function verifyWithPayU(txnId) {
  try {
    const command  = 'verify_payment'
    const hashStr  = crypto.createHash('sha512')
      .update(`${PAYU_KEY}|${command}|${txnId}|${PAYU_SALT}`)
      .digest('hex')

    const formData = new URLSearchParams({
      key:     PAYU_KEY,
      command,
      hash:    hashStr,
      var1:    txnId,
    })

    const response = await fetch('https://info.payu.in/merchant/postservice?form=2', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    formData.toString(),
    })

    const data = await response.json()
    // PayU returns status 1 = success
    if (data?.transaction_details?.[txnId]?.status === 'success') {
      return { ok: true, data }
    }
    return { ok: false, data }
  } catch (err) {
    console.error('[payment] PayU verify error:', err.message)
    return { ok: false }
  }
}

/* ── 4. CLIENT-SIDE VERIFY (after redirect back) ─── */
async function verifyPayment(req, res) {
  const { txnId, userId } = req.body || {}

  if (!txnId || !userId) {
    return res.status(400).json({ success:false, message:'Missing txnId or userId.' })
  }

  const sb = getSB()
  if (!sb) return res.status(500).json({ success:false, message:'DB unavailable.' })

  const { data: txn, error } = await sb
    .from('transactions')
    .select('status, plan_id, user_id')
    .eq('txn_id', txnId)
    .single()

  if (error || !txn) {
    return res.status(404).json({ success:false, message:'Transaction not found.' })
  }

  // Security: ensure the transaction belongs to this user
  if (txn.user_id !== userId) {
    return res.status(403).json({ success:false, message:'Unauthorized.' })
  }

  if (txn.status !== 'success') {
    return res.status(200).json({ success:false, message:'Payment not successful.', data:{ status: txn.status }})
  }

  // Fetch updated profile
  const { data: profile } = await sb
    .from('profiles')
    .select('plan, plan_expires_at')
    .eq('id', userId)
    .single()

  return res.status(200).json({
    success: true,
    message: 'Payment verified.',
    data: {
      status:  txn.status,
      plan:    txn.plan_id,
      profile,
    }
  })
}

/* ── 5. GET PAYMENT STATUS ───────────────────────── */
async function getPaymentStatus(req, res) {
  const { txnId, userId } = req.body || {}
  if (!txnId || !userId) return res.status(400).json({ success:false, message:'Missing fields.' })

  const sb = getSB()
  if (!sb) return res.status(500).json({ success:false, message:'DB unavailable.' })

  const { data: txn } = await sb
    .from('transactions')
    .select('status, plan_id, amount, created_at')
    .eq('txn_id', txnId)
    .eq('user_id', userId)
    .single()

  if (!txn) return res.status(404).json({ success:false, message:'Not found.' })

  return res.status(200).json({ success:true, data: txn })
}
