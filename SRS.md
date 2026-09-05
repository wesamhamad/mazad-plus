# Software Requirements Specification (SRS)
## مزاد+ — Mazad+
### Specialised Real-Estate Auction Platform, Infath Innovation Program — Auctions Track

**Version 2.0 — 4 September 2026**
Supersedes v1.0 (working title "Rasa"). Renamed to **مزاد+ / Mazad+**, aligned with
the financial study and the technical specification in §11 of the source document.

---

## 1. Introduction

### 1.1 Purpose
This document specifies **Mazad+**, a specialised digital platform for judicial
real-estate and movable-asset auctions operating within Infath's sale-and-liquidation
ecosystem. Mazad+ combines four capabilities in one system:

1. A **unified Asset Card** generated from inspection documents.
2. A **listing-readiness score** that blocks incomplete assets from being listed.
3. An **explainable opening-price recommendation** with a hammer-probability estimate.
4. A **live auction engine** with bid-integrity monitoring (Najsh / collusion detection).

All four sit behind a mandatory human-in-the-loop gate and an append-only audit trail.

### 1.2 Scope
This SRS covers the working system built and running locally, not a paper design.
Every requirement marked **[BUILT]** is implemented and verifiable in the running
application; **[FUTURE]** marks work that requires access this project does not have.

**Out of scope (deliberately, for legal positioning — see §5.5):** holding bidder
funds, marketing properties under the platform's own brand, charging any percentage
of transaction value or agent commission, and acting as a licensed real-estate
mediator.

### 1.3 Definitions
- **Asset Card** — standardised structured record of an asset.
- **Readiness Score** — 0–100 gate on whether an asset may be listed.
- **Arbun (العربون)** — pre-agreed, disclosed deposit, forfeitable on withdrawal.
- **Najsh (النجش)** — bidding with no intent to buy in order to inflate price; the
  Arabic term for shill bidding.
- **Nafath** — Saudi national single sign-on.
- **HITL** — human-in-the-loop.
- **DGA Platforms Code (كود المنصات)** — the Saudi Digital Government Authority's
  unified design system.

### 1.4 References
Source document `برنامج ابتكار إنفاذ.docx` §16 (references) and §11 (technical
specification); DGA Platforms Code; NCA ECC-2:2024; SDAIA PDPL and AI ethics
principles; Real Estate Auction Regulation; Competition Law; Enforcement Law
(Royal Decree M/237); Nafath terms of use.

---

## 2. Overall Description

### 2.1 Product Perspective
Infath's auction model is decentralised by design: it does not run one auction
platform but accredits several (six registered as of August 2026) and relies on
licensed sale agents. Mazad+ therefore positions as a **specialised platform and
service layer serving that ecosystem**, and its revenue model is deliberately
structured to stay outside the statutory definition of real-estate mediation.

```
Inspection docs → [Asset Card] → [Readiness gate] → [Price recommendation]
                                          ↓                    ↓
                                   (blocks listing)    (appraiser approves)
                                          ↓                    ↓
                          [Live auction + integrity monitoring] → [Award]
                                          ↓
                              [Append-only hash-chained audit log]
```

### 2.2 User Classes
| Role | Code | Capabilities |
|---|---|---|
| Sale Agent | `agent` | Manage assets, upload documents, trigger rescoring |
| Certified Appraiser | `appraiser` | **Sole** authority to approve or override a price |
| Compliance Supervisor | `compliance` | Edit regulatory parameters, decide integrity alerts |
| Bidder | `bidder` | Acknowledge deposit terms, place bids |

Roles are enforced **server-side**, not merely hidden in the UI. **[BUILT]**

### 2.3 Operating Environment
Local development stack, RTL Arabic-first, light and dark themes.
Production target: Saudi-hosted infrastructure (data-residency requirement).

### 2.4 Design Constraints
- **DGA Platforms Code compliance.** Design tokens are consumed from the published
  `@maldarabseh/dga-tokens` package; the application defines no competing palette.
  Typeface is IBM Plex Sans Arabic. **[BUILT]**
- **Nafath replica is a labelled simulation.** It reproduces the live Nafath SSO
  layout — official-government banner with its "كيف تتحقق" panel, two-tab login card,
  two-digit push confirmation, four-column footer — and declares itself a demo in
  three separate places. **[BUILT]**
- **Regulatory values are database rows, not constants.** **[BUILT]**
- **No late-payment fee exists anywhere in the schema.** **[BUILT]**

---

## 3. Functional Requirements

### 3.1 Identity (Nafath simulation)
- **FR-1 [BUILT]** Validate national ID as `^[12]\d{9}$` on client and server.
- **FR-2 [BUILT]** Match against the local `users` table; unknown IDs return 404
  with an Arabic message.
- **FR-3 [BUILT]** Two-step push flow: server issues a 2-digit confirmation code
  plus two decoys; the client must select the matching number.
