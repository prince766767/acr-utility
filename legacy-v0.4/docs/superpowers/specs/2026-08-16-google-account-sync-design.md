# Personal ACR Utility — Google Account Sync: Architecture & Specification

Status: **Draft for approval — no implementation started.**
Scope: Adds Google Sign-In + Google Drive sync to the existing local-first ACR Utility, for personal use now and distribution to other teachers later. Does not change the ACR form, calculations, Word/PDF output, or print layout.

---

## 1. Current architecture (as found)

The working product is `ACR-Utility.html`, a single self-contained file built by `build.py` from `src/*.js` + `src/styles.css` into `src/shell.html`. It makes **no network requests of any kind** today.

- **Data model** (`src/model.js`): one JSON document per ACR year (`blankDoc()`), `schemaVersion: 5`, holding college/employee profile, Points 1–30, and the API scoring tables. `cloneForNewYear()` carries forward stable profile fields into a new year.
- **Storage** (`src/app.js`): documents live in `localStorage`, keyed `acr.doc.<id>`, with an index (`acr.index.v1`) and a "currently open" pointer (`acr.current.v1`). `persist()` writes immediately on every change.
- **Scoring**: pure functions (`totals()`, `C3RULES`, `share()`) implementing the UGC 2010 Appendix-I schedule — unaffected by anything in this document.
- **Output**: `render.js` builds the on-screen/print preview; `docx.js` hand-writes a real `.docx` (a ZIP it constructs itself, no libraries) — both operate purely on the local document, no network.
- **Linked-file sync** (`src/sync.js`): points the app at one file via the File System Access API (`showSaveFilePicker`/`showOpenFilePicker`), normally inside a Drive/OneDrive-synced folder. Every save writes the file; every load reads and merges it. Merge rule: per-year, newest `updatedAt` wins, except a `touched:false` (never-edited) copy never beats a `touched:true` one regardless of clock. Debounced 4s after the last edit. **Chrome/Edge desktop only** — Android and iOS give browsers no such file-handle API, so phones are limited to manual export/import today.
- **Manual backup**: Export writes one `.acrbak.json` with every year; Import merges it in, never deleting existing years.
- **Personal seed data**: `seedDoc()` in `model.js` hardcodes your real 2024-25 ACR (name, employee code, address, mobile, publications) as the fallback default whenever `localStorage` is empty — i.e. **every fresh install currently starts pre-filled with your personal data.** This must not ship to other teachers (§20).
- A second, much smaller prototype exists under `public/` (IndexedDB, a stub service worker/manifest, an unused HTTP sync-outbox). It is not what `HOW-TO-USE.md` documents and is not part of the shipped product; this spec does not build on it.

Nothing here needs to be rewritten. The plan below adds a second, optional transport for the same merge logic that already exists in `sync.js`, and a sign-in layer on top of the same `localStorage` documents.

---

## 2. Recommended architecture — Option A (approved)

**Google Sign-In (Google Identity Services) + Google Drive API only. No Firestore, no database, no backend, no sync server.**

Each teacher's Drive becomes the second copy of their own data. The app is a static file; nothing runs on any server you operate; there is no shared store where one teacher's records and another's could ever mix. This is the smallest possible extension of the merge engine that already exists in `sync.js` — same logic, new transport.

---

## 3. Developer attribution (new requirement)

A fixed, unobtrusive line appears in both the hosted and the downloadable build — footer and an "About" entry — reading exactly:

> **Utility developed by: Dr. Prince Thakur (Assistant Professor Botany)**

