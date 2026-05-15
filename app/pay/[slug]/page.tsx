'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import QRCodeDisplay from '@/components/checkout/QRCodeDisplay'
import { formatCurrency, getStellarExplorerUrl, truncateAddress } from '@/lib/utils'

type Status = 'loading' | 'ready' | 'awaiting' | 'confirmed' | 'failed' | 'inactive'

interface CheckoutData {
  link: {
    productName: string; description?: string; amount: number; currency: string
    merchant: { businessName: string; stellarPublicKey?: string }
  }
}

interface PaymentData {
  id: string; amount: number; currency: string; stellarMemo: string
  merchantPublicKey: string; businessName: string; productName: string
  description?: string; paymentUri: string
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const [status, setStatus] = useState<Status>('loading')
  const [checkout, setCheckout] = useState<CheckoutData | null>(null)
  const [payment, setPayment] = useState<PaymentData | null>(null)
  const [txHash, setTxHash] = useState('')
  const [confirmedTx, setConfirmedTx] = useState('')
  const [email, setEmail] = useState('')
  const [polling, setPolling] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Load the checkout link details
  useEffect(() => {
    fetch(`/api/pay?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setStatus('inactive'); return }
        setCheckout(d)
        setStatus('ready')
      })
      .catch(() => setStatus('inactive'))
  }, [slug])

  // Start a payment session
  async function initiatePayment() {
    setStatus('awaiting')
    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, customerEmail: email || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { setStatus('failed'); return }
    setPayment(data.payment)
  }

  // Poll Stellar for payment confirmation
  const verifyPayment = useCallback(async () => {
    if (!payment || polling) return
    setPolling(true)
    try {
      const res = await fetch('/api/pay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.id, txHash: txHash || undefined }),
      })
      const data = await res.json()
      if (data.status === 'CONFIRMED') {
        setStatus('confirmed')
        setConfirmedTx(data.txHash || '')
      }
    } finally {
      setPolling(false)
    }
  }, [payment, txHash, polling])

  // Auto-poll every 5 seconds when awaiting
  useEffect(() => {
    if (status !== 'awaiting' || !payment) return
    const interval = setInterval(verifyPayment, 5000)
    return () => clearInterval(interval)
  }, [status, payment, verifyPayment])

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  // ── Renders ───────────────────────────────────────────────────────────────

  if (status === 'loading') return (
    <Shell>
      <div className="flex flex-col items-center py-16 gap-3">
        <div className="spinner w-8 h-8" />
        <p className="text-slate-500 text-sm">Loading checkout...</p>
      </div>
    </Shell>
  )

  if (status === 'inactive') return (
    <Shell>
      <div className="text-center py-16">
        <p className="text-4xl mb-4">🔒</p>
        <h2 className="text-xl font-semibold text-white mb-2">Link unavailable</h2>
        <p className="text-slate-400 text-sm">This payment link is inactive or does not exist.</p>
      </div>
    </Shell>
  )

  if (status === 'confirmed') return (
    <Shell>
      <div className="text-center py-8">
        <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Payment confirmed!</h2>
        <p className="text-slate-400 mb-6">
          Your {formatCurrency(payment?.amount || 0, payment?.currency)} payment has been received on the Stellar network.
        </p>
        {confirmedTx && (
          <a href={getStellarExplorerUrl(confirmedTx)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-stellar-400 hover:text-stellar-300 bg-stellar-500/10 px-4 py-2 rounded-xl border border-stellar-500/20">
            View on Stellar Explorer ↗
          </a>
        )}
      </div>
    </Shell>
  )

  if (status === 'ready' && checkout) return (
    <Shell>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-stellar-500 to-accent-green flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {checkout.link.merchant.businessName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-slate-500">{checkout.link.merchant.businessName}</p>
            <h1 className="text-lg font-bold text-white">{checkout.link.productName}</h1>
          </div>
        </div>
        {checkout.link.description && (
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">{checkout.link.description}</p>
        )}
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-4xl font-bold text-white">{checkout.link.amount.toFixed(2)}</span>
          <span className="text-lg text-slate-400 font-medium">{checkout.link.currency}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label text-xs">Email <span className="text-slate-600">(optional — for receipt)</span></label>
          <input type="email" className="input text-sm" placeholder="your@email.com"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <button onClick={initiatePayment} className="btn-primary w-full py-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          Pay {formatCurrency(checkout.link.amount, checkout.link.currency)} with Stellar
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Secured by Stellar · Non-custodial · Instant settlement
      </div>
    </Shell>
  )

  // Awaiting payment
  if (status === 'awaiting' && payment) return (
    <Shell>
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Waiting for payment
        </div>
        <h2 className="text-xl font-bold text-white">Send exactly</h2>
        <p className="text-4xl font-bold gradient-text my-2">
          {formatCurrency(payment.amount, payment.currency)}
        </p>
        <p className="text-sm text-slate-400">to the address below with the exact memo</p>
      </div>

      {/* Payment details */}
      <div className="space-y-3 mb-6">
        <div className="card p-4">
          <p className="text-xs text-slate-500 mb-1.5">Send to (Stellar address)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-stellar-300 truncate">{payment.merchantPublicKey}</code>
            <button onClick={() => copy(payment.merchantPublicKey, 'addr')}
              className="text-xs text-slate-500 hover:text-slate-300 flex-shrink-0">
              {copied === 'addr' ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="card p-4 border-amber-800/30 bg-amber-500/5">
          <p className="text-xs text-amber-500 mb-1.5 font-medium">⚠️ Required Memo (text)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono font-bold text-amber-300">{payment.stellarMemo}</code>
            <button onClick={() => copy(payment.stellarMemo, 'memo')}
              className="text-xs text-amber-600 hover:text-amber-400 flex-shrink-0">
              {copied === 'memo' ? '✓' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-amber-700 mt-1">Without this memo, your payment cannot be matched</p>
        </div>
      </div>

      {/* QR code */}
      <div className="flex justify-center mb-6">
        <QRCodeDisplay value={payment.paymentUri} size={180} />
      </div>

      {/* Manual tx hash submission */}
      <div className="card p-4">
        <p className="text-xs text-slate-500 mb-2">Already sent? Enter your transaction hash to confirm instantly:</p>
        <div className="flex gap-2">
          <input type="text" className="input text-xs font-mono flex-1" placeholder="Transaction hash (optional)"
            value={txHash} onChange={e => setTxHash(e.target.value)} />
          <button onClick={verifyPayment} disabled={polling} className="btn-secondary text-xs flex-shrink-0">
            {polling ? <span className="spinner w-4 h-4" /> : 'Verify'}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-600 mt-4">
        Checking Stellar network every 5 seconds... • Powered by Horizon API
      </p>
    </Shell>
  )

  return null
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 bg-gradient-to-br from-stellar-950/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-stellar-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-stellar-500 to-accent-green flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-400">StellarPay</span>
          </div>
        </div>
        <div className="card-glass p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
