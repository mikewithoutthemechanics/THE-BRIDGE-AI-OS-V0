# 11 — Legal

_Last updated: 2026-04-17_

This chapter indexes the legal surface. It is not a substitute for counsel; it points at authoritative sources.

## License

> This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Source: `README.md` (license section). **Note:** The referenced `LICENSE` file is not present at the repo root — see chapter 14.

## Data protection and privacy

The ConsentVault OSINT stack documents a GDPR- and CCPA-aware consent regime:

> | **Consent Records** | 7 years post-revocation | Legal compliance (GDPR art. 17) |

Source: `consent-osint-stack/docs/policy.md` (Data Retention Policy table). Sections 4.1 and 3.1 of that file describe rights under GDPR/CCPA and differential-privacy requirements.

Bridge AI OS uses the schema to hold legal artifacts per company:

- `legal_documents` — `status`: `draft → active | archived | expired`; RLS-enabled (src: `supabase/migrations/20260411100000_business_suite_schema.sql:L344-L357`).
- `compliance_status` — `status`: `in_progress | compliant | non_compliant`; RLS-enabled (src: same file L367-L380).

## Jurisdiction / data residency

- VPS: single host `102.208.228.44` (user memory `reference_bridgeai_vps.md`). No jurisdiction statement in sources — see chapter 14.
- Vercel: US-default edge. No explicit residency declaration in `vercel.json`.
- Supabase: project region not recorded in committed files; defined only in dashboard.
- Linea (BRDG token): chain ID 59144 (src: `.env.example:L86`).

## ToS / Privacy pointers

- The repo does not include a committed ToS or Privacy Policy file at the root. The consent regime lives in `consent-osint-stack/docs/policy.md` (src: directory).
- Third-party verification methodology (how external auditors can prove each dashboard metric without trusting the operator) is in `public/VERIFICATION.md:L1-L15`.

## Compliance claims

| Claim | Source | Verification method |
|-------|--------|---------------------|
| Tamper-evident audit trail | SHA-256 hash-chain on `audit_log`. | Replay chain; each row's `hash = SHA256(prev_hash || row)`. src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L179-L190`. |
| Double-entry accounting | Trigger rejects unbalanced inserts. | Insert test fails. src: same file L81. |
| BRDG supply transparency | Trustless read of Linea contract. | `totalSupply()` at `0x5f0541302bd4fC672018b07a35FA5f294A322947`. src: `public/VERIFICATION.md:L20-L36`. |
| Proof of reserves | Merkle tree of user balances. | Build tree locally; compare root with on-chain commitment. src: `BRIDGE_FINAL_FORM.md:L14-L30`. |

## Payments compliance (PayFast)

- PayFast IPN endpoint at `/payfast/notify` validates signature + performs server-side ITN validate (src: `SESSION-HANDOFF.md`).
- Rate-limited to max 30 requests per window (src: `server.js:L102`).
- ZAR-only price points: R0 / R499 / R2499 (src: `SESSION-HANDOFF.md`).

## Wallet / blockchain legal surface

- Contract deployer key (`DEPLOYER_PRIVATE_KEY`) must never be shared; export from MetaMask → Account Details → Export Private Key (src: `.env.example:L89-L90`).
- Treasury address receives initial 10M BRDG mint (src: `.env.example:L91-L92`).

## Partner declarations

The Claude AI Partner page declares a commercial partnership with Anthropic including a dedicated `claude_partner` treasury bank, a 10% ZAR commission affiliate scheme, and a 30-day cookie window (src: `SESSION-HANDOFF.md` "Claude AI Partner Suite").

## Sources

- `README.md`
- `consent-osint-stack/docs/policy.md`
- `supabase/migrations/20260411000000_hardened_treasury_schema.sql`
- `supabase/migrations/20260411100000_business_suite_schema.sql`
- `public/VERIFICATION.md`
- `BRIDGE_FINAL_FORM.md`
- `SESSION-HANDOFF.md`
- `.env.example`
- `server.js`
