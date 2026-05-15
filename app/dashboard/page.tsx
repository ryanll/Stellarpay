'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate, truncateHash, getStellarExplorerUrl, truncateAddress } from '@/lib/utils'

interface Stats { totalEarned: number; totalConfirmed: number }
interface Payment {
  id: string; amount: number; currency: string; status: string
  createdAt: string; stellarTxHash?: string; payerAddress?: string
  checkoutLink?: { productName: string }
}
interface Merchant { businessName: string; stellarPublicKey?: string }
interface Balances { xlm: string; usdc: string }

export default function DashboardPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [balances, setBalances] = useState<Balances>({ xlm: '0', usdc: '0' })
  const [stats, setStats] = useState<Stats>({ totalEarned: 0, totalConfirmed: 0 })
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/merchants/me').then(r => r.json()),
      fetch('/api/payments?limit=5').then(r => r.json()),
    ]).then(([merchantData, paymentsData]) => {
      setMerchant(merchantData.merchant)
      setBalances(merchantData.balances || { xlm: '0', usdc: '0' })
      setStats(paymentsData.stats || { totalEarned: 0, totalConfirmed: 0 })
      setPayments(paymentsData.payments || [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full py-32">
      <div className="spinner w-8 h-8" />
    </div>
  )

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      CONFIRMED: 'badge-confirmed', PENDING: 'badge-pending',
      FAILED: 'badge-failed', EXPIRED: 'badge-expired',
    }
    return <span className={map[status] || 'badge'}>{status}</span>
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {merchant?.businessName} 👋
          </h1>
          <p className="text-slate-400 mt-1">Your payment overview</p>
        </div>
        <Link href="/dashboard/links/new" className="btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New payment link
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card col-span-2">
          <p className="text-sm text-slate-500 font-medium">Total Earned</p>
          <p className="text-3xl font-bold gradient-text">{formatCurrency(stats.totalEarned)}</p>
          <p className="text-xs text-slate-600">{stats.totalConfirmed} confirmed payments</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-500 font-medium">USDC Balance</p>
          <p className="text-2xl font-bold text-white">{parseFloat(balances.usdc).toFixed(2)}</p>
          <p className="text-xs text-slate-600">USDC in wallet</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-500 font-medium">XLM Balance</p>
          <p className="text-2xl font-bold text-white">{parseFloat(balances.xlm).toFixed(2)}</p>
          <p className="text-xs text-slate-600">for transaction fees</p>
        </div>
      </div>

      {/* Stellar wallet card */}
      {merchant?.stellarPublicKey && (
        <div className="card p-5 mb-8 bg-gradient-to-r from-stellar-900/30 to-slate-900 border-stellar-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-stellar-400 font-medium uppercase tracking-wider mb-1">
                Your Stellar Receiving Address
              </p>
              <p className="font-mono text-sm text-white">{merchant.stellarPublicKey}</p>
            </div>
            <a
              href={`https://stellar.expert/explorer/testnet/account/${merchant.stellarPublicKey}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-ghost text-xs text-stellar-400 flex-shrink-0"
            >
              View on Explorer →
            </a>
          </div>
        </div>
      )}

      {/* Recent payments */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Recent Transactions</h2>
          <Link href="/dashboard/payments" className="text-sm text-stellar-400 hover:text-stellar-300">
            View all →
          </Link>
        </div>
        {payments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">⚡</p>
            <p className="text-slate-400 font-medium">No payments yet</p>
            <p className="text-slate-600 text-sm mt-1">Create a payment link to start accepting USDC</p>
            <Link href="/dashboard/links/new" className="btn-primary mt-4 inline-flex">
              Create payment link
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {payments.map(p => (
              <div key={p.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm">
                    {p.checkoutLink?.productName || 'Payment'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    {p.payerAddress ? truncateAddress(p.payerAddress) : p.id.slice(0, 16)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-white">{formatCurrency(p.amount, p.currency)}</p>
                  <p className="text-xs text-slate-500">{formatDate(p.createdAt)}</p>
                </div>
                {statusBadge(p.status)}
                {p.stellarTxHash && (
                  <a
                    href={getStellarExplorerUrl(p.stellarTxHash)}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-stellar-400 hover:text-stellar-300 font-mono flex-shrink-0"
                    title={p.stellarTxHash}
                  >
                    {truncateHash(p.stellarTxHash)} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
