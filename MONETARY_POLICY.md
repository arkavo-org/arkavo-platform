# Monetary Policy

This document describes the monetary system implemented in this repository and the policy direction expressed by the manifesto. It is intentionally split between what the code currently enforces and what remains a constitutional or product requirement.

## Purpose

Arkavo's monetary system is a self-contained civic economy. Its purpose is to provision human needs, account for productive work, let organizations form and finance themselves, and direct public resources democratically.

The system uses a unified ledger in CockroachDB. Accounts, transactions, UBI accrual, wages, taxes, stocks, insurance, and fiscal policy all resolve through the same `accounts` and `transactions` tables.

## Currency

The implemented system currency is `DEM`.

The UBI worker uses the term `DENA` for the high-precision annual UBI accrual parameter. Whole-cent payouts are posted to spendable `DEM` balances.

## Ledger

The core ledger is `accounts` plus `transactions`.

`accounts` supports these entity types:

- `INDIVIDUAL`
- `BUSINESS`
- `NONPROFIT`
- `GOVERNMENT`

Each account has an email identity, name, balance, credit score, optional business/nonprofit fields, optional tax id, verification status, and a `dena_balance` accumulator used by UBI.

`transactions` records monetary movement and issuance events with:

- `from_account_id`
- `to_account_id`
- `amount`
- `currency`
- `transaction_type`
- `description`
- `timestamp`
- optional `reference_id`
- optional JSON metadata

Supported transaction types include:

- `UBI_PAYMENT`
- `TAX_PAYMENT`
- `SALARY`
- `PURCHASE`
- `INVESTMENT`
- `DIVIDEND`
- `INSURANCE_PREMIUM`
- `INSURANCE_CLAIM`
- `BUSINESS_REVENUE`
- `DONATION`
- `GRANT`
- `STOCK_PURCHASE`
- `STOCK_SALE`
- `INTEREST`

Money supply history is derived from account balances and transactions. A transaction with no source and a destination is treated as issuance into circulation. A transaction with a source and no destination is treated as removal from circulation.

## Personal Finance

Individuals receive an `INDIVIDUAL` account. The portal exposes account discovery, balances, incoming transactions, all transactions, and payment endpoints.

On authenticated Org Portal access, the system can auto-provision a matching account from PIdP identity data. This makes the account ledger consistent with identity rather than creating a separate wallet store.

## Business Finance And Registration

Businesses use `BUSINESS` accounts. Business accounts support business type, mission statement, tax id, verification status, balances, transactions, stock issuance, tax calculation, and payment flows.

A verified business or SysAdmin can issue stock. The stock system records ticker, current price, shares, market cap, sector, and account holdings.

## Nonprofit Finance And Registration

Nonprofits use `NONPROFIT` accounts. Nonprofits share the account and transaction ledger with all other entities and support mission statements and tax ids.

The implemented tax engine exempts nonprofit accounts from tax liability by returning zero tax for nonprofit entity type.

## Government Finance

Government entities use `GOVERNMENT` accounts and the same ledger. Public finance is represented through fiscal proposals, fiscal votes, budget allocations, tax records, grants, and government-directed transaction types.

## Universal Basic Income

UBI is implemented by `OrgPortal/ubi/ubi.py` and runs as the `ubi` service.

Runtime settings live in CockroachDB in `ubi_runtime_settings`:

- `interval_seconds`, default `60`
- `dena_annual`, default `1`
- `dena_precision`, default `6`
- `entity_types`, default `individual`
- `updated_at`
- `updated_by`

Each tick computes:

```text
dena_per_tick = dena_annual / (60 * 24 * 365)
```

The worker adds this high-precision amount to `accounts.dena_balance` for eligible account entity types. When an account has at least `0.01` accumulated, the worker moves whole cents from `dena_balance` to spendable `accounts.balance` and inserts a `UBI_PAYMENT` transaction in `DEM`.

This design prevents precision loss while keeping the spendable ledger cent-denominated.

## Wage Schedule

Wages are implemented by `OrgPortal/ubi/wages.py` and run as the `wages` service alongside UBI.

Runtime settings live in `wage_runtime_settings`:

