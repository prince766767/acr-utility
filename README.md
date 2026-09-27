# ACR Utility v0.2 - Personal ACR Assistant

This version moves the project into the template-binding stage.

## Authoritative format
The supplied `ACR_OFFICIAL_MASTER.pdf` is treated as the authoritative visual master because it contains 30 official pages. The supplied filled DOCX is retained only as a reference/template source.

The employee completes Points 1-30 and the List of Enclosures. Part III starts with Reporting Officer Point 31; the Reporting Officer, Screening/Reviewing Officer and Countersigning portions are left for manual completion.

## Current build
- Responsive PWA UI for Android/iOS/iPadOS/PC.
- Local draft persistence.
- Draft export/import.
- College and employee profiles.
- Repeatable teaching/assignment/result rows.
- Enclosure checklist.
- Initial API summary.
- Masked DOCX master preserving the supplied Word document's page layout.
- First DOCX template-binding generator (`generate_acr.py`) as a development harness.

## Important status
The DOCX generator is NOT yet the final production renderer. It is being used to identify every employee-data location in the official template.

The final production renderer will use the official PDF as the visual master for PDF generation, because this is the safest way to preserve the exact official A4 appearance. DOCX generation will be finalized separately after the field map is complete.

## Source discrepancy discovered
The supplied official PDF has 30 pages, while the supplied filled Word reference renders to 27 pages. Pages 28-30 of the PDF contain the official PBAS instructions and Appendix-V. This is why the final generator must use the PDF as the authoritative page set.

## API scoring
Only source-supported maxima have been wired in the prototype. The complete Category III scoring rules and all indicator-level rules must be implemented from the official instruction pages before the score engine is labeled authoritative.


## v0.3 generation
The generator now uses a cleaned employee master based on the supplied filled ACR, keeps Reporting/Reviewing Officer pages blank, appends the final three official instruction pages, calculates Category-I/II self-reported API components from structured inputs, and supports repeatable Category-III tables.