- **FR-4 [BUILT]** Auth requests expire after 120 seconds, enforced server-side.
- **FR-5 [BUILT]** Issue an opaque session token; sessions are revocable on logout.
- **FR-6 [BUILT]** Every login is written to the audit trail.
- **FR-7 [FUTURE]** Real Nafath integration — requires application, integration
  agreement, and prior approval from the National Information Center.

### 3.2 Asset Card and Readiness
- **FR-8 [BUILT]** Maintain a structured Asset Card per property with a document
  checklist distinguishing required from optional.
- **FR-9 [BUILT]** Compute a 0–100 readiness score from four weighted components:
  required documents (45), inspection recency (20), core card fields (20), and
  presence of a valuation (15).
- **FR-10 [BUILT]** Inspection recency decays gradually past the 90-day window
  rather than falling off a cliff.
- **FR-11 [BUILT]** Every deducted point names the specific field that caused it;
  these reasons are surfaced verbatim in the UI.
- **FR-12 [BUILT]** Assets scoring below the configured threshold are blocked from
  listing automatically; unblocking happens by completing documents, and each change
  is attributed and audited.

### 3.3 Price Recommendation
- **FR-13 [BUILT]** Produce an opening-price **range** plus a hammer-probability
  estimate, anchored on the appraised value and cross-checked against comparables.
- **FR-14 [BUILT]** Select comparables within a plausible value band (0.4×–2.5× the
  appraisal) so a villa is not "compared" to an apartment in the same city.
- **FR-15 [BUILT]** Apply a divergence adjustment only when at least two comparables
  exist; a single observation is not a median.
- **FR-16 [BUILT]** Refuse to price an asset with any missing required document.
- **FR-17 [BUILT]** Ship the comparables **and** the adjustment factors with every
  recommendation; explanation is not optional.
- **FR-18 [BUILT]** A recommendation becomes an opening price only via an explicit
  appraiser action. Override without a recorded reason is rejected with HTTP 400.

### 3.4 Auctions and Bidding
- **FR-19 [BUILT]** Auction lifecycle: draft → blocked/upcoming → live → closed.
- **FR-20 [BUILT]** Enforce a configurable minimum bid increment server-side.
- **FR-21 [BUILT]** Require a logged acknowledgement of deposit terms before a
  user's first bid (HTTP 409 until acknowledged).
- **FR-22 [BUILT]** Push live bids to connected clients over Server-Sent Events.
- **FR-23 [BUILT]** Close auctions automatically at expiry, record the winner, and
  create a settlement payment due after the configured deadline.
- **FR-24 [BUILT]** Display bidders only by pseudonymous alias.

### 3.5 Bid-Integrity Monitoring
- **FR-25 [BUILT]** Detect three patterns from live bid data: repeated two-party
  alternation (Najsh), late sniping in the closing window, and coordinated withdrawal.
- **FR-26 [BUILT]** Output is **always** a supervisor alert; the system never
  auto-blocks, bans, or cancels.
- **FR-27 [BUILT]** Network fingerprint is scored as one signal among several and is
  labelled as such in the alert text itself.
- **FR-28 [BUILT]** A supervisor closes each alert with one of three recorded
  decisions: refer to the Competition Authority, extended review, or dismiss.

### 3.6 Regulatory Parameters
- **FR-29 [BUILT]** Five editable parameters: notice period, deposit cap, payment
  deadline, readiness threshold, minimum increment — each carrying its legal basis.
- **FR-30 [BUILT]** Changing the readiness threshold or deposit cap immediately
  re-evaluates every auction's blocked state.
- **FR-31 [BUILT]** Only `compliance` may edit; every change is audited with the
  before and after values.

### 3.7 Audit Trail
- **FR-32 [BUILT]** Record every AI output and human decision with actor, kind,
  action, detail, entity, and timestamp.
- **FR-33 [BUILT]** Chain each entry to the hash of the previous one.
- **FR-34 [BUILT]** Expose chain verification; the UI shows a live integrity banner.
- **FR-35 [BUILT]** Keep personal data **out** of the hashed payload so erasure
  under PDPL remains technically possible.

---

## 4. External Interfaces

### 4.1 API (implemented)
```
POST /api/auth/nafath/initiate      POST /api/auth/nafath/verify
GET  /api/auth/me                   POST /api/auth/logout
GET  /api/auth/demo-identities
GET  /api/dashboard
GET  /api/auctions                  GET  /api/auctions/:code
POST /api/auctions/:code/bids       POST /api/auctions/:code/deposit/accept
GET  /api/auctions/:code/stream     (Server-Sent Events)
GET  /api/properties                GET  /api/properties/:ref
POST /api/properties/:ref/documents/:id/toggle
POST /api/properties/:ref/pricing/decision
GET  /api/fraud-alerts              POST /api/fraud-alerts/:code/decision
GET  /api/settings                  PUT  /api/settings/:key
GET  /api/audit                     GET  /api/notifications
```

### 4.2 Data Model (implemented)
`Users` · `Properties` · `Documents` · `Auctions` · `Bids` · `Deposits` ·
`Payments` · `FraudAlerts` · `AuditLogs` · `Notifications` · `Settings` ·
`AuthRequests` · `Sessions`

