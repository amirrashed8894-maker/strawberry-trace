(function (global) {
  const PRESETS = {
    '50x30': { id:'50x30', name:'رول 50×30 مم', mode:'roll', widthMm:50, heightMm:30, mainFontPt:9.2, repeatFontPt:5.2, repeatRows:7, repeatCols:3, marginMm:1.1, urlFontPt:4.2 },
    '50x40': { id:'50x40', name:'رول 50×40 مم', mode:'roll', widthMm:50, heightMm:40, mainFontPt:10.5, repeatFontPt:5.5, repeatRows:9, repeatCols:3, marginMm:1.2, urlFontPt:4.4 },
    '60x40': { id:'60x40', name:'رول 60×40 مم', mode:'roll', widthMm:60, heightMm:40, mainFontPt:11.5, repeatFontPt:5.4, repeatRows:9, repeatCols:4, marginMm:1.3, urlFontPt:4.6 },
    '70x40': { id:'70x40', name:'رول 70×40 مم', mode:'roll', widthMm:70, heightMm:40, mainFontPt:12.5, repeatFontPt:5.8, repeatRows:8, repeatCols:5, marginMm:1.3, urlFontPt:5 },
    'a4-50x30': { id:'a4-50x30', name:'ورق A4 — 50×30 مم (36 ملصق)', mode:'a4', widthMm:50, heightMm:30, cols:4, rows:9, mainFontPt:9.2, repeatFontPt:5.2, repeatRows:7, repeatCols:3, marginMm:1.1, urlFontPt:4.2, sheetGapX:0, sheetGapY:0, sheetMarginX:5, sheetMarginY:13.5 },
    'a4-70x40': { id:'a4-70x40', name:'ورق A4 — 70×40 مم (21 ملصق)', mode:'a4', widthMm:70, heightMm:40, cols:3, rows:7, mainFontPt:12.5, repeatFontPt:5.8, repeatRows:8, repeatCols:5, marginMm:1.3, urlFontPt:5, sheetGapX:0, sheetGapY:2.4, sheetMarginX:0, sheetMarginY:8.5 }
  };

  function cfgFrom(presetId, overrides) {
    const base = { ...(PRESETS[presetId] || PRESETS['50x30']) };
    const o = overrides || {};
    const num = k => (o[k] != null && o[k] !== '' ? Number(o[k]) : base[k]);
    return {
      ...base,
      mainFontPt: num('mainFontPt'),
      repeatFontPt: num('repeatFontPt'),
      repeatRows: Math.max(2, Math.round(num('repeatRows'))),
      repeatCols: Math.max(2, Math.round(num('repeatCols'))),
      marginMm: num('marginMm'),
      urlFontPt: num('urlFontPt') || base.urlFontPt || 4.2
    };
  }

  function rectsOverlap(a, b, pad) {
    const p = pad || 0;
    return a.x < b.x + b.w + p && a.x + a.w > b.x - p && a.y < b.y + b.h + p && a.y + a.h > b.y - p;
  }

  function siteHost(base) {
    const root = (base || (global.ST_CONFIG && ST_CONFIG.defaultPublicUrl) || (typeof location !== 'undefined' && location.origin) || 'https://strawberry-trace.onrender.com').replace(/\/+$/, '');
    try { return new URL(root).host; } catch (e) { return 'strawberry-trace.onrender.com'; }
  }

  function publicUrl(serial, base) {
    const root = (base || (global.ST_CONFIG && ST_CONFIG.defaultPublicUrl) || (typeof location !== 'undefined' && location.origin) || 'https://strawberry-trace.onrender.com').replace(/\/+$/, '');
    return `${root}/?c=${encodeURIComponent(serial)}`;
  }

  function labelBands(cfg) {
    const m = cfg.marginMm;
    const mainH = Math.max(6.2, cfg.mainFontPt * 0.48 + 2.4);
    const urlH = Math.max(3.2, (cfg.urlFontPt || 4.2) * 0.5 + 1.4);
    return {
      m,
      mainH,
      urlH,
      mainR: { x: m, y: m, w: cfg.widthMm - m * 2, h: mainH },
      urlR: { x: m, y: cfg.heightMm - m - urlH, w: cfg.widthMm - m * 2, h: urlH }
    };
  }

  function labelInnerHTML(cfg, serial, baseUrl) {
    const host = siteHost(baseUrl);
    const bands = labelBands(cfg);
    const midTop = bands.m + bands.mainH + 0.2;
    const midBot = cfg.heightMm - bands.m - bands.urlH - 0.2;
    const cells = [];
    for (let i = 0; i < cfg.repeatRows * cfg.repeatCols; i++) {
      cells.push(`<span style="font-size:${cfg.repeatFontPt}pt;font-weight:700;letter-spacing:-0.1px;line-height:1;white-space:nowrap;direction:ltr;color:#111;">${serial}</span>`);
    }
    return `
      <div class="st-label" style="width:${cfg.widthMm}mm;height:${cfg.heightMm}mm;position:relative;overflow:hidden;background:#fff;color:#000;border:0.25mm solid #222;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;">
        <div class="st-grid" style="position:absolute;top:${midTop}mm;left:${bands.m}mm;right:${bands.m}mm;height:${(midBot-midTop).toFixed(2)}mm;display:grid;grid-template-columns:repeat(${cfg.repeatCols},1fr);grid-template-rows:repeat(${cfg.repeatRows},1fr);align-items:center;justify-items:center;pointer-events:none;">
          ${cells.join('')}
        </div>
        <div class="st-main" style="position:absolute;top:${bands.m}mm;left:${bands.m}mm;right:${bands.m}mm;height:${bands.mainH}mm;background:#fff;display:flex;align-items:center;justify-content:center;padding:0 0.4mm;box-sizing:border-box;">
          <div style="font-size:${cfg.mainFontPt}pt;font-weight:900;letter-spacing:-0.2px;line-height:1;white-space:nowrap;direction:ltr;color:#000;">${serial}</div>
        </div>
        <div class="st-url" style="position:absolute;left:${bands.m}mm;right:${bands.m}mm;bottom:${bands.m}mm;height:${bands.urlH}mm;background:#fff;display:flex;align-items:center;justify-content:center;padding:0 0.4mm;box-sizing:border-box;">
          <div style="font-size:${cfg.urlFontPt}pt;font-weight:600;letter-spacing:0;line-height:1;white-space:nowrap;direction:ltr;color:#222;">${host}</div>
        </div>
      </div>`;
  }

  function renderPreview(container, cfg, serial, baseUrl) {
    const zoom = Math.min(5.2, Math.max(3.2, 340 / cfg.widthMm));
    const w = (cfg.widthMm * zoom).toFixed(2);
    const h = (cfg.heightMm * zoom).toFixed(2);
    container.innerHTML = `<div style="width:${w}mm;height:${h}mm;margin:0 auto;position:relative;">
      <div style="position:absolute;top:0;left:0;width:${cfg.widthMm}mm;height:${cfg.heightMm}mm;transform:scale(${zoom});transform-origin:top left;">
        ${labelInnerHTML(cfg, serial || 'RS-000001-A3K7', baseUrl)}
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
      </style></head><body>${html}</body></html>`);
    w.document.close();
    return w;
  }

  async function buildPrintHTML(serials, cfg, baseUrl, onProg) {
    const parts = [];
    if (cfg.mode === 'roll') {
      for (let i = 0; i < serials.length; i++) {
        if (onProg) onProg(i + 1, serials.length);
        parts.push(`<div class="roll-wrap" style="width:${cfg.widthMm}mm;height:${cfg.heightMm}mm;">${labelInnerHTML(cfg, serials[i], baseUrl)}</div>`);
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
        const r = Math.floor(j / cfg.cols), c = j % cfg.cols;
        const x = (cfg.sheetMarginX || 0) + c * (cfg.widthMm + (cfg.sheetGapX || 0));
        const y = (cfg.sheetMarginY || 0) + r * (cfg.heightMm + (cfg.sheetGapY || 0));
        cells.push(`<div style="position:absolute;top:${y}mm;left:${x}mm;">${labelInnerHTML(cfg, slice[j], baseUrl)}</div>`);
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

  function drawLabel(doc, cfg, x, y, serial, baseUrl) {
    const host = siteHost(baseUrl);
    const bands = labelBands(cfg);
    const m = cfg.marginMm;
    const w = cfg.widthMm, h = cfg.heightMm;
    doc.setDrawColor(30);
    doc.setLineWidth(0.18);
    doc.rect(x, y, w, h);
    const midTop = y + m + bands.mainH + 0.2;
    const midBot = y + h - m - bands.urlH - 0.2;
    const cellW = (w - m * 2) / cfg.repeatCols;
    const cellH = (midBot - midTop) / cfg.repeatRows;
    doc.setFont('courier', 'bold');
    doc.setFontSize(cfg.repeatFontPt);
    doc.setTextColor(20);
    for (let r = 0; r < cfg.repeatRows; r++) {
      for (let c = 0; c < cfg.repeatCols; c++) {
        const cx = x + m + cellW * (c + 0.5);
        const cy = midTop + cellH * (r + 0.5);
        doc.text(serial, cx, cy, { align: 'center', baseline: 'middle' });
      }
    }
    const mainR = { x: x + bands.mainR.x, y: y + bands.mainR.y, w: bands.mainR.w, h: bands.mainR.h };
    const urlR = { x: x + bands.urlR.x, y: y + bands.urlR.y, w: bands.urlR.w, h: bands.urlR.h };
    doc.setFillColor(255, 255, 255);
    doc.rect(mainR.x, mainR.y, mainR.w, mainR.h, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(cfg.mainFontPt);
    doc.setTextColor(0);
    doc.text(serial, x + w / 2, mainR.y + mainR.h / 2, { align: 'center', baseline: 'middle' });
    doc.setFillColor(255, 255, 255);
    doc.rect(urlR.x, urlR.y, urlR.w, urlR.h, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.urlFontPt || 4.2);
    doc.setTextColor(30);
    doc.text(host, x + w / 2, urlR.y + urlR.h / 2, { align: 'center', baseline: 'middle' });
  }

  async function buildPdfDoc(serials, cfg, baseUrl, onProg) {
    const JSPDF = global.jspdf && global.jspdf.jsPDF;
    if (!JSPDF) throw new Error('مكتبة PDF غير متاحة');
    const doc = cfg.mode === 'a4'
      ? new JSPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      : new JSPDF({ unit: 'mm', format: [cfg.widthMm, cfg.heightMm], orientation: cfg.widthMm >= cfg.heightMm ? 'landscape' : 'portrait' });

    if (cfg.mode === 'roll') {
      for (let i = 0; i < serials.length; i++) {
        if (i) doc.addPage([cfg.widthMm, cfg.heightMm], cfg.widthMm >= cfg.heightMm ? 'landscape' : 'portrait');
        if (onProg) onProg(i + 1, serials.length);
        drawLabel(doc, cfg, 0, 0, serials[i], baseUrl);
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
        drawLabel(doc, cfg, x, y, serials[i], baseUrl);
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

  global.STLabels = { PRESETS, cfgFrom, publicUrl, siteHost, labelInnerHTML, renderPreview, printLabels, downloadPdf, buildPrintHTML, pdfBytes };
})(window);
