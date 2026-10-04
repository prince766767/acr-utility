# Save to Google Drive and Share / Email the filled ACR — design

Date: 2026-10-04. Status: approved in brainstorming, awaiting spec review.

## Goal

A teacher who has filled the ACR can, from the Review tab:

1. **Save a copy in their own Google Drive**: the Word file and a PDF.
2. **Mail a copy to themselves** as a PDF and a DOCX.

The app stays a static page with no server of ours. Everything runs in the browser.

## User decisions

| Topic | Decision |
|---|---|
| Email | System **share sheet** (Web Share API) with both files attached; the user picks Gmail/Outlook and sends it to themselves. No Gmail API, no mail server. |
| PDF source | **Google converts it**: the DOCX is uploaded to the user's Drive as a temporary Google Doc and exported as a PDF, then the temporary Doc is deleted. |
| Drive contents | DOCX + PDF in a folder **"ACR Utility"**. Saving the same record again **replaces** those files. |
| Sign-in | **Google Identity Services (GIS) token client**, scope `https://www.googleapis.com/auth/drive.file` only. Not Firebase. |
| Header button | The unused Firebase "Sign in with Google" / "Sign out" buttons in the header are **hidden** (code kept for the later cloud-sessions work). |
| Hosting | **GitHub Pages** (`https://<user>.github.io/...`), plus `http://localhost:8765` for testing. |
| File name | `ACR_<name>_<session>` for all three buttons (Download, Share, Drive). |

## What the user sees

These sit in the existing `.docx-box` in the Review tab:

- **Download Word file (.docx)**: works as today, except it uses the new file name.
- **Share / Email (DOCX + PDF)**
  1. Makes the DOCX (offline).
  2. Gets a Google token. The first time, Google's consent popup appears.
  3. Makes the PDF through Drive.
  4. Calls `navigator.share({files:[docx,pdf], title})`.
  - If sign-in is cancelled or fails, or the PDF fails (for example, no internet), the status line says why and a button **"Share the Word file only"** appears. It shares just the DOCX.
  - If `navigator.canShare({files})` is false, the app downloads both files and says: "This browser can't attach files to a share; both files were downloaded. Attach them to an email yourself."
  - If the user cancels the share sheet (`AbortError`), nothing is reported as an error.
- **Save to Google Drive**
  1. Makes the DOCX.
  2. Gets the token.
  3. Finds or creates the folder "ACR Utility".
  4. Makes the PDF.
  5. Uploads both files, replacing any files of the same name in that folder.
  - The status line then shows "Saved to Google Drive" with a link to open the folder (`https://drive.google.com/drive/folders/<id>`) in a new tab.
- **When the buttons can be used:** both new buttons follow the same rule as Download. They are disabled while `renderFieldProblems` lists problems, with the same reason text. They are **not rendered at all** when `google-config.js` still holds the placeholder Client ID.
- **Status while working:** the status line shows the current step ("Making the Word file…", "Signing in to Google…", "Making the PDF…", "Uploading…"). Buttons are disabled while a job runs, so a double tap can't start two jobs.
- The **"Make a PDF or print on a phone"** help stays, as the offline route. One line is added: "Or use Share / Email or Save to Google Drive above (needs internet and a Google account; the PDF is made by Google Docs and may differ slightly from Word)."

## File name

Built as `ACR_<name>_<session>.<ext>`:

- `<name>` is the profile full name and `<session>` is the session.
- In each part, any run of characters other than letters, digits, `-` and `.` becomes a single `_`, and leading or trailing `_` are trimmed.
- An empty part falls back to `noname` or `draft`.
- Example: `ACR_Ravi_Kumar_2025-26.docx`.

One function `acrFileName(d, ext)` in `file_names.js` makes the name, and all three buttons use it.

## Code structure

### `google-config.js` (new)

```js
// Replace with the OAuth Client ID from Google Cloud (see docs/google-drive-setup.md).
export default { clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com' };
```

### `google_drive.js` (new, ES module, no DOM access except loading the GIS script)

The network functions take `fetch` and `token` as parameters, so tests can pass a fake `fetch`.

- **`loadGis()`**
  - Injects `https://accounts.google.com/gsi/client` once.
  - Resolves when `google.accounts.oauth2` exists.
  - Rejects after 15 s with "Google sign-in could not be loaded (are you online?)".
- **`getToken(clientId)`**
  - Keeps one `initTokenClient({client_id, scope: drive.file, callback})`.
  - Calls `requestAccessToken({prompt:''})`.
  - The token is cached **in memory only**, with its expiry, and reused until 60 s before it expires.
  - It rejects if the user closes the popup or refuses consent.
  - The token is never written to localStorage or any other browser storage.
- **`ensureFolder(fetch, token)`**
  - Calls `files.list` with `q = name='ACR Utility' and mimeType='application/vnd.google-apps.folder' and trashed=false`.
  - Returns the first id, or creates the folder.
  - With `drive.file`, the app sees only a folder it created itself. That is intended.
- **`upsertFile(fetch, token, {name, bytes, mime, folderId})`**
  - Lists `name='<name>' and '<folderId>' in parents and trashed=false`. Quotes in the name are escaped.
  - If found, it does a media `PATCH` (`uploadType=media`) on the first match and trashes any further duplicates.
  - Otherwise, it does a multipart `POST` (`uploadType=multipart`) with metadata `{name, parents:[folderId]}`.
  - Returns `{id, name}`.
- **`docxToPdf(fetch, token, docxBytes)`**
  1. Multipart upload of the DOCX with metadata `{name:'ACR temp (safe to delete)', mimeType:'application/vnd.google-apps.document'}`, which makes Google convert it.
  2. `GET files/<id>/export?mimeType=application/pdf` returns the PDF bytes.
  3. `DELETE files/<id>` runs in a `finally`, so the temporary Doc is deleted even when the export fails. A failed delete is logged, not thrown.
