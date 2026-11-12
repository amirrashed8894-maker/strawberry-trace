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
    if (adminPath === 'admin' || adminPath === 'admin/login') return { name: state.admin ? 'dash' : 'login' };
    if (adminPath.startsWith('admin/')) {
      if (!state.admin && !state.user) return { name: 'login' };
      const rest = adminPath.slice('admin/'.length);
      if (['print','lots','containers','assign','search','settings'].includes(rest)) return { name: rest };
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

  function header(title, sub, badge) {
    return `<div class="top">
      <div><h1>${esc(title)}</h1><div class="sub">${esc(sub || '')}</div></div>
      ${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
    </div>`;
  }
  function adminNav(cur) {
    const items = [
      ['/admin', 'dash', 'لوحة التحكم'],
      ['/admin/print', 'print', 'طباعة الأرقام'],
      ['/admin/lots', 'lots', 'اللوتات'],
      ['/admin/containers', 'containers', 'الحاويات'],
      ['/admin/assign', 'assign', 'التخصيص'],
      ['/admin/search', 'search', 'بحث وتتبع'],
      ['/admin/settings', 'settings', 'الإعدادات']
    ];
    return `<nav class="nav">${items.map(i => `<a href="${i[0]}" class="${cur===i[1]?'on':''}">${i[2]}</a>`).join('')}
      <a href="#" data-act="logout" class="ghost">خروج</a></nav>`;
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

  function fieldList(data, settings, isAdmin) {
    const vis = (settings && settings.public_fields) || {};
    return ST.FIELDS.filter(([k]) => {
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
      <div class="card">
        <h2>اعرض تفاصيل الكرتونة</h2>
        <p class="muted">صوّر كود الـ QR بكاميرا الموبايل، أو اكتب الرقم المكتوب على الاستيكر، أو التقط صورة لو الكود تالف.</p>
        <div class="searchbar">
          <input id="serialIn" class="ltr" placeholder="RS-000001-A3K7" autocomplete="off" autocapitalize="characters">
          <button class="btn pri" data-act="open-serial">عرض</button>
        </div>
        <div class="row">
          <button class="btn" data-act="photo">صوّر الاستيكر</button>
          <input id="photoIn" type="file" accept="image/*" capture="environment" hidden>
        </div>
        <div id="ocrMsg" class="ocr-progress"></div>
      </div>
      <div class="footer">شركة الراشد للتجارة · تتبع الكرتون · <a href="/?p=admin">دخول الإدارة</a></div>`;
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
          ? ` (ظهر ${res.candidates[0].count} مرة في الصورة)`
          : '';
        box.textContent = (res.source === 'qr' ? 'اتقرأ الكود بنجاح: ' : 'اتقرأ الرقم من الكتابة: ') + res.serial + extra;
        openSerial(res.serial);
      } else {
        box.textContent = 'ما قدرناش نقرأ رقم واضح. جرّب صورة أوضح أو اكتب الرقم يدوي.';
      }
    } catch (e) {
      box.textContent = ST.errMsg(e);
    }
  }

  /* ---------------- Public carton ---------------- */
  async function viewCarton(serial) {
    app.classList.remove('wide');
    const s = ST.normalizeSerial(serial);
    app.innerHTML = header('بيانات الكرتونة', 'شركة الراشد للتجارة') + `<div class="card"><p class="muted">جاري التحميل…</p></div>`;
    let data, err;
    try { data = await ST.lookup(s); } catch (e) { err = e; }
    if (err) {
      app.innerHTML = header('بيانات الكرتونة', 'شركة الراشد للتجارة') + toast(ST.errMsg(err), 'warn') + lookupAgain();
      bindLookupAgain();
      return;
    }
    const settings = state.settings;
    if (data.status === 'invalid') {
      app.innerHTML = header('بيانات الكرتونة', '') + toast('الرقم المدخل غير مكتمل أو غير صالح.', 'warn') + lookupAgain();
      bindLookupAgain();
      return;
    }
    if (data.status === 'unknown') {
      app.innerHTML = header('بيانات الكرتونة', '') + `
        <div class="card hero-serial"><div class="s ltr">${esc(data.serial || s)}</div></div>
        <div class="notice warn">الرقم ده مش موجود في النظام. تأكد من الرقم المكتوب على الاستيكر.</div>
        ${lookupAgain()}`;
      bindLookupAgain();
      return;
    }
    if (data.status === 'unassigned') {
      app.innerHTML = header('بيانات الكرتونة', '') + `
        <div class="card hero-serial"><div class="s ltr">${esc(data.serial)}</div>
          <div class="en">${state.admin ? 'الرقم مسجّل ولم يُخصَّص بعد' : ''}</div></div>
        <div class="notice">الكرتونة دي لسه متخصصلهاش بيانات (لوت أو حاوية). لو عندك استفسار، تواصل مع شركة الراشد للتجارة.</div>
        ${state.admin ? `<div class="muted">تسلسل ${data.seq || ''} · يمكن تخصيص الرقم من شاشة التخصيص.</div>` : ''}
        ${lookupAgain()}`;
      bindLookupAgain();
      return;
    }
    let hist = '';
    if (state.admin && data.scan_history) {
      hist = `<div class="card"><h2>سجل المسح <small>${data.scan_count || 0} مرة</small></h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الوقت (القاهرة)</th><th>النوع</th></tr></thead><tbody>
        ${(data.scan_history || []).map(h => `<tr><td class="ltr">${esc(fmtCairo(h.scanned_at))}</td><td>${h.is_admin ? 'إدارة' : 'عميل'}</td></tr>`).join('') || '<tr><td colspan="2">لا يوجد</td></tr>'}
        </tbody></table></div></div>`;
    }
    app.innerHTML = header('بيانات الكرتونة', 'شركة الراشد للتجارة') + `
      <div class="card hero-serial">
        <div class="s ltr">${esc(data.serial)}</div>
        <div class="en">Carton serial</div>
      </div>
      <div class="card"><div class="details">${fieldList(data, settings, state.admin)}</div></div>
      ${hist}
      ${lookupAgain()}`;
    bindLookupAgain();
  }
  function lookupAgain() {
    return `<div class="card"><h2>بحث عن رقم آخر</h2>
      <div class="searchbar"><input id="serialIn" class="ltr" placeholder="RS-000001-A3K7">
      <button class="btn pri" data-act="open-serial">عرض</button></div>
      <div class="row"><button class="btn" data-act="photo">صوّر الاستيكر</button>
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

  /* ---------------- Login ---------------- */
  function viewLogin() {
    app.classList.remove('wide');
    app.innerHTML = header('دخول الإدارة', 'تتبع الكرتون — شركة الراشد للتجارة') + `
      <div class="card login" style="margin-top:0">
        <div class="f"><label>البريد الإلكتروني</label><input id="email" type="email" autocomplete="username" dir="ltr"></div>
        <div class="f" style="margin-top:10px"><label>كلمة المرور</label><input id="pass" type="password" autocomplete="current-password"></div>
        <div class="row"><button class="btn pri wide" data-act="login">دخول</button></div>
        <div id="loginErr"></div>
      </div>`;
    app.querySelector('[data-act="login"]').onclick = doLogin;
    app.querySelector('#pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }
  async function doLogin() {
    const email = app.querySelector('#email').value.trim();
    const pass = app.querySelector('#pass').value;
    const box = app.querySelector('#loginErr');
    box.innerHTML = '';
    try {
      await ST.login(email, pass);
      state.user = await ST.user();
      state.admin = await ST.isAdmin();
      if (!state.admin) {
        await ST.logout();
        state.user = null;
        box.innerHTML = toast('الحساب ده مش حساب إدارة.', 'warn');
        return;
      }
      try { state.settings = await ST.settings(); } catch (e) {}
      go('/admin', true);
    } catch (e) {
      box.innerHTML = toast(ST.errMsg(e), 'warn');
    }
  }

  /* ---------------- Dashboard ---------------- */
  async function viewDash() {
    app.classList.add('wide');
    app.innerHTML = header('لوحة التحكم', 'تتبع الكرتون') + adminNav('dash') + `<div class="card"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    let d;
    try { d = await ST.dashboard(); } catch (e) {
      app.innerHTML = header('لوحة التحكم', '') + adminNav('dash') + toast(ST.errMsg(e), 'warn');
      bindNav(); return;
    }
    app.innerHTML = header('لوحة التحكم', 'شركة الراشد للتجارة') + adminNav('dash') + `
      <div class="kpis">
        <div class="kpi"><b class="num">${d.total}</b><span>إجمالي الكراتين</span></div>
        <div class="kpi"><b class="num">${d.free}</b><span>غير مخصّصة</span></div>
        <div class="kpi"><b class="num">${d.withLot}</b><span>على لوت</span></div>
        <div class="kpi"><b class="num">${d.loaded}</b><span>محمّلة في حاوية</span></div>
        <div class="kpi"><b class="num">${d.lots}</b><span>لوتات</span></div>
        <div class="kpi"><b class="num">${d.containers}</b><span>حاويات</span></div>
        <div class="kpi"><b class="num">${d.batches}</b><span>دفعات طباعة</span></div>
        <div class="kpi"><b class="num">${d.printedCartons}</b><span>مطبوعة</span></div>
      </div>
      <div class="card" style="margin-top:14px">
        <h2>آخر عمليات المسح</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الرقم</th><th>النوع</th></tr></thead><tbody>
        ${(d.recentScans.length ? d.recentScans.map(s => `<tr><td class="ltr">${esc(fmtCairo(s.scanned_at))}</td><td class="serial">${esc(s.serial_attempt||'')}</td><td>${s.is_admin?'إدارة':'عميل'}</td></tr>`).join('') : '<tr><td colspan="3">لا يوجد بعد</td></tr>')}
        </tbody></table></div>
      </div>`;
    bindNav();
  }

  /* ---------------- Print ---------------- */
  async function viewPrint() {
    app.classList.add('wide');
    const presets = STLabels.PRESETS;
    const opts = Object.values(presets).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    app.innerHTML = header('طباعة الأرقام', 'ولّد الأرقام أولاً، اطبع الاستيكرات، وبعدين خصّصها') + adminNav('print') + `
      <div class="card">
        <h2>توليد دفعة جديدة</h2>
        <div class="grid">
          <div class="f"><label>عدد الكراتين</label><input id="cnt" type="number" min="1" max="10000" value="100"></div>
          <div class="f"><label>مقاس الاستيكر</label><select id="size">${opts}</select></div>
          <div class="f span"><label>ملاحظة</label><input id="notes" placeholder="اختياري"></div>
        </div>
        <div class="grid g3" style="margin-top:10px">
          <div class="f"><label>صفوف التكرار</label><input id="rRows" type="number" min="2" max="20"></div>
          <div class="f"><label>أعمدة التكرار</label><input id="rCols" type="number" min="2" max="12"></div>
          <div class="f"><label>حجم الخط الصغير (pt)</label><input id="rFont" type="number" step="0.1" min="3" max="9"></div>
          <div class="f"><label>حجم الرقم الكبير (pt)</label><input id="mFont" type="number" step="0.1" min="6" max="16"></div>
          <div class="f"><label>مقاس الـ QR (مم)</label><input id="qrMm" type="number" step="0.5" min="10" max="28"></div>
          <div class="f"><label>الهامش (مم)</label><input id="marg" type="number" step="0.1" min="0.6" max="4"></div>
        </div>
        <p class="muted">نفس الرقم يتطبع كبير مرة، ويتكرر في شبكة تغطي الاستيكر. لو جزء من الاستيكر اتمسح من التلج أو الرطوبة، الرقم يفضل ظاهر في مكان تاني. عدد الصفوف والأعمدة يتظبط حسب المقاس.</p>
        <div class="preview-wrap" id="preview"></div>
        <div class="row">
          <button class="btn pri" data-act="gen">توليد وطباعة / تحميل</button>
        </div>
        <div id="genMsg"></div>
      </div>
      <div class="card" id="batches"><h2>الدفعات السابقة</h2><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    const sizeEl = app.querySelector('#size');
    function currentCfg() {
      return STLabels.cfgFrom(sizeEl.value, {
        repeatRows: app.querySelector('#rRows').value,
        repeatCols: app.querySelector('#rCols').value,
        repeatFontPt: app.querySelector('#rFont').value,
        mainFontPt: app.querySelector('#mFont').value,
        qrMm: app.querySelector('#qrMm').value,
        marginMm: app.querySelector('#marg').value
      });
    }
    function fillFromPreset() {
      const p = presets[sizeEl.value] || presets['50x30'];
      app.querySelector('#rRows').value = p.repeatRows;
      app.querySelector('#rCols').value = p.repeatCols;
      app.querySelector('#rFont').value = p.repeatFontPt;
      app.querySelector('#mFont').value = p.mainFontPt;
      app.querySelector('#qrMm').value = p.qrMm;
      app.querySelector('#marg').value = p.marginMm;
      refreshPreview();
    }
    async function refreshPreview() {
      const cfg = currentCfg();
      const sample = 'RS-000001-A3K7';
      const base = (state.settings && state.settings.public_base_url) || location.origin;
      const qr = await STLabels.qrDataUrl(sample, base, 280);
      STLabels.renderPreview(app.querySelector('#preview'), cfg, sample, qr);
    }
    sizeEl.onchange = fillFromPreset;
    ['rRows','rCols','rFont','mFont','qrMm','marg'].forEach(id => {
      app.querySelector('#'+id).addEventListener('change', refreshPreview);
    });
    fillFromPreset();

    app.querySelector('[data-act="gen"]').onclick = async () => {
      const n = Number(app.querySelector('#cnt').value);
      const msg = app.querySelector('#genMsg');
      msg.innerHTML = '';
      if (!n || n < 1) return msg.innerHTML = toast('أدخل عدداً صالحاً', 'warn');
      try {
        const cfg = currentCfg();
        const res = await ST.generateBatch(n, cfg.id, {
          repeatRows: cfg.repeatRows, repeatCols: cfg.repeatCols,
          repeatFontPt: cfg.repeatFontPt, mainFontPt: cfg.mainFontPt,
          qrMm: cfg.qrMm, marginMm: cfg.marginMm
        }, app.querySelector('#notes').value || null);
        msg.innerHTML = toast(`اتولدت الدفعة ${res.batch_code}: من ${res.first_serial} إلى ${res.last_serial} (${res.count} كرتونة). جاهزة للطباعة.`, 'ok');
        await showPrintActions(res.batch_id, cfg, msg);
        await loadBatches();
      } catch (e) {
        msg.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };

    async function showPrintActions(batchId, cfg, msg) {
      const extra = document.createElement('div');
      extra.className = 'row';
      extra.innerHTML = `<button class="btn pri" data-act="pdf">تحميل PDF</button>
        <button class="btn" data-act="print">طباعة من المتصفح</button>
        <span class="muted" id="prog"></span>`;
      msg.appendChild(extra);
      const cartons = await ST.batchCartons(batchId);
      const serials = cartons.map(c => c.serial);
      const base = (state.settings && state.settings.public_base_url) || location.origin;
      const prog = extra.querySelector('#prog');
      const tick = (i, t) => { prog.textContent = `جاري تجهيز ${i} من ${t}…`; };
      extra.querySelector('[data-act="pdf"]').onclick = async () => {
        try {
          await STLabels.downloadPdf(serials, cfg, base, tick);
          await ST.markPrinted(batchId);
          prog.textContent = 'تم تحميل الملف، واتعلم على الدفعة إنها اتطبعت.';
          await loadBatches();
        } catch (e) { prog.textContent = ST.errMsg(e); }
      };
      extra.querySelector('[data-act="print"]').onclick = async () => {
        try {
          await STLabels.printLabels(serials, cfg, base, tick);
          await ST.markPrinted(batchId);
          prog.textContent = 'اتفتحت نافذة الطباعة، واتعلم على الدفعة إنها اتطبعت.';
          await loadBatches();
        } catch (e) { prog.textContent = ST.errMsg(e); }
      };
    }

    async function loadBatches() {
      const box = app.querySelector('#batches');
      try {
        const rows = await ST.listBatches();
        box.innerHTML = `<h2>الدفعات السابقة</h2>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>الكود</th><th>من</th><th>إلى</th><th>العدد</th><th>المقاس</th><th>الطباعة</th><th></th></tr></thead><tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td class="ltr">${esc(r.batch_code)}</td>
            <td class="num">${r.start_seq}</td><td class="num">${r.end_seq}</td>
            <td class="num">${r.count}</td><td>${esc(r.label_size)}</td>
            <td>${r.printed_at ? esc(fmtCairo(r.printed_at)) : 'لم تُطبع بعد'}</td>
            <td><button class="btn sm" data-reprint="${r.id}">إعادة طباعة</button></td>
          </tr>`).join('') : '<tr><td colspan="7">لا توجد دفعات بعد</td></tr>'}
          </tbody></table></div>`;
        box.querySelectorAll('[data-reprint]').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-reprint');
            const row = rows.find(x => x.id === id);
            const warn = row.printed_at
              ? 'الدفعة دي اتطبعت قبل كده. إعادة الطباعة هتستخدم نفس الأرقام الموجودة من غير ما تولّد أرقام جديدة. نكمّل؟'
              : 'هتتطبع نفس أرقام الدفعة الموجودة (من غير توليد أرقام جديدة). نكمّل؟';
            if (!confirm(warn)) return;
            const cfg = STLabels.cfgFrom(row.label_size, row.label_config || {});
            const cartons = await ST.batchCartons(id);
            const serials = cartons.map(c => c.serial);
            const base = (state.settings && state.settings.public_base_url) || location.origin;
            btn.disabled = true; btn.textContent = 'جاري التجهيز…';
            try {
              await STLabels.downloadPdf(serials, cfg, base);
              await ST.markPrinted(id);
              await loadBatches();
            } catch (e) { alert(ST.errMsg(e)); btn.disabled = false; btn.textContent = 'إعادة طباعة'; }
          };
        });
      } catch (e) {
        box.innerHTML = toast(ST.errMsg(e), 'warn');
      }
    }
    await loadBatches();
  }

  /* ---------------- Lots ---------------- */
  async function viewLots() {
    app.classList.add('wide');
    app.innerHTML = header('اللوتات', 'عربية المورد ≈ لوت واحد') + adminNav('lots') + `<div id="box"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    await drawLots();
  }
  async function drawLots(edit) {
    const box = app.querySelector('#box');
    let lots, suppliers, factories, nextNo;
    try {
      [lots, suppliers, factories, nextNo] = await Promise.all([
        ST.listLots(), ST.parties('supplier'), ST.parties('factory'), ST.nextLotNumber()
      ]);
    } catch (e) { box.innerHTML = toast(ST.errMsg(e), 'warn'); return; }
    const r = edit || {
      lot_number: nextNo, supplier:'', receipt_date: ST.cairoToday(), weight_kg:'', packing_factory:'',
      packing_date: ST.cairoToday(), production_date:'', variety:'فراولة مجمدة', size_grade:'', carton_weight_kg:'10', notes:''
    };
    box.innerHTML = `
      <div class="card">
        <h2>${edit ? 'تعديل لوت' : 'لوت جديد'}</h2>
        <div class="grid">
          <div class="f"><label>رقم اللوت</label><input id="lot_number" class="ltr" value="${esc(r.lot_number||'')}"> </div>
          <div class="f"><label>المورد</label>${partySelect('supplier','supplier',suppliers,r.supplier)}</div>
          <div class="f"><label>تاريخ الاستلام</label><input id="receipt_date" type="date" value="${esc(r.receipt_date||'')}"> </div>
          <div class="f"><label>وزن العربية (كجم)</label><input id="weight_kg" type="number" step="0.01" value="${esc(r.weight_kg||'')}"> </div>
          <div class="f"><label>مصنع التعبئة</label>${partySelect('packing_factory','factory',factories,r.packing_factory)}</div>
          <div class="f"><label>تاريخ التعبئة</label><input id="packing_date" type="date" value="${esc(r.packing_date||'')}"> </div>
          <div class="f"><label>تاريخ الإنتاج</label><input id="production_date" type="date" value="${esc(r.production_date||'')}"> </div>
          <div class="f"><label>الصنف</label><input id="variety" value="${esc(r.variety||'')}"> </div>
          <div class="f"><label>المقاس / الدرجة</label><input id="size_grade" value="${esc(r.size_grade||'')}"> </div>
          <div class="f"><label>وزن الكرتونة (كجم)</label><input id="carton_weight_kg" type="number" step="0.01" value="${esc(r.carton_weight_kg||'')}"> </div>
          <div class="f span"><label>ملاحظات</label><input id="notes" value="${esc(r.notes||'')}"> </div>
        </div>
        <div class="row"><button class="btn pri" data-act="save-lot">حفظ</button>${edit?`<button class="btn ghost" data-act="cancel">إلغاء</button>`:''}</div>
        <div id="lotMsg"></div>
      </div>
      <div class="card">
        <h2>اللوتات المسجّلة</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>اللوت</th><th>المورد</th><th>الاستلام</th><th>المصنع</th><th>الصنف</th><th>الوزن</th><th></th></tr></thead><tbody>
        ${lots.length? lots.map(l => `<tr>
          <td class="ltr">${esc(l.lot_number)}</td><td>${val(l.supplier)}</td><td class="ltr">${dateVal(l.receipt_date)}</td>
          <td>${val(l.packing_factory)}</td><td>${val(l.variety)}</td><td class="num">${val(l.weight_kg)}</td>
          <td><button class="btn sm" data-edit="${l.id}">تعديل</button>
              <button class="btn sm ghost" data-trace="${l.id}">تتبع</button></td>
        </tr>`).join('') : '<tr><td colspan="7">لا يوجد بعد</td></tr>'}
        </tbody></table></div>
      </div>`;
    box.querySelectorAll('select[data-party]').forEach(sel => {
      sel.addEventListener('change', () => ensureParty(sel.getAttribute('data-party'), sel));
    });
    box.querySelector('[data-act="save-lot"]').onclick = async () => {
      try {
        const supplier = await ensureParty('supplier', box.querySelector('#supplier'));
        const factory = await ensureParty('factory', box.querySelector('#packing_factory'));
        const row = {
          lot_number: box.querySelector('#lot_number').value.trim(),
          supplier: supplier || null,
          receipt_date: box.querySelector('#receipt_date').value || null,
          weight_kg: numOrNull(box.querySelector('#weight_kg').value),
          packing_factory: factory || null,
          packing_date: box.querySelector('#packing_date').value || null,
          production_date: box.querySelector('#production_date').value || null,
          variety: box.querySelector('#variety').value.trim() || null,
          size_grade: box.querySelector('#size_grade').value.trim() || null,
          carton_weight_kg: numOrNull(box.querySelector('#carton_weight_kg').value),
          notes: box.querySelector('#notes').value.trim() || null
        };
        if (!row.lot_number) throw new Error('رقم اللوت مطلوب');
        await ST.saveLot(row, edit && edit.id);
        box.querySelector('#lotMsg').innerHTML = toast('تم الحفظ', 'ok');
        await drawLots();
      } catch (e) {
        box.querySelector('#lotMsg').innerHTML = toast(ST.errMsg(e), 'warn');
      }
    };
    const cancel = box.querySelector('[data-act="cancel"]');
    if (cancel) cancel.onclick = () => drawLots();
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => drawLots(lots.find(x => x.id === b.getAttribute('data-edit'))));
    box.querySelectorAll('[data-trace]').forEach(b => b.onclick = () => go('/admin/search?lot=' + b.getAttribute('data-trace')));
  }
  function numOrNull(v) { return (v === '' || v == null) ? null : Number(v); }

  /* ---------------- Containers ---------------- */
  async function viewContainers() {
    app.classList.add('wide');
    app.innerHTML = header('الحاويات', 'يمكن أن تجمع لوتات من أكثر من مورد') + adminNav('containers') + `<div id="box"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    await drawContainers();
  }
  async function drawContainers(edit) {
    const box = app.querySelector('#box');
    let rows, customers;
    try { [rows, customers] = await Promise.all([ST.listContainers(), ST.parties('customer')]); }
    catch (e) { box.innerHTML = toast(ST.errMsg(e), 'warn'); return; }
    const r = edit || { container_number:'', loading_date: ST.cairoToday(), customer:'', destination:'', notes:'' };
    box.innerHTML = `
      <div class="card">
        <h2>${edit ? 'تعديل حاوية' : 'حاوية جديدة'}</h2>
        <div class="grid">
          <div class="f"><label>رقم الحاوية</label><input id="container_number" class="ltr" value="${esc(r.container_number||'')}"></div>
          <div class="f"><label>تاريخ التحميل</label><input id="loading_date" type="date" value="${esc(r.loading_date||'')}"></div>
          <div class="f"><label>العميل</label>${partySelect('customer','customer',customers,r.customer)}</div>
          <div class="f"><label>جهة الوصول</label><input id="destination" value="${esc(r.destination||'')}"></div>
          <div class="f span"><label>ملاحظات</label><input id="notes" value="${esc(r.notes||'')}"></div>
        </div>
        <div class="row"><button class="btn pri" data-act="save">حفظ</button>${edit?`<button class="btn ghost" data-act="cancel">إلغاء</button>`:''}</div>
        <div id="msg"></div>
      </div>
      <div class="card"><h2>الحاويات</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الحاوية</th><th>التحميل</th><th>العميل</th><th>الوجهة</th><th></th></tr></thead><tbody>
        ${rows.length? rows.map(c => `<tr>
          <td class="ltr">${esc(c.container_number)}</td><td class="ltr">${dateVal(c.loading_date)}</td>
          <td>${val(c.customer)}</td><td>${val(c.destination)}</td>
          <td><button class="btn sm" data-edit="${c.id}">تعديل</button></td>
        </tr>`).join('') : '<tr><td colspan="5">لا يوجد بعد</td></tr>'}
        </tbody></table></div>
      </div>`;
    box.querySelector('#customer').addEventListener('change', () => ensureParty('customer', box.querySelector('#customer')));
    box.querySelector('[data-act="save"]').onclick = async () => {
      try {
        const customer = await ensureParty('customer', box.querySelector('#customer'));
        const row = {
          container_number: box.querySelector('#container_number').value.trim(),
          loading_date: box.querySelector('#loading_date').value || null,
          customer: customer || null,
          destination: box.querySelector('#destination').value.trim() || null,
          notes: box.querySelector('#notes').value.trim() || null
        };
        if (!row.container_number) throw new Error('رقم الحاوية مطلوب');
        await ST.saveContainer(row, edit && edit.id);
        box.querySelector('#msg').innerHTML = toast('تم الحفظ', 'ok');
        await drawContainers();
      } catch (e) { box.querySelector('#msg').innerHTML = toast(ST.errMsg(e), 'warn'); }
    };
    const cancel = box.querySelector('[data-act="cancel"]');
    if (cancel) cancel.onclick = () => drawContainers();
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => drawContainers(rows.find(x => x.id === b.getAttribute('data-edit'))));
  }

  /* ---------------- Assign ---------------- */
  async function viewAssign() {
    app.classList.add('wide');
    app.innerHTML = header('التخصيص', 'اربط مدى أرقام بلوت أو حاوية، أو امسح الاستيكر') + adminNav('assign') + `<div id="box"><p class="muted">جاري التحميل…</p></div>`;
    bindNav();
    const box = app.querySelector('#box');
    let lots, cons;
    try { [lots, cons] = await Promise.all([ST.listLots(), ST.listContainers()]); }
    catch (e) { box.innerHTML = toast(ST.errMsg(e), 'warn'); return; }
    box.innerHTML = `
      <div class="card">
        <h2>تخصيص مدى أرقام</h2>
        <div class="grid">
          <div class="f"><label>من رقم</label><input id="from" class="ltr" placeholder="RS-000001-A3K7"></div>
          <div class="f"><label>إلى رقم</label><input id="to" class="ltr" placeholder="RS-000100-K7P2"></div>
          <div class="f"><label>اللوت</label>
            <select id="lot"><option value="">— بدون تغيير —</option>${lots.map(l=>`<option value="${l.id}">${esc(l.lot_number)} — ${esc(l.supplier||'')}</option>`).join('')}</select>
          </div>
          <div class="f"><label>الحاوية</label>
            <select id="con"><option value="">— بدون تغيير —</option>${cons.map(c=>`<option value="${c.id}">${esc(c.container_number)} — ${esc(c.customer||'')}</option>`).join('')}</select>
          </div>
          <div class="f"><label>وزن الكرتونة (اختياري)</label><input id="w" type="number" step="0.01"></div>
        </div>
        <div class="row">
          <button class="btn pri" data-act="assign">تخصيص</button>
          <button class="btn" data-act="only-free">تخصيص الفارغ فقط</button>
          <button class="btn danger" data-act="unassign">إلغاء التخصيص</button>
          <button class="btn ghost" data-act="scan">مسح بالكاميرا</button>
        </div>
        <div id="reader" hidden></div>
        <div id="msg"></div>
      </div>
      <div class="card">
        <h2>تحميل لوت كامل على حاوية</h2>
        <div class="grid">
          <div class="f"><label>اللوت</label>
            <select id="lot2">${lots.map(l=>`<option value="${l.id}">${esc(l.lot_number)} — ${esc(l.supplier||'')}</option>`).join('')}</select>
          </div>
          <div class="f"><label>الحاوية</label>
            <select id="con2">${cons.map(c=>`<option value="${c.id}">${esc(c.container_number)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="row"><button class="btn pri" data-act="lot2con">تحميل اللوت</button>
          <button class="btn" data-act="lot2con-free">الكراتين غير المحمّلة فقط</button></div>
        <div id="msg2"></div>
      </div>`;

    async function runAssign(onlyFree) {
      const msg = box.querySelector('#msg');
      msg.innerHTML = '';
      try {
        const from = box.querySelector('#from').value.trim();
        const to = box.querySelector('#to').value.trim() || from;
        const res = await ST.assignRange(from, to, box.querySelector('#lot').value, box.querySelector('#con').value, onlyFree, box.querySelector('#w').value);
        if (!res.ok && res.reason === 'conflict') {
          msg.innerHTML = toast(`في ${ (res.conflicts||[]).length } كرتونة متخصّصة قبل كده. تقدر تلغي التخصيص أو تستخدم «تخصيص الفارغ فقط».`, 'warn') +
            `<div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th></tr></thead><tbody>${(res.conflicts||[]).slice(0,40).map(c=>`<tr><td class="serial">${esc(c.serial)}</td></tr>`).join('')}</tbody></table></div>`;
          return;
        }
        msg.innerHTML = toast(`تم التخصيص: ${res.updated} من ${res.total}` + (res.skipped? ` (اتخطّى ${res.skipped})` : ''), 'ok');
      } catch (e) { msg.innerHTML = toast(ST.errMsg(e), 'warn'); }
    }
    box.querySelector('[data-act="assign"]').onclick = () => runAssign(false);
    box.querySelector('[data-act="only-free"]').onclick = () => runAssign(true);
    box.querySelector('[data-act="unassign"]').onclick = async () => {
      if (!confirm('متأكد إنك عايز تلغي التخصيص عن المدى ده؟')) return;
      const what = prompt('إلغاء إيه؟ اكتب: lot أو container أو both', 'both') || 'both';
      try {
        const from = box.querySelector('#from').value.trim();
        const to = box.querySelector('#to').value.trim() || from;
        const res = await ST.unassignRange(from, to, what);
        box.querySelector('#msg').innerHTML = toast(`تم إلغاء التخصيص عن ${res.updated} كرتونة`, 'ok');
      } catch (e) { box.querySelector('#msg').innerHTML = toast(ST.errMsg(e), 'warn'); }
    };
    let scanner = null;
    box.querySelector('[data-act="scan"]').onclick = async () => {
      const holder = box.querySelector('#reader');
      holder.hidden = !holder.hidden;
      if (holder.hidden) { if (scanner) { try { await scanner.stop(); } catch(e){} } return; }
      if (!global.Html5Qrcode) { box.querySelector('#msg').innerHTML = toast('مكتبة المسح غير متاحة', 'warn'); return; }
      scanner = new Html5Qrcode('reader');
      try {
        await scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: 220 }, txt => {
          const s = STOcr.serialFromQrPayload(txt) || ST.normalizeSerial(txt);
          if (s) {
            box.querySelector('#from').value = s;
            if (!box.querySelector('#to').value) box.querySelector('#to').value = s;
          }
        });
      } catch (e) {
        holder.hidden = true;
        box.querySelector('#msg').innerHTML = toast('تعذر فتح الكاميرا: ' + ST.errMsg(e), 'warn');
      }
    };
    box.querySelector('[data-act="lot2con"]').onclick = () => lot2con(false);
    box.querySelector('[data-act="lot2con-free"]').onclick = () => lot2con(true);
    async function lot2con(only) {
      const msg = box.querySelector('#msg2');
      try {
        const res = await ST.assignLotToContainer(box.querySelector('#lot2').value, box.querySelector('#con2').value, only);
        if (!res.ok) { msg.innerHTML = toast(`في ${res.conflicts} كرتونة متحمّلة على حاوية تانية. استخدم الخيار الثاني للفارغ فقط.`, 'warn'); return; }
        msg.innerHTML = toast(`تم: ${res.updated} من ${res.total}`, 'ok');
      } catch (e) { msg.innerHTML = toast(ST.errMsg(e), 'warn'); }
    }
  }

  /* ---------------- Search ---------------- */
  async function viewSearch() {
    app.classList.add('wide');
    const preLot = new URLSearchParams(location.search).get('lot');
    app.innerHTML = header('بحث وتتبع', 'ابحث برقم الكرتونة أو اللوت أو الحاوية أو المورد') + adminNav('search') + `
      <div class="card">
        <div class="searchbar"><input id="q" placeholder="رقم، لوت، حاوية، مورد، عميل"><button class="btn pri" data-act="go">بحث</button>
          <button class="btn" data-act="csv">تصدير CSV</button>
          <button class="btn" data-act="xls">تصدير Excel</button></div>
        <div id="msg"></div>
      </div>
      <div id="out"></div>`;
    bindNav();
    const qEl = app.querySelector('#q');
    qEl.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    app.querySelector('[data-act="go"]').onclick = run;
    let lastRows = [];
    async function run() {
      const out = app.querySelector('#out');
      try {
        const rows = await ST.search({ q: qEl.value, lotId: preLot || null });
        lastRows = rows;
        if (preLot && !qEl.value) {
          try {
            const tr = await ST.lotTrace(preLot);
            out.innerHTML = `<div class="card"><h2>تتبع اللوت ${esc(tr.lot.lot_number)}</h2>
              <p>المورد: <b>${val(tr.lot.supplier)}</b> · الإجمالي: <b class="num">${tr.total}</b> كرتونة</p>
              ${tr.groups.map(g => `<h3 style="font-size:15px">${g.container ? 'حاوية ' + esc(g.container.container_number) + ' — ' + val(g.container.customer) + ' / ' + val(g.container.destination) : 'غير محمّل بعد'} <small>(${g.cartons.length})</small></h3>
                <div class="muted ltr">${g.cartons[0].serial} → ${g.cartons[g.cartons.length-1].serial}</div>`).join('')}
            </div>` + tableHtml(rows);
            return;
          } catch (e) {}
        }
        out.innerHTML = tableHtml(rows);
      } catch (e) { app.querySelector('#msg').innerHTML = toast(ST.errMsg(e), 'warn'); }
    }
    function tableHtml(rows) {
      if (!rows.length) return `<div class="card"><p class="muted">لا توجد نتائج</p></div>`;
      return `<div class="card"><h2>النتائج <small>${rows.length}</small></h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>اللوت</th><th>المورد</th><th>الحاوية</th><th>العميل</th><th>الوجهة</th></tr></thead><tbody>
        ${rows.map(r => `<tr>
          <td class="serial"><a href="/c/${encodeURIComponent(r.serial)}">${esc(r.serial)}</a></td>
          <td class="ltr">${val(r.st_lots && r.st_lots.lot_number)}</td>
          <td>${val(r.st_lots && r.st_lots.supplier)}</td>
          <td class="ltr">${val(r.st_containers && r.st_containers.container_number)}</td>
          <td>${val(r.st_containers && r.st_containers.customer)}</td>
          <td>${val(r.st_containers && r.st_containers.destination)}</td>
        </tr>`).join('')}
        </tbody></table></div></div>`;
    }
    app.querySelector('[data-act="csv"]').onclick = async () => downloadDelim(await ST.exportRows(lastRows), 'csv');
    app.querySelector('[data-act="xls"]').onclick = async () => downloadDelim(await ST.exportRows(lastRows), 'xls');
    if (preLot) run();
  }
  function downloadDelim(rows, kind) {
    if (!rows || !rows.length) return alert('مفيش نتائج للتصدير');
    const cols = Object.keys(rows[0]);
    const escCell = v => `"${String(v==null?'':v).replace(/"/g,'""')}"`;
    const body = [cols.join('\t'), ...rows.map(r => cols.map(c => r[c]).map(escCell).join('\t'))].join('\n');
    const bom = '\uFEFF';
    const mime = kind === 'xls' ? 'application/vnd.ms-excel;charset=utf-8' : 'text/csv;charset=utf-8';
    const blob = new Blob([bom + body.replace(/\t/g, kind==='xls'?'\t':',')], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `carton-trace-${ST.cairoToday()}.${kind==='xls'?'xls':'csv'}`;
    a.click();
  }

  /* ---------------- Settings ---------------- */
  async function viewSettings() {
    app.classList.remove('wide');
    app.innerHTML = header('الإعدادات', 'إخفاء أو إظهار الحقول في صفحة العميل') + adminNav('settings') + `<div id="box"></div>`;
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
      <div class="f" style="margin-top:8px"><label>بادئة الرقم</label><input id="pref" class="ltr" value="${esc(s.serial_prefix||'RS')}"></div>
      <div class="f" style="margin-top:8px"><label>رابط الموقع العام (يُطبع داخل الـ QR)</label><input id="url" class="ltr" value="${esc(s.public_base_url||'')}"></div>
      <h2 style="margin-top:16px">الحقول الظاهرة للعميل</h2>
      <p class="muted">المورد ظاهر افتراضياً، وتقدر تخفيه من هنا.</p>
      ${fields}
      <div class="row"><button class="btn pri" data-act="save">حفظ الإعدادات</button></div>
      <div id="msg"></div>
    </div>`;
    box.querySelector('[data-act="save"]').onclick = async () => {
      const pf = {};
      box.querySelectorAll('input[data-k]').forEach(c => { pf[c.getAttribute('data-k')] = c.checked; });
      try {
        state.settings = await ST.saveSettings({
          company_name: box.querySelector('#cn').value.trim(),
          company_name_en: box.querySelector('#cne').value.trim(),
          serial_prefix: box.querySelector('#pref').value.trim() || 'RS',
          public_base_url: box.querySelector('#url').value.trim(),
          public_fields: pf
        });
        box.querySelector('#msg').innerHTML = toast('تم حفظ الإعدادات', 'ok');
      } catch (e) { box.querySelector('#msg').innerHTML = toast(ST.errMsg(e), 'warn'); }
    };
  }

  function bindNav() {
    app.querySelectorAll('.nav a').forEach(a => {
      a.addEventListener('click', ev => {
        const href = a.getAttribute('href');
        if (a.getAttribute('data-act') === 'logout') {
          ev.preventDefault();
          ST.logout().then(() => { state.user = null; state.admin = false; go('/'); });
          return;
        }
        if (href && href.startsWith('/')) { ev.preventDefault(); go(href); }
      });
    });
  }

  async function render() {
    const r = parseRoute();
    if (r.name === 'home') return viewHome();
    if (r.name === 'carton') return viewCarton(r.serial);
    if (r.name === 'login') return viewLogin();
    if (!state.admin) return viewLogin();
    if (r.name === 'dash') return viewDash();
    if (r.name === 'print') return viewPrint();
    if (r.name === 'lots') return viewLots();
    if (r.name === 'containers') return viewContainers();
    if (r.name === 'assign') return viewAssign();
    if (r.name === 'search') return viewSearch();
    if (r.name === 'settings') return viewSettings();
    return viewDash();
  }

  window.addEventListener('popstate', render);
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && href.startsWith('/') && !a.hasAttribute('download') && a.target !== '_blank') {
      ev.preventDefault();
      go(href);
    }
  });

  (async function init() {
    try {
      state.user = await ST.user();
      if (state.user) state.admin = await ST.isAdmin();
      if (state.admin) {
        try { state.settings = await ST.settings(); } catch (e) {}
      }
    } catch (e) {}
    render();
  })();
})();
