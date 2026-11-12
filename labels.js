(function (global) {
  const PRESETS = {
    '50x30': { id:'50x30', name:'رول 50×30 مم', mode:'roll', widthMm:50, heightMm:30, qrMm:15, mainFontPt:8, repeatFontPt:4.6, repeatRows:6, repeatCols:3, marginMm:1.2 },
    '50x40': { id:'50x40', name:'رول 50×40 مم', mode:'roll', widthMm:50, heightMm:40, qrMm:16, mainFontPt:8.4, repeatFontPt:4.6, repeatRows:7, repeatCols:3, marginMm:1.4 },
    '60x40': { id:'60x40', name:'رول 60×40 مم', mode:'roll', widthMm:60, heightMm:40, qrMm:17, mainFontPt:9, repeatFontPt:5, repeatRows:7, repeatCols:4, marginMm:1.5 },
    '70x40': { id:'70x40', name:'رول 70×40 مم', mode:'roll', widthMm:70, heightMm:40, qrMm:18, mainFontPt:10, repeatFontPt:5.2, repeatRows:7, repeatCols:5, marginMm:1.5 },
    'a4-50x30': { id:'a4-50x30', name:'ورق A4 — 50×30 مم (36 ملصق)', mode:'a4', widthMm:50, heightMm:30, cols:4, rows:9, qrMm:15, mainFontPt:8, repeatFontPt:4.6, repeatRows:6, repeatCols:3, marginMm:1.2, sheetGapX:0, sheetGapY:0, sheetMarginX:5, sheetMarginY:13.5 },
    'a4-70x40': { id:'a4-70x40', name:'ورق A4 — 70×40 مم (21 ملصق)', mode:'a4', widthMm:70, heightMm:40, cols:3, rows:7, qrMm:18, mainFontPt:10, repeatFontPt:5.2, repeatRows:7, repeatCols:5, marginMm:1.5, sheetGapX:0, sheetGapY:2.4, sheetMarginX:0, sheetMarginY:8.5 }
  };

  function cfgFrom(presetId, overrides) {
    const base = { ...(PRESETS[presetId] || PRESETS['50x30']) };
    const o = overrides || {};
    const num = k => (o[k] != null && o[k] !== '' ? Number(o[k]) : base[k]);
    return {
      ...base,
      qrMm: num('qrMm'),
      mainFontPt: num('mainFontPt'),
      repeatFontPt: num('repeatFontPt'),
      repeatRows: Math.max(2, Math.round(num('repeatRows'))),
      repeatCols: Math.max(2, Math.round(num('repeatCols'))),
      marginMm: num('marginMm')
    };
  }


  function rectsOverlap(a, b, pad) {
    const p = pad || 0;
    return a.x < b.x + b.w + p && a.x + a.w > b.x - p && a.y < b.y + b.h + p && a.y + a.h > b.y - p;
  }
  function publicUrl(serial, base) {
    const root = (base || (global.ST_CONFIG && ST_CONFIG.defaultPublicUrl) || location.origin).replace(/\/+$/, '');
    return `${root}/?c=${encodeURIComponent(serial)}`;
  }

  async function qrDataUrl(serial, base, size) {
    const url = publicUrl(serial, base);
    return QRCode.toDataURL(url, {
      width: size || 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    });
  }

  function labelInnerHTML(cfg, serial, qrUrl) {
    const qPad = Math.max(0.7, cfg.marginMm * 0.4);
    const mainH = Math.max(5.8, cfg.mainFontPt * 0.5 + 2);
    const qrR = { x: cfg.marginMm, y: cfg.marginMm, w: cfg.qrMm, h: cfg.qrMm };
    const mainR = { x: cfg.qrMm + cfg.marginMm * 1.6, y: cfg.marginMm, w: cfg.widthMm - (cfg.qrMm + cfg.marginMm * 1.6) - 0.5, h: mainH };
    const inset = 0.4;
    const cellW = (cfg.widthMm - inset * 2) / cfg.repeatCols;
    const cellH = (cfg.heightMm - inset * 2) / cfg.repeatRows;
    const cells = [];
    for (let r = 0; r < cfg.repeatRows; r++) {
      for (let c = 0; c < cfg.repeatCols; c++) {
        const cell = { x: inset + c * cellW, y: inset + r * cellH, w: cellW, h: cellH };
        if (rectsOverlap(cell, qrR, 0.2) || rectsOverlap(cell, mainR, 0.2)) {
          cells.push('<span></span>');
        } else {
          cells.push(`<span style="font-size:${cfg.repeatFontPt}pt;font-weight:700;letter-spacing:-0.1px;line-height:1;white-space:nowrap;direction:ltr;color:#111;">${serial}</span>`);
        }
      }
    }
    return `
      <div class="st-label" style="width:${cfg.widthMm}mm;height:${cfg.heightMm}mm;position:relative;overflow:hidden;background:#fff;color:#000;border:0.25mm solid #222;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;">
        <div class="st-grid" style="position:absolute;inset:${inset}mm;display:grid;grid-template-columns:repeat(${cfg.repeatCols},1fr);grid-template-rows:repeat(${cfg.repeatRows},1fr);align-items:center;justify-items:center;pointer-events:none;">
          ${cells.join('')}
        </div>
        <div class="st-qr" style="position:absolute;top:${cfg.marginMm}mm;left:${cfg.marginMm}mm;width:${cfg.qrMm}mm;height:${cfg.qrMm}mm;background:#fff;padding:${qPad}mm;box-sizing:border-box;">
          <img alt="" src="${qrUrl}" style="width:100%;height:100%;display:block;image-rendering:pixelated;">
        </div>
        <div class="st-main" style="position:absolute;top:${cfg.marginMm}mm;left:${(cfg.qrMm + cfg.marginMm * 1.6)}mm;right:0.5mm;height:${mainH}mm;background:#fff;display:flex;align-items:center;justify-content:flex-start;padding:0 0.5mm;box-sizing:border-box;">
          <div style="font-size:${cfg.mainFontPt}pt;font-weight:900;letter-spacing:-0.2px;line-height:1;white-space:nowrap;direction:ltr;color:#000;">${serial}</div>
        </div>
      </div>`;
  }

  function renderPreview(container, cfg, serial, qrUrl) {
    const zoom = Math.min(5.2, Math.max(3.2, 340 / cfg.widthMm));
    const w = (cfg.widthMm * zoom).toFixed(2);
    const h = (cfg.heightMm * zoom).toFixed(2);
    container.innerHTML = `<div style="width:${w}mm;height:${h}mm;margin:0 auto;position:relative;">
      <div style="position:absolute;top:0;left:0;width:${cfg.widthMm}mm;height:${cfg.heightMm}mm;transform:scale(${zoom});transform-origin:top left;">
        ${labelInnerHTML(cfg, serial || 'RS-000001-A3K7', qrUrl || '')}
      </div>
    </div>`;
  }

  function printDocument(html, title) {
    const w = window.open('', '_blank');
    if (!w) throw new Error('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title || 'ستيكرات'}</title>
      <style>
        @page { margin: 0; }
        html,body{margin:0;padding:0;background:#fff}
        .page{page-break-after:always;}
        .page:last-child{page-break-after:auto;}
        .roll-wrap{display:flex;justify-content:center;align-items:center;page-break-after:always;}
        .a4{width:210mm;height:297mm;position:relative;page-break-after:always;}
        .st-label img{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    return w;
  }

  async function buildPrintHTML(serials, cfg, baseUrl, onProg) {
    const parts = [];
    if (cfg.mode === 'roll') {
      for (let i = 0; i < serials.length; i++) {
        if (onProg) onProg(i + 1, serials.length);
        const qr = await qrDataUrl(serials[i], baseUrl, 280);
        parts.push(`<div class="roll-wrap" style="width:${cfg.widthMm}mm;height:${cfg.heightMm}mm;">${labelInnerHTML(cfg, serials[i], qr)}</div>`);
      }
      return { html: parts.join(''), pageStyle: `@page { size: ${cfg.widthMm}mm ${cfg.heightMm}mm; margin: 0; }` };
    }
    const per = (cfg.cols || 1) * (cfg.rows || 1);
    const pages = [];
    for (let i = 0; i < serials.length; i += per) {
      const slice = serials.slice(i, i + per);
      const cells = [];
      for (let j = 0; j < slice.length; j++) {
        if (onProg) onProg(i + j + 1, serials.length);
        const qr = await qrDataUrl(slice[j], baseUrl, 280);
        const r = Math.floor(j / cfg.cols), c = j % cfg.cols;
        const x = (cfg.sheetMarginX || 0) + c * (cfg.widthMm + (cfg.sheetGapX || 0));
        const y = (cfg.sheetMarginY || 0) + r * (cfg.heightMm + (cfg.sheetGapY || 0));
        cells.push(`<div style="position:absolute;top:${y}mm;left:${x}mm;">${labelInnerHTML(cfg, slice[j], qr)}</div>`);
      }
      pages.push(`<div class="a4">${cells.join('')}</div>`);
    }
    return { html: pages.join(''), pageStyle: `@page { size: A4; margin: 0; }` };
  }

  async function printLabels(serials, cfg, baseUrl, onProg) {
    const built = await buildPrintHTML(serials, cfg, baseUrl, onProg);
    const w = printDocument('', 'ستيكرات تتبع الكرتون');
    w.document.head.insertAdjacentHTML('beforeend', `<style>${built.pageStyle}</style>`);
    w.document.body.innerHTML = built.html;
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
    return w;
  }

  async function buildPdfDoc(serials, cfg, baseUrl, onProg) {
    const JSPDF = global.jspdf && global.jspdf.jsPDF;
    if (!JSPDF) throw new Error('مكتبة PDF غير متاحة');
    const doc = cfg.mode === 'a4'
      ? new JSPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      : new JSPDF({ unit: 'mm', format: [cfg.widthMm, cfg.heightMm], orientation: cfg.widthMm >= cfg.heightMm ? 'landscape' : 'portrait' });

    function drawLabel(doc, x, y, serial, qr) {
      const m = cfg.marginMm;
      const w = cfg.widthMm, h = cfg.heightMm;
      doc.setDrawColor(30);
      doc.setLineWidth(0.18);
      doc.rect(x, y, w, h);
      const cellW = (w - m * 2) / cfg.repeatCols;
      const cellH = (h - m * 2) / cfg.repeatRows;
      const qrR = { x: x + m, y: y + m, w: cfg.qrMm, h: cfg.qrMm };
      const mainH0 = Math.max(6, cfg.mainFontPt * 0.45 + 2.2);
      const mainR = { x: x + m + cfg.qrMm, y: y + m, w: w - m * 2 - cfg.qrMm, h: mainH0 };
      doc.setFont('courier', 'bold');
      doc.setFontSize(cfg.repeatFontPt);
      doc.setTextColor(20);
      for (let r = 0; r < cfg.repeatRows; r++) {
        for (let c = 0; c < cfg.repeatCols; c++) {
          const cell = { x: x + m + cellW * c, y: y + m + cellH * r, w: cellW, h: cellH };
          if (rectsOverlap(cell, qrR, 0.2) || rectsOverlap(cell, mainR, 0.2)) continue;
          const cx = x + m + cellW * (c + 0.5);
          const cy = y + m + cellH * (r + 0.5);
          doc.text(serial, cx, cy, { align: 'center', baseline: 'middle' });
        }
      }
      const qPad = Math.max(0.6, m * 0.35);
      const qSize = cfg.qrMm;
      doc.setFillColor(255, 255, 255);
      doc.rect(x + m, y + m, qSize, qSize, 'F');
      doc.addImage(qr, 'PNG', x + m + qPad, y + m + qPad, qSize - qPad * 2, qSize - qPad * 2);
      const mainH = Math.max(6, cfg.mainFontPt * 0.45 + 2.2);
      doc.setFillColor(255, 255, 255);
      doc.rect(x + m + qSize, y + m, w - m * 2 - qSize, mainH, 'F');
      doc.setFont('courier', 'bold');
      doc.setFontSize(cfg.mainFontPt);
      doc.setTextColor(0);
      doc.text(serial, x + m + qSize + 0.6, y + m + mainH / 2, { baseline: 'middle' });
    }

    if (cfg.mode === 'roll') {
      for (let i = 0; i < serials.length; i++) {
        if (i) doc.addPage([cfg.widthMm, cfg.heightMm], cfg.widthMm >= cfg.heightMm ? 'landscape' : 'portrait');
        if (onProg) onProg(i + 1, serials.length);
        const qr = await qrDataUrl(serials[i], baseUrl, 320);
        drawLabel(doc, 0, 0, serials[i], qr);
      }
    } else {
      const per = cfg.cols * cfg.rows;
      for (let i = 0; i < serials.length; i++) {
        if (i && i % per === 0) doc.addPage('a4', 'portrait');
        if (onProg) onProg(i + 1, serials.length);
        const j = i % per;
        const r = Math.floor(j / cfg.cols), c = j % cfg.cols;
        const x = (cfg.sheetMarginX || 0) + c * (cfg.widthMm + (cfg.sheetGapX || 0));
        const y = (cfg.sheetMarginY || 0) + r * (cfg.heightMm + (cfg.sheetGapY || 0));
        const qr = await qrDataUrl(serials[i], baseUrl, 320);
        drawLabel(doc, x, y, serials[i], qr);
      }
    }
    return doc;
  }

  async function downloadPdf(serials, cfg, baseUrl, onProg) {
    const doc = await buildPdfDoc(serials, cfg, baseUrl, onProg);
    const name = `sticker-labels-${serials[0] || 'batch'}.pdf`;
    doc.save(name);
    return name;
  }

  async function pdfBytes(serials, cfg, baseUrl, onProg) {
    const doc = await buildPdfDoc(serials, cfg, baseUrl, onProg);
    return doc.output('arraybuffer');
  }

  global.STLabels = { PRESETS, cfgFrom, publicUrl, qrDataUrl, labelInnerHTML, renderPreview, printLabels, downloadPdf, buildPrintHTML, pdfBytes };
})(window);
