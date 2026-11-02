import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, PeriodChips, StatStrip, Empty, ErrorBox, Loading, Btn } from '../components/ui';
import { LedgerService } from '../api/services';
import { Ledger, LedgerEntryRow } from '../types';
import { useAuth } from '../context/AuthContext';
import { MODULE, C, R } from '../theme';
import { drcr, dmy, money, fyOf, Period, r2 } from '../utils/format';

const VT: Record<string, string> = {
  SALE: 'Sale', COUNTER_SALE: 'Cntr', SALE_CHALLAN: 'S.Ch', PURCHASE: 'Purc', PURCHASE_CHALLAN: 'P.Ch', SALE_RETURN: 'S.Rt',
  PURCHASE_RETURN: 'P.Rt', RECEIPT: 'Rcpt', PAYMENT: 'Pymt', CONTRA: 'Ctra', JOURNAL: 'Jrnl', DEBIT_NOTE: 'D.N.', CREDIT_NOTE: 'C.N.',
};

/** Running Dr / Cr statement of one ledger for a period (web: All Ledgers ▸ ledger, Alt+L). */
export const LedgerStatementScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const id: number = route.params.id;
  const accent = MODULE.ledger;
  const { can, user } = useAuth();
  const fy = fyOf();
  const [period, setPeriod] = useState<Period>({ key: 'fy', label: 'This F.Y.', ...fy });
  const [data, setData] = useState<{ ledger: Ledger; opening: number; rows: LedgerEntryRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await LedgerService.statement(id, period.from, period.to));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, period.from, period.to]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  let run = data?.opening ?? 0;
  const rows = (data?.rows ?? []).map((r) => { run = r2(run + Number(r.debit) - Number(r.credit)); return { ...r, bal: run }; });
  const dr = rows.reduce((s, r) => s + Number(r.debit), 0);
  const cr = rows.reduce((s, r) => s + Number(r.credit), 0);
  const l = data?.ledger;
  const party = l && (l.group_name === 'Sundry Debtors' || l.group_name === 'Sundry Creditors');

  return (
    <Screen accent={accent}>
      <TopBar
        title={l?.name ?? route.params?.name ?? 'Ledger'}
        subtitle={l ? `${l.group_name}${l.city ? ' · ' + l.city : ''}` : undefined}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={l && user?.app_perms?.edit !== false && can(['masters.ledger']) ? { label: '✏️ Edit', onPress: () => navigation.navigate('LedgerEntry', { id }) } : undefined}
      >
        <View style={{ marginTop: 10 }}><PeriodChips value={period} onChange={setPeriod} /></View>
        <StatStrip items={[
          { label: 'Opening', value: drcr(data?.opening ?? 0) },
          { label: 'Debit', value: money(dr) },
          { label: 'Credit', value: money(cr) },
        ]} />
        <View style={st.closing}>
          <Text style={st.closingLbl}>Closing Balance</Text>
          <Text style={st.closingVal}>{drcr(run)}</Text>
        </View>
      </TopBar>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading && !data ? <Loading color={accent.main} /> : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[accent.main]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListHeaderComponent={party ? (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <Btn small label="📋 Status" ghost color={accent.main} style={{ flex: 1 }}
                onPress={() => navigation.navigate('PartyStatus', { id, kind: l!.group_name === 'Sundry Creditors' ? 'PURCHASE' : 'SALE' })} />
              <Btn small label={l!.group_name === 'Sundry Creditors' ? '💸 Payment' : '💰 Receipt'} color={accent.main} style={{ flex: 1 }}
                onPress={() => navigation.navigate('VoucherEntry', { type: l!.group_name === 'Sundry Creditors' ? 'PAYMENT' : 'RECEIPT' })} />
            </View>
          ) : null}
          renderItem={({ item: r }) => (
            <TouchableOpacity
              style={st.row}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(r.source === 'BILL' ? 'BillDetail' : 'VoucherDetail', { id: r.source_id })}
            >
              <View style={st.left}>
                <Text style={st.date}>{dmy(r.date).slice(0, 5)}</Text>
                <Text style={st.vt}>{VT[r.vtype] ?? r.vtype}</Text>
              </View>
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={st.against} numberOfLines={1}>{r.against || r.narration || '—'}</Text>
                <Text style={st.meta}>{r.vno}{r.narration && r.against ? ` · ${r.narration}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {Number(r.debit) ? <Text style={[st.amt, { color: C.dr }]}>{money(r.debit)} Dr</Text> : null}
                {Number(r.credit) ? <Text style={[st.amt, { color: C.cr }]}>{money(r.credit)} Cr</Text> : null}
                <Text style={st.bal}>{drcr(r.bal)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={!loading && !error ? <Empty icon="📒" title="No entries in this period" sub="Try This F.Y. or All." /> : null}
        />
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  closing: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, backgroundColor: C.white, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 10 },
  closingLbl: { color: C.sub, fontWeight: '700' },
  closingVal: { color: MODULE.ledger.dark, fontWeight: '900', fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 11, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  left: { width: 46, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.line, paddingRight: 8 },
  date: { fontWeight: '800', color: C.text, fontSize: 13 },
  vt: { fontSize: 11, color: MODULE.ledger.main, fontWeight: '800', marginTop: 2 },
  against: { fontSize: 14, fontWeight: '700', color: C.text },
  meta: { fontSize: 11.5, color: C.sub, marginTop: 2 },
  amt: { fontSize: 14, fontWeight: '800' },
  bal: { fontSize: 11.5, color: C.sub, marginTop: 2 },
});
