(function (global) {
  const cfg = global.ST_CONFIG;
  const sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'st-auth' }
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
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session || null;
    },
    async user() {
      const { data } = await sb.auth.getUser();
      return data.user || null;
    },
    async login(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async logout() { await sb.auth.signOut(); },
    async isAdmin() {
      const u = await api.user();
      if (!u) return false;
      if (u.app_metadata && u.app_metadata.role === 'admin') return true;
      const { data, error } = await sb.from('st_admins').select('user_id').eq('user_id', u.id).maybeSingle();
      if (error) return false;
      return !!data;
    },
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
    async settings() {
      const { data, error } = await sb.from('st_settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
    async saveSettings(patch) {
      const { data, error } = await sb.from('st_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
      if (error) throw error;
      return data;
    },
    async parties(kind) {
      let q = sb.from('st_parties').select('*').order('name');
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async addParty(kind, name) {
      const { data, error } = await sb.from('st_parties').insert({ kind, name: name.trim() }).select().single();
      if (error) {
        if (String(error.message || '').includes('duplicate')) {
          const { data: d2 } = await sb.from('st_parties').select('*').eq('kind', kind).eq('name', name.trim()).single();
          return d2;
        }
        throw error;
      }
      return data;
    },
    async listBatches() {
      const { data, error } = await sb.from('st_batches').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    async batchCartons(batchId) {
      const { data, error } = await sb.from('st_cartons').select('serial,seq,check_code,lot_id,container_id').eq('batch_id', batchId).order('seq');
      if (error) throw error;
      return data || [];
    },
    async rangeCartons(from, to) {
      const a = await api.cartonBySerial(from);
      const b = await api.cartonBySerial(to);
      if (!a || !b) throw new Error('رقم غير موجود في المدى');
      const lo = Math.min(a.seq, b.seq), hi = Math.max(a.seq, b.seq);
      const { data, error } = await sb.from('st_cartons').select('serial,seq').gte('seq', lo).lte('seq', hi).order('seq');
      if (error) throw error;
      return data || [];
    },
    async cartonBySerial(serial) {
      const s = normalizeSerial(serial);
      const { data, error } = await sb.from('st_cartons').select('*').eq('serial', s).maybeSingle();
      if (error) throw error;
      return data;
    },
    async listLots() {
      const { data, error } = await sb.from('st_lots').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
    async saveLot(row, id) {
      if (id) {
        const { data, error } = await sb.from('st_lots').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb.from('st_lots').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async listContainers() {
      const { data, error } = await sb.from('st_containers').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
    async saveContainer(row, id) {
      if (id) {
        const { data, error } = await sb.from('st_containers').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb.from('st_containers').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async dashboard() {
      const [cartons, lots, containers, batches, scans] = await Promise.all([
        sb.from('st_cartons').select('id,lot_id,container_id,batch_id'),
        sb.from('st_lots').select('id', { count: 'exact', head: true }),
        sb.from('st_containers').select('id', { count: 'exact', head: true }),
        sb.from('st_batches').select('id,count,printed_at,created_at'),
        sb.from('st_scan_logs').select('id,serial_attempt,scanned_at,is_admin,carton_id').order('scanned_at', { ascending: false }).limit(12)
      ]);
      if (cartons.error) throw cartons.error;
      const rows = cartons.data || [];
      return {
        total: rows.length,
        withLot: rows.filter(r => r.lot_id).length,
        loaded: rows.filter(r => r.container_id).length,
        free: rows.filter(r => !r.lot_id && !r.container_id).length,
        lots: lots.count || 0,
        containers: containers.count || 0,
        batches: (batches.data || []).length,
        printedCartons: (batches.data || []).filter(b => b.printed_at).reduce((s, b) => s + (b.count || 0), 0),
        recentScans: scans.data || []
      };
    },
    async search({ q, lotId, containerId, supplier }) {
      const term = (q || '').trim();
      if (term && /^RS/i.test(term)) {
        const { data, error } = await sb.from('st_cartons')
          .select('*, st_lots(*), st_containers(*)')
          .ilike('serial', `%${normalizeSerial(term).replace(/%/g, '')}%`)
          .order('seq').limit(200);
        if (error) throw error;
        return data || [];
      }
      let lotIds = null;
      if (supplier) {
        const { data, error } = await sb.from('st_lots').select('id').ilike('supplier', `%${supplier}%`);
        if (error) throw error;
        lotIds = (data || []).map(x => x.id);
        if (!lotIds.length) return [];
      }
      if (term && !lotId) {
        const { data: lots } = await sb.from('st_lots').select('id,lot_number,supplier').or(`lot_number.ilike.%${term}%,supplier.ilike.%${term}%`);
        const { data: cons } = await sb.from('st_containers').select('id,container_number,customer').or(`container_number.ilike.%${term}%,customer.ilike.%${term}%,destination.ilike.%${term}%`);
        const lids = (lots || []).map(x => x.id);
        const cids = (cons || []).map(x => x.id);
        let qy = sb.from('st_cartons').select('*, st_lots(*), st_containers(*)');
        const ors = [];
        if (lids.length) ors.push(`lot_id.in.(${lids.join(',')})`);
        if (cids.length) ors.push(`container_id.in.(${cids.join(',')})`);
        ors.push(`serial.ilike.%${term}%`);
        qy = qy.or(ors.join(','));
        if (lotId) qy = qy.eq('lot_id', lotId);
        if (containerId) qy = qy.eq('container_id', containerId);
        const { data, error } = await qy.order('seq').limit(500);
        if (error) throw error;
        return data || [];
      }
      let qy = sb.from('st_cartons').select('*, st_lots(*), st_containers(*)');
      if (lotId) qy = qy.eq('lot_id', lotId);
      if (containerId) qy = qy.eq('container_id', containerId);
      if (lotIds) qy = qy.in('lot_id', lotIds);
      const { data, error } = await qy.order('seq').limit(500);
      if (error) throw error;
      return data || [];
    },
    async lotTrace(lotId) {
      const { data: lot, error: e1 } = await sb.from('st_lots').select('*').eq('id', lotId).single();
      if (e1) throw e1;
      const { data: cartons, error: e2 } = await sb.from('st_cartons').select('id,serial,seq,container_id,st_containers(*)').eq('lot_id', lotId).order('seq');
      if (e2) throw e2;
      const byCon = new Map();
      for (const c of cartons || []) {
        const key = c.container_id || 'none';
        if (!byCon.has(key)) byCon.set(key, { container: c.st_containers || null, cartons: [] });
        byCon.get(key).cartons.push(c);
      }
      return { lot, total: (cartons || []).length, groups: [...byCon.values()] };
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
