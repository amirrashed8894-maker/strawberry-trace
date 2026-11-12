(function (global) {
  const SERIAL_RE = /RS[-\s]?(\d{6})[-\s]?([A-HJ-NP-Z2-9OIL01]{4})/gi;
  const CHECK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function fixChar(ch) {
    const u = String(ch).toUpperCase();
    if (u === 'O' || u === '0') return null; // not in alphabet — try both later
    if (u === 'I' || u === 'L' || u === '1') return null;
    return CHECK_ALPHABET.includes(u) ? u : u;
  }
  function fixCheck(raw) {
    const map = { O:'Q', '0':'Q', I:'J', L:'J', '1':'7' };
    // Common OCR confusions mapped to nearest allowed letter — we also expand candidates
    const opts = [''];
    const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (s.length !== 4) return [];
    function branch(i, acc) {
      if (i === 4) { opts.push(acc); return; }
      const ch = s[i];
      const cands = new Set();
      if (CHECK_ALPHABET.includes(ch)) cands.add(ch);
      if (ch === 'O' || ch === '0') { cands.add('Q'); cands.add('D'); cands.add('G'); }
      if (ch === 'I' || ch === '1' || ch === 'L') { cands.add('J'); cands.add('7'); cands.add('T'); }
      if (ch === 'S' && !cands.size) cands.add('5');
      if (ch === '5') cands.add('S');
      if (ch === 'Z') cands.add('2');
      if (ch === 'B') cands.add('8');
      if (ch === '8') cands.add('B');
      if (!cands.size) cands.add(ch);
      for (const c of cands) {
        if (CHECK_ALPHABET.includes(c)) branch(i + 1, acc + c);
      }
    }
    branch(0, '');
    return [...new Set(opts.filter(Boolean))];
  }

  function extractSerialsFromText(text) {
    const counts = new Map();
    const src = String(text || '').toUpperCase();
    SERIAL_RE.lastIndex = 0;
    let m;
    while ((m = SERIAL_RE.exec(src))) {
      const num = m[1];
      const checks = fixCheck(m[2]);
      for (const chk of checks) {
        const serial = `RS-${num}-${chk}`;
        counts.set(serial, (counts.get(serial) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([serial, count]) => ({ serial, count }))
      .sort((a, b) => b.count - a.count || a.serial.localeCompare(b.serial));
  }

  function pickSerialFromText(text) {
    const list = extractSerialsFromText(text);
    return list[0] || null;
  }

  let tessLoading = null;
  function loadTesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (tessLoading) return tessLoading;
    tessLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = () => resolve(global.Tesseract);
      s.onerror = () => reject(new Error('تعذر تحميل أداة قراءة النص'));
      document.head.appendChild(s);
    });
    return tessLoading;
  }

  async function ocrImage(file, onProgress) {
    const T = await loadTesseract();
    const worker = await T.createWorker('eng', 1, {
      logger: m => { if (onProgress && m && m.status) onProgress(m); }
    });
    try {
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-rsRS',
        tessedit_pageseg_mode: '6'
      });
      const { data } = await worker.recognize(file);
      return data && data.text ? data.text : '';
    } finally {
      await worker.terminate();
    }
  }

  async function resolveValidSerial(candidates, lookupStatus) {
    if (!candidates || !candidates.length) return null;
    const uniq = [];
    const seen = new Set();
    for (const c of candidates) {
      if (seen.has(c.serial)) continue;
      seen.add(c.serial);
      uniq.push(c);
      if (uniq.length >= 10) break;
    }
    if (!lookupStatus) return uniq[0].serial;
    for (const c of uniq) {
      try {
        const st = await lookupStatus(c.serial);
        if (st && st !== 'unknown' && st !== 'invalid') return c.serial;
      } catch (e) { /* try next */ }
    }
    return uniq[0].serial;
  }

  async function readSerialFromPhoto(file, onProgress, lookupStatus) {
    if (onProgress) onProgress({ status: 'ocr', progress: 0 });
    const text = await ocrImage(file, onProgress);
    const candidates = extractSerialsFromText(text);
    if (!candidates.length) return { source: 'ocr', serial: null, text, candidates: [] };
    const serial = await resolveValidSerial(candidates, lookupStatus);
    return { source: 'ocr', serial, text, candidates };
  }

  global.STOcr = { extractSerialsFromText, pickSerialFromText, readSerialFromPhoto, resolveValidSerial };
})(window);