- **Errors:** a non-2xx reply throws `DriveError(status, message)`, where the message comes from Google's JSON `error.message`. A 401 clears the cached token and retries once, which forces a new sign-in.

### `share.js` (new)

`shareFiles(files, {title})` takes `files` as an array of `File` objects.

- If `navigator.canShare?.({files})` is true, it calls `navigator.share({files, title})` and returns `'shared'`.
  - `AbortError` returns `'cancelled'`.
- Otherwise it downloads each file through the same `<a download>` method as today and returns `'downloaded'`.

### `app.js` changes

- Extract `makeDocx(d)`. It fetches the template, calls `generateDocx` and returns `{bytes, name}`. The Download button uses it, unchanged apart from the name.
- Import `acrFileName(d, ext)` from `file_names.js`.
- Add the Share and Drive click handlers. They use `makeDocx`, `getToken`, `docxToPdf`, `ensureFolder`, `upsertFile` and `shareFiles`, and show the step texts and errors in `#docxStatus`.
- Add the "Share the Word file only" fallback button.
- Hide the header buttons:
  - `signInBtn` and `signOutBtn` get the `hidden` class in `index.html`.
  - The Firebase `onAuthStateChanged` handler must not un-hide them. Its `classList` toggles are wrapped so they run only when a new `const SHOW_FIREBASE_SIGNIN=false` flag is true.

### `index.html`

- The two new buttons and the fallback button go in `.docx-box`.
- The help line about the new route is added.
- The header buttons get `hidden`.

### `sw.js` (bug fix that this feature needs)

Today the fetch handler caches **every** GET, including other websites. That would store Drive replies, which hold the teacher's data, in the cache, and serve stale `files.list` results.

The new rule:

- **Same-origin** requests use cache-first, as today.
- **`https://www.gstatic.com/firebasejs/`** stays cache-first. `app.js` imports Firebase from there at module load, so the app would break offline without it.
- **Everything else** (`googleapis.com`, `accounts.google.com`, …) is not intercepted at all: no `respondWith`, so the browser fetches it normally.
- Add `./google-config.js`, `./google_drive.js`, `./share.js`, `./file_names.js` and `./sw_rules.js` to `ASSETS` and bump `CACHE` to `acr-utility-v0-8`.

### `docs/google-drive-setup.md` (new)

Step-by-step setup for the user:

1. Create a Google Cloud project.
2. Enable the **Google Drive API**.
3. Set up the OAuth consent screen: External, app name, support email, scope `drive.file`. `drive.file` is non-sensitive, so no Google verification is needed, but the app should still be published so the consent screen is not limited to listed test users.
4. Create an OAuth Client ID of type "Web application" with these Authorized JavaScript origins:
   - `https://<user>.github.io`
   - `http://localhost:8765`
5. Paste the Client ID into `google-config.js`.

The notes also say what a teacher sees on first use.

## Privacy

- The DOCX and PDF go only to the signed-in user's own Drive and their own share target.
- The app's permission covers only files it created.
- The temporary Google Doc is deleted right after the export.
- Tokens are kept in memory only.
- No data passes through any server of ours.

## Testing

**Unit tests (`node --test`).** A new `tests/google_drive.test.js` uses a fake `fetch` that records each request and its replies. It checks:

- `ensureFolder` reuses an existing folder and creates one only when none is found.
- `upsertFile` PATCHes when the file exists, POSTs when it doesn't, trashes extra duplicates, and escapes quotes in the name.
- `docxToPdf` returns the export bytes, deletes the temporary Doc on success, **and on export failure**, and does not hide the export error when the delete also fails.
- A 401 triggers exactly one retry with a new token.
- `DriveError` carries Google's message.

A new `tests/share.test.js` checks:

- The share path returns `'shared'`.
- `AbortError` returns `'cancelled'`.
- No `canShare` support returns `'downloaded'`.

A new `tests/file_names.test.js` checks that `acrFileName` sanitizes the name and handles empty parts. `acrFileName` lives in a new module `file_names.js`, which `app.js` imports and `sw.js` caches.

A service-worker test checks the routing rule: same-origin and `gstatic/firebasejs` are handled, while `googleapis.com` and `accounts.google.com` are not. For that, the routing decision is a pure function `shouldCache(url, origin)` in a new classic script `sw_rules.js`. `sw.js` loads it with `importScripts('sw_rules.js')`, and the test evaluates the same file with `node:vm`.

Existing suites (81 JS, 55 Python) must still pass. `generate_acr.py` and `docx_engine.js` are not changed, so parity is unaffected.

**Manual end-to-end check (after the user creates the Client ID):**

1. Localhost, with the user's approval before starting the server:
   - sign in
   - Save to Drive twice, then confirm in Drive that there is exactly one DOCX and one PDF and that the temporary Doc is gone
   - Share on a PC browser (Chrome or Edge on Windows supports file sharing)
   - the share fallback in Firefox
   - offline: the Download button still works and the new buttons give clear messages
2. GitHub Pages: repeat on a real Android phone and an iPhone.

**PDF layout check.**

- Export the demo record's PDF through Google, render it with `pdftoppm`, and compare all pages with `UGC_ACR_Form.pdf` and with the Word-made PDF.
- If Google's layout breaks the form (pages shifting, tables split badly), stop and report to the user before going further. Do not ship it quietly.

## Out of scope

- Gmail API sending, any mail server, or typing an email address in the app.
- Making a PDF offline or without Google.
- Loading drafts from Drive or syncing records. That stays with the later cloud-sessions item.
- Removing the Firebase code.
