# Keep the draft in Google Drive (continue on another device) — design

Date: 2026-10-04. Status: draft for the user's review.

## Goal

A teacher who fills part of the ACR on one device (PC) can continue on another device (phone, laptop) and find
everything already filled in, without remembering to export anything.

## User decisions

- **Saving to Drive is automatic** once the teacher has switched it on with one tap. There is no separate save
  button to remember.
- This spec is written first; building starts after the user approves it.

## What the teacher sees

1. **Switching it on (once per device).** A **"Keep my draft in Google Drive"** button in the top bar, next to
   Text style and Preview.
   - The teacher taps it and signs in with Google. It is the same sign-in and the same `drive.file` permission
     that Share and Save to Google Drive already use. No new permission is asked for.
   - The button then reads **"Drive: saved 10:42"**, showing the time of the last save.
   - Tapping it again opens a small menu:
     - **Save now**
     - **Check Drive for a newer copy**
     - **Stop keeping in Drive (on this device)**
2. **Automatic saving.** While it is on, every change is saved on the device straight away, as today.
   - About 5 seconds after the teacher stops typing, the current record is also saved to Drive.
   - It is saved again when the page is hidden or closed, where the browser allows this.
3. **On another device.** The teacher opens the app and taps **"Keep my draft in Google Drive"**, signing in
   with the same Google account. The app then compares the Drive copies with what is on this device, for each
   ACR session (2025-26, 2026-27, …).
   - **Only Drive has it, or the Drive copy is newer and this device has not changed since it last synced.**
     The app loads the Drive copy.
     - If this device has any filled-in data for that session, it asks first: "A newer copy of 2025-26 from
       Drive (saved 4 Oct, 17:20 on another device) is available. Load it? Your copy on this device was last
       changed 3 Oct, 11:05." The choices are **Load from Drive** and **Keep this device's copy**.
   - **Both changed since they last agreed** (edited on two devices). The app always asks and shows both dates.
     Whichever copy is not chosen is **kept**, not deleted: it is saved in Drive as
     `ACR draft 2025-26 (other copy, 4 Oct 17-20).acr.json`, so nothing is lost.
   - **This device is newer.** The app saves it to Drive.
4. **When the sign-in runs out.** Google's sign-in lasts about an hour, and the browser only allows renewing it
   after a tap.
   - When it runs out, the button turns amber: **"Drive: tap to reconnect"**.
   - Work keeps being saved on the device as always. One tap reconnects, and the pending save goes to Drive.
   - The app never opens a Google pop-up without a tap.
5. **Offline.** Everything keeps working and saving on the device. The button reads "Drive: offline, will save
   later", and the save goes to Drive when the device is back online and signed in.

## What is stored, and where

- **In Drive.** One file per ACR session in the teacher's own folder **"ACR Utility - Word and PDF"** (the same
  folder as the Word and PDF copies):
  - `ACR draft 2025-26.acr.json`
  - `ACR draft (no session).acr.json` for an unnamed draft
  - The content is the same JSON as **Export Draft**, plus `savedAt`, `deviceLabel` (for example "Windows –
    Chrome") and a `contentHash`.
  - Saving again replaces the file, as Save to Google Drive does with the Word file.
- **On the device**, in addition to today's records:
  - `acrUtility:drive:on` — Drive keeping is switched on for this device.
  - `acrUtility:sync:<session>` — the `contentHash` and Drive file id from the last time this session agreed
    with Drive.
- **"Changed since last sync"** is decided by the content, not the clock: a hash of the record without
  `savedAt` and without `ui` (the open tab). Opening a record on a device does not count as a change.
- The Google sign-in token stays in memory only, as now. Nothing goes to any server of ours.

## Building blocks

- **`google_drive.js`** — two additions, using the existing tested helpers:
  - `listFiles(folderId, prefix)` lists the draft files.
  - `downloadText(fileId)` downloads one.
  - `upsertFile` already handles the save.
- **New `draft_sync.js`** holds the decisions as pure functions without browser code, so they can be unit-tested:
  - `contentHash(record)`
  - `decide({local, localSync, remote})` returns one of `load` / `ask-load` / `ask-conflict` / `upload` /
    `nothing`
  - `driveName(session)`
- **`app.js`** handles:
  - the top-bar button and its small menu
  - the debounced auto-save, about 5 seconds after typing stops
  - the dialogs
- **`index.html` / `styles.css`** — the button and the dialog.
- **`privacy.html`** — one line added: "If you switch on 'Keep my draft in Google Drive', your draft is also
  saved as a file in your own Drive folder."
- **`sw.js`** — the new module is added to the cached files and the cache version is bumped.

## Safety rules

- The device copy is **never** overwritten without asking if it has real data that Drive does not have.
- The copy that loses a conflict is always kept, as an "other copy" file in Drive.
- A failed Drive save never blocks typing. It shows on the button and is retried on the next save or reconnect.
- "Stop keeping in Drive" only stops the syncing. It deletes nothing, on the device or in Drive.

## Testing

- **Unit tests for `draft_sync.js`.** Every case of `decide`:
  - only Drive
  - only device
  - Drive newer while the device is unchanged since last sync
  - both changed
  - device newer
  - equal content
  - an unnamed draft

  Plus `contentHash` ignoring `savedAt` and `ui`.
- **Unit tests for the new `google_drive.js` helpers**, with a fake `fetch`, in the same style as the existing
  tests.
- **Browser checks on localhost**, using two separate browser profiles as "two devices":
  - fill on A, then open on B
  - edit on both to get the conflict dialog, and confirm the other copy is kept
  - offline behaviour
  - the reconnect after sign-in expiry
- **A real check on the live site**: the user on PC and phone with their own Google account.

## Out of scope

- Live, simultaneous editing on two devices; it is one teacher at a time.
- Importing drafts from the earlier v0.4 Drive sync. That migration is a separate item.
- Sharing a draft with anyone else.
