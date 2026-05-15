/**
 * lib/stellar/client.ts
 *
 * Core Stellar SDK integration for StellarPay.
 * Handles account creation, trustline checks, payment detection, and transaction verification
 * using the Stellar Horizon API on testnet.
 *
 * Stellar Testnet: https://horizon-testnet.stellar.org
 * Stellar SDK: https://stellar.github.io/js-stellar-sdk/
 */

import * as StellarSdk from '@stellar/stellar-sdk'

// ─── Network Configuration ────────────────────────────────────────────────────

const NETWORK = process.env.STELLAR_NETWORK || 'TESTNET'
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'

// Stellar network passphrase — used to sign transactions
const NETWORK_PASSPHRASE =
  NETWORK === 'MAINNET'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET

// USDC asset issuer address on Stellar testnet
// On mainnet use Circle's official USDC issuer:
// GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
const USDC_ISSUER =
  process.env.STELLAR_USDC_ISSUER ||
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

// USDC asset definition
export const USDC_ASSET = new StellarSdk.Asset('USDC', USDC_ISSUER)

// Horizon server instance (Stellar's REST API)
export const server = new StellarSdk.Horizon.Server(HORIZON_URL)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StellarKeypair {
  publicKey: string
  secretKey: string
}

export interface PaymentRecord {
  txHash: string
  from: string
  to: string
  amount: string
  asset: string
  memo: string | null
  createdAt: string
}

type LoadedAccount = Awaited<ReturnType<typeof server.loadAccount>>

async function loadAccount(publicKey: string): Promise<LoadedAccount | null> {
  try {
    return await server.loadAccount(publicKey)
  } catch (err: unknown) {
    if (err instanceof StellarSdk.NotFoundError) return null
    throw err
  }
}

// ─── Account Management ───────────────────────────────────────────────────────

/**
 * Generate a new Stellar keypair for a merchant.
 * Returns both public and secret keys.
 *
 * ⚠️  The secret key MUST be encrypted before storing in the database.
 *     Use lib/stellar/encryption.ts for this.
 */
export function generateKeypair(): StellarKeypair {
  const keypair = StellarSdk.Keypair.random()
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  }
}

/**
 * Fund a new Stellar testnet account using Friendbot.
 * Friendbot gives 10,000 XLM to a new testnet account.
 * Only works on TESTNET — do not call on mainnet.
 */
export async function fundTestnetAccount(publicKey: string): Promise<boolean> {
  if (NETWORK === 'MAINNET') {
    throw new Error('Friendbot is only available on testnet')
  }

  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    )
    return response.ok
  } catch (err) {
    console.error('[Stellar] Friendbot funding failed:', err)
    return false
  }
}

/**
 * Check if a Stellar account exists on the network.
 */
export async function accountExists(publicKey: string): Promise<boolean> {
  return (await loadAccount(publicKey)) !== null
}

/**
 * Get the XLM and USDC balance for a Stellar account.
 */
export async function getAccountBalances(
  publicKey: string
): Promise<{ xlm: string; usdc: string }> {
  try {
    const account = await loadAccount(publicKey)
    if (!account) {
      return { xlm: '0', usdc: '0' }
    }

    let xlm = '0'
    let usdc = '0'

    for (const balance of account.balances) {
      if (balance.asset_type === 'native') {
        xlm = balance.balance
      } else if (
        balance.asset_type !== 'liquidity_pool_shares' &&
        balance.asset_code === 'USDC' &&
        balance.asset_issuer === USDC_ISSUER
      ) {
        usdc = balance.balance
      }
    }

    return { xlm, usdc }
  } catch {
    return { xlm: '0', usdc: '0' }
  }
}

/**
 * Check whether a Stellar account has a USDC trustline.
 */
export async function checkUsdcTrustline(publicKey: string): Promise<boolean> {
  try {
    const account = await loadAccount(publicKey)
    if (!account) return false

    return account.balances.some(
      balance =>
        balance.asset_type !== 'native' &&
        balance.asset_type !== 'liquidity_pool_shares' &&
        balance.asset_code === 'USDC' &&
        balance.asset_issuer === USDC_ISSUER
    )
  } catch (err) {
    console.error('[Stellar] Trustline check failed:', err)
    return false
  }
}

// ─── Payment Detection ────────────────────────────────────────────────────────

/**
 * Search a merchant's Stellar account for an incoming USDC payment
 * that matches the given memo and amount.
 *
 * Stellar memo is used as the payment reference — each checkout link
 * generates a unique memo so we can match incoming payments.
 *
 * @param merchantPublicKey - The merchant's receiving wallet address
 * @param expectedMemo      - Unique memo string for this payment order
 * @param expectedAmount    - Amount of USDC expected
 * @returns PaymentRecord if found, null if not yet received
 */
