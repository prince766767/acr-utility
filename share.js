// Hand files to the system share sheet (Gmail, Outlook, ...) or, where a browser can't share files, download them.
export function downloadFile(file, doc = document) {
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export async function shareFiles(files, { title } = {}, env = {}) {
  const nav = env.navigator ?? globalThis.navigator;
  const download = env.download ?? (f => downloadFile(f));
  const attempt = async list => {
    try { await nav.share({ files: list, title }); return 'shared'; }
    catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'needs-tap';
      throw err;
    }
  };
  if (nav?.canShare?.({ files })) return attempt(files);
  // Chromium shares only some types (PDF yes, Word no): share what it accepts, download the rest.
  const ok = files.filter(f => nav?.canShare?.({ files: [f] }));
  if (ok.length) {
    const result = await attempt(ok);
    if (result !== 'shared') return result;
    for (const f of files) if (!ok.includes(f)) download(f);
    return 'partial';
  }
  for (const f of files) download(f);
  return 'downloaded';
}
