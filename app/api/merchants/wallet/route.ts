/**
 * app/api/merchants/wallet/route.ts
 * Update merchant's receiving wallet address.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { getSession } from '@/lib/auth/session'
import { accountExists, checkUsdcTrustline } from '@/lib/stellar/client'
import * as StellarSdk from '@stellar/stellar-sdk'

const schema = z.object({
  stellarPublicKey: z.string().min(56).max(56),
})

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { stellarPublicKey } = schema.parse(body)

    // Validate it's a real Stellar public key format
    try {
      StellarSdk.Keypair.fromPublicKey(stellarPublicKey)
    } catch {
      return NextResponse.json({ error: 'Invalid Stellar public key' }, { status: 400 })
    }

    // Check if account exists on the network
    const exists = await accountExists(stellarPublicKey)
    if (!exists) {
      return NextResponse.json({
        error: 'Account not found on Stellar network. Fund it first.',
      }, { status: 400 })
    }

    const merchant = await db.merchant.update({
      where: { id: session.merchantId },
      data: { stellarPublicKey },
      select: { id: true, stellarPublicKey: true },
    })

    const hasTrustline = await checkUsdcTrustline(stellarPublicKey)

    return NextResponse.json({ merchant, hasTrustline })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('[Merchants/Wallet]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
