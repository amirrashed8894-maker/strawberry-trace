(function () {
  const app = document.getElementById('app');
  const state = { user: null, admin: false, settings: null, toast: '' };

  function path() { return (location.pathname.replace(/\/+$/, '') || '/'); }
  function toHref(href) {
    if (!href || href === '/') return '/';
    try {
      const u = new URL(href, location.origin);
      const pn = u.pathname.replace(/\/+$/, '') || '/';
      const m = pn.match(/^\/c\/([^/]+)$/);
      if (m) return '/?c=' + encodeURIComponent(decodeURIComponent(m[1]));
      if (pn === '/admin' || pn === '/admin/login') return '/?p=admin';
      if (pn.startsWith('/admin/')) return '/?p=' + encodeURIComponent(pn.slice(1));
      if (u.searchParams.get('c') || u.searchParams.get('p')) return (pn === '/' ? '/' : pn) + u.search;
      return href;
    } catch (e) { return href; }
  }
  function go(href, replace) {
    const dest = toHref(href);
    if (replace) history.replaceState({}, '', dest);
    else history.pushState({}, '', dest);
    render();
  }
  function parseRoute() {
    const pth = path();
    const q = new URLSearchParams(location.search);
    const m = pth.match(/^\/c\/([^/]+)$/);
    if (m) return { name: 'carton', serial: decodeURIComponent(m[1]) };
    if (q.get('c')) return { name: 'carton', serial: q.get('c') };
    let adminPath = '';
    if (pth === '/admin' || pth.startsWith('/admin/')) adminPath = pth === '/admin' ? 'admin' : pth.slice(1);
    else if (q.get('p')) adminPath = q.get('p');
    if (adminPath === 'admin' || adminPath === 'admin/login') return { name: 'dash' };
    if (adminPath.startsWith('admin/')) {
      const rest = adminPath.slice('admin/'.length);
      if (rest === 'assign') return { name: 'containers' };
      if (rest === 'print') return { name: 'legacy' };
      if (['lots','containers','search','settings','legacy'].includes(rest)) return { name: rest };
      return { name: 'dash' };
    }
    return { name: 'home' };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function val(v) { return (v == null || v === '') ? '—' : esc(v); }
  function dateVal(v) { return (v == null || v === '') ? '—' : esc(ST.fmtDate(v)); }
  function formatNum(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '';
    const s = String(Number(n));
    return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  function header(title, sub, badge) {
    return `<div class="top">
      <div><h1>${esc(title)}</h1><div class="sub">${esc(sub || '')}</div></div>
      ${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
    </div>`;
  }
  function adminNav(cur) {
    const items = [
      ['/admin', 'dash', 'لوحة التحكم'],
      ['/admin/lots', 'lots', 'اللوتات'],
      ['/admin/containers', 'containers', 'الحاويات'],
      ['/admin/search', 'search', 'بحث وتتبع'],
      ['/admin/settings', 'settings', 'الإعدادات']
    ];
    return `<nav class="nav">${items.map(i => `<a href="${i[0]}" class="${cur===i[1]?'on':''}">${i[2]}</a>`).join('')}
      <a href="/" class="ghost">الموقع العام</a></nav>`;
  }
  function toast(msg, kind) {
    return msg ? `<div class="notice ${kind||''}">${esc(msg)}</div>` : '';
  }
  function partySelect(id, kind, list, current) {
    const opts = [`<option value="">—</option>`]
      .concat((list || []).map(p => `<option ${p.name===current?'selected':''}>${esc(p.name)}</option>`))
      .concat(`<option value="__new__">إضافة جديد</option>`);
    return `<select id="${id}" data-party="${kind}">${opts.join('')}</select>`;
  }
  async function ensureParty(kind, selectEl) {
    if (selectEl.value !== '__new__') return selectEl.value;
    const name = prompt(kind === 'supplier' ? 'اسم المورد:' : kind === 'factory' ? 'اسم مصنع التعبئة:' : 'اسم العميل:');
    if (!name || !name.trim()) { selectEl.value = ''; return ''; }
    const row = await ST.addParty(kind, name.trim());
    const opt = document.createElement('option');
    opt.value = row.name; opt.textContent = row.name; opt.selected = true;
    selectEl.insertBefore(opt, selectEl.lastElementChild);
    return row.name;
  }

  function dateField(id, iso, label, defaultToday) {
    const shown = iso ? ST.fmtDate(iso) : (defaultToday ? ST.fmtDate(ST.cairoToday()) : '');
    return `<div class="f"><label>${label}</label>
      <input id="${id}" class="ltr date-in" inputmode="numeric" autocomplete="off" placeholder="يوم/شهر/سنة" aria-label="${label} يوم/شهر/سنة" value="${esc(shown)}">
      <div class="hint">ميلادي — يوم/شهر/سنة</div></div>`;
  }
  function readDate(el) {
    const raw = el && el.value;
    if (!String(raw || '').trim()) return null;
    const iso = ST.parseDateInput(raw);
    if (!iso) throw new Error('اكتبه يوم/شهر/سنة ميلادي، زي 12/11/2026');
    return iso;
  }

  function fieldList(data, settings, isAdmin, skip) {
    const vis = (settings && settings.public_fields) || {};
    const skipSet = new Set(skip || []);
    return ST.FIELDS.filter(([k]) => {
      if (skipSet.has(k)) return false;
      if (isAdmin) return true;
      if (!Object.prototype.hasOwnProperty.call(data, k)) return false;
      if (vis && vis[k] === false) return false;
      return true;
    }).map(([k, ar, en]) => {
      const raw = data[k];
      const shown = (k.includes('date')) ? dateVal(raw) : (k === 'carton_net_weight' && raw != null && raw !== '' ? esc(raw) + ' كجم' : val(raw));
      return `<div class="item"><div class="k">${ar}<small>${en}</small></div><div class="val ${k.includes('number')||k==='serial'?'ltr':''}">${shown}</div></div>`;
    }).join('');
  }

  /* ---------------- Public home ---------------- */
  function viewHome() {
    app.classList.remove('wide');
    app.innerHTML = header('تتبع الكرتون', 'شركة الراشد للتجارة — Al-Rashed Trading Co.') + `
      <div class="card entry">
        <h2>اعرض تفاصيل اللوت</h2>
        <p class="muted">اكتب الرقم المكتوب على الاستيكر، أو صوّر الكرتونة لو جزء من الرقم اتمسح.</p>
        <div class="f"><label>رقم اللوت</label>
          <input id="serialIn" class="ltr entry-in" placeholder="FS-2611-01" autocomplete="off" autocapitalize="characters" inputmode="text">
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn pri wide" data-act="open-serial">عرض التفاصيل</button>
        </div>
        <div class="row">
          <button class="btn wide" data-act="photo">صوّر الكرتونة</button>
          <input id="photoIn" type="file" accept="image/*" capture="environment" hidden>
        </div>
        <div id="ocrMsg" class="ocr-progress"></div>
      </div>
      <div class="footer">شركة الراشد للتجارة · تتبع الكرتون · <a href="/?p=admin">الإدارة</a></div>`;
    const input = app.querySelector('#serialIn');
    input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Enter') openSerial(input.value); });
    app.querySelector('[data-act="open-serial"]').onclick = () => openSerial(input.value);
    app.querySelector('[data-act="photo"]').onclick = () => app.querySelector('#photoIn').click();
    app.querySelector('#photoIn').onchange = ev => handlePhoto(ev.target.files && ev.target.files[0]);
  }
  function openSerial(raw) {
    const s = ST.normalizeSerial(raw);
    if (!s) return;
    go('/c/' + encodeURIComponent(s));
  }
  async function handlePhoto(file) {
    if (!file) return;
    const box = app.querySelector('#ocrMsg');
    box.textContent = 'جاري قراءة الصورة…';
    try {
      const res = await STOcr.readSerialFromPhoto(file, m => {
        if (!box) return;
        if (m.status === 'recognizing text') box.textContent = 'قراءة النص من الصورة… ' + Math.round((m.progress || 0) * 100) + '%';
        else if (m.status) box.textContent = 'جاري التحليل…';
      }, ST.serialStatus);
      if (res.serial) {
        const extra = res.candidates && res.candidates.length > 1
          ? `ظهر في الصورة ${res.candidates.find(c => c.serial===res.serial)?.count || res.candidates[0].count} مرة.`
          : '';
        box.innerHTML = `<div class="notice ok" style="margin:8px 0 0">الرقم المقروء من الصورة: <b class="ltr serial">${res.serial}</b><div class="muted">${extra}</div>
          <div class="row" style="margin-top:8px">
            <button class="btn pri" type="button" data-act="confirm-serial">تأكيد وعرض التفاصيل</button>
            <button class="btn ghost" type="button" data-act="cancel-ocr">إلغاء</button>
          </div></div>`;
        const input = app.querySelector('#serialIn');
        if (input) input.value = res.serial;
        box.querySelector('[data-act="confirm-serial"]').onclick = () => openSerial(res.serial);
        box.querySelector('[data-act="cancel-ocr"]').onclick = () => { box.innerHTML = ''; };
      } else {
        box.textContent = 'ما قدرناش نقرأ رقم واضح. جرّب صورة أوضح أو اكتب الرقم يدوي.';
      }
    } catch (e) {
      box.textContent = ST.errMsg(e);
    }
  }

  /* ---------------- Public lookup ---------------- */
  async function viewCarton(serial) {
    app.classList.remove('wide');
    const s = ST.normalizeSerial(serial);
    app.innerHTML = header('بيانات التتبع', 'شركة الراشد للتجارة') + `<div class="card"><p class="muted">جاري التحميل…</p></div>`;
    let data, err;
    try { data = await ST.lookup(s); } catch (e) { err = e; }
    if (err) {
      app.innerHTML = header('بيانات التتبع', 'شركة الراشد للتجارة') + toast(ST.errMsg(err), 'warn') + lookupAgain();
      bindLookupAgain();
      return;
    }
    const settings = state.settings;
    if (data.status === 'invalid') {
      app.innerHTML = header('بيانات التتبع', '') + toast('الرقم المدخل غير مكتمل أو غير صالح.', 'warn') + lookupAgain();
      bindLookupAgain();
      return;
    }
    if (data.status === 'unknown') {
      app.innerHTML = header('بيانات التتبع', '') + `
        <div class="card hero-serial"><div class="s ltr">${esc(data.serial || s)}</div></div>
        <div class="notice warn">الرقم ده مش موجود في النظام. تأكد من الرقم المكتوب على الاستيكر.</div>
        ${lookupAgain()}`;
      bindLookupAgain();
      return;
    }
    if (data.status === 'unassigned' || data.kind === 'carton') {
      if (data.status === 'unassigned') {
        app.innerHTML = header('بيانات الكرتونة', '') + `
          <div class="card hero-serial"><div class="s ltr">${esc(data.serial)}</div>
            <div class="en">رقم كرتونة من نظام سابق</div></div>
          <div class="notice">الكرتونة دي لسه متخصصلهاش بيانات (لوت أو حاوية). لو عندك استفسار، تواصل مع شركة الراشد للتجارة.</div>
          ${lookupAgain()}`;
        bindLookupAgain();
        return;
      }
      app.innerHTML = header('بيانات الكرتونة', 'شركة الراشد للتجارة') + `
        <div class="card hero-serial">
          <div class="s ltr">${esc(data.serial)}</div>
          <div class="en">Carton serial</div>
        </div>
        <div class="card"><div class="details">${fieldList(data, settings, state.admin)}</div></div>
        ${lookupAgain()}`;
      bindLookupAgain();
      return;
    }

    const cons = data.containers || [];
    const loaded = cons.length > 0;
    let consHtml;
    if (!loaded) {
      consHtml = `<div class="notice">لم يتم التحميل بعد</div>`;
    } else {
      consHtml = `<div class="card"><h2>الحاويات</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>رقم الحاوية</th><th>تاريخ التحميل</th><th>العميل</th><th>جهة الوصول</th><th>الكراتين</th>
        </tr></thead><tbody>
        ${cons.map(c => `<tr>
          <td class="ltr serial">${val(c.container_number)}</td>
          <td>${dateVal(c.loading_date)}</td>
          <td>${val(c.customer)}</td>
          <td>${val(c.destination)}</td>
          <td class="num">${c.carton_count != null ? esc(c.carton_count) : '—'}</td>
        </tr>`).join('')}
        </tbody></table></div></div>`;
    }
    app.innerHTML = header('بيانات اللوت', 'شركة الراشد للتجارة') + `
      <div class="card hero-serial">
        <div class="s ltr">${esc(data.lot_number || data.serial || s)}</div>
        <div class="en">Lot number</div>
      </div>
      <div class="card"><div class="details">${fieldList(data, settings, state.admin)}</div></div>
      ${consHtml}
      ${lookupAgain()}`;
    bindLookupAgain();
  }
  function lookupAgain() {
    return `<div class="card entry"><h2>بحث عن رقم آخر</h2>
      <div class="f"><label>رقم اللوت</label>
        <input id="serialIn" class="ltr entry-in" placeholder="FS-2611-01" autocomplete="off" autocapitalize="characters">
      </div>
      <div class="row" style="margin-top:10px"><button class="btn pri wide" data-act="open-serial">عرض التفاصيل</button></div>
      <div class="row"><button class="btn wide" data-act="photo">صوّر الكرتونة</button>
      <input id="photoIn" type="file" accept="image/*" capture="environment" hidden></div>
      <div id="ocrMsg" class="ocr-progress"></div>
      <div class="row"><a class="btn ghost" href="/">الصفحة الرئيسية</a></div></div>`;
  }
  function bindLookupAgain() {
    const input = app.querySelector('#serialIn');
    const btn = app.querySelector('[data-act="open-serial"]');
    if (btn) btn.onclick = () => openSerial(input.value);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') openSerial(input.value); });
    const ph = app.querySelector('[data-act="photo"]');
    if (ph) ph.onclick = () => app.querySelector('#photoIn').click();
    const fi = app.querySelector('#photoIn');
    if (fi) fi.onchange = ev => handlePhoto(ev.target.files && ev.target.files[0]);
  }
  function fmtCairo(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(iso));
    } catch (e) { return iso; }
  }

  /* ---------------- Dashboard ---------------- */
  async function viewDash() {
    app.classList.add('wide');
    app.innerHTML = header('لوحة التحكم', 'تتبع اللوتات') + adminNav('dash') + `<div class="card"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    let d;
    try { d = await ST.dashboard(); } catch (e) {
      app.innerHTML = header('لوحة التحكم', '') + adminNav('dash') + toast(ST.errMsg(e), 'warn');
      bindNav(); return;
    }
    const legacyNote = (d.legacyBatches || d.legacyCartons)
      ? `<div class="card"><p class="muted">في النظام دفعة أرقام كراتين سابقة (${d.legacyBatches || 0} دفعة، ${d.legacyCartons || 0} رقم، منها ${d.legacyFree || 0} غير مخصّصة). النظام الجديد ما بيستخدمهاش في اللوتات الجديدة. تقدر تعيد طباعتها من <a href="/admin/legacy">الدفعات السابقة</a>.</p></div>`
      : '';
    app.innerHTML = header('لوحة التحكم', 'شركة الراشد للتجارة') + adminNav('dash') + `
      <div class="kpis">
        <div class="kpi"><b class="num">${d.lots || 0}</b><span>لوتات</span></div>
        <div class="kpi"><b class="num">${d.containers || 0}</b><span>حاويات</span></div>
        <div class="kpi"><b class="num">${d.printedStickers || 0}</b><span>استيكرات مطبوعة</span></div>
        <div class="kpi"><b class="num">${d.baseCartons || 0}</b><span>كراتين اللوتات</span></div>
        <div class="kpi"><b class="num">${d.allocatedCartons || 0}</b><span>محمّلة في حاوية</span></div>
        <div class="kpi"><b class="num">${d.unloadedLots || 0}</b><span>لوتات لم تُحمّل</span></div>
      </div>
      ${legacyNote}
      <div class="card" style="margin-top:14px">
        <h2>آخر عمليات المسح</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الرقم</th><th>النوع</th></tr></thead><tbody>
        ${((d.recentScans||[]).length ? d.recentScans.map(s => `<tr><td class="ltr">${esc(fmtCairo(s.scanned_at))}</td><td class="serial">${esc(s.serial_attempt||'')}</td><td>${s.is_admin?'إدارة':'عميل'}</td></tr>`).join('') : '<tr><td colspan="3">لا يوجد بعد</td></tr>')}
        </tbody></table></div>
      </div>`;
    bindNav();
  }

  /* ---------------- Lots ---------------- */
  function currentCfg(root) {
    const presets = STLabels.PRESETS;
    const id = (root.querySelector('#size') && root.querySelector('#size').value) || '50x30';
    const base = STLabels.cfgFrom(id, {
      repeatRows: numOrUndef(root.querySelector('#rRows')),
      repeatCols: numOrUndef(root.querySelector('#rCols')),
      repeatFontPt: numOrUndef(root.querySelector('#rFont')),
      mainFontPt: numOrUndef(root.querySelector('#mFont')),
      marginMm: numOrUndef(root.querySelector('#marg'))
    });
    return base;
  }
  function numOrUndef(el) {
    if (!el || el.value === '' || el.value == null) return undefined;
    const n = Number(el.value);
    return Number.isNaN(n) ? undefined : n;
  }
  function fillFromPreset(root, id) {
    const p = STLabels.PRESETS[id] || STLabels.PRESETS['50x30'];
    const set = (sel, v) => { const el = root.querySelector(sel); if (el && (el.value === '' || true)) el.value = v; };
    if (root.querySelector('#rRows')) root.querySelector('#rRows').value = p.repeatRows;
    if (root.querySelector('#rCols')) root.querySelector('#rCols').value = p.repeatCols;
    if (root.querySelector('#rFont')) root.querySelector('#rFont').value = p.repeatFontPt;
    if (root.querySelector('#mFont')) root.querySelector('#mFont').value = p.mainFontPt;
    if (root.querySelector('#marg')) root.querySelector('#marg').value = p.marginMm;
  }
  function offerPrintButtons(msgEl, serials, cfg, baseUrl) {
    msgEl.innerHTML = `<div class="notice ok" id="printReady">جاهزة للطباعة — كل الاستيكرات بنفس الرقم ${esc(serials[0] || '')} (${serials.length} نسخة).
      <div class="row" style="margin-top:8px">
        <button class="btn pri" type="button" data-act="pdf">تحميل PDF</button>
        <button class="btn" type="button" data-act="browser">طباعة من المتصفح</button>
      </div>
      <div id="printProg" class="muted"></div>
    </div>`;
    const prog = (p) => { const el = msgEl.querySelector('#printProg'); if (el && p) el.textContent = p; };
    msgEl.querySelector('[data-act="pdf"]').onclick = async () => {
      try {
        prog('جاري تجهيز الـ PDF…');
        await STLabels.downloadPdf(serials, cfg, baseUrl, m => prog(m));
        prog('تم التحميل.');
      } catch (e) { prog(ST.errMsg(e)); }
    };
    msgEl.querySelector('[data-act="browser"]').onclick = async () => {
      try {
        prog('جاري التجهيز…');
        await STLabels.printLabels(serials, cfg, baseUrl, m => prog(m));
      } catch (e) { prog(ST.errMsg(e)); }
    };
  }

  async function viewLots() {
    app.classList.add('wide');
    app.innerHTML = header('اللوتات', 'عربية المورد = لوت واحد، وكل استيكراته بنفس الرقم') + adminNav('lots') + `<div id="box"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    await drawLots();
  }

  async function drawLots(edit) {
    const box = document.getElementById('box');
    if (!box) return;
    let lots = [], suppliers = [], factories = [], settings;
    try {
      [lots, suppliers, factories, settings] = await Promise.all([
        ST.listLots(), ST.parties('supplier'), ST.parties('factory'), ST.settings()
      ]);
      state.settings = settings;
    } catch (e) {
      box.innerHTML = toast(ST.errMsg(e), 'warn');
      return;
    }
    const r = edit || {};
    const isEdit = !!(edit && edit.id);
    const defaultSpare = (r.spare_pct != null && r.spare_pct !== '') ? r.spare_pct : (settings.default_spare_pct != null ? settings.default_spare_pct : 10);
    const initialUnit = (r.weight_kg != null && Number(r.weight_kg) > 0 && Number(r.weight_kg) < 1000) ? 'kg' : 't';
    const initialScale = r.weight_kg != null ? ST.kgToScale(r.weight_kg, initialUnit) : '';
    let stats = null;
    if (isEdit) {
      try { stats = await ST.lotStickerStats(edit.id); } catch (e) { stats = null; }
    }
    const presets = STLabels.PRESETS;
    const opts = Object.values(presets).map(p => `<option value="${p.id}" ${(r.label_size||'50x30')===p.id?'selected':''}>${esc(p.name)}</option>`).join('');

    box.innerHTML = `
      <div class="card">
        <h2>${isEdit ? 'تعديل لوت ' + esc(r.lot_number) : 'لوت جديد'}</h2>
        <div class="grid">
          <div class="f"><label>رقم اللوت</label><input id="lot_number" class="ltr" value="${esc(r.lot_number||'')}" placeholder="يُولَّد تلقائي"></div>
          <div class="f"><label>المورد</label>${partySelect('supplier','supplier',suppliers,r.supplier)}</div>
          <div class="f"><label>مصنع التعبئة</label>${partySelect('packing_factory','factory',factories,r.packing_factory)}</div>
          ${dateField('receipt_date', r.receipt_date, 'تاريخ الاستلام', !isEdit)}
          <div class="f span"><label>ميزان العربية</label>
            <div class="weight-in">
              <input id="scale_w" class="ltr" inputmode="decimal" value="${esc(initialScale)}" placeholder="مثلاً 5 أو 5.25">
              <select id="scale_unit">
                <option value="t" ${initialUnit==='t'?'selected':''}>طن</option>
                <option value="kg" ${initialUnit==='kg'?'selected':''}>كجم</option>
              </select>
            </div>
            <div class="hint" id="scaleHint"></div>
          </div>
          <div class="f"><label>وزن الكرتونة (كجم)</label><input id="carton_weight_kg" class="ltr" inputmode="decimal" value="${esc(r.carton_weight_kg != null ? r.carton_weight_kg : 10)}"></div>
          <div class="f"><label>احتياطي الاستيكرات (%)</label><input id="spare_pct" class="ltr" inputmode="decimal" value="${esc(defaultSpare)}"></div>
          ${dateField('packing_date', r.packing_date, 'تاريخ التعبئة', !isEdit)}
          ${dateField('production_date', r.production_date, 'تاريخ الإنتاج', !isEdit)}
          <div class="f"><label>الصنف</label><input id="variety" value="${esc(r.variety||'')}"></div>
          <div class="f"><label>المقاس / الدرجة</label><input id="size_grade" value="${esc(r.size_grade||'')}"></div>
          <div class="f span"><label>ملاحظات</label><input id="notes" value="${esc(r.notes||'')}"></div>
        </div>
        <div id="stickerCalc" class="sticker-calc"></div>
        <div class="print-cfg" id="printCfg">
          <h2>طباعة الاستيكرات</h2>
          <p class="muted">كل استيكرات اللوت بنفس الرقم، متكرر على الاستيكر، وفي أسفله عنوان موقع التتبع. مفيش أرقام جديدة للزيادة — اطبع الفرق يعني نسخ إضافية من نفس الرقم.</p>
          <div class="grid g3">
            <div class="f"><label>مقاس الاستيكر</label><select id="size">${opts}</select></div>
            <div class="f"><label>صفوف التكرار</label><input id="rRows" type="number" min="2" max="20"></div>
            <div class="f"><label>أعمدة التكرار</label><input id="rCols" type="number" min="2" max="12"></div>
            <div class="f"><label>حجم الخط الصغير (pt)</label><input id="rFont" type="number" step="0.1" min="3" max="9"></div>
            <div class="f"><label>حجم الرقم الكبير (pt)</label><input id="mFont" type="number" step="0.1" min="6" max="16"></div>
            <div class="f"><label>الهامش (مم)</label><input id="marg" type="number" step="0.1" min="0.6" max="4"></div>
          </div>
          <div class="preview-wrap" id="preview"></div>
        </div>
        <div class="row">
          <button class="btn pri" data-act="save">${isEdit ? 'حفظ التعديل' : 'حفظ اللوت'}</button>
          ${isEdit ? '<button class="btn ghost" data-act="cancel">لوت جديد</button>' : ''}
        </div>
        <div id="lotMsg"></div>
      </div>
      <div class="card">
        <h2>اللوتات <small>${lots.length}</small></h2>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>رقم اللوت</th><th>المورد</th><th>الميزان</th><th>الكراتين</th><th>الاستيكرات</th><th>المطبوع</th><th>التحميل</th><th></th>
        </tr></thead><tbody>
        ${lots.length ? lots.map(l => `<tr>
          <td class="serial">${esc(l.lot_number)}</td>
          <td>${val(l.supplier)}</td>
          <td>${l.weight_kg != null ? esc(formatNum(l.weight_kg)) + ' كجم' : '—'}</td>
          <td class="num">${l.base_cartons != null ? esc(l.base_cartons) : '—'}</td>
          <td class="num">${l.required_stickers != null ? esc(l.required_stickers) : '—'}</td>
          <td class="num">${esc(l.printed_count || 0)}</td>
          <td class="num">${esc(l.on_container || 0)}</td>
          <td><button class="btn sm" data-edit="${l.id}">تعديل</button></td>
        </tr>`).join('') : '<tr><td colspan="8">لا يوجد لوتات بعد</td></tr>'}
        </tbody></table></div>
      </div>`;

    if (!r.lot_number) {
      ST.nextLotNumber().then(n => {
        const el = box.querySelector('#lot_number');
        if (el && !el.value) el.value = n;
      }).catch(() => {});
    }
    fillFromPreset(box, (r.label_size || '50x30'));
    if (r.label_config && typeof r.label_config === 'object') {
      const c = r.label_config;
      if (c.repeatRows) box.querySelector('#rRows').value = c.repeatRows;
      if (c.repeatCols) box.querySelector('#rCols').value = c.repeatCols;
      if (c.repeatFontPt) box.querySelector('#rFont').value = c.repeatFontPt;
      if (c.mainFontPt) box.querySelector('#mFont').value = c.mainFontPt;
      if (c.marginMm) box.querySelector('#marg').value = c.marginMm;
    }

    function currentWeightKg() {
      return ST.scaleToKg(box.querySelector('#scale_w').value, box.querySelector('#scale_unit').value);
    }
    function refreshPreview() {
      const num = (box.querySelector('#lot_number').value || 'FS-0000-00').trim();
      const cfg = currentCfg(box);
      const url = (state.settings && state.settings.public_base_url) || (window.ST_CONFIG && window.ST_CONFIG.defaultPublicUrl);
      const wrap = box.querySelector('#preview');
      if (wrap) STLabels.renderPreview(wrap, cfg, num, url);
    }
    function refreshCalc() {
      const kg = currentWeightKg();
      const carton = Number(box.querySelector('#carton_weight_kg').value);
      const spare = Number(box.querySelector('#spare_pct').value);
      const unit = box.querySelector('#scale_unit').value;
      const hint = box.querySelector('#scaleHint');
      if (kg != null) {
        hint.textContent = unit === 't' ? `أي ${formatNum(kg)} كجم` : `أي ${formatNum(ST.kgToScale(kg, 't'))} طن`;
      } else hint.textContent = '';
      const base = ST.baseCartons(kg, carton);
      const need = ST.requiredStickers(kg, carton, spare);
      const printed = (stats && stats.printed != null) ? stats.printed : (isEdit ? (edit.printed_count || 0) : 0);
      const onCon = (stats && stats.on_container != null) ? stats.on_container : (isEdit ? (edit.on_container || 0) : 0);
      let html = '';
      if (base == null || need == null) {
        html = `<div class="muted">أدخل ميزان العربية ووزن الكرتونة ونسبة الاحتياطي لحساب عدد الاستيكرات.</div>`;
      } else {
        const spareN = need - base;
        const diff = need - printed;
        html = `<div>كراتين اللوت (من الميزان)</div><div class="big num">${base}</div>
          <div class="muted">${formatNum(kg)} كجم ÷ ${formatNum(carton)} كجم للكرتونة${Number.isFinite(spare) ? ` · احتياطي ${formatNum(spare)}٪ = ${spareN} استيكر زيادة` : ''}</div>
          <div style="margin-top:8px">الاستيكرات المطلوب طباعتها</div><div class="big num">${need}</div>`;
        if (isEdit) {
          html += `<div class="muted">المطبوع حالياً: ${printed} استيكر (نفس رقم اللوت ${esc(edit.lot_number)})</div>`;
          html += `<div class="muted">المتحمّل على حاويات: ${onCon} كرتونة من أصل ${base}.</div>`;
          if (diff > 0) {
            html += `<div>الفرق: يلزم طباعة ${diff} استيكر زيادة (نسخ إضافية من نفس رقم اللوت، مش أرقام جديدة).</div>
              <div class="row"><button class="btn pri" type="button" id="printDiff">اطبع الفرق (${diff} استيكر)</button></div>`;
          } else if (printed > 0 && diff === 0) {
            html += `<div>العدد مطابق للمطبوع حالياً.</div>
              <div class="row"><button class="btn" type="button" id="reprint">إعادة طباعة (${printed} استيكر)</button></div>`;
          } else if (printed > need) {
            html += `<div class="notice warn" style="margin-top:8px">العدد الجديد أقل من المطبوع بـ ${printed - need} استيكر. الاستيكرات الحالية مش هتتمسح تلقائي.</div>
              <div class="row"><button class="btn" type="button" id="reprint">إعادة طباعة (${need} استيكر)</button></div>`;
          } else {
            html += `<div class="row"><button class="btn pri" type="button" id="printDiff">اطبع الاستيكرات (${need} استيكر)</button></div>`;
          }
          if (onCon > base) {
            html += `<div class="notice warn" style="margin-top:8px">تحذير: في ${onCon} كرتونة من اللوت ده متحمّلة على حاويات، وده أكبر من العدد الجديد (${base}). راجع التحميل قبل ما تعتمده.</div>`;
          }
        } else {
          html += `<div class="muted">بعد الحفظ تقدر تطبع ${need} استيكر بنفس رقم اللوت، ولو عدّلت الميزان بعد كده يظهر الفرق.</div>`;
        }
      }
      box.querySelector('#stickerCalc').innerHTML = html;
      const pd = box.querySelector('#printDiff');
      if (pd) pd.onclick = () => printCopies(false);
      const rp = box.querySelector('#reprint');
      if (rp) rp.onclick = () => printCopies(true);
      refreshPreview();
    }
    async function printCopies(reprint) {
      const msg = box.querySelector('#lotMsg');
      try {
        if (!isEdit) throw new Error('احفظ اللوت أولاً');
        const kg = currentWeightKg();
        const carton = Number(box.querySelector('#carton_weight_kg').value);
        const spare = Number(box.querySelector('#spare_pct').value);
        const need = ST.requiredStickers(kg, carton, spare);
        const printed = (stats && stats.printed != null) ? stats.printed : (edit.printed_count || 0);
        const count = reprint ? (need || printed) : Math.max(0, (need || 0) - printed);
        if (!count) throw new Error('مفيش استيكرات للطباعة');
        const num = (box.querySelector('#lot_number').value || edit.lot_number).trim();
        const cfg = currentCfg(box);
        const ok = confirm(reprint
          ? `هنعيد طباعة ${count} نسخة من نفس رقم اللوت ${num} (من غير زيادة العدد المطبوع). نكمّل؟`
          : `هنطبع ${count} نسخة من نفس رقم اللوت ${num} (مش أرقام جديدة). نكمّل؟`);
        if (!ok) return;
        const serials = Array.from({ length: count }, () => num);
        const url = (state.settings && state.settings.public_base_url) || (window.ST_CONFIG && window.ST_CONFIG.defaultPublicUrl);
        offerPrintButtons(msg, serials, cfg, url);
        if (!reprint) {
          stats = await ST.markLotPrinted(edit.id, count, cfg.id || box.querySelector('#size').value, cfg);
          edit.printed_count = stats.printed;
          refreshCalc();
        }
      } catch (e) {
        msg.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    }

    box.querySelector('#size').onchange = () => { fillFromPreset(box, box.querySelector('#size').value); refreshCalc(); };
    ['#rRows','#rCols','#rFont','#mFont','#marg','#lot_number'].forEach(sel => {
      const el = box.querySelector(sel);
      if (el) el.addEventListener('input', refreshPreview);
    });
    box.querySelector('#scale_unit').onchange = () => {
      const kg = currentWeightKg();
      const unit = box.querySelector('#scale_unit').value;
      if (kg != null) box.querySelector('#scale_w').value = formatNum(ST.kgToScale(kg, unit));
      refreshCalc();
    };
    ['#scale_w','#carton_weight_kg','#spare_pct'].forEach(sel => {
      box.querySelector(sel).addEventListener('input', refreshCalc);
    });
    refreshCalc();

    box.querySelector('[data-act="save"]').onclick = async () => {
      const msg = box.querySelector('#lotMsg');
      try {
        const supplier = await ensureParty('supplier', box.querySelector('#supplier'));
        const factory = await ensureParty('factory', box.querySelector('#packing_factory'));
        const weight_kg = currentWeightKg();
        const carton_weight_kg = numOrNull(box.querySelector('#carton_weight_kg').value);
        const spare_pct = numOrNull(box.querySelector('#spare_pct').value);
        const base = ST.baseCartons(weight_kg, carton_weight_kg);
        const onCon = (stats && stats.on_container != null) ? stats.on_container : (isEdit ? (edit.on_container || 0) : 0);
        if (isEdit && base != null && onCon > base) {
          if (!confirm(`تحذير: في ${onCon} كرتونة متحمّلة على حاويات، أكبر من العدد الجديد (${base}). تحفظ التعديل رغم كده؟`)) return;
        }
        const row = {
          lot_number: box.querySelector('#lot_number').value.trim(),
          supplier: supplier || null,
          packing_factory: factory || null,
          receipt_date: readDate(box.querySelector('#receipt_date')),
          packing_date: readDate(box.querySelector('#packing_date')),
          production_date: readDate(box.querySelector('#production_date')),
          weight_kg,
          carton_weight_kg,
          spare_pct,
          variety: box.querySelector('#variety').value.trim() || null,
          size_grade: box.querySelector('#size_grade').value.trim() || null,
          notes: box.querySelector('#notes').value.trim() || null
        };
        if (!row.lot_number) throw new Error('رقم اللوت مطلوب');
        const saved = await ST.saveLot(row, isEdit ? edit.id : null);
        await drawLots(saved);
        const box2 = document.getElementById('box');
        const m2 = box2 && box2.querySelector('#lotMsg');
        if (m2) m2.innerHTML = toast('تم الحفظ', 'ok') + m2.innerHTML;
      } catch (e) {
        msg.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };
    const cancel = box.querySelector('[data-act="cancel"]');
    if (cancel) cancel.onclick = () => drawLots();
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => drawLots(lots.find(x => x.id === b.getAttribute('data-edit'))));
  }
  function numOrNull(v) { return (v === '' || v == null) ? null : Number(v); }

  /* ---------------- Containers ---------------- */
  async function viewContainers() {
    app.classList.add('wide');
    app.innerHTML = header('الحاويات', 'حمّل من اللوتات بعدد الكراتين. الحاوية ممكن تجمع أكثر من لوت، واللوت ممكن يتوزع على أكثر من حاوية.') + adminNav('containers') + `<div id="box"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    await drawContainers();
  }
  async function drawContainers(edit) {
    const box = document.getElementById('box');
    let cons = [], customers = [], lots = [];
    try {
      [cons, customers, lots] = await Promise.all([
        ST.listContainers(), ST.parties('customer'), ST.listLots()
      ]);
    } catch (e) {
      box.innerHTML = toast(ST.errMsg(e), 'warn');
      return;
    }
    const r = edit || {};
    const isEdit = !!(edit && edit.id);
    const loads = (isEdit && (edit.loads || [])) || [];
    box.innerHTML = `
      <div class="card">
        <h2>${isEdit ? 'تعديل حاوية ' + esc(r.container_number) : 'حاوية جديدة'}</h2>
        <div class="grid">
          <div class="f"><label>رقم الحاوية</label><input id="container_number" class="ltr" value="${esc(r.container_number||'')}"></div>
          ${dateField('loading_date', r.loading_date, 'تاريخ التحميل', !isEdit)}
          <div class="f"><label>العميل</label>${partySelect('customer','customer',customers,r.customer)}</div>
          <div class="f"><label>جهة الوصول</label><input id="destination" value="${esc(r.destination||'')}"></div>
          <div class="f span"><label>ملاحظات</label><input id="notes" value="${esc(r.notes||'')}"></div>
        </div>
        <div class="row">
          <button class="btn pri" data-act="save">${isEdit ? 'حفظ التعديل' : 'حفظ الحاوية'}</button>
          ${isEdit ? '<button class="btn ghost" data-act="cancel">حاوية جديدة</button>' : ''}
        </div>
        <div id="conMsg"></div>
        ${isEdit ? `<div class="alloc-box" id="allocBox">
          <h2>تحميل لوتات على الحاوية</h2>
          <p class="muted">حدّد اللوت وعدد الكراتين. النظام يمنع التحميل فوق عدد كراتين اللوت (من الميزان، من غير الاحتياطي).</p>
          <div class="grid">
            <div class="f"><label>اللوت</label>
              <select id="alloc_lot">${['<option value="">—</option>'].concat(lots.map(l => {
                const avail = (l.base_cartons != null) ? (l.base_cartons - (l.on_container || 0)) : '—';
                const current = (loads.find(x => x.lot_id === l.id) || {}).carton_count || 0;
                const left = (l.base_cartons != null) ? (l.base_cartons - (l.on_container || 0) + current) : '—';
                return `<option value="${l.id}">${esc(l.lot_number)} — ${esc(l.supplier||'بدون مورد')} (المتاح ${left})</option>`;
              })).join('')}</select>
            </div>
            <div class="f"><label>عدد الكراتين</label><input id="alloc_count" class="ltr" inputmode="numeric" placeholder="مثلاً 200"></div>
          </div>
          <div class="row"><button class="btn pri" type="button" id="allocBtn">تحميل / تحديث العدد</button>
            <button class="btn danger" type="button" id="allocRemove">إزالة اللوت من الحاوية</button></div>
          <div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr>
            <th>اللوت</th><th>المورد</th><th>الكراتين</th>
          </tr></thead><tbody>
          ${loads.length ? loads.map(l => `<tr>
            <td class="serial">${esc(l.lot_number)}</td>
            <td>${val(l.supplier)}</td>
            <td class="num">${esc(l.carton_count)}</td>
          </tr>`).join('') : '<tr><td colspan="3">لم يتم التحميل بعد</td></tr>'}
          </tbody></table></div>
        </div>` : '<p class="muted">بعد حفظ الحاوية تقدر تحمّل عليها لوتات بعدد الكراتين.</p>'}
      </div>
      <div class="card">
        <h2>الحاويات <small>${cons.length}</small></h2>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>رقم الحاوية</th><th>التاريخ</th><th>العميل</th><th>الجهة</th><th>الكراتين</th><th></th>
        </tr></thead><tbody>
        ${cons.length ? cons.map(c => `<tr>
          <td class="serial">${esc(c.container_number)}</td>
          <td>${dateVal(c.loading_date)}</td>
          <td>${val(c.customer)}</td>
          <td>${val(c.destination)}</td>
          <td class="num">${esc(c.carton_count || 0)}</td>
          <td><button class="btn sm" data-edit="${c.id}">تعديل</button></td>
        </tr>`).join('') : '<tr><td colspan="6">لا يوجد حاويات بعد</td></tr>'}
        </tbody></table></div>
      </div>`;

    box.querySelector('[data-act="save"]').onclick = async () => {
      const msg = box.querySelector('#conMsg');
      try {
        const customer = await ensureParty('customer', box.querySelector('#customer'));
        const row = {
          container_number: box.querySelector('#container_number').value.trim(),
          loading_date: readDate(box.querySelector('#loading_date')),
          customer: customer || null,
          destination: box.querySelector('#destination').value.trim() || null,
          notes: box.querySelector('#notes').value.trim() || null
        };
        if (!row.container_number) throw new Error('رقم الحاوية مطلوب');
        const saved = await ST.saveContainer(row, isEdit ? edit.id : null);
        const fresh = (await ST.listContainers()).find(c => c.id === saved.id) || saved;
        await drawContainers(fresh);
        const box2 = document.getElementById('box');
        const m2 = box2 && box2.querySelector('#conMsg');
        if (m2) m2.innerHTML = toast('تم الحفظ', 'ok');
      } catch (e) {
        msg.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };
    const cancel = box.querySelector('[data-act="cancel"]');
    if (cancel) cancel.onclick = () => drawContainers();
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => drawContainers(cons.find(x => x.id === b.getAttribute('data-edit'))));

    const allocBtn = box.querySelector('#allocBtn');
    if (allocBtn) allocBtn.onclick = async () => {
      const msg = box.querySelector('#conMsg');
      try {
        const lotId = box.querySelector('#alloc_lot').value;
        const count = Number(box.querySelector('#alloc_count').value);
        if (!lotId) throw new Error('اختر لوت');
        if (!count || count < 1) throw new Error('أدخل عدد الكراتين');
        await ST.allocateLot(lotId, edit.id, count);
        const fresh = (await ST.listContainers()).find(c => c.id === edit.id);
        await drawContainers(fresh);
        const box2 = document.getElementById('box');
        const m2 = box2 && box2.querySelector('#conMsg');
        if (m2) m2.innerHTML = toast('تم التحميل', 'ok');
      } catch (e) {
        msg.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };
    const rm = box.querySelector('#allocRemove');
    if (rm) rm.onclick = async () => {
      const msg = box.querySelector('#conMsg');
      try {
        const lotId = box.querySelector('#alloc_lot').value;
        if (!lotId) throw new Error('اختر لوت لإزالته');
        if (!confirm('إزالة اللوت ده من الحاوية؟')) return;
        await ST.allocateLot(lotId, edit.id, 0);
        const fresh = (await ST.listContainers()).find(c => c.id === edit.id);
        await drawContainers(fresh);
      } catch (e) {
        msg.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };
  }

  /* ---------------- Search ---------------- */
  async function viewSearch() {
    app.classList.add('wide');
    const q0 = new URLSearchParams(location.search).get('q') || '';
    app.innerHTML = header('بحث وتتبع', 'ابحث برقم اللوت أو الحاوية أو المورد أو العميل') + adminNav('search') + `
      <div class="card">
        <div class="searchbar">
          <input id="q" class="ltr" placeholder="رقم اللوت أو الحاوية أو المورد" value="${esc(q0)}">
          <button class="btn pri" data-act="go">بحث</button>
        </div>
        <div id="res"><p class="muted">اكتب رقم أو اسم للبحث.</p></div>
      </div>`;
    bindNav();
    const run = async () => {
      const q = app.querySelector('#q').value.trim();
      const res = app.querySelector('#res');
      if (!q) { res.innerHTML = '<p class="muted">اكتب رقم أو اسم للبحث.</p>'; return; }
      res.innerHTML = '<p class="muted">جاري البحث…</p>';
      try {
        const data = await ST.searchAll(q);
        const lots = data.lots || [];
        const cons = data.containers || [];
        const cartons = data.cartons || [];
        res.innerHTML = `
          <h2>لوتات <small>${lots.length}</small></h2>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>اللوت</th><th>المورد</th><th>الصنف</th><th>الكراتين</th><th>التحميل</th><th></th></tr></thead><tbody>
          ${lots.length ? lots.map(l => `<tr>
            <td class="serial">${esc(l.lot_number)}</td><td>${val(l.supplier)}</td><td>${val(l.variety)}</td>
            <td class="num">${l.base_cartons != null ? esc(l.base_cartons) : '—'}</td>
            <td class="num">${esc(l.on_container || 0)}</td>
            <td><a class="btn sm" href="/?c=${encodeURIComponent(l.lot_number)}">عرض</a></td>
          </tr>`).join('') : '<tr><td colspan="6">لا يوجد</td></tr>'}
          </tbody></table></div>
          <h2 style="margin-top:16px">حاويات <small>${cons.length}</small></h2>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>الحاوية</th><th>العميل</th><th>الجهة</th><th>الكراتين</th></tr></thead><tbody>
          ${cons.length ? cons.map(c => `<tr>
            <td class="serial">${esc(c.container_number)}</td><td>${val(c.customer)}</td><td>${val(c.destination)}</td>
            <td class="num">${esc(c.carton_count || 0)}</td>
          </tr>`).join('') : '<tr><td colspan="4">لا يوجد</td></tr>'}
          </tbody></table></div>
          ${cartons.length ? `<h2 style="margin-top:16px">أرقام كراتين سابقة <small>${cartons.length}</small></h2>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>اللوت</th><th>الحاوية</th></tr></thead><tbody>
          ${cartons.map(c => `<tr><td class="serial">${esc(c.serial)}</td><td>${val(c.st_lots && c.st_lots.lot_number)}</td><td>${val(c.st_containers && c.st_containers.container_number)}</td></tr>`).join('')}
          </tbody></table></div>` : ''}`;
        res.querySelectorAll('a.btn').forEach(a => a.onclick = ev => { ev.preventDefault(); go(a.getAttribute('href')); });
      } catch (e) {
        res.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };
    app.querySelector('[data-act="go"]').onclick = run;
    app.querySelector('#q').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    if (q0) run();
  }

  /* ---------------- Settings + legacy reprint ---------------- */
  async function viewSettings() {
    app.classList.remove('wide');
    app.innerHTML = header('الإعدادات', 'إخفاء أو إظهار الحقول في صفحة العميل، ونسبة الاحتياطي') + adminNav('settings') + `<div id="box"></div>`;
    bindNav();
    const box = app.querySelector('#box');
    let s;
    try { s = await ST.settings(); state.settings = s; }
    catch (e) { box.innerHTML = toast(ST.errMsg(e), 'warn'); return; }
    const fields = ST.FIELDS.map(([k, ar, en]) => {
      const on = s.public_fields && s.public_fields[k] !== false;
      return `<label style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)">
        <input type="checkbox" data-k="${k}" ${on?'checked':''}>
        <span>${ar} <small class="muted">${en}</small></span></label>`;
    }).join('');
    box.innerHTML = `<div class="card">
      <div class="f"><label>اسم الشركة</label><input id="cn" value="${esc(s.company_name||'')}"></div>
      <div class="f" style="margin-top:8px"><label>الاسم بالإنجليزية</label><input id="cne" class="ltr" value="${esc(s.company_name_en||'')}"></div>
      <div class="f" style="margin-top:8px"><label>عنوان الموقع المطبوع أسفل الاستيكر</label><input id="url" class="ltr" value="${esc(s.public_base_url||'')}"></div>
      <div class="f" style="margin-top:8px"><label>نسبة الاستيكرات الاحتياطية الافتراضية (%)</label>
        <input id="spare" class="ltr" inputmode="decimal" value="${esc(s.default_spare_pct != null ? s.default_spare_pct : 10)}">
        <div class="hint">تتحسب فوق عدد الكراتين: مثلاً 500 كرتونة + 10٪ = 550 استيكر بنفس رقم اللوت.</div>
      </div>
      <h2 style="margin-top:16px">الحقول الظاهرة للعميل</h2>
      <p class="muted">المورد ظاهر افتراضياً، وتقدر تخفيه من هنا. الحاويات تظهر في جدول منفصل في صفحة اللوت.</p>
      ${fields}
      <div class="row"><button class="btn pri" data-act="save">حفظ الإعدادات</button></div>
      <div id="msg"></div>
    </div>
    <div class="card">
      <h2>دفعات أرقام كراتين سابقة</h2>
      <p class="muted">النظام الجديد بيطبع رقم اللوت على كل استيكرات العربية. الدفعات دي من النظام القديم (رقم لكل كرتونة) ومش بنستخدمها في اللوتات الجديدة. تقدر تعيد طباعتها من <a href="/admin/legacy">هنا</a>.</p>
    </div>`;
    box.querySelector('[data-act="save"]').onclick = async () => {
      const pf = {};
      box.querySelectorAll('input[data-k]').forEach(c => { pf[c.getAttribute('data-k')] = c.checked; });
      try {
        state.settings = await ST.saveSettings({
          company_name: box.querySelector('#cn').value.trim(),
          company_name_en: box.querySelector('#cne').value.trim(),
          public_base_url: box.querySelector('#url').value.trim(),
          default_spare_pct: Number(box.querySelector('#spare').value),
          public_fields: pf
        });
        box.querySelector('#msg').innerHTML = toast('تم حفظ الإعدادات', 'ok');
      } catch (e) { box.querySelector('#msg').innerHTML = toast(ST.errMsg(e), 'warn'); }
    };
    box.querySelectorAll('a').forEach(a => {
      if (a.getAttribute('href') && a.getAttribute('href').startsWith('/')) {
        a.addEventListener('click', ev => { ev.preventDefault(); go(a.getAttribute('href')); });
      }
    });
  }

  async function viewLegacy() {
    app.classList.add('wide');
    app.innerHTML = header('دفعات أرقام كراتين سابقة', 'النظام القديم: رقم فريد لكل كرتونة. النظام الجديد لا يستخدم هذه الأرقام في اللوتات الجديدة.') + adminNav('settings') + `<div id="box"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    const box = app.querySelector('#box');
    let batches;
    try { batches = await ST.listBatches(); }
    catch (e) { box.innerHTML = toast(ST.errMsg(e), 'warn'); return; }
    const presets = STLabels.PRESETS;
    const opts = Object.values(presets).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    box.innerHTML = `<div class="card">
      <p class="muted">ما فيش توليد أرقام جديدة من هنا. لو حابب تطبع استيكرات، استخدم شاشة اللوتات: رقم واحد للعربية، ونسخ منه.</p>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>الدفعة</th><th>من</th><th>إلى</th><th>العدد</th><th>المقاس</th><th>طبعت</th><th></th>
      </tr></thead><tbody>
      ${batches.length ? batches.map(b => `<tr>
        <td class="serial">${esc(b.batch_code)}</td>
        <td class="serial">${esc('RS-' + String(b.start_seq).padStart(6,'0'))}</td>
        <td class="serial">${esc('RS-' + String(b.end_seq).padStart(6,'0'))}</td>
        <td class="num">${esc(b.count)}</td>
        <td>${esc(b.label_size||'')}</td>
        <td>${b.printed_at ? dateVal(String(b.printed_at).slice(0,10)) : '—'}</td>
        <td><button class="btn sm" data-reprint="${b.id}">إعادة طباعة</button></td>
      </tr>`).join('') : '<tr><td colspan="7">لا توجد دفعات سابقة</td></tr>'}
      </tbody></table></div>
      <div id="legacyMsg"></div>
      <div class="grid g3" style="margin-top:12px">
        <div class="f"><label>مقاس الاستيكر</label><select id="size">${opts}</select></div>
      </div>
    </div>`;
    box.querySelectorAll('[data-reprint]').forEach(btn => {
      btn.onclick = async () => {
        const msg = box.querySelector('#legacyMsg');
        try {
          const id = btn.getAttribute('data-reprint');
          const rows = await ST.batchCartons(id);
          const serials = (rows || []).map(r => r.serial);
          if (!serials.length) throw new Error('الدفعة فاضية');
          const cfg = STLabels.cfgFrom(box.querySelector('#size').value);
          const url = (state.settings && state.settings.public_base_url) || (window.ST_CONFIG && window.ST_CONFIG.defaultPublicUrl);
          offerPrintButtons(msg, serials, cfg, url);
        } catch (e) {
          msg.innerHTML = toast(ST.errMsg(e), 'warn');
        }
      };
    });
  }

  function bindNav() {
    app.querySelectorAll('.nav a, a.ghost').forEach(a => {
      a.addEventListener('click', ev => {
        const href = a.getAttribute('href');
        if (href && href.startsWith('/')) { ev.preventDefault(); go(href); }
      });
    });
  }

  async function render() {
    const r = parseRoute();
    if (r.name === 'home') return viewHome();
    if (r.name === 'carton') return viewCarton(r.serial);
    if (r.name === 'dash') return viewDash();
    if (r.name === 'lots') return viewLots();
    if (r.name === 'containers') return viewContainers();
    if (r.name === 'search') return viewSearch();
    if (r.name === 'settings') return viewSettings();
    if (r.name === 'legacy') return viewLegacy();
    return viewHome();
  }

  async function init() {
    try { state.settings = await ST.settings(); } catch (e) {}
    window.addEventListener('popstate', render);
    render();
  }
  init();
})();
