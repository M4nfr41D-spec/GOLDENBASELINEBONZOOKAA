import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || process.cwd());
const HTML_PATH = path.join(ROOT, 'index.html');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function listFiles(dir, exts) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
        stack.push(p);
      } else if (exts.includes(path.extname(ent.name))) {
        out.push(p);
      }
    }
  }
  return out;
}

function extractHtmlIds(html) {
  const ids = new Set();
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

function extractJsIdRefs(js) {
  const ids = new Set();

  const patterns = [
    /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g,
    /querySelector\(\s*['"]#([^'"]+)['"]\s*\)/g,
    /querySelectorAll\(\s*['"]#([^'"]+)['"]\s*\)/g,
    /\b(showModal|hideModal)\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(js))) {
      ids.add(m[m.length - 1]); // last capture group
    }
  }
  return ids;
}

function formatList(title, arr) {
  const lines = [title];
  for (const x of arr) lines.push(` - ${x}`);
  return lines.join('\n');
}

if (!fs.existsSync(HTML_PATH)) {
  console.error(`❌ index.html not found at: ${HTML_PATH}`);
  process.exit(2);
}

const htmlIds = extractHtmlIds(read(HTML_PATH));
const jsFiles = listFiles(ROOT, ['.js']);

const jsIds = new Set();
for (const f of jsFiles) {
  const refs = extractJsIdRefs(read(f));
  for (const id of refs) jsIds.add(id);
}

const missingInHtml = [...jsIds].filter(id => !htmlIds.has(id)).sort();
const unusedInJs = [...htmlIds].filter(id => !jsIds.has(id)).sort();

console.log(`ROOT: ${ROOT}`);
console.log(`HTML IDs: ${htmlIds.size} | JS referenced IDs: ${jsIds.size}`);
console.log('');

if (missingInHtml.length) {
  console.log(formatList('❌ Referenced in JS but missing in HTML:', missingInHtml));
  console.log('');
} else {
  console.log('✅ No missing HTML IDs referenced by JS.\n');
}

if (unusedInJs.length) {
  console.log(formatList('ℹ️ Present in HTML but not referenced by JS (may be OK):', unusedInJs));
  console.log('');
}

process.exit(missingInHtml.length ? 1 : 0);
