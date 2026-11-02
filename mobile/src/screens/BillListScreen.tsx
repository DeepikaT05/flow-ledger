import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, Card, Badge, SearchBar, PeriodChips, StatStrip, Empty, ErrorBox, Loading } from '../components/ui';
import { BillService } from '../api/services';
import { Bill, BillType } from '../types';
import { BILL, accentOf } from '../labels';
import { C } from '../theme';
import { money, dmy, periodByKey, Period } from '../utils/format';

/** Bills of one or more types (Modify Bill, registers, Party Transaction). */
export const BillListScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const types: BillType[] = route.params?.types ?? ['SALE'];
  const party: number | undefined = route.params?.party;
  const kind = BILL[types[0]];
  const accent = accentOf(kind.module);
  const [period, setPeriod] = useState<Period>(periodByKey(party ? 'all' : 'month'));
  const [rows, setRows] = useState<Bill[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await BillService.list(types, period.from, period.to, party));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [types.join(), period.from, period.to, party]);

  // Loads on open, on period change and on coming back from an edit.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const words = q.trim().toLowerCase();
  const shown = words ? rows.filter((b) => `${b.no} ${b.party} ${b.walkin_name ?? ''} ${b.net}`.toLowerCase().includes(words)) : rows;
  const total = shown.reduce((s, b) => s + Number(b.net || 0), 0);
  const tax = shown.reduce((s, b) => s + Number(b.tax || 0), 0);
  const canNew = !party && types.length === 1;

  return (
    <Screen accent={accent}>
      <TopBar
        title={route.params?.title ?? kind.title}
        subtitle={party ? route.params?.partyName : `${dmy(period.from)} → ${dmy(period.to)}`}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={canNew ? { label: '+ New', onPress: () => navigation.navigate('BillEntry', { type: types[0] }) } : undefined}
      >
        <View style={{ marginTop: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Bill no, party, amount…" onDark /></View>
        <View style={{ marginTop: 10 }}><PeriodChips value={period} onChange={setPeriod} /></View>
        <StatStrip items={[{ label: 'Bills', value: String(shown.length) }, { label: 'GST', value: money(tax) }, { label: 'Total', value: money(total) }]} />
      </TopBar>

      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading && !rows.length ? <Loading color={accent.main} /> : (
        <FlatList
          data={shown}
          keyExtractor={(b) => String(b.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[accent.main]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: b }) => {
            const k = BILL[b.type] ?? kind;
            return (
              <Card onPress={() => navigation.navigate('BillDetail', { id: b.id })} style={{ borderLeftWidth: 4, borderLeftColor: accentOf(k.module).main }}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.party} numberOfLines={1}>{b.walkin_name || b.party}</Text>
                    <Text style={st.meta}>{b.no} · {dmy(b.date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.amt, { color: accentOf(k.module).dark }]}>{money(b.net)}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {types.length > 1 || party ? <Badge label={k.short} color={accentOf(k.module).main} soft /> : null}
                      <Badge label={b.mode} color={b.mode === 'CASH' ? C.cr : C.navy3} soft />
                    </View>
                  </View>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={!loading && !error ? (
            <Empty
              icon="🧾"
              title="No entries in this period"
              sub="Pick another period above, or create a new one."
              action={canNew ? { label: `+ New ${kind.short}`, onPress: () => navigation.navigate('BillEntry', { type: types[0] }), color: accent.main } : undefined}
            />
          ) : null}
        />
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  party: { fontSize: 15.5, fontWeight: '700', color: C.text },
  meta: { fontSize: 12.5, color: C.sub, marginTop: 3 },
  amt: { fontSize: 16.5, fontWeight: '800' },
});
