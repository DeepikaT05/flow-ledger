import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, SearchBar, PeriodChips, StatStrip, Empty, ErrorBox, Loading, Badge } from '../components/ui';
import { ReportService } from '../api/services';
import { MODULE, C, R, Accent } from '../theme';
import { money, drcr, dmy, periodByKey, Period, today } from '../utils/format';

/** One report: where its rows come from, how a row looks and what tapping it opens. */
interface Def {
  title: string;
  accent: Accent;
  dated?: boolean;                       // takes a from / to period
  url: (p: Period) => string;
  filter?: (r: any) => boolean;
  search: (r: any) => string;
  title_: (r: any) => string;
  sub: (r: any) => string;
  right: (r: any) => { text: string; color?: string; sub?: string };
  tag?: (r: any) => string | undefined;
  open?: (r: any, nav: any) => void;
  totals: (rows: any[]) => { label: string; value: string }[];
}

const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const openParty = (kind: 'SALE' | 'PURCHASE') => (r: any, nav: any) => nav.navigate('PartyStatus', { id: r.id, kind });
const openSource = (r: any, nav: any) => nav.navigate(r.source === 'BILL' ? 'BillDetail' : 'VoucherDetail', { id: r.source_id });
const openLedger = (r: any, nav: any) => nav.navigate('LedgerStatement', { id: r.id, name: r.name });

