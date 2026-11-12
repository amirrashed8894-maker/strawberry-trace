// Node test for repeated-serial majority vote (mirrors ocr.js)
const SERIAL_RE = /RS[-\s]?(\d{6})[-\s]?([A-HJ-NP-Z2-9OIL01]{4})/gi;
const CHECK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function fixCheck(raw) {
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (s.length !== 4) return [];
  const opts = [];
  function branch(i, acc) {
    if (i === 4) { opts.push(acc); return; }
    const ch = s[i];
    const cands = new Set();
    if (CHECK_ALPHABET.includes(ch)) cands.add(ch);
    if (ch === 'O' || ch === '0') { cands.add('Q'); cands.add('D'); cands.add('G'); }
    if (ch === 'I' || ch === '1' || ch === 'L') { cands.add('J'); cands.add('7'); cands.add('T'); }
    if (ch === '5') cands.add('S');
    if (ch === '8') cands.add('B');
    if (ch === 'B') cands.add('8');
    if (!cands.size) cands.add(ch);
    for (const c of cands) if (CHECK_ALPHABET.includes(c)) branch(i + 1, acc + c);
  }
  branch(0, '');
  return [...new Set(opts)];
}
function extract(text) {
  const counts = new Map();
  const src = String(text || '').toUpperCase();
  SERIAL_RE.lastIndex = 0;
  let m;
  while ((m = SERIAL_RE.exec(src))) {
    for (const chk of fixCheck(m[2])) {
      const serial = `RS-${m[1]}-${chk}`;
      counts.set(serial, (counts.get(serial) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([serial, count]) => ({ serial, count })).sort((a, b) => b.count - a.count);
}

const repeated = Array(18).fill('RS-000123-K7P2').join('\n') + '\nRS-000123-K7P8\nRS-000199-XXXX';
const r = extract(repeated);
console.assert(r[0].serial === 'RS-000123-K7P2', r);
console.assert(r[0].count >= 18, r[0]);
const messy = 'RS 000123 K7P2  RS-000123-K7P2  rs-000123-k7p2';
const r2 = extract(messy);
console.assert(r2[0].serial === 'RS-000123-K7P2' && r2[0].count >= 3, r2);
const ocrTypo = 'RS-000123-K7P2\n'.repeat(10) + 'RS-000123-K7PO\nRS-000123-K7P0';
const r3 = extract(ocrTypo);
console.assert(r3[0].serial === 'RS-000123-K7P2', r3);
console.log('ocr tests passed', { majority: r[0], messy: r2[0], typoTop: r3[0] });
