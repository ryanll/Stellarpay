/**
 * app/api/merchants/me/route.ts
 * Get current merchant profile and Stellar wallet info.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { checkUsdcTrustline, getAccountBalances } from '@/lib/stellar/client'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const merchant = await db.merchant.findUnique({
      where: { id: session.merchantId },
      select: {
        id: true,
        email: true,
        name: true,
        businessName: true,
        stellarPublicKey: true,
        webhookUrl: true,
        createdAt: true,
        _count: {
          select: {
            checkoutLinks: true,
            payments: true,
          },
        },
      },
    })

    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })
    }

    // Fetch live Stellar wallet state for the merchant.
    let balances = { xlm: '0', usdc: '0' }
    let hasTrustline = false
    if (merchant.stellarPublicKey) {
      const [walletBalances, trustline] = await Promise.all([
        getAccountBalances(merchant.stellarPublicKey),
        checkUsdcTrustline(merchant.stellarPublicKey),
      ])
      balances = walletBalances
      hasTrustline = trustline
    }

    return NextResponse.json({ merchant, balances, hasTrustline })
  } catch (err) {
    console.error('[Merchants/Me]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
