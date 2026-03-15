// api/payment.js
// Razorpay subscription payment handler
// Handles: create order, verify payment, update subscription

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

function getSB() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const PLANS = {
  pro_monthly: {
    amount: 4900,       // ₹49 in paise
    currency: 'INR',
    name: 'KrackHire Pro — Monthly',
    description: 'Unlimited analyses, all features',
    plan: 'pro',
    duration_days: 30,
  },
  pro_yearly: {
    amount: 49900,      // ₹499 in paise
    currency: 'INR',
    name: 'KrackHire Pro — Yearly',
    description: 'Best value — save ₹89 vs monthly',
    plan: 'pro',
    duration_days: 365,
  },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID
  const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Payment system not configured.' })
  }

  const { action, planId, userId, orderId, paymentId, signature } = req.body || {}

  // ── CREATE ORDER ─────────────────────────────────────────
  if (action === 'create_order') {
    if (!planId || !userId)
      return res.status(400).json({ error: 'Plan and user required.' })

    const plan = PLANS[planId]
    if (!plan)
      return res.status(400).json({ error: 'Invalid plan.' })

    try {
      // Create Razorpay order
      const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
      const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: plan.amount,
          currency: plan.currency,
          receipt: `kh_${userId.slice(0, 8)}_${Date.now()}`,
          notes: { userId, planId },
        }),
      })

      if (!orderRes.ok) {
        const err = await orderRes.text()
        console.error('Razorpay order error:', err)
        return res.status(502).json({ error: 'Could not create payment order. Try again.' })
      }

      const order = await orderRes.json()
      return res.status(200).json({
        orderId:  order.id,
        amount:   plan.amount,
        currency: plan.currency,
        name:     plan.name,
        description: plan.description,
        keyId:    RAZORPAY_KEY_ID,
      })

    } catch (err) {
      console.error('Create order error:', err.message)
      return res.status(500).json({ error: 'Payment system error. Please try again.' })
    }
  }

  // ── VERIFY PAYMENT & ACTIVATE SUBSCRIPTION ───────────────
  if (action === 'verify_payment') {
    if (!orderId || !paymentId || !signature || !userId || !planId)
      return res.status(400).json({ error: 'Missing payment verification data.' })

    // Verify Razorpay signature
    const expectedSig = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')

    if (expectedSig !== signature)
      return res.status(400).json({ error: 'Payment verification failed. Contact support.' })

    const plan = PLANS[planId]
    if (!plan)
      return res.status(400).json({ error: 'Invalid plan.' })

    // Update database
    const sb = getSB()
    if (!sb)
      return res.status(500).json({ error: 'Database not configured.' })

    try {
      const now        = new Date()
      const expiresAt  = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000)

      // Update profile to pro
      await sb.from('profiles').update({
        plan:                 'pro',
        plan_expires_at:      expiresAt.toISOString(),
        analyses_this_month:  0,
        updated_at:           now.toISOString(),
      }).eq('id', userId)

      // Save payment record
      await sb.from('payments').insert({
        user_id:    userId,
        plan_id:    planId,
        order_id:   orderId,
        payment_id: paymentId,
        amount:     plan.amount,
        currency:   plan.currency,
        status:     'success',
        expires_at: expiresAt.toISOString(),
      })

      return res.status(200).json({
        success:    true,
        plan:       'pro',
        expiresAt:  expiresAt.toISOString(),
        message:    'Payment successful! Your Pro subscription is now active.',
      })

    } catch (err) {
      console.error('DB update error:', err.message)
      // Payment went through but DB failed — log it
      return res.status(500).json({
        error: 'Payment received but account update failed. Please contact hello@krackhire.in with your payment ID: ' + paymentId
      })
    }
  }

  return res.status(400).json({ error: 'Invalid action.' })
}
