// File names for the Word file and PDF: ACR_<name>_<session>.<ext>.
const part = (s, fallback) => String(s ?? '').replace(/[^\p{L}\p{M}\p{N}.-]+/gu, '_').replace(/^_+|_+$/g, '') || fallback;

export function acrFileName(d, ext) {
  return `ACR_${part(d?.profile?.fullName, 'noname')}_${part(d?.session, 'draft')}.${ext}`;
}
