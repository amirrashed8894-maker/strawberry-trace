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
    ['carton_net_weight', 'الوزن الصافي للكرتونة (كجم)', 'Carton net weight (kg)'],
    ['container_number', 'رقم الحاوية', 'Container number'],
    ['loading_date', 'تاريخ التحميل', 'Loading date'],
    ['customer', 'العميل', 'Customer'],
    ['destination', 'جهة الوصول', 'Destination']
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
  function normalizeSerial(raw) {
    if (!raw) return '';
    let s = String(raw).toUpperCase().trim().replace(/[\s_]/g, '');
    const m = s.match(/RS-?(\d{6})-?([A-HJ-NP-Z2-9]{4})$/);
    return m ? `RS-${m[1]}-${m[2]}` : s;
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

  const api = {
    sb, FIELDS, cairoToday, fmtDate, normalizeSerial, errMsg,
    // Admin is open by design (v1.0.4): no login. Operations go through granted RPCs only.
    lookup(serial) { return rpc('st_lookup_carton', { p_serial: serial }); },
    serialStatus(serial) { return rpc('st_serial_status', { p_serial: serial }); },
    generateBatch(count, labelSize, labelConfig, notes) {
      return rpc('st_generate_batch', { p_count: count, p_label_size: labelSize, p_label_config: labelConfig || {}, p_notes: notes || null });
    },
    assignRange(from, to, lotId, containerId, onlyFree, weight) {
      return rpc('st_assign_range', {
        p_from: from, p_to: to,
        p_lot_id: lotId || null,
        p_container_id: containerId || null,
        p_only_free: !!onlyFree,
        p_carton_weight: weight == null || weight === '' ? null : Number(weight)
      });
    },
    unassignRange(from, to, what) {
      return rpc('st_unassign_range', { p_from: from, p_to: to, p_what: what || 'both' });
    },
    assignLotToContainer(lotId, containerId, onlyUnassigned) {
      return rpc('st_assign_lot_to_container', { p_lot_id: lotId, p_container_id: containerId, p_only_unassigned: !!onlyUnassigned });
    },
    nextLotNumber() { return rpc('st_next_lot_number'); },
    markPrinted(id) { return rpc('st_mark_batch_printed', { p_batch_id: id }); },
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
    async dashboard() {
      const d = await rpc('st_dashboard');
      return d || { total:0, withLot:0, loaded:0, free:0, lots:0, containers:0, batches:0, printedCartons:0, recentScans:[] };
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
    async exportRows(rows) {
      return (rows || []).map(r => ({
        serial: r.serial,
        seq: r.seq,
        lot_number: r.st_lots?.lot_number || '',
        supplier: r.st_lots?.supplier || '',
        packing_factory: r.st_lots?.packing_factory || '',
        variety: r.st_lots?.variety || '',
        size_grade: r.st_lots?.size_grade || '',
        packing_date: r.st_lots?.packing_date || '',
        carton_net_weight: r.carton_net_weight_kg || r.st_lots?.carton_weight_kg || '',
        container_number: r.st_containers?.container_number || '',
        loading_date: r.st_containers?.loading_date || '',
        customer: r.st_containers?.customer || '',
        destination: r.st_containers?.destination || ''
      }));
    }
  };

  global.ST = api;
})(window);
