# USDC trustline

A Stellar wallet can only receive a non-native asset like USDC after it adds a trustline for that asset.

## Why this matters

StellarPay settles payments directly to the merchant's wallet. If the wallet does not trust USDC, the payment cannot complete on-chain.

## How to add one

1. Open your wallet or Stellar Laboratory.
2. Add a trustline for asset code `USDC`.
3. Use the issuer for the network you are on:
   - Testnet: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
   - Mainnet: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
4. Return to StellarPay and refresh the Settings page.

## Testnet note

Friendbot can fund a testnet account with XLM, but it does not create a USDC trustline. Custom wallet addresses still need the trustline added before they can receive payments.