const DEFS: Record<string, Def> = {
  'outstanding:receivable': {
    title: 'Receivable Outstanding', accent: MODULE.receipt, url: () => '/reports/outstanding?kind=receivable',
    search: (r) => `${r.name} ${r.city ?? ''} ${r.phone ?? ''}`, title_: (r) => r.name, sub: (r) => [r.city, r.phone].filter(Boolean).join(' · '),
    right: (r) => ({ text: drcr(r.balance), color: r.balance > 0 ? C.dr : C.cr }), open: openParty('SALE'),
    totals: (rows) => [{ label: 'Parties', value: String(rows.length) }, { label: 'Total Receivable', value: money(sum(rows, 'balance')) }],
  },
  'outstanding:payable': {
    title: 'Payable Outstanding', accent: MODULE.payment, url: () => '/reports/outstanding?kind=payable',
    search: (r) => `${r.name} ${r.city ?? ''}`, title_: (r) => r.name, sub: (r) => [r.city, r.phone].filter(Boolean).join(' · '),
    right: (r) => ({ text: drcr(r.balance), color: r.balance < 0 ? C.dr : C.cr }), open: openParty('PURCHASE'),
    totals: (rows) => [{ label: 'Suppliers', value: String(rows.length) }, { label: 'Total Payable', value: money(-sum(rows, 'balance')) }],
  },
  ageing: {
    title: 'Bill Collection Ageing', accent: MODULE.receipt, url: () => `/reports/ageing?upto=${today()}`,
    search: (r) => `${r.name} ${r.city ?? ''}`, title_: (r) => r.name,
    sub: (r) => `0-30 ${money(r.s0)} · 31-60 ${money(r.s1)} · 61-90 ${money(r.s2)} · 91-180 ${money(r.s3)} · 180+ ${money(r.s4)}`,
    right: (r) => ({ text: money(r.total), color: C.dr, sub: `${r.bills} bills` }),
    tag: (r) => (r.s4 > 0 ? '180+' : r.s3 > 0 ? '91+' : undefined), open: openParty('SALE'),
    totals: (rows) => [{ label: '0-30', value: money(sum(rows, 's0')) }, { label: '31-90', value: money(sum(rows, 's1') + sum(rows, 's2')) }, { label: '90+', value: money(sum(rows, 's3') + sum(rows, 's4')) }],
  },
  trial: {
    title: 'Trial Balance', accent: MODULE.ledger, url: () => '/reports/trial-balance',
    search: (r) => `${r.name} ${r.group_name}`, title_: (r) => r.name, sub: (r) => r.group_name,
    right: (r) => ({ text: drcr(r.balance), color: r.balance > 0 ? C.dr : C.cr }), open: openLedger,
    totals: (rows) => [
      { label: 'Debit', value: money(rows.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0)) },
      { label: 'Credit', value: money(rows.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0)) },
    ],
  },
  daybook: {
    title: 'Day Book', accent: MODULE.ledger, dated: true, url: (p) => `/reports/day-book?from=${p.from}&to=${p.to}`,
    search: (r) => `${r.party} ${r.no} ${r.narration} ${r.type}`, title_: (r) => r.party || '—', sub: (r) => `${dmy(r.date)} · ${r.no}${r.narration ? ' · ' + r.narration : ''}`,
    right: (r) => (r.debit ? { text: `${money(r.debit)} Dr`, color: C.dr } : { text: `${money(r.credit)} Cr`, color: C.cr }),
    tag: (r) => r.type, open: openSource,
    totals: (rows) => [{ label: 'Entries', value: String(rows.length) }, { label: 'Debit', value: money(sum(rows, 'debit')) }, { label: 'Credit', value: money(sum(rows, 'credit')) }],
  },
  salebook: {
    title: 'Sale Book', accent: MODULE.sale, dated: true, url: (p) => `/reports/sale-book?from=${p.from}&to=${p.to}`,
    search: (r) => `${r.party} ${r.no}`, title_: (r) => r.party, sub: (r) => `${dmy(r.date)} · ${r.no}`,
    right: (r) => ({ text: money(r.net), color: MODULE.sale.dark }), tag: (r) => r.type, open: openSource,
    totals: (rows) => [{ label: 'Bills', value: String(rows.length) }, { label: 'Total', value: money(sum(rows, 'net')) }],
  },
  gp: {
    title: 'Bill wise Sale & Cost', accent: MODULE.sale, dated: true, url: (p) => `/reports/gross-profit?from=${p.from}&to=${p.to}`,
    search: (r) => `${r.party} ${r.no}`, title_: (r) => r.party, sub: (r) => `${dmy(r.date)} · ${r.no} · Sale ${money(r.sale)}${r.cost != null ? ` · Cost ${money(r.cost)}` : ''}`,
    right: (r) => (r.profit == null ? { text: '🔒', color: C.faint, sub: 'no cost access' } : { text: money(r.profit), color: r.profit < 0 ? C.danger : C.cr, sub: r.sale ? `${((r.profit / r.sale) * 100).toFixed(1)}%` : '' }),
    tag: (r) => (r.profit != null && r.profit < 0 ? 'LOSS' : undefined),
    open: (r, nav) => nav.navigate('BillDetail', { id: r.id }),
    totals: (rows) => [{ label: 'Sale', value: money(sum(rows, 'sale')) }, { label: 'Cost', value: money(sum(rows, 'cost')) }, { label: 'Profit', value: money(sum(rows, 'profit')) }],
  },
  allledgers: {
    title: 'All Ledgers', accent: MODULE.ledger, url: () => `/reports/ledger-accounts?upto=${today()}`,
    search: (r) => `${r.name} ${r.city ?? ''} ${r.group_name}`, title_: (r) => r.name,
    sub: (r) => `${r.group_name} · Dr ${money(r.debit)} · Cr ${money(r.credit)}`,
    right: (r) => ({ text: drcr(r.balance), color: r.balance > 0 ? C.dr : r.balance < 0 ? C.cr : C.faint }),
    tag: (r) => (r.has_due ? 'DUE' : undefined), open: openLedger,
    totals: (rows) => [{ label: 'Ledgers', value: String(rows.length) }, { label: 'Debit', value: money(sum(rows, 'debit')) }, { label: 'Credit', value: money(sum(rows, 'credit')) }],
  },
  creditlimits: {
    title: "Live Credit Limit's", accent: MODULE.sale, url: () => `/reports/ledger-accounts?upto=${today()}`,
    filter: (r) => r.group_name === 'Sundry Debtors',
    search: (r) => `${r.name} ${r.city ?? ''}`, title_: (r) => r.name,
    sub: (r) => (r.credit_limit ? `Limit ${money(r.credit_limit)} · Used ${Math.round((Math.max(0, r.balance) / r.credit_limit) * 100)}%` : 'No credit limit set'),
    right: (r) => ({ text: drcr(r.balance), color: r.credit_limit && r.balance > r.credit_limit ? C.danger : C.text }),
    tag: (r) => (r.credit_limit && r.balance > r.credit_limit ? 'OVER' : undefined), open: openParty('SALE'),
    totals: (rows) => [{ label: 'Customers', value: String(rows.length) }, { label: 'Over limit', value: String(rows.filter((r) => r.credit_limit && r.balance > r.credit_limit).length) }],
  },
  groups: {
    title: 'Account Groups', accent: MODULE.ledger, url: () => '/groups',
    search: (r) => r.name, title_: (r) => r.name, sub: (r) => r.nature, right: () => ({ text: '›', color: C.faint }),
    tag: (r) => (r.is_system ? 'SYSTEM' : undefined),
    open: (r, nav) => nav.navigate('LedgerList', { title: r.name, group: r.name, pick: 'statement' }),
    totals: (rows) => [{ label: 'Groups', value: String(rows.length) }],
  },
};

