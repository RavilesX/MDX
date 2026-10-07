# Prueba de tablas en PDF

Exportar a PDF y revisar que las columnas cortas (`#`, `TC`, `AC`, `Severity`,
`Report`) queden en una sola línea y que solo `Outcome` haga wrap.

## Defects

| # | TC | AC | Severity | Report | Outcome |
|---|---|---|---|---|---|
| 1 | 54167 | AC 10 | Medium | [bug-report-1.md](bug-report-1.md) | Fixed. Retested 2026-10-06 on sandbox: a PUT with unchanged values and `effective_date` is no longer saved (`updated_at` unchanged, no new audit row); a real edit is still saved and stamped |
| 2 | 54172 | AC 12 | High | [bug-report-2.md](bug-report-2.md) | Open. A POST with an `effective_date` in the past returns 200 instead of 422; the row is created and shows up in the audit log with the wrong period |
| 3 | 54180 | AC 3 | Low | [bug-report-3.md](bug-report-3.md) | Won't fix. The tooltip on the disabled Save button is truncated at 1280px wide; cosmetic only |

## Passed TCs

| # | TC | AC | Title | Notes |
|---|---|---|---|---|
| 1 | 54160 | AC 1 | Create a rate with all required fields | Checked through the UI and the API; both write one audit row |
| 2 | 54161 | AC 2 | Reject a rate without `effective_date` | 422 with a field-level error message |
| 3 | 54165 | AC 8 | Edit a rate and keep its history | Previous value stays readable under History |