No email address or other personal identifier is shown anywhere in the UI. This text ships in the public distributable and is not something a teacher can remove from the interface (though of course they see the source, since it's a client-side app).

---

## 4. Authentication — Google Identity Services

**Library**: Google Identity Services (GIS) — the current, mandatory library. Google fully retired the old `gapi.auth2` / Google Sign-In JS library on **31 March 2023**; GIS is not a preference, it's the only supported option. *(Verified: [Google Developers Blog](https://developers.googleblog.com/discontinuing-authorization-support-for-the-google-sign-in-javascript-platform-library/), [Migration guide](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis))*

**Flow**:
1. Teacher clicks **Sign in with Google**. GIS's token client opens Google's own popup; the teacher picks their account and reviews the permission screen described in §5.
2. GIS returns a short-lived **access token, held in memory only** — never written to `localStorage`, `IndexedDB`, or anywhere on disk.
3. The app calls Google's `userinfo` endpoint once with that token to learn the signed-in email/name for display, then uses the token to find-or-create the "ACR Utility" folder (§6) and begins syncing.
4. One small, non-sensitive marker — the account's Google user ID and email — is cached locally under `acr.auth.account`, purely so the app knows *whose* workspace is open. No token, password, or secret is ever stored.

**Every required case**:

| Case | Behaviour |
|---|---|
| First-time sign-in | Consent screen shown once; folder created (§6); local data offered for migration (§20). |
| Returning user, same device | GIS re-requests a token silently where the browser allows it; otherwise one tap re-shows the account picker (no password ever asked — that's Google's, not this app's). |
| Sign-out | Token revoked via GIS, in-memory token discarded, `acr.auth.account` cleared. The app falls back to whatever local-only workspace existed before sign-in (§7) — nothing is deleted. |
| Sign in with a different account | Treated as switching workspace (§7) — the previous account's cached documents never appear under the new one. |
| Switching accounts on the same device | Same as above; a confirmation step warns if the outgoing account has unsynced changes still pending upload. |
| Revoked authorization (teacher removes access in their Google Account settings) | Next API call fails with 401/`invalid_grant`; app catches it, drops to "⚠ Sync needs attention," keeps working entirely offline, and prompts a re-sign-in — no data loss, no blocked editing. |
| Expired session | Same handling as revoked — silent retry first, visible prompt only if silent retry fails. |
| New device | Sign in → folder discovered by tag (§6) → full archive downloads automatically. |
| Lost device | Nothing device-specific to recover — the Drive copy is durable; sign in anywhere else. |
| Browser/session restart | `acr.auth.account` marker persists locally so the UI can show "Signed in as …" immediately; the access token itself is re-requested fresh (GIS handles this, typically silently). |

---

## 5. Google Drive scope — exactly what is requested and why

**Scope requested: `drive.file`.** This is Drive's narrowest, recommended-for-this-exact-use-case scope: it lets the app read and write **only files and folders the app itself created** (plus anything a teacher explicitly opens through a Drive file picker, which this app never uses). It cannot list, read, or modify anything else anywhere in the teacher's Drive, Gmail, Photos, or any other Google product.

**In-app explanation shown before/at the consent screen** (plain wording, no jargon):

> *"ACR Utility would like to create and manage a folder named 'ACR Utility' in your Google Drive, to keep your ACR records backed up and available on your other devices. It can only see and use files inside that folder — it cannot see, read, or change anything else in your Google Drive, Gmail, Photos, or any other Google service."*

Also requested: `email` and `profile` (or the equivalent OpenID Connect claims), solely to show "Signed in as name@example.com" — no other identity data is read.

*(Note on wording: Google's own scope classification lists `drive.file` as its lowest-friction Drive tier — requiring only Google's basic app verification rather than the heavier review process — but the important fact for this app is not that classification label, it's the narrow, self-created-files-only access boundary described above. That boundary is what actually protects a teacher's other Drive content, and it holds regardless of how the scope happens to be labelled. Verified directly against [Google's current Drive API scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).)*

---

## 6. Google Drive storage structure

```
My Drive
└── ACR Utility                      (created automatically, once, per Google account)
    ├── ACR 2026-27.acr.json
    ├── ACR 2025-26.acr.json
    ├── ACR 2024-25.acr.json
    ├── ACR 2023-24.acr.json
    ├── ...
    └── Backups
        ├── backup-2026-08-16T10-00.acrbak.json
        └── ...
```

- **One JSON file per ACR year**, not a subfolder per year — there is exactly one record per year, so a flat file keeps the folder simple to browse in Drive's own UI while still reading, at a glance, exactly like the tree above. Filenames follow the visible pattern `ACR <session>.acr.json` (e.g. `ACR 2024-25.acr.json`).
- **Robust identity, not filename-dependent**: every file also carries hidden Drive `properties` (`acrDocId`, `schemaVersion`, `appTag: 'acr-utility-year-file'`). The app always matches files by `acrDocId`, so a teacher renaming a file in Drive (or Drive silently appending "(1)" to a duplicate name) never breaks sync or creates a duplicate record.
- **Folder discovery**: the root folder is tagged `appTag: 'acr-utility-root'`. On every sign-in the app searches for that tag before creating a new one — so a folder created from a PC is found correctly when the teacher next signs in on a phone, without depending on the folder's display name staying "ACR Utility."
- **Backups subfolder**: written to only when the teacher presses **Export backup** while signed in (§13) — not on a background timer. No separate cron-like process needed.
- **All of this is automatic.** A teacher never creates a folder, names a file, or picks a location — the four "must not have to manually…" actions in your brief (create/select/upload/download/rename/sync files) are the app's job, not the teacher's, from first sign-in onward.

---

## 7. Data ownership & account isolation

- Google's own OAuth boundary is the primary guarantee: an access token is cryptographically scoped to the one Drive it was issued for. There is no shared backend where a misconfiguration could let Teacher A's token see Teacher B's folder — that entire class of bug is structurally impossible in this architecture, because there is no shared store to misconfigure.
- Locally, every cached document, index, and sync-state entry is **namespaced by the signed-in account's Google user ID**: `acr.<accountId>.doc.<id>`, `acr.<accountId>.index`, etc. A separate, unnamespaced area (`acr.local.*`) holds work created before any sign-in.
- Signing out clears the *active* pointer only — it does not delete the namespaced data, so signing back into the same account later restores it instantly without a re-download. Signing in as a **different** account never reads another account's namespace; the UI shows only the newly-signed-in account's years.
- Multi-teacher distribution requires no developer action per teacher: there is no account, database row, or config entry for you to create. A teacher's Google Sign-In *is* their account provisioning.

---

## 8. Local-first storage (unchanged core)

`localStorage` remains the source of truth for "what does the teacher see right now" — this is the part of the current app that already does the hard job correctly and is not being replaced. The only additions are:

- The account namespace prefix described in §7.
- A small per-document sync-state record (`{ driveFileId, driveModifiedTime, lastSyncedUpdatedAt }`) — tiny (well under 1 KB per year), stored the same way, needed so the sync cycle (§9) can tell what actually changed without re-reading everything.

No move to IndexedDB is proposed. The data is KB-scale and `localStorage` already handles it correctly today; introducing IndexedDB here would add complexity with no corresponding benefit (YAGNI). IndexedDB continues to exist solely for the optional linked-file handle (§14), unchanged.

---

## 9. Automatic synchronization

Reuses the existing debounce/merge logic in `sync.js` almost as-is; only the transport changes, from "write one linked file" to "read/write Drive files."

1. **Local save** — immediate, unchanged, exactly as today (§8).
2. **Change detection** — the existing 4-second post-edit debounce (`syncSchedule`) is kept.
3. **Cheap check before any content transfer** — one Drive `files.list` call scoped to the "ACR Utility" folder, requesting only `id, name, modifiedTime, properties` (no file contents). This tells the app which year-files changed remotely since the last known `modifiedTime`, and which local years have moved since `lastSyncedUpdatedAt` — so a typical sync tick with nothing new costs one tiny metadata call, not a bulk download.
4. **Selective transfer** — only years that actually differ get uploaded (`files.update`, small JSON body) or downloaded (`files.get` media). A teacher with ten archived years pays no extra bandwidth for the nine that didn't change.
5. **Merge** — identical rule to today's `mergeDocs()`: newest `updatedAt` wins per year, a never-edited copy never beats a real edit; see §12 for what changes when both sides were genuinely edited concurrently.
6. **Triggers**: after the debounce settles; when the tab/app regains focus (catches "edited on phone, then opened the laptop"); when the browser fires its `online` event; and the existing manual **Sync now** button, kept as a visible reassurance control.

---

## 10. Offline & poor-internet behaviour

Editing has **zero** dependency on network at any point — that guarantee doesn't change. Sync is strictly a background layer that can fail without affecting the ability to open, edit, save, preview, print, or generate Word/PDF for any year, old or new.

**Status chip — exactly this vocabulary, nothing more technical ever shown to a teacher:**

| Shown | Meaning |
|---|---|
| ☁ Synced | Every local year matches what's confirmed saved in Drive. |
| ↻ Syncing… | A sync call is in flight right now. |
| ⚠ Offline — saved locally | `navigator.onLine` is false, or the last attempt failed for a network reason. Your edits are safe on this device; nothing to do. |
| ⚠ Sync needs attention | Something needs a teacher's action — almost always "sign in again" (expired/revoked auth). Never shown for ordinary offline use. |

**Failure handling**: a failed Drive call marks only the affected year "pending" and retries with capped exponential backoff (a few seconds, then longer, settling at "retry on next edit/focus/online event") — never a tight retry loop, never a blocking spinner. Each year's sync write is one small, atomic JSON PATCH; a failed or interrupted upload leaves the previous Drive copy completely untouched (Drive doesn't accept a partial write as a new revision), so poor connectivity can delay a sync but cannot corrupt data on either end.

---

## 11. Permanent archive strategy

Per your explicit correction, the permanent archive **is the set of year-specific files in the "ACR Utility" folder** — nothing else is treated as the guarantee of long-term availability:

- Every year is its own file, forever, until a teacher explicitly deletes it. A new year is never written over an old one — they have different `acrDocId`s and different filenames by construction.
- New/replacement device: sign in → the folder is found (§6) → every year-file downloads and repopulates local storage automatically. **No manual import is needed to get old years back** — that path is reserved for the emergency case in §13.
- **Drive's built-in revision history** is real and free, but is treated here strictly as a *bonus*, incidental safety net — never the thing this design relies on. It is not configured, not depended on for retention length, and not surfaced as "the archive" anywhere in the UI or in this spec's guarantees.
- **Drive's Trash** is used only as a soft-delete buffer (§ below) — an extra 30-day undo window on top of the app's own explicit-delete confirmation, again never the primary archive.
- Deleting a year is a deliberate, explicit teacher action (unchanged from today); the corresponding Drive file is moved to Drive's Trash (not permanently erased) as that extra accident buffer, on top of local confirmation.

---

## 12. Conflict resolution

The existing per-year, `updatedAt`+`touched` merge rule already correctly handles the common case: two devices edited at different times, or one device is still holding an untouched starter copy. Google Drive sync introduces exactly one new failure mode versus the old single-linked-file model: **two devices both offline, both editing the *same year*, reconnecting near the same moment.**

For that specific case, the rule changes from "pick a winner" to **"never silently discard either side"**:

- A monotonic per-document revision counter (incremented on every local save, independent of wall-clock time) lets the merge step distinguish "one side is simply older" from "both sides were genuinely edited independently since they last agreed."
- When a true concurrent edit is detected, **both copies are kept** as separate records: the version already reconciled keeps the year's normal name; the other becomes a clearly labelled sibling, e.g. **`2024-25 — Conflict Copy`**, with its own `acrDocId` and its own Drive file.
- A one-time notice tells the teacher plainly: *"Two devices edited 2024-25 at the same time. Both versions were kept — open each, keep what you need, and delete the one you don't."* No merge UI is built; the teacher's normal open/compare/delete actions do the reconciling.
- This never happens silently and never destroys data — it only ever adds an extra, clearly-named record for the teacher to resolve at their convenience.

---

## 13. Manual backup / import — unchanged, independent of sign-in

Export Backup and Import Backup keep working exactly as they do today, entirely on local `localStorage` data, whether or not a teacher has ever signed in. This is the explicit fallback path for: Drive being unavailable, Google auth being unreachable, moving to a brand-new device without wanting to sign in first, or simple peace of mind.

One small addition, not a new control: while signed in, pressing **Export backup** also drops a timestamped copy into `ACR Utility/Backups/` in Drive — the same button, slightly richer behaviour. Automatic synchronization never depends on this button being pressed.

---

## 14. Existing linked-file sync — recommendation: coexist, deprecate later

Per your Section 8/21 framing (replace / coexist / migrate), the recommendation is **coexist now, reassess later** — not replace outright:

- **Why not replace immediately**: it is the *only* sync path that works with zero Google account at all, and some teachers may specifically prefer that (institutional policy, no personal Google account, etc.). Removing it removes real capability for that group with no equivalent replacement.
- **Why it doesn't need active maintenance to keep around**: it already operates purely on the same local `localStorage` documents Drive sync uses, through an independent code path (`sync.js`'s `SYNC` object) that Drive sync doesn't touch. The two can technically both be active for the same teacher without conflicting, though in practice a teacher would sensibly pick one.
- **What does change**: it stops being *the* answer to "how do I use this on two devices" in the documentation and UI — Google Sign-In becomes the recommended, default path; the linked-file option moves to an "Advanced" section, clearly labelled "desktop only, no Google account required."
- **Migration note**: no data migration is needed between the two mechanisms — both read/write the same underlying `localStorage` documents; a teacher can switch from one to the other at any time without an export/import step.
- Revisit fully retiring it only after Drive sync has real usage history and you're satisfied it covers the cases that matter.

---

## 15. Security & privacy model

- **No shared datastore.** There is no backend, no database, nowhere that more than one teacher's data is ever present in the same place outside of Google's own infrastructure (which already isolates one Google account's Drive from another's — that's Google's job, not this app's).
- **Narrow scope** (§5): the app cannot read anything in a teacher's Drive/Gmail/Photos outside the one folder it created.
- **Tokens**: access tokens live in memory only, for the life of the tab; never written to `localStorage`, `IndexedDB`, cookies, or any log. Nothing about the token is recoverable by reading the device's storage after the tab closes.
- **Account switching / logout**: covered in §4/§7 — namespacing by account ID means a signed-out or switched-away account's cached documents are never rendered under a different signed-in identity.
- **Revoked authorization**: handled as an ordinary, non-destructive error state (§4/§10) — never a crash, never silent data loss, never a block on local editing.
- **No personal data in the public build**: the hardcoded seed ACR is removed from the path every new install takes (§20); a personal copy of your own data is something only your own deployment carries, never the shared codebase.
- **Attribution contains no personal contact detail** (§3) — name and role only.
- **Transport**: all Drive/Google calls are HTTPS to Google's own endpoints; nothing is ever sent to any server this project controls, because none exists.
- **URLs cannot leak data**: Drive files created under `drive.file` are private to the creating app + account by default — knowing a file's ID grants no access without a valid, scoped access token issued to that same account.

---

## 16. PC / Android / iPhone compatibility

| Capability | Windows (Chrome/Edge) | Android (Chrome) | iPhone/iPad (Safari) |
|---|---|---|---|
| Google Sign-In (GIS popup) | ✅ | ✅ | ✅ — GIS is designed to work across major mobile browsers, including Safari; a real tap-triggered popup (not a background auto-popup) is used throughout, which avoids Safari's popup blocker | 
| Drive API calls | ✅ (plain HTTPS `fetch`, no special browser API needed) | ✅ | ✅ — this is precisely what fixes today's Android/iPhone sync gap, which exists *only* because linked-file sync depends on the File System Access API that these browsers don't implement |
| `localStorage` editing/persistence | ✅ | ✅ | ✅, with the same existing caveat already documented in `HOW-TO-USE.md`: open from the Files app, not an email/preview context, or Safari may not persist storage between sessions |
| Linked-file sync (§14, unchanged) | ✅ | ❌ (no File System Access API) | ❌ (no File System Access API) — unchanged from today; this is exactly why it remains an "Advanced, desktop-only" option rather than the default |
| Printing / PDF | ✅ browser print dialog → "Save as PDF" | ✅ print sheet → "Save as PDF" | ✅ print preview → pinch-to-expand → share → Save PDF (existing, documented flow, unaffected by this change) |
| Word (.docx) download | ✅ | ✅ (open via Files app with Word/Docs app) | ✅ (existing, documented flow, unaffected) |
| Install as an app | Chrome "Install app" | Chrome "Add to Home screen" | Safari "Add to Home Screen" |

No feature in this design assumes desktop-only browser behaviour; the entire point of moving from File System Access to the Drive REST API is that plain HTTPS calls behave the same on all three platforms.

---

## 17. Verified current facts vs. this spec's assumptions

Everything below was checked directly against current Google/GitHub sources during this planning session (not carried over from prior knowledge):

| Fact | Verified detail | Source |
|---|---|---|
| GIS is mandatory, not optional | Legacy Google Sign-In JS library fully retired 31 Mar 2023 | [Google Developers Blog](https://developers.googleblog.com/discontinuing-authorization-support-for-the-google-sign-in-javascript-platform-library/) |
| `drive.file` scope boundary | Grants access only to files created by the app, or explicitly opened by the user via a picker; nothing else in the user's Drive | [Drive API scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) |
| `drive.file` verification tier | Google's own classification lists it at its lowest-friction tier, requiring only basic app verification rather than the sensitive/restricted review process | [Drive API scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) |
| Testing-mode cap | Apps not yet verified/published are capped at 100 test users; each test user's authorization expires 7 days after consent and must be re-granted | [Manage App Audience](https://support.google.com/cloud/answer/15549945) |
| When verification isn't required | Not required for personal use under 100 users, or while in Testing/staging with test users added explicitly | [When verification is not needed](https://support.google.com/cloud/answer/13464323) |
| Drive API quota (current, post-May-2026 unit model) | 1,000,000 units/minute per project; 325,000 units/minute per user; 400,000,000 units/day per project — a basic read costs 5 units, an edit 50 | [Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits) |
| Drive storage free tier | 15 GB per Google account, shared across Gmail/Drive/Photos | Current Google account storage policy (multiple 2026 sources) |
| GitHub Pages | Free HTTPS by default; soft limits ~1 GB repo size, ~100 GB bandwidth/month — soft-throttled, not billed, if exceeded | GitHub Pages documentation |

This app's realistic usage — a handful of KB per teacher per year, occasional saves — sits many orders of magnitude below every one of these ceilings.

---

## 18. Cost estimate

| Item | Cost at personal scale | Cost distributed to, say, 50–100 teachers |
|---|---|---|
| Google Identity Services | $0 — no charge exists for authentication itself | $0 |
| Google Drive API calls | $0 — free API, governed only by the quotas in §17, nowhere near reached | $0 |
| Google Drive storage | $0 — each teacher's data (KBs/year) uses their own free 15 GB, not any storage you provide or pay for | $0 |
| GitHub Pages hosting | $0 | $0 — a static file has no per-user cost |
| Google Cloud project (OAuth client) | $0 — creating a project and an OAuth client ID is free | $0 |
| OAuth verification (once >100 users) | N/A while under 100 | $0 — basic verification (the tier `drive.file` requires) has no fee; only requires a privacy-policy URL and some review turnaround time |
| **Total** | **$0** | **$0**, plus your own time for the one-time Cloud Console setup and (only if scaling past 100 teachers) the basic-verification submission |

There is no growth-triggered cost cliff in this architecture — the only thing that changes above 100 users is a one-time (free) verification step, not a bill.

---

## 19. Distribution model

- **Hosting**: `build.py`'s existing output is published as the site root of a GitHub Pages deployment (e.g. `https://<you>.github.io/acr-utility/`) — GitHub Pages hosts the **application code only**; no teacher's ACR data is ever written to, or readable from, the GitHub repository. All ACR content lives exclusively in each teacher's own Drive and their own device storage.
- **Two builds from one source**, both carrying the attribution in §3:
  1. The hosted Pages build — sign-in available, Drive sync available.
  2. The same `ACR-Utility.html` single-file download — sign-in button simply isn't usable from `file://` (Google blocks that origin outright; this is a hard platform rule, not a choice), so this build quietly falls back to the linked-file/export-import options only, exactly like today.
- **One-time Google Cloud Console setup (you, not code)**:
  1. Create a Google Cloud project.
  2. Configure the OAuth consent screen: app name "ACR Utility," your support email, scopes = `drive.file` + `email`/`profile`.
  3. Create an OAuth 2.0 Client ID, type "Web application."
  4. **Authorized JavaScript origins**: add the exact GitHub Pages origin (e.g. `https://<you>.github.io`) and `http://localhost:<port>` for local testing. *(Verified: origins must be exact, HTTPS in production, and only origins you control — [Google's OAuth JS guide](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow).)* No separate "redirect URI" flow is needed for GIS's token-client popup approach used here.
- **Rollout path**: while the consent screen is in "Testing," add each teacher's email as a test user in Cloud Console (up to 100, each re-consenting every 7 days — fine for a small pilot group). Move to "In production" + submit for Google's basic verification only once you're distributing beyond that pilot; this removes both the 100-user cap and the weekly re-consent requirement.

---

## 20. Migration strategy — no existing data at risk

- Nothing about existing installs changes by default. Sign-in ships as an added, opt-in button; a teacher who never presses it keeps exactly today's app, unchanged, including linked-file sync and export/import.
- **First sign-in on a device that already has local ACR data** triggers a one-time, explicit prompt:
  > *"Existing ACR data found on this device. Would you like to add it to your Google account?"*
  Approving copies the existing `acr.local.*` documents into the newly-signed-in account's namespace (§7) and begins syncing them to Drive; declining leaves local data exactly as it was, still fully usable, just not yet linked to the account. Nothing is ever deleted by this step.
- **Personal seed removal**: before any public build ships, `seedDoc()`'s hardcoded personal data is removed from the default/no-data code path — a brand-new install with no local data and no sign-in starts genuinely blank. Your own personal ACR history moves to being *your* deployment's data (delivered via your own Drive sign-in or a private import), never part of the shared codebase.
- **Schema**: no breaking change to `blankDoc()`/`SCHEMA_VERSION` is required for this migration; the existing `migrate()` upgrade path is reused unchanged for any future schema bump.

---

## 21. Implementation phases

1. **Attribution & seed cleanup** (small, low-risk, ships value immediately): add the developer credit (§3); remove personal seed data from the default path (§20), gated behind your own private way of loading your personal history back for your own use.
2. **Google Cloud + GIS wiring**: one-time Console setup (§19); add the Sign-In button and GIS token flow (§4), account-marker storage (§4/§7), no Drive calls yet — verify sign-in/sign-out/switch-account/revoke behave correctly in isolation.
3. **Drive folder + single-year read/write**: folder find-or-create (§6), upload/download for one document, manual "Sync now" only — no automatic triggers yet, so behaviour stays easy to observe.
4. **Automatic sync engine**: debounce, metadata-diffing, triggers (§9), the four-state status chip (§10).
5. **Conflict handling**: concurrent-edit detection and conflict-copy creation (§12) — deliberately last among the sync work, since it only matters once the rest is solid.
6. **Migration prompt + account namespacing polish** (§7/§20), full pass through every case in §4's table.
7. **GitHub Pages deployment** (§19) + the parallel downloadable-build path, end-to-end on real Windows/Android/iPhone devices.
8. **Docs**: update `HOW-TO-USE.md` to describe the new sign-in path as the default, linked-file sync as "Advanced."

Each phase is independently testable and shippable; nothing later in the list is required for an earlier phase to be useful on its own.

---

## 22. Risks & limitations

- **iOS Safari session behaviour**: Safari's tracking-prevention rules can make "silent" reauthentication less reliable than on Chrome; the fallback is simply a visible one-tap sign-in prompt rather than a fully invisible refresh — never a data-loss risk, just an occasional extra tap.
- **Testing-mode friction before verification**: up to 100 pilot teachers must be added individually as test users and re-consent every 7 days until you submit for basic verification — a real but temporary and free-to-resolve limitation (§19).
- **Whole-document conflict granularity**: conflicts are resolved at the year level, not per-field — acceptable given ACR years are edited by one person and conflicts should be rare, but a teacher who genuinely edited the same year from two offline devices will need to manually reconcile two full copies (§12), not just a couple of fields.
- **Drive account required for sync**: a teacher without any Google account is limited to the existing linked-file/export-import paths (§14) — an inherent tradeoff of "use your normal Gmail account," not a bug.
- **GitHub Pages is a soft-limited free service**: extremely unlikely to matter at this scale (§17), but it is not a contractually guaranteed SLA — acceptable for this use case.
- **This spec does not implement "lock completed years read-only"** from the original brief — deliberately deferred as a separate, later UX proposal, not bundled into this already-large sync change.

---

## 23. Testing strategy

- **Unit-level** (extends the existing `tests/api-rules.test.js` pattern, no new dependency): pure-function tests for the merge/conflict logic (§9/§12) — feed synthetic local/remote document pairs through the merge function and assert on winner selection and conflict-copy creation, exactly as `mergeDocs()` is already structured to be tested today.
- **Manual cross-device pass**, run on real hardware for every phase in §21:
  - Windows Chrome + Windows Edge
  - Android Chrome
  - iPhone Safari (and iPad Safari)
- **Scenario walkthroughs**, each performed end-to-end at least once before calling a phase done: every row of §4's authentication table, the full offline→online sync recovery cycle (§10), a deliberate two-device concurrent edit (§12), and a full delete→Drive-Trash→recover pass.
- **Regression pass on unrelated functionality**: preview, print, Word generation, and API scoring for at least one archived year, confirmed unchanged before and after this work — since this spec touches none of that code, but "confirm it's still true" is cheap insurance for a change this size.

---

## 24. Acceptance criteria

The implementation is done when every one of these is true, demonstrated on real devices (not just local dev):

1. **First Google sign-in** — a teacher with no prior ACR data can sign in and land in a working, blank ACR Utility.
2. **Drive authorization** — the consent screen shows only the `drive.file` (+ identity) request, with the plain-language explanation from §5.
3. **First-device migration** — an existing install with local data, on first sign-in, is offered and can accept "add this device's ACR data to your Google account" (§20), with nothing deleted regardless of the teacher's choice.
4. **New-device restoration** — signing in on a second, previously-unused device automatically restores the complete year archive with no manual import.
5. **Offline editing** — with network disabled, a teacher can open, edit, save, switch years, preview, print, and generate Word/PDF for any year, old or new.
6. **Poor internet** — a simulated slow/flaky connection never blocks editing; sync retries later without hammering the API or freezing the UI.
7. **Automatic synchronization** — an edit made on one device appears on a second device (same account) without any manual sync action beyond normal use.
8. **Two-device concurrent editing** — both devices offline, both edit the same year, both reconnect: neither edit is silently lost.
9. **Conflict preservation** — the scenario above produces a clearly labelled `— Conflict Copy` record rather than an overwrite, with a teacher-facing notice.
10. **Previous-year retrieval** — selecting any archived year (including one never touched on the current device) opens that exact year's data.
11. **Previous-year printing** — any archived year can be previewed and printed, reproducing the saved record accurately.
12. **PDF generation** — works identically for the current year and any archived year.
13. **Word generation** — works identically for the current year and any archived year.
14. **Account switching** — signing out and into a different Google account on the same device shows only the new account's data; no trace of the previous account's years is visible.
15. **Logout** — clears the active session/token; local data for that account remains intact and reappears on next sign-in.
16. **Revoked authorization** — revoking access from the teacher's own Google Account settings results in a graceful "⚠ Sync needs attention" state, with editing still fully functional.
17. **Manual backup/recovery** — Export/Import Backup work with no Google account signed in at all, unchanged from today.
18. **Clean installation for a new teacher** — a brand-new install, before any sign-in, shows no trace of your personal seed data anywhere, and the developer attribution (§3) is present and correctly worded.
