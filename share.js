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
  if (nav?.canShare?.({ files })) {
    try { await nav.share({ files, title }); return 'shared'; }
    catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'needs-tap';
      throw err;
    }
  }
  for (const f of files) download(f);
  return 'downloaded';
}
