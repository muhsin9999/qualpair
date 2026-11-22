// Converts a few Zhang (2026, CC BY 4.0) transcripts into public/sample/interviews.json.
// Usage: node tools/build-sample.mjs <raw-dir> <count>
import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';

const [dir, countArg] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.docx')).sort((a, b) => parseInt(a) - parseInt(b));
const out = [];
for (const f of files.slice(0, Number(countArg ?? 6))) {
  const { value } = await mammoth.extractRawText({ path: path.join(dir, f) });
  const text = value.replace(/\n{2,}/g, '\n').trim();
  out.push({ file: f, title: f.replace(/\.docx$/, ''), text, words: text.split(/\s+/).length });
}
fs.mkdirSync('public/sample', { recursive: true });
fs.writeFileSync('public/sample/interviews.json', JSON.stringify(out, null, 1));
for (const o of out) console.log(o.title, o.words, 'words');
