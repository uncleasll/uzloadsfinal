# KARVAN / EZLoads parity audit — 2026-09-14

Status: accounting foundations corrected locally; full four-page parity is NOT certified.

Evidence: authenticated read-only requests to the user-provided s1-karvan00 EZLoads tenant, plus its current public frontend bundle `main.f659eaf6030126dbf0ca.js`. The tenant has no drivers, loads or settlements (confirmed by the user). The backend source and populated reference transaction results are unavailable. No reference transactions were created and no live KARVAN database migration was run.

## Confirmed reference behavior

- Driver rate methods: per mile, freight percentage, flatpay, hourly.
- Loaded miles, empty miles and extra stops have distinct rate fields.
- Load overrides support fixed amount, percentage/base, and mileage rates.
- Payroll selects driver AND payable to. Old payable-to balances do not automatically move when the driver's current payee changes.
- Available billing entries and selected settlement entries are separate.
- Settlement total sums selected earning/deduction entries. Applied advances/payments reduce balance due, not settlement total.
- Preparing is the editable settlement state. Ready for payment and Paid are separate states.
- Negative balance carryover is a debt transfer to a later settlement, not an ordinary cash payment.
- Fuel/toll/expense deductions can use discounted or retail amounts; missing retail falls back to discounted.
- Scheduled transactions have calendar rules, repeat limits, pause/resume, and generation of past periods.

These are interface/client behavior observations. They do not establish every server rounding rule, eligible load status, extra-stop counting convention, report definition, or integration behavior.

## Root causes corrected in this change

| Area | Before | After |
|---|---|---|
| Drivers → Loads | UI sent `freight_percentage`; calculation expected `percentage` and fell back to mileage | Canonical percentage value; legacy alias remains readable |
| Drivers | Partial updates wrote default values into unrelated pay fields | Only explicitly supplied profile fields are changed |
| Rates | Configured zero mile rate became 0.65/0.30 | Zero preserved in capture, calculations and breakdown |
| Loads → Payroll | Mileage/rate edits and service edits left stored payable stale | Eligible edits refresh amount using frozen rules; services included consistently |
| Locks | `str(Enum)` did not equal the stored enum value; changing status could bypass the old-state check | Enum values checked; original state checked before mutation; settlement membership checked |
| Historical reads | Reports and driver balances could fall back to live rates | Shared stored-pay reader; missing history is not fabricated from current profiles |
| Startup | Restart could backfill old compensation from today's driver profile | Automatic historical pay backfill removed |
| Payable to | Current profile could relabel old open loads | Newly captured loads retain a payable-to snapshot; candidate/add validation and grouping respect it |
| Settlement membership | Another driver's load or a load already in another active settlement could be inserted | Reject mismatched driver/payee and duplicate active membership; PostgreSQL row locking added |
| Deletion | Deleted settlements kept loads unavailable | Membership queries consider active/non-void settlements; applied advances restored on deletion |
| Advances | Advances reduced earned total; generic removal did not restore the source advance | Advances reduce due; source FK added; removal/deletion restore available credit |
| Legacy Payments | Legacy advance applications did not affect persistent totals | Legacy applications included in due; apply/unapply aggregates committed |
| Payments | Overpayment/negative carryover-as-payment could be recorded | Positive cent amounts and remaining-due checks; dedicated carryover operation |
| Carryover | Positive payment increased a negative debt and created no future debt entry | Linked outgoing/incoming debt transfer; exactly-once source; next new matching settlement receives debt; reversal updates both sides |
| Reports | P&L with a driver/truck filter deducted all company expenses | Expenses use the same driver/truck scope |
| Reports | Lumper deductions treated as positive revenue | Signed service amounts used |
| Dates | Pickup filtering used load date despite a dated pickup stop | Shared pickup basis (earliest dated pickup, fallback load date); actual completed date for delivery |
| Payroll UI/PDF | Advance included in earnings table and could disagree with due | Earnings and applied payments displayed separately; PDF shows total, applied advances, payments and due |
| New settlement | Driver selection forced payee to driver's name and hid company payees | Actual open-balance payees shown; empty settlement can be created for selected driver |

## Remaining work before a 1:1 claim

1. **Flatpay/hourly:** flatpay now has its own period/start fields and a linked recurring addition schedule. The UI no longer writes those values into extra-stop/hire-date fields. Hourly work has persistent time reports with frozen rate/payee/amount, request deduplication, one settlement application, removal and deletion. Work dates and daily hours are validated. Exact reference time-report editor, shift handling and period-end/proration semantics still need populated reference comparisons.
2. **Scheduled occurrences:** a persisted source/date ledger now holds generated obligations independently of settlement selection. Pausing a source preserves existing entries. The app generates due entries on startup/hourly and on payroll reads; application remains explicitly selected. Weekly, biweekly, inclusive-until, month-end and capped loan/escrow installments were compared with live EZLoads preview responses. Existing unlinked applications are not guessed. Flatpay revisions start after the last generated period and preserve earlier amounts. Generic schedule edits with generated entries require a new schedule. These editing/resume semantics and multi-worker locking still need exact reference/PostgreSQL validation.
3. **Extra stops:** migration 017 freezes rate/count and adds Other stops with payable flags. Saved reference transactions confirmed pickup/delivery count beyond two, plus payable Other stops. Fixed, percentage and mileage overrides all include extra-stop pay. Route editing and settlement locks are wired.
4. **Load overrides/recalculation:** fixed/percentage-base/mileage overrides now persist separately from captured rates, update the shared calculation, and restore the original frozen rules. They include service additions/deductions separately. Additional payees now have driver rules, captured per-load freight amounts and single-use settlement links. Reference fixtures verify freight-only payee percentages and invoice-based quickpay including accessorials. Broader regeneration edge cases remain unverified. Existing Delivered/invoiced locking is retained as a KARVAN rule, not certified as an exact EZLoads rule.
5. **Payee migration:** pre-010 loads have no reliable historic payee. The fallback is retained for those rows; it must be reconciled explicitly. A vendor ID with stable historical ownership should replace display-name matching for complete parity.
6. **Reports:** driver/truck grouping is implemented with stable IDs, weighted rate-per-mile, UI subtotals, PDF summary tables and an Excel Group summary sheet. Total-revenue Excel columns and rate-per-mile empty-mile totals were corrected. `change_to_overridden` is not wired to an override model. Fuel/toll totals remain placeholders. Quickpay now uses the captured broker percentage and signed invoice total; additional-payee costs are subtracted and shown in reports/exports. Full reference definitions and PDF/XLSX grouping need validation. Summary revenue treatment of freight versus accessorials must be checked against reference fixtures.
7. **Integrations:** marking `qb_exported` is not a real QuickBooks export. Email/download/template workflows need separate verification; no external emails were sent.
8. **Concurrency:** local tests use SQLite. PostgreSQL lock SQL is present, but concurrent payment/advance/status/void races need tests against disposable PostgreSQL before production certification.
9. **Reference fixture validation:** controlled temporary driver/load/payee records were created under the user’s authorized comparison scope. Saved financial results are in ezloads_load_financials.json. All temporary records were deleted and GET requests returned 404 for each. Settlement/export reference comparisons remain incomplete.