### 4.3 Technology Stack
Matches §11 of the source study: Python · Flask · React · REST APIs · real-time
push · SQL. SQLite stands in for MySQL so the project runs with no external
services; persistence is through SQLAlchemy, so the change is one connection string.

### 4.4 Future Interfaces
- **[FUTURE]** Nafath (National Information Center approval required).
- **[FUTURE]** Accredited auction-platform APIs.
- **[FUTURE]** Infath closed-auction dataset — the single most valuable input the
  pricing engine is missing; it should be requested explicitly.
- **[FUTURE]** Licensed payment service provider for real deposit handling.

---

## 5. Non-Functional Requirements

### 5.1 Security
NCA ECC-2:2024 baseline for production; CSCC-1:2019 if classified as a sensitive
system; CCC-1:2020 if cloud-hosted. Session tokens are cryptographically random and
server-revocable. **[BUILT — at prototype level]**

### 5.2 Privacy (PDPL)
- IP addresses are personal data under the law's broad definition. Mazad+ never
  stores a raw address: it stores a salted, truncated hash sufficient for comparison
  between bids and useless for re-identification. **[BUILT]**
- Bidder identity is pseudonymous in every view. **[BUILT]**
- Erasure remains possible because personal data stays out of the hash chain. **[BUILT]**
- **[FUTURE]** Published privacy policy, lawful-basis register, retention schedule.

### 5.3 AI Governance (SDAIA)
- AI is decision-support, never decision-maker — enforced in the API, not the UI. **[BUILT]**
- Automated bidder exclusion is classified high-risk and is therefore **not built**,
  by design rather than by omission. **[BUILT]**
- Every AI output is explainable by construction: rule-based engines that name their
  own inputs. **[BUILT]**
- **[FUTURE]** Periodic bias measurement of pricing performance across regions and
  asset categories.

### 5.4 Sharia Compliance
Binding constraints, implemented in the schema and the API:
- **No late-payment fee field exists.** A surcharge on a due money debt in exchange
  for more time is Riba per both Ibn Baz and Ibn Uthaymin. Default is handled by
  deposit forfeiture, award cancellation, or suspension. **[BUILT]**
- **Arbun requires explicit prior disclosure and a logged acknowledgement** before
  the first bid — the condition both scholars attach to its permissibility. **[BUILT]**
- **Najsh detection is framed as automating a religious and legal duty.** On proof,
  the sale is not void automatically; the harmed party has the option to seek
  rescission on excessive harm (غبن فاحش) — so the system opens a human-decided
  path, never an automatic cancellation. **[BUILT]**
- Deposit is capped at the regulatory ceiling and labelled "عربون متفق عليه", never
  "غرامة" — the characterisation changes the ruling. **[BUILT]**

### 5.5 Legal Positioning
Mazad+ stays on the **tool-provider track**: fixed subscription and per-asset fees
only, never a percentage of transaction value or agent commission, because the
statutory definition of real-estate mediation turns on two elements — intermediating
a transaction, and doing so for a commission. The platform holds no bidder funds and
markets no property under its own brand. **[BUILT — reflected in the pricing model]**

This is an analysis of published regulations, not legal advice. Commercial launch
requires a licensed Saudi legal opinion or a written enquiry to the General Real
Estate Authority.

### 5.6 Accessibility & Usability
RTL-first, WCAG 2.1 AA contrast targets, visible keyboard focus, `prefers-reduced-motion`
respected, full light/dark theming. **[BUILT]**

---

## 6. Acceptance Criteria — verified in the running system

| # | Criterion | Status |
|---|---|---|
| 1 | Login with a seeded ID completes the two-step Nafath-style flow and reaches a role-appropriate shell | ✅ |
| 2 | A blocked asset (52/100) names every missing item; uploading the deed raises the score and removes that reason | ✅ |
| 3 | Pricing is refused while a required document is missing | ✅ |
| 4 | Price override without a reason is rejected (HTTP 400); with a reason it is stored and audited | ✅ |
| 5 | A non-appraiser attempting a price decision receives HTTP 403 | ✅ |
| 6 | Live bids reach an open auction page over SSE without a page refresh | ✅ |
| 7 | Bidding before acknowledging deposit terms is refused (HTTP 409) | ✅ |
| 8 | Integrity alerts are generated from real bid patterns, not seeded rows | ✅ |
| 9 | Changing the readiness threshold immediately re-evaluates auction blocking | ✅ |
| 10 | The audit chain verifies as intact after a full session of writes | ✅ |

---

## 7. Known Limitations
- Login is a simulation; identity is matched locally.
- The comparable corpus is a described demo set, not real closed-auction data.
- No integration with accredited platforms or a payment gateway.
- Flask development server; production needs a WSGI server, in-Kingdom hosting, and
  the security controls in §5.1.
- Judging criteria for the program were never published; the feature set is derived
  from the program's stated goals and its registration form.
