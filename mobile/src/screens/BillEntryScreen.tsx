import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Screen, TopBar, Card, Field, SelectField, DateField, Segmented, SectionTitle, KV, Btn, Loading, PickerModal, Badge,
} from '../components/ui';
import { LineEditor, EditLine, lineCalc } from '../components/LineEditor';
import { BillService, LedgerService, ItemService } from '../api/services';
import { Batch, BillType, Item, Ledger } from '../types';
import { BILL, accentOf } from '../labels';
import { C, R } from '../theme';
import { useAuth } from '../context/AuthContext';
import { money, today, r2, drcr, amt } from '../utils/format';

/** New / modify any bill type: Sale, Challan, Counter Sale, Sale Return, Purchase, Purchase Challan, Purchase Return. */
export const BillEntryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { user } = useAuth();
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
  const [walkin, setWalkin] = useState({ name: '', mobile: '' });
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [cdPct, setCdPct] = useState('');
  const [freight, setFreight] = useState('');
  const [other, setOther] = useState('');
  const [payMode, setPayMode] = useState<number>(0);   // 0 = credit, else cash/bank ledger id

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [allParties, setAllParties] = useState(false);
  const [modes, setModes] = useState<Ledger[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [picker, setPicker] = useState<'' | 'party' | 'item' | 'batch'>('');
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
          setReason(b.reason ?? ''); setWalkin({ name: b.walkin_name ?? '', mobile: b.walkin_mobile ?? '' });
          setParty(ls.find((l) => l.id === b.party_id) ?? null);
          setFreight(b.freight ? String(b.freight) : ''); setOther(b.other_charges ? String(b.other_charges) : '');
          if (b.cd_amt && b.taxable) setCdPct(String(r2((b.cd_amt / b.taxable) * 100)));
          setPayMode(b.payments?.[0]?.ledger_id ?? 0);
          setLines((b.lines ?? []).map((l) => ({
            ...l, item_name: l.item_name ?? '', qty: Number(l.qty), free: Number(l.free) || 0, rate: Number(l.rate),
            disc_pct: Number(l.disc_pct) || 0, gst_rate: Number(l.gst_rate) || 0,
          })));
        } else {
          const r = await BillService.nextNo(type).catch(() => ({ no: '' }));
          setNo(r.no);
          if (type === 'COUNTER_SALE') {
            const cash = ls.find((l) => l.name.toLowerCase() === 'cash');
            setParty(cash ?? null);
            setPayMode(ms.find((m) => m.name.toLowerCase() === 'cash')?.id ?? ms[0]?.id ?? 0);
          }
        }
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Back from "New Ledger" → the new party shows in the picker.
  useEffect(() => navigation.addListener('focus', () => {
    if (!loading) LedgerService.list().then(setLedgers).catch(() => {});
  }), [navigation, loading]);

  const openItems = async () => {
    setPicker('item');
    if (!items.length) setItems(await ItemService.list().catch(() => []));
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
    const bs = await ItemService.batches(it.id).catch(() => [] as Batch[]);
    setBatches(bs);
    setPendingItem(it);
    setPicker('batch');
  };

  const saveLine = (l: EditLine) => {
    setLines((ls) => (editing && editing.index >= 0 ? ls.map((x, i) => (i === editing.index ? l : x)) : [...ls, l]));
    setEditing(null);
  };

  // ---------------------------------------------------------------- totals (same formula as server computeBill)
  const t = useMemo(() => {
    const calc = lines.map(lineCalc);
    const gross = r2(calc.reduce((s, c) => s + c.gross, 0));
    const taxable = r2(calc.reduce((s, c) => s + c.taxable, 0));
    const tax = r2(calc.reduce((s, c) => s + c.tax, 0));
    const cd = r2(taxable * (Number(cdPct) || 0) / 100);
    const sub = r2(taxable + tax - cd + (Number(freight) || 0) + (Number(other) || 0));
    const round = r2(Math.round(sub) - sub);
    return { gross, taxable, tax, cd, round, net: r2(sub + round), qty: lines.reduce((s, l) => s + Number(l.qty) + Number(l.free || 0), 0) };
  }, [lines, cdPct, freight, other]);

  // ---------------------------------------------------------------- save
  const save = async () => {
    if (!party) { Alert.alert('Select party', `Choose the ${kind.partyLabel.toLowerCase()} first.`); return; }
    if (!lines.length) { Alert.alert('No items', 'Add at least one item.'); return; }
    if (kind.needsReason && !reason.trim()) { Alert.alert('Reason required', 'Enter the reason for this return.'); return; }
    const body = {
      type, no: no.trim(), date, party_id: party.id, narration,
      mode: payMode ? 'CASH' : 'CREDIT',
      payments: kind.takesPayment && payMode ? [{ ledger_id: payMode, amount: t.net, remark: '', detail: '' }] : [],
      ref_no: refNo.trim(), ref_date: refDate, reason: reason.trim(),
      walkin_name: walkin.name.trim(), walkin_mobile: walkin.mobile.trim(), walkin_gstin: '', walkin_address: '',
      cd_pct: Number(cdPct) || 0, freight: Number(freight) || 0, other_charges: Number(other) || 0,
      lines: lines.map((l) => ({
        item_id: l.item_id, batch_id: l.batch_id || undefined, batch: l.batch, expiry: l.expiry,
        qty: l.qty, free: l.free, rate: l.rate, disc_pct: l.disc_pct, gst_rate: l.gst_rate, mrp: l.mrp,
      })),
    };
    setSaving(true);
    try {
      const res = editId ? await BillService.update(editId, body) : await BillService.create(body);
      Alert.alert('Saved ✓', `${kind.title} ${res.no} saved — ${money(res.net)}`, [
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
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Bill No." value={no} onChangeText={setNo} autoCapitalize="characters" style={{ flex: 1 }} />
              <DateField label="Date" value={date} onChange={setDate} style={{ flex: 1.2 }} />
            </View>
            <SelectField
              label={kind.partyLabel}
              value={party?.name}
              sub={party ? `${party.group_name}${party.city ? ' · ' + party.city : ''} · Bal ${drcr(party.balance)}` : undefined}
              placeholder={`Select ${kind.partyLabel.toLowerCase()}`}
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
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Customer Name" value={walkin.name} onChangeText={(v) => setWalkin((w) => ({ ...w, name: v }))} placeholder="Walk-in name" style={{ flex: 1.4 }} />
                <Field label="Mobile" value={walkin.mobile} onChangeText={(v) => setWalkin((w) => ({ ...w, mobile: v }))} placeholder="10-digit" keyboardType="phone-pad" style={{ flex: 1 }} />
              </View>
            ) : null}
            {kind.hasRef ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Party Inv. No." value={refNo} onChangeText={setRefNo} autoCapitalize="characters" style={{ flex: 1 }} />
                <DateField label="Party Inv. Date" value={refDate || date} onChange={setRefDate} style={{ flex: 1.2 }} />
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
              <TouchableOpacity key={i} style={st.line} activeOpacity={0.7} onPress={async () => {
                setBatches(await ItemService.batches(l.item_id).catch(() => []));
                setEditing({ line: l, index: i });
              }}>
                <View style={[st.lineNo, { backgroundColor: accent.soft }]}><Text style={{ color: accent.dark, fontWeight: '800' }}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.itemName} numberOfLines={1}>{l.item_name}</Text>
                  <Text style={st.meta} numberOfLines={1}>
                    {l.qty}{l.free ? `+${l.free}` : ''} × ₹{amt(l.rate)}{l.disc_pct ? ` −${l.disc_pct}%` : ''} · GST {l.gst_rate}%{l.batch ? ` · ${l.batch}` : ''}
                  </Text>
                </View>
                <Text style={[st.lineAmt, { color: accent.dark }]}>{money(c.amount)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={[st.addBtn, { borderColor: accent.main }]} onPress={openItems} activeOpacity={0.7}>
            <Text style={{ color: accent.main, fontWeight: '800', fontSize: 15 }}>＋ Add Item</Text>
          </TouchableOpacity>

          {kind.takesPayment ? (
            <>
              <SectionTitle>Payment</SectionTitle>
              <Card>
                <Segmented
                  color={accent.main}
                  value={String(payMode)}
                  onChange={(k) => setPayMode(Number(k))}
                  options={[...(type === 'COUNTER_SALE' ? [] : [{ key: '0', label: 'Credit' }]), ...modes.slice(0, 3).map((m) => ({ key: String(m.id), label: m.name }))]}
                />
                <Text style={st.hint}>
                  {payMode ? `Full bill amount ${money(t.net)} ${kind.inward ? 'paid from' : 'received in'} ${modes.find((m) => m.id === payMode)?.name}.`
                    : `Amount stays on the ${kind.partyLabel.toLowerCase()}'s account (udhaar).`}
                </Text>
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
        title={`Select ${kind.partyLabel}`}
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
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={st.pickName}>{l.name}</Text>
              <Text style={st.meta}>{l.group_name}{l.city ? ` · ${l.city}` : ''}</Text>
            </View>
            <Text style={{ fontWeight: '700', color: l.balance < 0 ? C.cr : C.dr }}>{drcr(l.balance)}</Text>
          </View>
        )}
      />

      <PickerModal<Item>
        visible={picker === 'item'}
        title="Select Item"
        items={items}
        loading={!items.length}
        keyOf={(i) => i.id}
        search={(i) => `${i.name} ${i.company ?? ''} ${i.pack ?? ''} ${i.hsn ?? ''}`}
        onClose={() => setPicker('')}
        onPick={pickItem}
        render={(i) => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={st.pickName}>{i.name}</Text>
              <Text style={st.meta}>{i.company ?? ''}{i.pack ? ` · ${i.pack}` : ''} · GST {i.gst_rate ?? 0}% · MRP ₹{amt(i.mrp)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Badge label={`Stk ${i.stock ?? 0}`} color={Number(i.stock) > 0 ? C.cr : C.danger} soft />
              <Text style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>₹{amt(kind.inward && type !== 'SALE_RETURN' ? (i.purchase_rate ?? 0) : i.sale_rate)}</Text>
            </View>
          </View>
        )}
      />

      <PickerModal<Batch>
        visible={picker === 'batch'}
        title={`Batch — ${pendingItem?.name ?? ''}`}
        items={kind.inward ? batches : (batches.filter((b) => Number(b.stock) > 0).length ? batches.filter((b) => Number(b.stock) > 0) : batches)}
        keyOf={(b) => `${b.id}-${b.batch}`}
        search={(b) => `${b.batch} ${b.expiry}`}
        onClose={() => setPicker('')}
        onPick={(b) => { setPicker(''); if (pendingItem) startLine(pendingItem, b); }}
        header={
          kind.inward ? (
            <TouchableOpacity
              style={{ backgroundColor: accent.main, paddingVertical: 12, paddingHorizontal: 16, borderRadius: R.sm, marginBottom: 10, alignItems: 'center' }}
              onPress={() => {
                setPicker('');
                if (pendingItem) {
                  startLine(pendingItem, {
                    id: 0,
                    item_id: pendingItem.id,
                    batch: '',
                    expiry: '',
                    mrp: pendingItem.mrp ?? 0,
                    rate: pendingItem.purchase_rate ?? 0,
                    purchase_rate: pendingItem.purchase_rate ?? 0,
                    stock: 0,
                  } as any);
                }
              }}
            >
              <Text style={{ color: C.white, fontWeight: '800', fontSize: 14 }}>＋ Create New Batch</Text>
            </TouchableOpacity>
          ) : undefined
        }
        render={(b) => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={st.pickName}>{b.batch || '< No Batch >'}</Text>
              <Text style={st.meta}>Exp {b.expiry || '—'} · MRP ₹{amt(b.mrp)} · Rate ₹{amt(b.rate)}</Text>
            </View>
            <Badge label={`Stk ${b.stock}`} color={b.stock > 0 ? C.cr : C.danger} soft />
          </View>
        )}
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
});