- `interval_seconds`, default `60`
- `max_payments_per_tick`, default `500`
- `updated_at`
- `updated_by`

Personnel pay schedules live in `personnel_wage_schedules`:

- `account_id`
- `active`
- `amount`
- `currency`, default `DEM`
- `pay_interval_seconds`
- `next_pay_at`
- `last_paid_at`
- `description`

Every tick, the worker selects active schedules where `next_pay_at <= now()`, credits the account balance, inserts a `SALARY` transaction, and records the period in `personnel_wage_payments`.

`personnel_wage_payments` has a unique key on `(schedule_id, pay_period_end)`. This is the idempotency guard: if the worker restarts or retries, the same wage period cannot be paid twice.

The wage service is intentionally account-based. Personnel are paid by linking a schedule to the same `accounts` row used by Portal and PIdP-derived identities.

## Taxation

Taxation is implemented as a tax estimate and payment flow.

The current tax engine uses progressive brackets:

- 10 percent up to 25,000
- 15 percent from 25,000.01 to 50,000
- 20 percent from 50,000.01 to 100,000
- 25 percent from 100,000.01 to 500,000
- 30 percent above 500,000.01

Nonprofits are exempt. Tax records are stored in `tax_records`. Tax payments debit the account, update the tax record, and insert a `TAX_PAYMENT` transaction.

The manifesto leaves taxation open as "possibly fair taxation." The implemented brackets are therefore an operational default, not a final constitutional rule.

## Democratic Fiscal Policy

Democratic fiscal policy is implemented through fiscal proposals, votes, and budget allocations.

Fiscal proposal policy areas currently include:

- `EDUCATION`
- `HEALTHCARE`
- `INFRASTRUCTURE`
- `DEFENSE`
- `ENVIRONMENT`
- `SOCIAL_WELFARE`
- `RESEARCH`
- `CULTURE`

Accounts can create fiscal proposals with a proposed budget, duration, expected impact, and voting window. Votes are `YES`, `NO`, or `ABSTAIN`, with one vote per account per proposal.

A background worker checks completed voting proposals. If yes votes exceed no votes, the proposal passes and increases the corresponding `budget_allocations` row for the current fiscal year and policy area. Otherwise it is rejected.

## Stock Market

The stock market supports business capitalization and investment.

Implemented components:

- `stocks`
- `portfolio_holdings`
- `stock_orders`

Verified businesses, or SysAdmins, can issue stocks. Accounts can place buy and sell orders while the market is open. The market is open Monday through Friday from 09:00 to 17:00 UTC. A background worker updates active stock prices every minute while the market is open using simulated sentiment, volatility, and volume.

## Insurance

Insurance supports the manifesto categories:

- Life
- Health
- Fire
- Acts of God

Implemented components:

- `insurance_policies`
- `insurance_claims`
- `INSURANCE_PREMIUM` transactions
- `INSURANCE_CLAIM` transaction type support

Premiums are calculated by insurance type, coverage amount, and risk factors. The current implementation uses default risk factors when purchasing a policy and debits the premium from the account balance.

## Provision Of Human Needs

The monetary system is intended to finance the provision of human needs:

- Air
- Water
- Food
- Shelter
- Security
- Health

In the current code, these needs map most directly to fiscal policy areas and future department budgets:

- Health maps to `HEALTHCARE` and health insurance.
- Shelter maps to `SOCIAL_WELFARE`, infrastructure, and the proposed Housing department.
- Security maps to `DEFENSE`, future law enforcement budgets, and insurance.
- Food, water, and air are policy requirements that should be represented as explicit budget areas, departments, programs, or grants.

## Identity

PIdP is the implemented identity provider. It currently supports:

- Email/password registration with hashed passwords
- JWT access tokens
- Personal access tokens for service automation
- Optional Google/GitHub OAuth
- JSON `identity_data`
- Website-scoped users and schemas

The manifesto requires identity by iris, with provision for people without irises. That is not yet implemented in code. The policy requirement is:

- Iris identity should be a high-assurance identity proof, not a payment account by itself.
- The ledger identity remains the account id and email-linked PIdP identity.
- Irisless people must have an equal-strength alternative enrollment and recovery process.
- Biometric data should not be stored directly in the monetary ledger.
- Any biometric implementation must support revocation, appeal, manual review, and privacy-preserving templates.

