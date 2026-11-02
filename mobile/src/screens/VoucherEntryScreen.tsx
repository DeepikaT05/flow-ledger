import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Screen, TopBar, Card, Field, SelectField, DateField, SectionTitle, KV, Btn, Loading, PickerModal, Badge, ui,
} from '../components/ui';
import { VoucherService, LedgerService } from '../api/services';
import { Ledger, PendingBill, VoucherType } from '../types';
import { VOUCHER, accentOf } from '../labels';
import { C, R } from '../theme';
import { useAuth } from '../context/AuthContext';
import { money, today, r2, drcr, dmy } from '../utils/format';

interface JLine { ledger: Ledger | null; side: 'Dr' | 'Cr'; amount: string }
const CASH_BANK = ['Cash-in-hand', 'Bank Accounts'];

/**
 * Receipt / Payment / Contra: one party (or account) against one cash / bank account, with
 * bill-wise adjustment for Receipt & Payment. Journal / Debit Note / Credit Note: free Dr / Cr lines.
 */
export const VoucherEntryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { user } = useAuth();
  const type: VoucherType = route.params?.type ?? 'RECEIPT';
  const editId: number | undefined = route.params?.id;

  useEffect(() => {
    if (editId && user?.app_perms?.edit === false) {
      Alert.alert('Permission Denied', 'Editing is not permitted on this account.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [editId, user]);
  const kind = VOUCHER[type];
  const accent = accentOf(kind.module);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simple, setSimple] = useState(kind.simple);
  const [no, setNo] = useState('');
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState('');
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [modes, setModes] = useState<Ledger[]>([]);
  // simple
  const [party, setParty] = useState<Ledger | null>(null);
  const [bank, setBank] = useState<Ledger | null>(null);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState<PendingBill[]>([]);
  const [adj, setAdj] = useState<Record<number, number>>({});
  // journal
  const [jl, setJl] = useState<JLine[]>([{ ledger: null, side: 'Dr', amount: '' }, { ledger: null, side: 'Cr', amount: '' }]);
  const [picker, setPicker] = useState<'' | 'party' | 'bank' | number>('');
  const [allParties, setAllParties] = useState(false);

  const loadPending = async (p: Ledger, keep?: Record<number, number>) => {
    if (!kind.billKind) return;
    const bills = await LedgerService.pendingBills(p.id, kind.billKind, editId).catch(() => [] as PendingBill[]);
    setPending(bills);
    setAdj(keep ?? {});
  };

  useEffect(() => {
    (async () => {
      try {
        const [ls, ms] = await Promise.all([LedgerService.list(), LedgerService.paymentModes()]);
        setLedgers(ls);
        setModes(ms);
        if (editId) {
          const v = await VoucherService.get(editId);
          setNo(v.no); setDate(v.date); setNarration(v.narration ?? '');
          const lines = v.lines ?? [];
          const byId = (id: number) => ls.find((l) => l.id === id) ?? null;
          const bankLine = lines.find((l) => (kind.bankDr ? l.debit : l.credit) && ms.some((m) => m.id === l.ledger_id));
          const partyLine = lines.find((l) => l !== bankLine);
          if (kind.simple && lines.length === 2 && bankLine && partyLine) {
            const p = byId(partyLine.ledger_id);
            setBank(byId(bankLine.ledger_id));
            setParty(p);
            setAmount(String(bankLine.debit || bankLine.credit));
            const keep: Record<number, number> = {};
            for (const a of v.adjustments ?? []) if (a.bill_id) keep[a.bill_id] = Number(a.amount);
            if (p) await loadPending(p, keep);
          } else {
            setSimple(false);
            setJl(lines.map((l) => ({ ledger: byId(l.ledger_id), side: l.debit ? 'Dr' : 'Cr', amount: String(l.debit || l.credit) })));
          }
        } else {
          setNo((await VoucherService.nextNo(type).catch(() => ({ no: '' }))).no);
          if (kind.simple) setBank(ms.find((m) => m.name.toLowerCase() === 'cash') ?? ms[0] ?? null);
        }
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------------------------------------------------------------- bill adjustment
  const amt0 = Number(amount) || 0;
  const adjusted = r2(Object.values(adj).reduce((s, a) => s + a, 0));
  const autoAdjust = (total = amt0) => {
    let left = total;
    const next: Record<number, number> = {};
    for (const b of pending) {   // oldest first (server orders by date)
      if (left <= 0) break;
      const take = r2(Math.min(left, b.balance));
      next[b.id] = take;
      left = r2(left - take);
    }
    setAdj(next);
  };
  const toggleBill = (b: PendingBill) => {
    const n = { ...adj };
    if (n[b.id] !== undefined) delete n[b.id];
    else n[b.id] = b.balance;
    setAdj(n);
    // Amount follows the ticked bills unless the user typed a bigger amount (rest goes on account).
    const sum = r2(Object.values(n).reduce((s, x) => s + x, 0));
    if (!amount || amt0 < sum || amt0 === adjusted) setAmount(sum ? String(sum) : '');
  };

  // ---------------------------------------------------------------- save
  const jDr = r2(jl.reduce((s, l) => s + (l.side === 'Dr' ? Number(l.amount) || 0 : 0), 0));
  const jCr = r2(jl.reduce((s, l) => s + (l.side === 'Cr' ? Number(l.amount) || 0 : 0), 0));

  const save = async () => {
    let lines: { ledger_id: number; debit: number; credit: number }[];
    let adjustments: { bill_id: number | null; amount: number; remark: string }[] | undefined;
    if (simple) {
      if (!party) { Alert.alert('Missing', `Select "${kind.partyLabel}".`); return; }
      if (!bank) { Alert.alert('Missing', `Select "${kind.bankLabel}".`); return; }
      if (party.id === bank.id) { Alert.alert('Same account', 'Both sides cannot be the same ledger.'); return; }
      if (amt0 <= 0) { Alert.alert('Amount', 'Enter the amount.'); return; }
      if (adjusted > amt0 + 0.004) { Alert.alert('Bill adjustment', `Adjusted ${money(adjusted)} is more than the amount ${money(amt0)}.`); return; }
      const a = r2(amt0);
      lines = [
        { ledger_id: bank.id, debit: kind.bankDr ? a : 0, credit: kind.bankDr ? 0 : a },
        { ledger_id: party.id, debit: kind.bankDr ? 0 : a, credit: kind.bankDr ? a : 0 },
      ];
      if (kind.billKind) {
        adjustments = Object.entries(adj).filter(([, x]) => x > 0).map(([id, x]) => ({ bill_id: Number(id), amount: x, remark: '' }));
      }
    } else {
      const real = jl.filter((l) => l.ledger && Number(l.amount) > 0);
      if (real.length < 2) { Alert.alert('Entries', 'Enter at least one Dr and one Cr line.'); return; }
      if (jDr !== jCr) { Alert.alert('Not balanced', `Debit ${money(jDr)} and Credit ${money(jCr)} do not match.`); return; }
      lines = real.map((l) => ({ ledger_id: l.ledger!.id, debit: l.side === 'Dr' ? r2(Number(l.amount)) : 0, credit: l.side === 'Cr' ? r2(Number(l.amount)) : 0 }));
    }
    const body = { type, no: no.trim(), date, narration, lines, ...(adjustments ? { adjustments } : {}) };
    setSaving(true);
    try {
      const res = editId ? await VoucherService.update(editId, body) : await VoucherService.create(body);
      Alert.alert('Saved ✓', `${kind.title} ${res.no} saved — ${money(simple ? amt0 : jDr)}`, [
        { text: 'View', onPress: () => navigation.replace('VoucherDetail', { id: res.id }) },
        ...(editId ? [] : [{ text: 'New Entry', onPress: () => navigation.replace('VoucherEntry', { type }) }]),
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- pickers
  const partyGroups = type === 'RECEIPT' ? ['Sundry Debtors'] : type === 'PAYMENT' ? ['Sundry Creditors'] : CASH_BANK;
  const partyChoices = type === 'CONTRA' ? modes
    : allParties ? ledgers.filter((l) => !CASH_BANK.includes(l.group_name)) : ledgers.filter((l) => partyGroups.includes(l.group_name));
  const pickTitle = picker === 'party' ? kind.partyLabel ?? 'Ledger' : picker === 'bank' ? kind.bankLabel ?? 'Cash / Bank' : 'Ledger';
  const pickItems = picker === 'bank' ? modes : picker === 'party' ? partyChoices : ledgers;

  const onPick = async (l: Ledger) => {
    const p = picker;
    setPicker('');
    if (p === 'party') { setParty(l); setPending([]); setAdj({}); await loadPending(l); }
    else if (p === 'bank') setBank(l);
    else if (typeof p === 'number') setJl((ls) => ls.map((x, i) => (i === p ? { ...x, ledger: l } : x)));
  };

  if (loading) return <Screen accent={accent}><TopBar title={kind.title} accent={accent} onBack={() => navigation.goBack()} /><Loading color={accent.main} /></Screen>;

  return (
    <Screen accent={accent}>
      <TopBar
        title={editId ? `Modify ${kind.title} ${no}` : `New ${kind.title}`}
        subtitle={simple ? `Amount ${money(amt0)}` : `Dr ${money(jDr)} · Cr ${money(jCr)}`}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={{ label: 'SAVE', onPress: save, busy: saving }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Card>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Voucher No." value={no} onChangeText={setNo} autoCapitalize="characters" style={{ flex: 1 }} />
              <DateField label="Date" value={date} onChange={setDate} style={{ flex: 1.2 }} />
            </View>

            {simple ? (
              <>
                <SelectField
                  label={kind.partyLabel!}
                  value={party?.name}
                  sub={party ? `${party.group_name}${party.city ? ' · ' + party.city : ''} · Bal ${drcr(party.balance)}` : undefined}
                  onPress={() => setPicker('party')}
                />
                <Text style={ui.label}>Amount</Text>
                <View style={[ui.input, { flexDirection: 'row', alignItems: 'center', borderColor: accent.main, borderWidth: 1.6 }]}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: accent.dark, marginRight: 6 }}>₹</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={C.faint}
                    style={{ flex: 1, fontSize: 24, fontWeight: '800', color: C.text, padding: 0 }}
                  />
                </View>
                <SelectField
                  label={kind.bankLabel!}
                  value={bank?.name}
                  sub={bank ? `Bal ${drcr(bank.balance)}` : undefined}
                  onPress={() => setPicker('bank')}
                />
              </>
            ) : null}
          </Card>

          {simple && kind.billKind && party ? (
            <>
              <SectionTitle right={pending.length ? (
                <TouchableOpacity onPress={() => autoAdjust()}><Text style={{ color: accent.main, fontWeight: '800', fontSize: 12.5 }}>⚡ AUTO ADJUST</Text></TouchableOpacity>
              ) : null}>
                Pending Bills ({pending.length})
              </SectionTitle>
              {!pending.length ? (
                <Card><Text style={{ color: C.sub }}>No pending credit bills — amount goes on account.</Text></Card>
              ) : pending.map((b) => {
                const on = adj[b.id] !== undefined;
                return (
                  <TouchableOpacity key={b.id} style={[st.bill, on && { borderColor: accent.main, backgroundColor: accent.soft }]} onPress={() => toggleBill(b)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 20, marginRight: 10, color: on ? accent.main : C.faint }}>{on ? '☑' : '☐'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.billNo}>{b.ref} · {dmy(b.date)}</Text>
                      <Text style={st.meta}>Bill {money(b.net)} · {b.days} days</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontWeight: '800', color: C.dr }}>{money(b.balance)}</Text>
                      {on ? (
                        <TextInput
                          value={String(adj[b.id])}
                          onChangeText={(t) => setAdj((a) => ({ ...a, [b.id]: Math.min(b.balance, Number(t) || 0) }))}
                          keyboardType="decimal-pad"
                          style={st.adjInput}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {pending.length ? (
                <Card style={{ marginTop: 4 }}>
                  <KV k="Adjusted against bills" v={money(adjusted)} />
                  <KV k="On account" v={money(Math.max(0, r2(amt0 - adjusted)))} />
                </Card>
              ) : null}
            </>
          ) : null}

          {!simple ? (
            <>
              <SectionTitle>Entries</SectionTitle>
              {jl.map((l, i) => (
                <View key={i} style={st.jline}>
                  <TouchableOpacity
                    onPress={() => setJl((ls) => ls.map((x, j) => (j === i ? { ...x, side: x.side === 'Dr' ? 'Cr' : 'Dr' } : x)))}
                    style={[st.side, { backgroundColor: l.side === 'Dr' ? '#FDECEC' : '#E3F4E8' }]}
                  >
                    <Text style={{ fontWeight: '900', color: l.side === 'Dr' ? C.dr : C.cr }}>{l.side}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker(i)}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: l.ledger ? C.text : C.faint }} numberOfLines={1}>{l.ledger?.name ?? 'Select ledger ▾'}</Text>
                    {l.ledger ? <Text style={st.meta}>{l.ledger.group_name}</Text> : null}
                  </TouchableOpacity>
                  <TextInput
                    value={l.amount}
                    onChangeText={(t) => setJl((ls) => ls.map((x, j) => (j === i ? { ...x, amount: t } : x)))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={C.faint}
                    style={st.jamt}
                  />
                  {jl.length > 2 ? (
                    <TouchableOpacity onPress={() => setJl((ls) => ls.filter((_, j) => j !== i))} hitSlop={8}><Text style={{ color: C.danger, marginLeft: 8 }}>✕</Text></TouchableOpacity>
                  ) : null}
                </View>
              ))}
              <TouchableOpacity
                style={[st.addBtn, { borderColor: accent.main }]}
                onPress={() => {
                  const diff = r2(jDr - jCr);
                  setJl((ls) => [...ls, { ledger: null, side: diff > 0 ? 'Cr' : 'Dr', amount: diff ? String(Math.abs(diff)) : '' }]);
                }}
              >
                <Text style={{ color: accent.main, fontWeight: '800' }}>＋ Add Line</Text>
              </TouchableOpacity>
              <Card style={{ marginTop: 10 }}>
                <KV k="Total Debit" v={money(jDr)} color={C.dr} />
                <KV k="Total Credit" v={money(jCr)} color={C.cr} />
                <KV k="Difference" v={money(Math.abs(jDr - jCr))} bold color={jDr === jCr ? C.cr : C.danger} />
              </Card>
            </>
          ) : null}

          <SectionTitle>Narration</SectionTitle>
          <Card>
            <TextInput
              value={narration}
              onChangeText={setNarration}
              placeholder="Cheque no., UPI ref., remark…"
              placeholderTextColor={C.faint}
              multiline
              style={{ minHeight: 60, fontSize: 15, color: C.text, textAlignVertical: 'top' }}
            />
          </Card>
          <Btn label={editId ? 'Save Changes' : `Save ${kind.title}`} color={accent.main} busy={saving} onPress={save} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal<Ledger>
        visible={picker !== ''}
        title={`Select — ${pickTitle}`}
        items={pickItems}
        keyOf={(l) => l.id}
        search={(l) => `${l.name} ${l.city ?? ''} ${l.group_name} ${l.phone ?? ''}`}
        onClose={() => setPicker('')}
        onPick={onPick}
        header={picker === 'party' && type !== 'CONTRA' ? (
          <TouchableOpacity onPress={() => setAllParties((a) => !a)} style={{ paddingVertical: 8 }}>
            <Text style={{ color: C.navy3, fontWeight: '700' }}>{allParties ? '☑' : '☐'} Show all ledgers (expenses, incomes, …)</Text>
          </TouchableOpacity>
        ) : null}
        render={(l) => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{l.name}</Text>
              <Text style={st.meta}>{l.group_name}{l.city ? ` · ${l.city}` : ''}</Text>
            </View>
            <Badge label={drcr(l.balance)} color={l.balance < 0 ? C.cr : C.dr} soft />
          </View>
        )}
      />
    </Screen>
  );
};

const st = StyleSheet.create({
  meta: { fontSize: 12, color: C.sub, marginTop: 2 },
  bill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1.2, borderColor: C.line },
  billNo: { fontSize: 14.5, fontWeight: '700', color: C.text },
  adjInput: { borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4, minWidth: 80, textAlign: 'right', backgroundColor: C.white, color: C.text },
  jline: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  side: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  jamt: { width: 100, borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 8, textAlign: 'right', fontSize: 15, fontWeight: '700', color: C.text },
  addBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: R.md, paddingVertical: 12, alignItems: 'center', backgroundColor: C.white },
});
