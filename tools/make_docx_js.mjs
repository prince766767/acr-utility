// Builds an ACR Word file with the app's engine (docx_engine.js), for the parity test with generate_acr.py.
// Usage: node tools/make_docx_js.mjs <record.json> <out.docx>
// Exit code 2 with the problems as JSON on stdout when the record has problems (no file written).
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { generateDocx, ProblemsError } from '../docx_engine.js';

const [, , inPath, outPath] = process.argv;
const data = JSON.parse(readFileSync(inPath, 'utf8'));
const template = readFileSync(new URL('../ACR_EMPLOYEE_MASTER.docx', import.meta.url));
try {
  writeFileSync(outPath, await generateDocx(data, template, { JSZip, DOMParser, XMLSerializer }));
} catch (err) {
  if (err instanceof ProblemsError) {
    process.stdout.write(JSON.stringify(err.problems));
    process.exit(2);
  }
  throw err;
}
