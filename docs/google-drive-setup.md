# Setting up Save to Google Drive and Share / Email

The two buttons stay hidden until `google-config.js` holds your own OAuth Client ID. This is a one-time setup and it is free.

1. Open https://console.cloud.google.com/ and create a project (for example "ACR Utility").
2. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**.
3. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform → Branding / Audience"):
   - User type **External**. In the newer console you choose External under **Audience** (or in the "Get started" wizard).
   - App name "ACR Utility", your support email, and the developer contact email.
   - **Data access / Scopes**: add `.../auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). It is a non-sensitive scope, so Google needs no review.
   - **Audience**: click **Publish app** (status "In production"). While it is in "Testing", only the test users you list can sign in.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins**: `https://<your-github-username>.github.io` and `http://localhost:8765`. Give only the scheme and host, with no path and no trailing slash.
   - No redirect URIs are needed.
5. Copy the Client ID (`....apps.googleusercontent.com`) into `google-config.js`:
   `export default { clientId: '1234-abc.apps.googleusercontent.com' };`
   The Client ID file is always fetched fresh, so no extra step is needed for it. But whenever you change any other app file, also change `CACHE` in `sw.js` (for example to `acr-utility-v0-11`) so phones pick up the new version.
6. Publish to GitHub Pages as usual.

**What a teacher sees the first time:** a Google window asking to let "ACR Utility" see, edit, create and delete only the Drive files it uses. After they allow it:

- **Save to Google Drive** creates the folder "ACR Utility - Word and PDF" in their Drive (v0.4 used "ACR Utility" for its sync files) with `ACR_<name>_<session>.docx` and `.pdf`. Saving again replaces them.
- **Share / Email** opens the phone's share menu with both files attached. They pick Gmail and send it to themselves.

**Privacy:** once the Client ID is set, the page loads Google's sign-in script (accounts.google.com) on each visit so the sign-in pop-up opens instantly; nothing is sent to Google until the teacher taps Share or Save. The files go only to the teacher's own Drive and their own share target. The app can see only files it created. The temporary Google Doc used to make the PDF is deleted straight away, and no data passes through any other server.
