import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, Modal, TextInput } from 'react-native';
import {
  Screen, TopBar, Card, Field, SelectField, DateField, Segmented, SectionTitle, KV, Btn, Loading, PickerModal, Badge, LockedField, Stepper, ui,
} from '../components/ui';
import { LineEditor, EditLine, lineCalc } from '../components/LineEditor';
import { ItemCart } from '../components/ItemCart';
import { Scanner } from '../components/Scanner';
import { findByCode, parseJewelCode, JewelTagData } from '../utils/codes';
import { allocate, fifoOrder } from '../utils/fifo';
import { shareInvoice } from '../utils/invoice';
import { BillService, LedgerService, ItemService } from '../api/services';
import { Batch, BillType, Item, Ledger } from '../types';
import { BILL, accentOf } from '../labels';
import { C, R } from '../theme';
import { useAuth } from '../context/AuthContext';
import { money, today, r2, drcr, amt, dmy } from '../utils/format';

interface PaymentSplit {
  ledger_id: number;
  name: string;
  amount: string;
}

/** New / modify any bill type: Sale, Challan, Counter Sale, Sale Return, Purchase, Purchase Challan, Purchase Return. */
export const BillEntryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { user, company } = useAuth();
  const type: BillType = route.params?.type ?? 'SALE';
  const editId: number | undefined = route.params?.id;

  useEffect(() => {
    if (editId && user?.app_perms?.edit === false) {
      Alert.alert('Permission Denied', 'Editing is not permitted on this account.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [editId, user]);
  const kind = BILL[type];
  const accent = accentOf(kind.module);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [no, setNo] = useState('');
  const [date, setDate] = useState(today());
  const [party, setParty] = useState<Ledger | null>(null);
  const [refNo, setRefNo] = useState('');
  const [refDate, setRefDate] = useState('');
  const [reason, setReason] = useState('');
  const [walkin, setWalkin] = useState({
    name: '',
    mobile: '',
    address: '',
    gstin: '',
    state: '',
    dl_no: '',
    email: '',
    order_no: '',
    remark: '',
  });
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [cdPct, setCdPct] = useState('');
  const [freight, setFreight] = useState('');
  const [other, setOther] = useState('');
  const [payMode, setPayMode] = useState<number>(0);   // 0 = credit, else cash/bank ledger id
  const [paySplits, setPaySplits] = useState<PaymentSplit[]>([]);

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [allParties, setAllParties] = useState(false);
  const [modes, setModes] = useState<Ledger[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [picker, setPicker] = useState<'' | 'party' | 'item' | 'batch' | 'cart' | 'payMode'>('');
  const [scannedJewel, setScannedJewel] = useState<JewelTagData | null>(null);

  // Batches of each item on the bill, for FIFO (outward bills never show a batch window).
  const batchCache = React.useRef<Record<number, Batch[]>>({});
  const [batches, setBatches] = useState<Batch[]>([]);
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
  const [editing, setEditing] = useState<{ line: EditLine; index: number } | null>(null);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    (async () => {
      try {
        const [ls, ms] = await Promise.all([LedgerService.list(), LedgerService.paymentModes().catch(() => [] as Ledger[])]);
        setLedgers(ls);
        setModes(ms);
        if (editId) {
          const b = await BillService.get(editId);
          setNo(b.no); setDate(b.date); setNarration(b.narration ?? ''); setRefNo(b.ref_no ?? ''); setRefDate(b.ref_date ?? '');
          setReason(b.reason ?? '');
          setWalkin({
            name: b.walkin_name ?? '',
            mobile: b.walkin_mobile ?? '',
            address: b.walkin_address ?? '',
            gstin: b.walkin_gstin ?? '',
            state: '',
            dl_no: '',
            email: '',
            order_no: '',
            remark: '',
          });
          setParty(ls.find((l) => l.id === b.party_id) ?? null);
          setFreight(b.freight ? String(b.freight) : ''); setOther(b.other_charges ? String(b.other_charges) : '');
          if (b.cd_amt && b.taxable) setCdPct(String(r2((b.cd_amt / b.taxable) * 100)));
          if (b.payments?.length) {
            setPaySplits(b.payments.map((p) => ({
              ledger_id: p.ledger_id,
              name: p.ledger || ls.find((l) => l.id === p.ledger_id)?.name || 'Payment',
              amount: String(p.amount),
            })));
            setPayMode(b.payments[0].ledger_id);
          } else {
            setPayMode(0);
          }
          setLines((b.lines ?? []).map((l) => ({
            ...l, item_name: l.item_name ?? '', qty: Number(l.qty), free: Number(l.free) || 0, rate: Number(l.rate),
            disc_pct: Number(l.disc_pct) || 0, gst_rate: Number(l.gst_rate) || 0,
          })));
        } else {
          const r = await BillService.nextNo(type).catch(() => ({ no: '' }));
          setNo(r.no);
          if (type === 'SALE' || type === 'COUNTER_SALE' || type === 'SALE_CHALLAN') {
            const cash = ls.find((l) => l.name.toLowerCase().includes('cash'));
            setParty(cash ?? null);
            setPayMode(ms.find((m) => m.name.toLowerCase().includes('cash'))?.id ?? ms[0]?.id ?? 0);
          }
        }
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Back from "New Ledger" / "New Item" → the new party shows in the picker, the new item goes on the bill.
  useEffect(() => navigation.addListener('focus', () => {
    if (loading) return;
    LedgerService.list().then(setLedgers).catch(() => {});
    LedgerService.paymentModes().then(setModes).catch(() => {});
    const code = pendingCode.current;
    if (code) {
      pendingCode.current = '';
      ItemService.list().then((all) => { setItems(all); const it = findByCode(all, code); if (it) setCartQty(it, (cur) => cur + 1); }).catch(() => {});
    }
  }), [navigation, loading, lines]);

  // Items & Stock ▸ "+ Stock": open the purchase with that item already on it.
  useEffect(() => {
    const it = route.params?.seedItem as Item | undefined;
    if (it && !lines.length && !loading) {
      startLine(it);
    }
  }, [loading, route.params?.seedItem]);

  const loadItems = async () => {
    if (items.length) return items;
    const all = await ItemService.list();
    setItems(all);
    return all;
  };
  const batchesOf = async (itemId: number) => {
    if (batchCache.current[itemId]) return batchCache.current[itemId];
    const bs = await ItemService.batches(itemId).catch(() => [] as Batch[]);
    batchCache.current[itemId] = bs;
    return bs;
  };

  // ---------------------------------------------------------------- cart & scanning
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [linkCode, setLinkCode] = useState('');   // unknown code waiting to be linked to an item
  const pendingCode = React.useRef('');

  const onScan = async (code: string) => {
    const all = await loadItems();
    const jewel = parseJewelCode(code, all);
    if (jewel) {
      setScanning(false);
      setScannedJewel(jewel);
      return;
    }

    const it = findByCode(all, code);
    if (it) {
      setCartQty(it, (cur) => cur + 1);
      setScanMsg(`✓ ${it.name} · qty ${qtyOf(it.id) + 1}`);
      return;
    }
    setScanning(false);
    Alert.alert('New code', `No item has code ${code} yet. Link it once — next time a scan adds the item directly.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Link to an item', onPress: () => setLinkCode(code) },
      { text: 'Create new item', onPress: () => { pendingCode.current = code; navigation.navigate('ItemEntry', { barcode: code }); } },
    ]);
  };

  const addJewelToBill = async (j: JewelTagData) => {
    setScannedJewel(null);
    const all = await loadItems();
    let it = findByCode(all, j.code) || all.find((i) => i.name.toUpperCase() === j.name.toUpperCase());
    if (it) {
      const line: EditLine = {
        item_id: it.id,
        item_name: it.name,
        pack: `${j.nw.toFixed(3)} GM`,
        unit: 'GM',
        batch_id: null,
        batch: j.code,
        expiry: '',
        mrp: Number(it.mrp ?? 0),
        qty: j.nw > 0 ? j.nw : 1,
        free: 0,
        rate: Number(it.sale_rate ?? 0),
        disc_pct: 0,
        gst_rate: Number(it.gst_rate ?? 3),
        stock: 999,
      };
      setLines((prev) => [...prev, line]);
      Alert.alert('Added ✓', `${it.name} (${j.nw.toFixed(3)} gm) added to bill.\nTag: ${j.code}`);
    } else {
      Alert.alert('Item Found via Tag', `Tag ${j.code} (${j.name || 'Jewellery Item'}) Net: ${j.nw.toFixed(3)} gm, GW: ${j.gw.toFixed(3)} gm. Create in Item Master?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create Item', onPress: () => navigation.navigate('ItemEntry', { barcode: j.code }) },
      ]);
    }
  };

  const linkTo = async (it: Item) => {
    const code = linkCode;
    setLinkCode('');
    try {
      await ItemService.setBarcode(it.id, code);
      const linked = { ...it, details: JSON.stringify({ ...JSON.parse(it.details || '{}'), barcode: code }) };
      setItems((all) => all.map((i) => (i.id === it.id ? linked : i)));
      setCartQty(linked, (cur) => cur + 1);
      Alert.alert('Linked ✓', `${code} now adds ${it.name}.`);
    } catch (e: any) {
      Alert.alert('Could not link', e.message);
    }
  };

  // ---------------------------------------------------------------- item → batch → line
  const startLine = (it: Item, b?: Batch) => {
    const rate = kind.inward
      ? (type === 'SALE_RETURN' ? Number(b?.rate ?? it.sale_rate ?? 0) : Number(b?.purchase_rate ?? it.purchase_rate ?? 0))
      : (type === 'PURCHASE_RETURN' ? Number(b?.purchase_rate ?? it.purchase_rate ?? 0) : Number(b?.rate ?? it.sale_rate ?? 0));
    const line: EditLine = {
      item_id: it.id, item_name: it.name, pack: it.pack, unit: it.unit,
      batch_id: b && b.id ? b.id : null, batch: b?.batch === 'OPENING' ? '' : (b?.batch ?? ''), expiry: b?.expiry ?? '', mrp: Number(b?.mrp ?? it.mrp ?? 0),
      qty: 1, free: 0, rate, disc_pct: 0, gst_rate: Number(it.gst_rate ?? 0),
      stock: kind.inward ? undefined : Number(b?.stock ?? it.stock ?? 0),
    };
    setEditing({ line, index: -1 });
  };
  const pickItem = async (it: Item) => {
    setPicker('');
    const bs = await batchesOf(it.id);
    setBatches(bs);
    if (!kind.inward && bs.length > 1) {
      setPendingItem(it);
      setPicker('batch');
      return;
    }
    startLine(it, bs[0]);
  };
  const pickBatch = (b: Batch) => {
    setPicker('');
    if (!pendingItem) return;
    startLine(pendingItem, b);
    setPendingItem(null);
  };
  const saveLine = (l: EditLine) => {
    if (editing && editing.index >= 0) setLines((ls) => ls.map((cur, i) => (i === editing.index ? l : cur)));
    else setLines((ls) => [...ls, l]);
    setEditing(null);
  };
  const stepLine = (index: number, qty: number) => {
    if (qty <= 0) setLines((ls) => ls.filter((_, i) => i !== index));
    else setLines((ls) => ls.map((cur, i) => (i === index ? { ...cur, qty } : cur)));
  };

  const qtyOf = (itemId: number) => lines.filter((l) => l.item_id === itemId).reduce((s, l) => s + Number(l.qty), 0);
  const outRate = (it: Item) => type === 'PURCHASE_RETURN' ? Number(it.purchase_rate ?? 0) : Number(it.sale_rate ?? 0);
  const setCartQty = (it: Item, update: number | ((cur: number) => number)) => {
    const cur = qtyOf(it.id);
    const next = Math.max(0, typeof update === 'function' ? update(cur) : update);
    if (next === cur) return;
    if (next === 0) {
      setLines((ls) => ls.filter((l) => l.item_id !== it.id));
      return;
    }
    const existingIdx = lines.findIndex((l) => l.item_id === it.id);
    if (existingIdx >= 0) {
      setLines((ls) => ls.map((l, i) => (i === existingIdx ? { ...l, qty: next } : l)));
    } else {
      setLines((ls) => [...ls, {
        item_id: it.id, item_name: it.name, pack: it.pack, unit: it.unit,
        batch_id: null, batch: '', expiry: '', mrp: Number(it.mrp ?? 0),
        qty: next, free: 0, rate: outRate(it), disc_pct: 0, gst_rate: Number(it.gst_rate ?? 0),
        fifo: !kind.inward,
      }]);
    }
  };
  const openItems = async () => {
    await loadItems();
    setPicker(kind.inward ? 'item' : 'cart');
  };

  // ---------------------------------------------------------------- bill totals
  const t = useMemo(() => {
    let gross = 0, taxable = 0, tax = 0, qty = 0;
    for (const l of lines) {
      const c = lineCalc(l);
      gross += c.gross; taxable += c.taxable; tax += c.tax; qty += Number(l.qty) || 0;
    }
    const cd = taxable && cdPct ? r2((taxable * (Number(cdPct) || 0)) / 100) : 0;
    const sub = taxable - cd + tax + (Number(freight) || 0) + (Number(other) || 0);
    const net = Math.round(sub);
    const round = r2(net - sub);
    return { gross: r2(gross), taxable: r2(taxable), tax: r2(tax), cd, net, round, qty: r2(qty) };
  }, [lines, cdPct, freight, other]);

  // ---------------------------------------------------------------- save
  const save = async () => {
    if (!party) { Alert.alert('Select party', `Choose the ledger first.`); return; }
    if (!lines.length) { Alert.alert('No items', 'Add at least one item.'); return; }
    if (kind.needsReason && !reason.trim()) { Alert.alert('Reason required', 'Enter the reason for this return.'); return; }
    const outLines: Record<string, unknown>[] = [];
    for (const l of lines) {
      const base = { item_id: l.item_id, rate: l.rate, disc_pct: l.disc_pct, gst_rate: l.gst_rate };
      if (l.fifo && !kind.inward) {
        for (const a of allocate(Number(l.qty), Number(l.free || 0), await batchesOf(l.item_id))) outLines.push({ ...base, ...a, mrp: a.mrp || l.mrp });
      } else {
        outLines.push({ ...base, batch_id: l.batch_id || undefined, batch: l.batch, expiry: l.expiry, qty: l.qty, free: l.free, mrp: l.mrp });
      }
    }

    const activePayments = paySplits.length > 0
      ? paySplits.filter((p) => Number(p.amount) > 0).map((p) => ({ ledger_id: p.ledger_id, amount: Number(p.amount) || 0, remark: '', detail: '' }))
      : (payMode ? [{ ledger_id: payMode, amount: t.net, remark: '', detail: '' }] : []);

    const body = {
      mr_auto: true,   // server puts the logged-in user as the bill's M.R.
      type, no: no.trim(), date, party_id: party.id,
      mode: activePayments.length ? 'CASH' : 'CREDIT',
      payments: kind.takesPayment ? activePayments : [],
      ref_no: refNo.trim(), ref_date: refDate || date, reason: reason.trim(),
      walkin_name: walkin.name.trim(),
      walkin_mobile: walkin.mobile.trim(),
      walkin_gstin: walkin.gstin.trim(),
      walkin_address: [
        walkin.address.trim(),
        walkin.state.trim() ? `State: ${walkin.state.trim()}` : '',
        walkin.dl_no.trim() ? `DL/PAN: ${walkin.dl_no.trim()}` : '',
        walkin.email.trim() ? `Email: ${walkin.email.trim()}` : '',
      ].filter(Boolean).join(', '),
      narration: [
        narration.trim(),
        walkin.remark.trim() ? `Remark: ${walkin.remark.trim()}` : '',
        walkin.order_no.trim() ? `Order No: ${walkin.order_no.trim()}` : '',
      ].filter(Boolean).join(' | '),
      cd_pct: Number(cdPct) || 0, freight: Number(freight) || 0, other_charges: Number(other) || 0,
      lines: outLines,
    };
    setSaving(true);
    try {
      const res = editId ? await BillService.update(editId, body) : await BillService.create(body);
      Alert.alert('Saved ✓', `${kind.title} ${res.no} saved — ${money(res.net)}`, [
        { text: 'Share PDF', onPress: () => { shareInvoice(res.id).catch((e) => Alert.alert('Share failed', e.message)); navigation.replace('BillDetail', { id: res.id }); } },
        { text: 'View', onPress: () => navigation.replace('BillDetail', { id: res.id }) },
        ...(editId ? [] : [{ text: 'New Entry', onPress: () => navigation.replace('BillEntry', { type }) }]),
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const partyChoices = allParties ? ledgers : ledgers.filter((l) => kind.partyGroup.split(',').includes(l.group_name));

  const allPayLedgers = useMemo(() => {
    return ledgers.filter((l) => ['Cash-in-hand', 'Bank Accounts', 'Bank OD A/c'].includes(l.group_name));
  }, [ledgers]);

  const isSaleFamily = type.startsWith('SALE') || type === 'COUNTER_SALE';

  if (loading) return <Screen accent={accent}><TopBar title={kind.title} accent={accent} onBack={() => navigation.goBack()} /><Loading color={accent.main} /></Screen>;

  return (
    <Screen accent={accent}>
      <TopBar
        title={editId ? `Modify ${kind.short} ${no}` : `New ${kind.title}`}
        subtitle={`${lines.length} item${lines.length === 1 ? '' : 's'} · Net ${money(t.net)}`}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={{ label: 'SAVE', onPress: save, busy: saving }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Card>
            {/* Serial number, date and M.R. are set by the system */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <LockedField label="Bill No." value={no || 'Auto'} style={{ flex: 1.1 }} />
              <LockedField label="Date" value={dmy(date)} style={{ flex: 1.2 }} />
              <LockedField label="M.R." value={user?.name ?? ''} style={{ flex: 0.9 }} />
            </View>

            {/* In New Sales bill, label is explicitly 'Ledger' directly above Cash */}
            <SelectField
              label={isSaleFamily ? 'Ledger' : kind.partyLabel}
              value={party?.name}
              sub={party ? `${party.group_name}${party.city ? ' · ' + party.city : ''} · Bal ${drcr(party.balance)}` : undefined}
              placeholder={isSaleFamily ? 'Select ledger' : `Select ${kind.partyLabel.toLowerCase()}`}
              onPress={() => setPicker('party')}
            />

            {party && !party.name.toUpperCase().includes('CASH') ? (
              <View style={{ backgroundColor: C.bg, borderRadius: R.sm, padding: 8, marginTop: 4, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.sub }}>
                  {[party.city, party.phone, party.gstin].filter(Boolean).join(' · ')}
                </Text>
                {party.credit_limit ? (
                  <Text style={{ fontSize: 12, color: C.text, fontWeight: '600' }}>Cr.Limit: ₹{amt(party.credit_limit)}</Text>
                ) : null}
              </View>
            ) : null}

            {party && (party.name.toUpperCase().includes('CASH') || type === 'COUNTER_SALE') ? (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={[ui.label, { color: accent.dark, fontWeight: '800', marginBottom: 8 }]}>
                  Party Detail (Cash / Walk-in Customer)
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="Customer Name *" value={walkin.name} onChangeText={(v) => setWalkin((w) => ({ ...w, name: v }))} placeholder="Party / customer name" autoCapitalize="characters" style={{ flex: 1.4 }} />
                  <Field label="Mobile" value={walkin.mobile} onChangeText={(v) => setWalkin((w) => ({ ...w, mobile: v }))} placeholder="10-digit mobile" keyboardType="phone-pad" style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="Address" value={walkin.address} onChangeText={(v) => setWalkin((w) => ({ ...w, address: v }))} placeholder="Customer address" autoCapitalize="words" style={{ flex: 1.4 }} />
                  <Field label="GST No." value={walkin.gstin} onChangeText={(v) => setWalkin((w) => ({ ...w, gstin: v }))} placeholder="GSTIN (optional)" autoCapitalize="characters" style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="State" value={walkin.state || (company?.state ? `${company.state}` : '')} onChangeText={(v) => setWalkin((w) => ({ ...w, state: v }))} placeholder="22-CHHATTISGARH" autoCapitalize="characters" style={{ flex: 1 }} />
                  <Field label="D.L.No. / PAN" value={walkin.dl_no} onChangeText={(v) => setWalkin((w) => ({ ...w, dl_no: v }))} placeholder="PAN or D.L.No." autoCapitalize="characters" style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="E-Mail" value={walkin.email} onChangeText={(v) => setWalkin((w) => ({ ...w, email: v }))} placeholder="Email id" keyboardType="email-address" style={{ flex: 1.2, marginBottom: 0 }} />
                  <Field label="Remark / Order No" value={walkin.remark} onChangeText={(v) => setWalkin((w) => ({ ...w, remark: v }))} placeholder="Remark" style={{ flex: 1, marginBottom: 0 }} />
                </View>
              </View>
            ) : null}

            {kind.hasRef ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Party Inv. No." value={refNo} onChangeText={setRefNo} autoCapitalize="characters" style={{ flex: 1 }} />
                <LockedField label="Party Inv. Date" value={dmy(refDate || date)} style={{ flex: 1 }} />
              </View>
            ) : null}

            {type === 'SALE_RETURN' || type === 'PURCHASE_RETURN' ? (
              <Field label={`Reason${kind.needsReason ? ' *' : ''}`} value={reason} onChangeText={setReason} placeholder="Expiry / Breakage / Rate difference…" />
            ) : null}
          </Card>

          <SectionTitle right={<Text style={{ color: C.sub, fontSize: 12 }}>Qty {t.qty}</Text>}>Items</SectionTitle>
          {lines.map((l, i) => {
            const c = lineCalc(l);
            return (
              <View key={i} style={st.line}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} activeOpacity={0.7} onPress={async () => {
                  setBatches(await batchesOf(l.item_id));
                  setEditing({ line: l, index: i });
                }}>
                  <View style={[st.lineNo, { backgroundColor: accent.soft }]}><Text style={{ color: accent.dark, fontWeight: '800' }}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.itemName} numberOfLines={1}>{l.item_name}</Text>
                    <Text style={st.meta} numberOfLines={1}>
                      ₹{amt(l.rate)}{l.free ? ` · +${l.free} free` : ''}{l.disc_pct ? ` −${l.disc_pct}%` : ''} · GST {l.gst_rate}%{l.fifo && !kind.inward ? ' · FIFO' : l.batch ? ` · Batch ${l.batch}` : ''}
                    </Text>
                    <Text style={[st.lineAmt, { color: accent.dark, marginLeft: 0, marginTop: 3 }]}>{money(c.amount)}</Text>
                  </View>
                </TouchableOpacity>
                <Stepper value={Number(l.qty)} onChange={(v) => stepLine(i, v)} color={accent.main} />
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[st.addBtn, { borderColor: accent.main, flex: 1 }]} onPress={openItems} activeOpacity={0.7}>
              <Text style={{ color: accent.main, fontWeight: '800', fontSize: 15 }}>＋ Add Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.addBtn, { borderColor: accent.main, borderStyle: 'solid', backgroundColor: accent.main, flex: 1 }]}
              onPress={() => { setScanMsg(''); setScanning(true); loadItems(); }} activeOpacity={0.8}>
              <Text style={{ color: C.white, fontWeight: '800', fontSize: 15 }}>📷 Scan QR</Text>
            </TouchableOpacity>
          </View>

          {/* PAYMENT SECTION WITH '+' BUTTON FOR MORE METHODS */}
          {kind.takesPayment ? (
            <>
              <SectionTitle
                right={
                  <TouchableOpacity
                    onPress={() => setPicker('payMode')}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm, backgroundColor: accent.soft }}
                  >
                    <Text style={{ color: accent.dark, fontWeight: '800', fontSize: 13 }}>＋ Add Method</Text>
                  </TouchableOpacity>
                }
              >
                Payment
              </SectionTitle>
              <Card>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {type !== 'COUNTER_SALE' && (
                    <TouchableOpacity
                      onPress={() => { setPayMode(0); setPaySplits([]); }}
                      activeOpacity={0.7}
                      style={[
                        st.payTab,
                        payMode === 0 && paySplits.length === 0 && { backgroundColor: accent.main, borderColor: accent.main },
                      ]}
                    >
                      <Text style={[st.payTabTxt, payMode === 0 && paySplits.length === 0 && { color: C.white }]}>Credit</Text>
                    </TouchableOpacity>
                  )}
                  {modes.map((m) => {
                    const sel = payMode === m.id && paySplits.length === 0;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        onPress={() => { setPayMode(m.id); setPaySplits([]); }}
                        activeOpacity={0.7}
                        style={[st.payTab, sel && { backgroundColor: accent.main, borderColor: accent.main }]}
                      >
                        <Text style={[st.payTabTxt, sel && { color: C.white }]}>{m.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => setPicker('payMode')}
                    activeOpacity={0.7}
                    style={[st.payTab, { backgroundColor: '#f1f5f9', borderStyle: 'dashed' }]}
                  >
                    <Text style={[st.payTabTxt, { color: accent.dark, fontWeight: '800' }]}>＋</Text>
                  </TouchableOpacity>
                </View>

                {paySplits.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[ui.label, { marginBottom: 6 }]}>Multi-Payment Splits</Text>
                    {paySplits.map((p, idx) => (
                      <View key={idx} style={st.paySplitRow}>
                        <Text style={st.paySplitName} numberOfLines={1}>{p.name}</Text>
                        <TextInput
                          value={p.amount}
                          onChangeText={(txt) => {
                            setPaySplits((prev) => prev.map((item, i) => (i === idx ? { ...item, amount: txt } : item)));
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          style={st.paySplitInput}
                        />
                        <TouchableOpacity
                          onPress={() => setPaySplits((prev) => prev.filter((_, i) => i !== idx))}
                          style={st.paySplitDel}
                        >
                          <Text style={{ color: C.danger, fontWeight: 'bold', fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <TouchableOpacity
                        onPress={() => setPicker('payMode')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Text style={{ color: accent.dark, fontWeight: '800', fontSize: 13 }}>＋ Add Another Method</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setPaySplits([])}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ color: C.sub, fontSize: 12 }}>Reset Single Mode</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={st.paySummaryBox}>
                      <Text style={{ fontSize: 13, color: C.sub }}>
                        Total Paid: <Text style={{ fontWeight: '800', color: C.text }}>{money(paySplits.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</Text>
                      </Text>
                      {t.net > paySplits.reduce((s, x) => s + (Number(x.amount) || 0), 0) ? (
                        <Text style={{ fontSize: 13, color: C.danger, fontWeight: '700' }}>
                          Balance (Udhaar): {money(t.net - paySplits.reduce((s, x) => s + (Number(x.amount) || 0), 0))}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 4 }}>
                    <Text style={st.hint}>
                      {payMode ? `Full bill amount ${money(t.net)} ${kind.inward ? 'paid from' : 'received in'} ${modes.find((m) => m.id === payMode)?.name || 'Cash'}.`
                        : `Amount stays on the ${isSaleFamily ? 'ledger' : kind.partyLabel.toLowerCase()}'s account (udhaar).`}
                    </Text>
                    {payMode !== 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          const m = modes.find((x) => x.id === payMode) || modes[0];
                          if (m) {
                            setPaySplits([{ ledger_id: m.id, name: m.name, amount: String(t.net) }]);
                          }
                        }}
                        style={{ marginTop: 8, alignSelf: 'flex-start' }}
                      >
                        <Text style={{ color: accent.dark, fontWeight: '700', fontSize: 12 }}>＋ Split payment across multiple accounts</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </Card>
            </>
          ) : null}

          <SectionTitle>Bill Sundry</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Cash Disc %" value={cdPct} onChangeText={setCdPct} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Freight" value={freight} onChangeText={setFreight} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Other" value={other} onChangeText={setOther} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <Field label="Narration" value={narration} onChangeText={setNarration} placeholder="Optional remark" style={{ marginBottom: 0 }} />
          </Card>

          <SectionTitle>Summary</SectionTitle>
          <Card>
            <KV k="Gross" v={money(t.gross)} />
            {t.gross !== t.taxable ? <KV k="Item Discount" v={`− ${money(t.gross - t.taxable)}`} /> : null}
            <KV k="Taxable" v={money(t.taxable)} />
            <KV k="GST (CGST + SGST)" v={money(t.tax)} />
            {t.cd ? <KV k="Cash Discount" v={`− ${money(t.cd)}`} /> : null}
            {Number(freight) ? <KV k="Freight" v={money(Number(freight))} /> : null}
            {Number(other) ? <KV k="Other Charges" v={money(Number(other))} /> : null}
            <KV k="Round Off" v={money(t.round)} />
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
            <KV k="Net Amount" v={money(t.net)} bold color={accent.dark} />
          </Card>
          <Btn label={editId ? 'Save Changes' : `Save ${kind.title}`} color={accent.main} busy={saving} onPress={save} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal<Ledger>
        visible={picker === 'party'}
        title={isSaleFamily ? 'Select Ledger' : `Select ${kind.partyLabel}`}
        items={partyChoices}
        keyOf={(l) => l.id}
        search={(l) => `${l.name} ${l.city ?? ''} ${l.phone ?? ''} ${l.gstin ?? ''}`}
        onClose={() => setPicker('')}
        onPick={(l) => { setParty(l); setPicker(''); }}
        header={
          <TouchableOpacity onPress={() => setAllParties((a) => !a)} style={{ paddingVertical: 8 }}>
            <Text style={{ color: C.navy3, fontWeight: '700' }}>{allParties ? '☑' : '☐'} Show all ledgers (not only {kind.partyGroup.split(',').join(' / ')})</Text>
          </TouchableOpacity>
        }
        footer={
          <Btn label="＋ New Ledger" ghost color={accent.main} small style={{ marginTop: 8 }}
            onPress={() => { setPicker(''); navigation.navigate('LedgerEntry', { group: kind.partyGroup.split(',').pop() }); }} />
        }
        render={(l) => (
          <View>
            <Text style={st.pickName}>{l.name}</Text>
            <Text style={st.meta}>{[l.group_name, l.city, l.phone].filter(Boolean).join(' · ')} · Bal {drcr(l.balance)}</Text>
          </View>
        )}
      />

      {/* Payment mode picker modal triggered by '+' */}
      <PickerModal<Ledger>
        visible={picker === 'payMode'}
        title="Select Payment Method (Cash / Bank)"
        items={allPayLedgers.length ? allPayLedgers : modes}
        keyOf={(l) => l.id}
        search={(l) => `${l.name} ${l.group_name} ${l.city ?? ''}`}
        onClose={() => setPicker('')}
        onPick={(l) => {
          setPicker('');
          if (!modes.some((m) => m.id === l.id)) {
            setModes((prev) => [...prev, l]);
          }
          if (paySplits.length > 0) {
            const currentTotal = paySplits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
            const remaining = Math.max(0, t.net - currentTotal);
            setPaySplits((prev) => [...prev, { ledger_id: l.id, name: l.name, amount: remaining ? String(remaining) : '' }]);
          } else {
            setPayMode(l.id);
          }
        }}
        footer={
          <Btn
            label="＋ Create New Payment Method (Bank / UPI / Cash)"
            ghost
            color={accent.main}
            small
            style={{ marginTop: 8 }}
            onPress={() => {
              setPicker('');
              navigation.navigate('LedgerEntry', { group: 'Bank Accounts' });
            }}
          />
        }
        render={(l) => (
          <View>
            <Text style={st.pickName}>{l.name}</Text>
            <Text style={st.meta}>{l.group_name} · Bal {drcr(l.balance)}</Text>
          </View>
        )}
      />

      <PickerModal<Item>
        visible={picker === 'item'}
        title="Select Item"
        items={items}
        keyOf={(i) => i.id}
        search={(i) => `${i.name} ${i.company ?? ''} ${i.pack ?? ''}`}
        onClose={() => setPicker('')}
        onPick={pickItem}
        footer={
          <Btn label="＋ New Item" ghost color={accent.main} small style={{ marginTop: 8 }}
            onPress={() => { setPicker(''); navigation.navigate('ItemEntry'); }} />
        }
        render={(i) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={st.pickName}>{i.name}</Text>
              <Text style={st.meta}>{[i.company, i.pack].filter(Boolean).join(' · ')} · MRP ₹{amt(i.mrp)} · Rate ₹{amt(outRate(i))}</Text>
            </View>
            <Badge label={`Stk ${i.stock ?? 0}`} color={(i.stock ?? 0) > 0 ? C.cr : C.danger} soft />
          </View>
        )}
      />

      <PickerModal<Batch>
        visible={picker === 'batch'}
        title={`Select Batch — ${pendingItem?.name ?? ''}`}
        items={batches}
        keyOf={(b) => b.id || b.batch}
        search={(b) => `${b.batch} ${b.expiry}`}
        onClose={() => { setPicker(''); setPendingItem(null); }}
        onPick={pickBatch}
        render={(b) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={st.pickName}>{b.batch || '< No Batch >'}</Text>
              <Text style={st.meta}>Exp {b.expiry || '—'} · MRP ₹{amt(b.mrp)} · Rate ₹{amt(b.rate)}</Text>
            </View>
            <Badge label={`Stk ${b.stock}`} color={b.stock > 0 ? C.cr : C.danger} soft />
          </View>
        )}
      />

      <Scanner
        visible={scanning}
        accent={accent}
        continuous
        title="Scan QR / Barcode"
        status={scanMsg}
        onCode={onScan}
        onClose={() => setScanning(false)}
      />

      <PickerModal<Item>
        visible={!!linkCode}
        title={`Link ${linkCode} to…`}
        items={items}
        keyOf={(i) => i.id}
        search={(i) => `${i.name} ${i.company ?? ''} ${i.pack ?? ''}`}
        onClose={() => setLinkCode('')}
        onPick={linkTo}
        render={(i) => (
          <View>
            <Text style={st.pickName}>{i.name}</Text>
            <Text style={st.meta}>{[i.company, i.pack].filter(Boolean).join(' · ')} · Stk {i.stock ?? 0}</Text>
          </View>
        )}
      />

      <ItemCart
        visible={picker === 'cart'}
        items={items}
        loading={!items.length}
        accent={accent}
        qtyOf={qtyOf}
        rateOf={(it) => lines.find((l) => l.fifo && l.item_id === it.id)?.rate ?? outRate(it)}
        onSet={setCartQty}
        onClose={() => setPicker('')}
      />

      <LineEditor
        visible={!!editing}
        line={editing?.line ?? null}
        inward={kind.inward}
        batches={batches}
        accent={accent}
        onClose={() => setEditing(null)}
        onSave={saveLine}
        onRemove={editing && editing.index >= 0 ? () => { setLines((ls) => ls.filter((_, i) => i !== editing.index)); setEditing(null); } : undefined}
      />

      {/* Jewellery Tag Scanned Modal */}
      <Modal visible={!!scannedJewel} transparent animationType="fade" onRequestClose={() => setScannedJewel(null)}>
        <View style={st.jewelModalOverlay}>
          <View style={st.jewelModalCard}>
            <View style={st.jewelModalHeader}>
              <Text style={st.jewelModalTitle}>💎 Jewellery Tag Scanned</Text>
              <TouchableOpacity onPress={() => setScannedJewel(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 18, color: '#888', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={st.jewelTagVisual}>
              <View style={st.jewelTagA}>
                <Text style={st.jewelTagCode}>{scannedJewel?.code}</Text>
                <Text style={st.jewelTagName} numberOfLines={2}>{scannedJewel?.name || 'JEWELLERY ITEM'}</Text>
              </View>
              <View style={st.jewelTagMid} />
              <View style={st.jewelTagB}>
                <View style={st.jewelRow}><Text style={st.jewelK}>GW</Text><Text style={st.jewelV}>{Number(scannedJewel?.gw || 0).toFixed(3)}</Text></View>
                <View style={st.jewelRow}><Text style={st.jewelK}>LESS</Text><Text style={st.jewelV}>{Number(scannedJewel?.less || 0).toFixed(3)}</Text></View>
                <View style={[st.jewelRow, st.jewelBld]}><Text style={st.jewelK}>NW</Text><Text style={st.jewelV}>{Number(scannedJewel?.nw || 0).toFixed(3)}</Text></View>
                <View style={st.jewelRow}><Text style={st.jewelK}>MKG</Text><Text style={st.jewelV}>{scannedJewel?.mkg || '5.00 %'}</Text></View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Btn label="Cancel" ghost color="#666" style={{ flex: 1 }} onPress={() => setScannedJewel(null)} />
              <Btn
                label={`＋ Add to Bill (${Number(scannedJewel?.nw || 0).toFixed(3)} gm)`}
                color={accent.main}
                style={{ flex: 2 }}
                onPress={() => {
                  if (scannedJewel) addJewelToBill(scannedJewel);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const st = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  lineNo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  itemName: { fontSize: 14.5, fontWeight: '700', color: C.text },
  meta: { fontSize: 12, color: C.sub, marginTop: 3 },
  lineAmt: { fontSize: 15, fontWeight: '800', marginLeft: 8 },
  addBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: R.md, paddingVertical: 14, alignItems: 'center', backgroundColor: C.white },
  hint: { color: C.sub, fontSize: 12.5, marginTop: 10 },
  pickName: { fontSize: 15, fontWeight: '700', color: C.text },

  payTab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.sm, borderWidth: 1.2, borderColor: C.line, backgroundColor: C.white, alignItems: 'center' },
  payTabTxt: { fontSize: 13, fontWeight: '700', color: C.text },

  paySplitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  paySplitName: { fontSize: 13, fontWeight: '700', color: C.text, flex: 1.4 },
  paySplitInput: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, fontWeight: '700', backgroundColor: C.white, textAlign: 'right' },
  paySplitDel: { padding: 6 },
  paySummaryBox: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', justifyContent: 'space-between' },

  jewelModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  jewelModalCard: { width: '100%', maxWidth: 360, backgroundColor: C.white, borderRadius: R.lg, padding: 18, elevation: 8 },
  jewelModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  jewelModalTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  jewelTagVisual: { borderWidth: 1.5, borderColor: '#333', borderRadius: 6, flexDirection: 'row', backgroundColor: '#fff', overflow: 'hidden' },
  jewelTagA: { flex: 1, padding: 10, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#ccc' },
  jewelTagCode: { fontSize: 14, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#111' },
  jewelTagName: { fontSize: 12, fontWeight: '700', color: '#333', marginTop: 4, textTransform: 'uppercase', textAlign: 'center' },
  jewelTagMid: { width: 6, backgroundColor: '#f5f5f5', borderRightWidth: 1, borderRightColor: '#ccc' },
  jewelTagB: { flex: 1.2, padding: 10, justifyContent: 'center', backgroundColor: '#fafafa' },
  jewelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  jewelBld: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 3, marginVertical: 2 },
  jewelK: { fontSize: 12, fontWeight: '700', color: '#555', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  jewelV: { fontSize: 12, fontWeight: '800', color: '#111', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