export async function findIncomingPayment(
  merchantPublicKey: string,
  expectedMemo: string,
  expectedAmount: number
): Promise<PaymentRecord | null> {
  try {
    // Query the Horizon API for recent payments to this account
    const payments = await server
      .payments()
      .forAccount(merchantPublicKey)
      .limit(50)
      .order('desc')
      .call()

    for (const record of payments.records) {
      // We only care about payment operations (not account_merge, path_payment, etc.)
      if (record.type !== 'payment') continue

      const payment = record as StellarSdk.Horizon.ServerApi.PaymentOperationRecord

      // Skip native XLM payments — we only accept USDC
      if (payment.asset_type === 'native') continue

      // Check asset matches USDC
      if (
        payment.asset_code !== 'USDC' ||
        payment.asset_issuer !== USDC_ISSUER
      ) {
        continue
      }

      // Fetch the transaction to get the memo
      const tx = await payment.transaction()
      const memo = tx.memo || null

      // Match memo to this payment order
      if (memo !== expectedMemo) continue

      // Verify amount matches (allow tiny float rounding)
      const receivedAmount = parseFloat(payment.amount)
      if (Math.abs(receivedAmount - expectedAmount) > 0.0001) continue

      // ✅ Payment found and verified!
      return {
        txHash: tx.hash,
        from: payment.from,
        to: payment.to,
        amount: payment.amount,
        asset: `${payment.asset_code}:${payment.asset_issuer}`,
        memo,
        createdAt: tx.created_at,
      }
    }

    return null
  } catch (err) {
    console.error('[Stellar] Payment detection error:', err)
    return null
  }
}

/**
 * Verify a specific transaction hash on the Stellar network.
 * Used to confirm a payment after the customer submits their tx hash.
 *
 * @param txHash           - The Stellar transaction hash
 * @param merchantPublicKey - Expected destination address
 * @param expectedMemo      - Expected memo for this order
 * @param expectedAmount    - Expected USDC amount
 */
export async function verifyTransaction(
  txHash: string,
  merchantPublicKey: string,
  expectedMemo: string,
  expectedAmount: number
): Promise<{ valid: boolean; record?: PaymentRecord; error?: string }> {
  try {
    // Fetch transaction details from Horizon
    const tx = await server.transactions().transaction(txHash).call()

    // Check memo matches
    const memo = tx.memo || null
    if (memo !== expectedMemo) {
      return { valid: false, error: 'Memo mismatch' }
    }

    // Load the operations in this transaction
    const ops = await tx.operations()

    for (const op of ops.records) {
      if (op.type !== 'payment') continue

      const payment = op as StellarSdk.Horizon.ServerApi.PaymentOperationRecord

      // Verify destination is the merchant's wallet
      if (payment.to !== merchantPublicKey) continue

      // Verify USDC asset
      if (
        payment.asset_type === 'native' ||
        payment.asset_code !== 'USDC' ||
        payment.asset_issuer !== USDC_ISSUER
      ) {
        continue
      }

      // Verify amount
      const receivedAmount = parseFloat(payment.amount)
      if (Math.abs(receivedAmount - expectedAmount) > 0.0001) {
        return { valid: false, error: 'Amount mismatch' }
      }

      return {
        valid: true,
        record: {
          txHash: tx.hash,
          from: payment.from,
          to: payment.to,
          amount: payment.amount,
          asset: `${payment.asset_code}:${payment.asset_issuer}`,
          memo,
          createdAt: tx.created_at,
        },
      }
    }

    return { valid: false, error: 'No matching payment operation found' }
  } catch (err) {
    console.error('[Stellar] Transaction verification error:', err)
    return { valid: false, error: 'Transaction not found on network' }
  }
}

/**
 * Build a Stellar payment URI for SEP-7 deep linking.
 * Customers can open this in their Stellar wallet app to pre-fill payment details.
 *
 * SEP-7: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */
export function buildPaymentURI(params: {
  destination: string
  amount: string
  assetCode: string
  assetIssuer: string
  memo: string
  memoType?: string
}): string {
  const { destination, amount, assetCode, assetIssuer, memo, memoType = 'text' } = params

  const queryParams = new URLSearchParams({
    destination,
    amount,
    asset_code: assetCode,
    asset_issuer: assetIssuer,
    memo,
    memo_type: memoType,
  })

  return `web+stellar:pay?${queryParams.toString()}`
}

export { NETWORK_PASSPHRASE, USDC_ISSUER, HORIZON_URL }