## Verification and release

Backend tests: from `backend`, run `python -m unittest discover -s ./tests -p 'test_payroll_integrity.py' -v` using the project's Python dependencies. The suite forces an in-memory SQLite URL and never opens the configured live database.

Frontend: `npm run build` from `frontend`.

Schema migration: **010 through 018 must be applied before starting the changed backend against an existing database.** `create_all()` does not add columns to existing tables. The migration adds a load payee snapshot, a source-advance FK and a carryover table. It does not overwrite historical load pay or guess historical payees.

After migration, preview historical settlement aggregate corrections with `python scripts/reconcile_payroll.py`. The default command is read-only. Review the differences before using `--apply`. Statuses are preserved. Legacy fake carryover payments block automatic application and require manual reconciliation.

No KARVAN production DB changes, deployment, git commit or external messages were performed. Temporary reference transactions were created, tested and removed. Pre-existing staged UI edits were preserved.

## Live preview validation — follow-up

Authenticated POST `/api/scheduled-payments/preview` was used without saving reference transactions. Sanitized numerical fixtures are in `backend/tests/fixtures/ezloads_schedule_previews.json`.

- Weekly, start 2026-09-01, repeat 3, deduction $100: September 1, 8, 15.
- Biweekly: September 1, 15, 29.
- Monthly, start January 31: January 31, February 28, March 31. The original day is retained after a short month.
- Weekly until September 15: September 15 is included.
- The start date anchors these previews; the old weekly body fields do not change their weekday.

These preview observations do not certify persisted generation, annual leap-day behavior, loan balances, or all four application pages. Migration 011 adds unique scheduled source/date links; no live database was changed.

## Implemented in the latest build

- Migration 012: distinct flatpay period/start date and unique source schedule.
- Migration 013: immutable hourly work amounts and single-use settlement links.
- Migration 014: separate loan/escrow principal and installment; final partial payment.
- Migration 015: per-load driver-pay override payload.
- Migration 016: persisted generated payroll obligations, independent of settlement selection.
- Driver and payroll open balances include unselected scheduled/hourly entries by historical payee.
- Background generation uses server calendar dates, runs hourly while the backend is running, and is idempotent by source/date. Tenant timezone matching, paused-period catch-up, and multi-process PostgreSQL behavior need validation before production parity certification.
- Report PDF sample rendered with macOS Quartz and inspected; grouped table is legible. Poppler had a local font-cache failure. Excel group amounts and corrected total columns were checked by reopening the generated workbook.
- No production migration or deployment was performed. Existing user edits remain intact.

Remaining significant gaps include expense/fuel/toll integration; report revenue override semantics; accrual/cash treatment of period payroll in P&L; and full end-to-end reference fixtures. This remains an implementation build, not a certified 100% clone.

## Saved transaction validation — 2026-09-14

- Base mileage pay $63; extra pickup $88; nonpayable Other remains $88; payable Other $113.
- With two extra stops: fixed $200 base yields $250; 20% of $1,000 yields $250; overridden mileage rates with $10 per extra stop yield $70.
- $1,200 freight plus $100 accessorial: additional payee at 10% is $120; Quick Pay at 2.25% is $29.25 on the $1,300 invoice.
- Migration 018 adds driver/payee rules, frozen per-load obligations, unique settlement links and captured quickpay percentage. Existing historical fees are not guessed.
- Corrected three missing `/api/v1` frontend prefixes for hourly work, scheduled previews and load overrides; tested requests against the mounted FastAPI router without importing production startup.

## Latest verification results

- 46 in-memory backend acceptance tests passed, including HTTP requests through the real `/api/v1` router, extra-stop rules, additional-payee uniqueness/removal, immutable fee bases and PDF/XLSX totals.
- Frontend TypeScript/Vite production build passed. Vite retains a nonblocking bundle-size warning.
- Offline PostgreSQL Alembic SQL generation through migration 018 passed; no database connection or live migration was performed.
- Updated Gross Profit per Load PDF was rendered with Quartz and visually inspected: the added payee column and $1,080.75 total are legible. XLSX headers and totals were verified by reopening the workbook.
- `git diff --check` passed. Existing staged user edits were preserved.