## State Departments

The manifesto establishes state needs as directly financed departments:

- Military
- Law Enforcement
- Faith
- Communications
- Culture
- Housing
- Energy

The current fiscal enum partially overlaps this list:

- Military maps to `DEFENSE`.
- Culture maps to `CULTURE`.
- Housing currently maps only indirectly to `SOCIAL_WELFARE` or `INFRASTRUCTURE`.
- Law Enforcement, Faith, Communications, and Energy are not explicit fiscal policy areas yet.

To fully implement the manifesto, the fiscal schema should add department-level records or expand policy areas so budgets can be allocated directly to these departments.

## Monetary Sources And Sinks

Implemented sources of money include:

- UBI payments into individual accounts
- Wage payments according to personnel schedules
- Grants
- Initial deposits and administrative account creation flows

Implemented sinks and transfers include:

- Tax payments
- Insurance premiums
- Stock purchases
- Purchases and account-to-account payments

Policy-sensitive transaction types should always be traceable by `transaction_type`, `reference_id`, and metadata.

## Governance Principles

The monetary system should follow these rules:

- One ledger: Portal, PIdP-derived users, UBI, wages, taxes, stocks, insurance, and fiscal policy must use the same `accounts` table.
- No hidden issuance: New money should be visible as transactions with no source account or an explicit government/source account.
- Idempotent automation: Scheduled payments must have uniqueness constraints to prevent duplicate issuance.
- Human needs first: UBI, wages for public service, and fiscal budgets exist to provision human needs before speculative activity.
- Democratic direction: Fiscal allocation should be directed by proposals and votes, with auditable outcomes.
- Equal identity access: Iris identity cannot exclude irisless people or people unable to enroll biometrically.
- Separation of concerns: Identity proves a person; accounts hold money; transactions record monetary facts.

## Current Gaps

The code already contains the backbone of the monetary system, but these gaps remain:

- Iris identity is not implemented.
- Irisless identity fallback is not implemented.
- Human needs are not yet first-class budget categories, programs, entitlements, supplier relationships, eligibility rules, or fulfillment records.
- State departments are not yet first-class budget categories or account-owning entities.
- Department budgets are not explicit for Military, Law Enforcement, Faith, Communications, Culture, Housing, and Energy.
- A personnel registry is missing. There is no dedicated employment model tying people to departments, jobs, wage schedules, supervisors, and public-service roles.
- Wage schedule administration is database/API level only; Portal UI integration is not implemented.
- Wage schedule approval, pause/resume, audit, and change-history workflows are not implemented.
- Government treasury accounts are not formalized as a hierarchy of central treasury, department accounts, program accounts, reserves, and appropriations.
- Budget disbursement is not implemented as ledger movement from treasury or issuance accounts into department and program accounts.
- Tax collection does not yet credit a specific treasury, department, or revenue account.
- Monetary issuance rules are not formalized beyond implemented UBI and wage workers. Missing policy controls include caps, targets, reserve rules, scheduled liabilities, and issuance limits.
- Fair taxation requires policy review beyond the current progressive default, including democratic tax schedule changes, exemptions, refunds, enforcement, and audit trails.
- Insurance claims have schema support, but full claim approval and payout workflows need completion.
- Insurance reserves, fraud review, appeals, and claim payout ledger routing are not implemented.
- Stock market settlement is incomplete. Missing aspects include order book depth, counterparties, settlement transactions, dividends, corporate actions, listing governance, and market surveillance.
- Money-supply governance is limited to history reporting. Missing aspects include issuance-by-source dashboards, sink analysis, policy simulations, scheduled-liability reporting, and alerts.
- Program-level grants are not modeled. `GRANT` exists as a transaction type, but grant programs, applications, approvals, milestones, reporting, and clawbacks are not implemented.
- Strong monetary audit controls are incomplete. Missing aspects include immutable policy events, multi-party approvals, separation of duties, reconciliation reports, and administrative action review.
- Direct government department accounts and budget disbursement rules need to be formalized.
