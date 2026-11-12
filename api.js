(function (global) {
  const cfg = global.ST_CONFIG;
  const sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const FIELDS = [
    ['supplier', 'المورد', 'Supplier'],
    ['packing_factory', 'مصنع التعبئة', 'Packing factory'],
    ['lot_number', 'رقم اللوت', 'Lot number'],
    ['variety', 'الصنف', 'Variety'],
    ['size_grade', 'المقاس / الدرجة', 'Size / grade'],
    ['packing_date', 'تاريخ التعبئة', 'Packing date'],
    ['production_date', 'تاريخ الإنتاج', 'Production date'],
    ['receipt_date', 'تاريخ الاستلام', 'Receipt date'],
    ['carton_net_weight', 'الوزن الصافي للكرتونة (كجم)', 'Carton net weight (kg)']
  ];

  function cairoToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function fmtDate(d) {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  }
  function parseDateInput(x) {
    let s = String(x == null ? '' : x).trim()
      .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x660))
      .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x6F0))
      .replace(/[\u066B\u066C\u2013\u2014.\-]/g, '/')
      .replace(/\s+/g, '');
    let y, mo, d, m;
    if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else return '';
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return '';
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function normalizeSerial(raw) {
    if (!raw) return '';
    let s = String(raw).toUpperCase().trim().replace(/[\s_]/g, '');
    const carton = s.match(/RS-?(\d{6})-?([A-HJ-NP-Z2-9]{4})$/);
    if (carton) return `RS-${carton[1]}-${carton[2]}`;
    const lot = s.match(/FS-?(\d{4})-?(\d{2,})$/);
    if (lot) return `FS-${lot[1]}-${lot[2].padStart(2, '0')}`;
    return s;
  }
  function errMsg(e) {
    if (!e) return 'حصل خطأ غير معروف';
    const m = e.message || e.error_description || e.hint || String(e);
    if (/not allowed|42501|permission/i.test(m)) return 'مفيش صلاحية للعملية دي';
    return m;
  }
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  function baseCartons(weightKg, cartonKg) {
    const w = Number(weightKg), c = Number(cartonKg);
    if (!w || !c || w <= 0 || c <= 0) return null;
    return Math.ceil((w / c) - 1e-9);
  }
  function requiredStickers(weightKg, cartonKg, sparePct) {
    const base = baseCartons(weightKg, cartonKg);
    if (base == null) return null;
    const spare = (sparePct == null || sparePct === '') ? 10 : Number(sparePct);
    if (Number.isNaN(spare) || spare < 0) return null;
    return Math.ceil((base * (1 + spare / 100)) - 1e-9);
  }
  function scaleToKg(value, unit) {
    const n = Number(value);
    if (value === '' || value == null || Number.isNaN(n)) return null;
    return unit === 't' ? n * 1000 : n;
  }
  function kgToScale(kg, unit) {
    if (kg == null || kg === '' || Number.isNaN(Number(kg))) return '';
    const n = Number(kg);
    return unit === 't' ? (Math.round((n / 1000) * 1000) / 1000) : (Math.round(n * 100) / 100);
  }

  const api = {
    sb, FIELDS, cairoToday, fmtDate, parseDateInput, normalizeSerial, errMsg,
    baseCartons, requiredStickers, scaleToKg, kgToScale,
    lookup(serial) { return rpc('st_lookup_carton', { p_serial: serial }); },
    serialStatus(serial) { return rpc('st_serial_status', { p_serial: serial }); },
    generateBatch(count, labelSize, labelConfig, notes) {
      return rpc('st_generate_batch', { p_count: count, p_label_size: labelSize, p_label_config: labelConfig || {}, p_notes: notes || null });
    },
    nextLotNumber() { return rpc('st_next_lot_number'); },
    markPrinted(id) { return rpc('st_mark_batch_printed', { p_batch_id: id }); },
    markLotPrinted(lotId, add, labelSize, labelConfig) {
      return rpc('st_mark_lot_printed', {
        p_lot_id: lotId,
        p_add: add,
        p_label_size: labelSize || null,
        p_label_config: labelConfig || {}
      });
    },
    settings() { return rpc('st_get_settings'); },
    saveSettings(patch) { return rpc('st_save_settings', { p_patch: patch || {} }); },
    async parties(kind) {
      const data = await rpc('st_list_parties', { p_kind: kind || null });
      return data || [];
    },
    addParty(kind, name) { return rpc('st_add_party', { p_kind: kind, p_name: name }); },
    async listBatches() {
      const data = await rpc('st_list_batches');
      return data || [];
    },
    async batchCartons(batchId) {
      const data = await rpc('st_batch_cartons', { p_batch_id: batchId });
      return data || [];
    },
    async listLots() {
      const data = await rpc('st_list_lots');
      return data || [];
    },
    saveLot(row, id) { return rpc('st_save_lot', { p_row: row, p_id: id || null }); },
    async listContainers() {
      const data = await rpc('st_list_containers');
      return data || [];
    },
    saveContainer(row, id) { return rpc('st_save_container', { p_row: row, p_id: id || null }); },
    allocateLot(lotId, containerId, count) {
      return rpc('st_allocate_lot', { p_lot_id: lotId, p_container_id: containerId, p_carton_count: count });
    },
    async dashboard() {
      const d = await rpc('st_dashboard');
      return d || { lots:0, containers:0, printedStickers:0, baseCartons:0, allocatedCartons:0, unloadedLots:0, legacyCartons:0, legacyFree:0, legacyBatches:0, recentScans:[] };
    },
    async searchAll(q) {
      const data = await rpc('st_search_all', { p_q: q || '' });
      return data || { lots:[], containers:[], cartons:[] };
    },
    async search({ q, lotId, containerId, supplier }) {
      const data = await rpc('st_search_cartons', {
        p_q: q || null,
        p_lot_id: lotId || null,
        p_container_id: containerId || null,
        p_supplier: supplier || null
      });
      return data || [];
    },
    async lotTrace(lotId) {
      const data = await rpc('st_lot_trace', { p_lot_id: lotId });
      return data;
    },
    lotStickerStats(lotId) { return rpc('st_lot_sticker_stats', { p_lot_id: lotId }); }
  };

  global.ST = api;
})(window);
