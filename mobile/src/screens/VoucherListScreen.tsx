import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, Card, SearchBar, PeriodChips, StatStrip, Empty, ErrorBox, Loading } from '../components/ui';
import { VoucherService } from '../api/services';
import { Voucher, VoucherType } from '../types';
import { VOUCHER, accentOf } from '../labels';
import { C } from '../theme';
import { money, dmy, periodByKey, Period } from '../utils/format';

/** Receipt / Payment / Contra / Journal / Note book for a period. */
export const VoucherListScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const type: VoucherType = route.params?.type ?? 'RECEIPT';
  const kind = VOUCHER[type];
  const accent = accentOf(kind.module);
  const [period, setPeriod] = useState<Period>(periodByKey('month'));
  const [rows, setRows] = useState<Voucher[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await VoucherService.list(type, period.from, period.to));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [type, period.from, period.to]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const w = q.trim().toLowerCase();
  const shown = w ? rows.filter((v) => `${v.no} ${v.ledgers} ${v.narration} ${v.amount}`.toLowerCase().includes(w)) : rows;
  const total = shown.reduce((s, v) => s + Number(v.amount || 0), 0);

  return (
    <Screen accent={accent}>
      <TopBar
        title={route.params?.title ?? `${kind.title} Book`}
        subtitle={`${dmy(period.from)} → ${dmy(period.to)}`}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={{ label: '+ New', onPress: () => navigation.navigate('VoucherEntry', { type }) }}
      >
        <View style={{ marginTop: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Voucher no, party, narration…" onDark /></View>
        <View style={{ marginTop: 10 }}><PeriodChips value={period} onChange={setPeriod} /></View>
        <StatStrip items={[{ label: 'Vouchers', value: String(shown.length) }, { label: 'Total', value: money(total) }]} />
      </TopBar>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading && !rows.length ? <Loading color={accent.main} /> : (
        <FlatList
          data={shown}
          keyExtractor={(v) => String(v.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[accent.main]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: v }) => (
            <Card onPress={() => navigation.navigate('VoucherDetail', { id: v.id })} style={{ borderLeftWidth: 4, borderLeftColor: accent.main }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={st.party} numberOfLines={1}>{v.ledgers}</Text>
                  <Text style={st.meta}>{v.no} · {dmy(v.date)}</Text>
                  {v.narration ? <Text style={st.narr} numberOfLines={1}>📝 {v.narration}</Text> : null}
                </View>
                <Text style={[st.amt, { color: accent.dark }]}>{money(v.amount)}</Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={!loading && !error ? (
            <Empty icon={accent.icon} title={`No ${kind.title.toLowerCase()} vouchers`} sub="Pick another period, or make a new one."
              action={{ label: `+ New ${kind.title}`, onPress: () => navigation.navigate('VoucherEntry', { type }), color: accent.main }} />
          ) : null}
        />
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  party: { fontSize: 15, fontWeight: '700', color: C.text },
  meta: { fontSize: 12.5, color: C.sub, marginTop: 3 },
  narr: { fontSize: 12, color: C.faint, marginTop: 3 },
  amt: { fontSize: 16.5, fontWeight: '800' },
});
