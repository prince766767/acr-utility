# Personal ACR Utility v0.4

A local-first, installable web utility for preparing the employee-owned portion of a UGC/PBAS ACR (Points 1-30). It remembers profiles and drafts on the device, calculates PBAS/API self-assessment scores, keeps an enclosure checklist, and exports portable draft JSON.

## Start it

Open `public/index.html` in a modern browser. For offline installation/service-worker support, serve the folder with any static web server. No account, data collection, or internet connection is required.

## What is production-ready here

- The complete employee workflow: Points 1-30, structured repeatable rows, completion state and last-opened section.
- IndexedDB persistence for college/employee profiles and the active ACR draft; completed years are retained as exported portable files until the dashboard/archive view is connected to a cloud provider.
- Export/import of a portable `.acr.json` draft, suitable for a Drive/Dropbox/own-server backup workflow.
- A sync outbox and a deliberately small HTTP adapter. Adding a private endpoint later does not change the app's data model.
- Rule-based Category I-III API calculation, with caps and co-author allocation. The auditable rule table is in `public/api-rules.js`.
- Enclosure checkboxes and custom enclosures.

## Official 30-page output

The official `UGC_ACR_Form.pdf` and Word master were not present in the workspace supplied to this build. For that reason, this package does **not** pretend to recreate the official visual form from memory.

Place the authoritative master PDF at `assets/UGC_ACR_Form.pdf` and, if DOCX is required, a placeholder-enabled official Word master at `assets/UGC_ACR_Form.docx`. Then use `tools/generate_acr.py` with the completed exported draft and a verified `template-map.json`. The tool overlays only employee slots on the official PDF and leaves all other pages—including Reporting/Reviewing Officer sections—untouched. It also replaces explicitly named placeholders in a copy of the DOCX master.

The coordinate map must be calibrated against the actual master once, then retained and regression-tested. This is intentional: it protects the official appearance rather than generating a generic substitute.

## API rules

The calculator implements the published UGC 2010 Appendix-I schedule reflected in the referenced form: Category I maxima (50/10/20/20/25), Category II item maxima (20/15/15) with the form's annual 25-point cap, and Category III paper/publication/project/guidance/training/conference/invited-lecture rules. See `API_RULES.md` and test with `node tests/api-rules.test.js`.

The user remains responsible for evidence and for institutional verification. The form itself provides that final scores are verified by the competent committee; the utility reports a self-assessment only.