export const ReportScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const def = DEFS[route.params?.key] ?? DEFS.daybook;
  const accent = def.accent;
  const [period, setPeriod] = useState<Period>(periodByKey('month'));
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ReportService.get<any[]>(def.url(period));
      setRows(Array.isArray(data) ? (def.filter ? data.filter(def.filter) : data) : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [def, period.from, period.to]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const w = q.trim().toLowerCase();
  const shown = w ? rows.filter((r) => def.search(r).toLowerCase().includes(w)) : rows;

  return (
    <Screen accent={accent}>
      <TopBar title={def.title} subtitle={def.dated ? `${dmy(period.from)} → ${dmy(period.to)}` : `As on ${dmy(today())}`} accent={accent} onBack={() => navigation.goBack()}>
        <View style={{ marginTop: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Search…" onDark /></View>
        {def.dated ? <View style={{ marginTop: 10 }}><PeriodChips value={period} onChange={setPeriod} /></View> : null}
        <StatStrip items={def.totals(shown)} />
      </TopBar>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading && !rows.length ? <Loading color={accent.main} /> : (
        <FlatList
          data={shown}
          keyExtractor={(r, i) => `${r.source ?? ''}${r.source_id ?? r.id ?? ''}-${i}`}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[accent.main]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          renderItem={({ item: r }) => {
            const right = def.right(r);
            const tag = def.tag?.(r);
            return (
              <TouchableOpacity style={st.row} activeOpacity={def.open ? 0.7 : 1} onPress={() => def.open?.(r, navigation)}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {tag ? <Badge label={tag} color={tag === 'LOSS' || tag === 'OVER' || tag === 'DUE' || tag.endsWith('+') ? C.danger : accent.main} soft /> : null}
                    <Text style={st.title} numberOfLines={1}>{def.title_(r)}</Text>
                  </View>
                  <Text style={st.sub} numberOfLines={2}>{def.sub(r)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[st.amt, { color: right.color ?? C.text }]}>{right.text}</Text>
                  {right.sub ? <Text style={st.sub}>{right.sub}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={!loading && !error ? <Empty icon="📊" title="Nothing to show" sub={def.dated ? 'Try a wider period.' : undefined} /> : null}
        />
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  title: { fontSize: 15, fontWeight: '700', color: C.text, flexShrink: 1 },
  sub: { fontSize: 12, color: C.sub, marginTop: 3 },
  amt: { fontSize: 15, fontWeight: '800' },
});
