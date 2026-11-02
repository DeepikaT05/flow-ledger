import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, Card, SearchBar, StatStrip, Empty, ErrorBox, Loading } from '../components/ui';
import { LedgerService } from '../api/services';
import { Ledger } from '../types';
import { useAuth } from '../context/AuthContext';
import { MODULE, C } from '../theme';
import { money, drcr } from '../utils/format';

/** What tapping a ledger does — set by the menu that opened the list. */
type Pick = 'statement' | 'edit' | 'status' | 'txn';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'Sundry Debtors', label: 'Debtors' },
  { key: 'Sundry Creditors', label: 'Creditors' },
  { key: 'Cash-in-hand,Bank Accounts', label: 'Cash & Bank' },
  { key: 'Duties & Taxes', label: 'Taxes' },
];

export const LedgerListScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const fixedGroup: string | undefined = route.params?.group;
  const pick: Pick = route.params?.pick ?? 'statement';
  const kind: 'SALE' | 'PURCHASE' | undefined = route.params?.kind;
  const accent = MODULE.ledger;
  const { can } = useAuth();
  const [group, setGroup] = useState(fixedGroup ?? '');
  const [rows, setRows] = useState<Ledger[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await LedgerService.list(group || undefined));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [group]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = w.length ? rows.filter((l) => { const h = `${l.name} ${l.city ?? ''} ${l.phone ?? ''} ${l.gstin ?? ''}`.toLowerCase(); return w.every((x) => h.includes(x)); }) : rows;
  const dr = shown.reduce((s, l) => s + (l.balance > 0 ? l.balance : 0), 0);
  const cr = shown.reduce((s, l) => s + (l.balance < 0 ? -l.balance : 0), 0);

  const open = (l: Ledger) => {
    if (pick === 'edit') navigation.navigate('LedgerEntry', { id: l.id });
    else if (pick === 'status') navigation.navigate('PartyStatus', { id: l.id, kind });
    else if (pick === 'txn') navigation.navigate('BillList', {
      party: l.id, partyName: l.name, title: 'Party Transaction',
      types: l.group_name === 'Sundry Creditors' ? ['PURCHASE', 'PURCHASE_CHALLAN', 'PURCHASE_RETURN'] : ['SALE', 'SALE_CHALLAN', 'COUNTER_SALE', 'SALE_RETURN'],
    });
    else navigation.navigate('LedgerStatement', { id: l.id, name: l.name });
  };

  return (
    <Screen accent={accent}>
      <TopBar
        title={route.params?.title ?? 'Ledgers'}
        subtitle={pick === 'edit' ? 'Tap to modify' : pick === 'status' ? 'Tap for status' : pick === 'txn' ? 'Tap for bills' : 'Tap for statement'}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={can(['masters.ledger']) ? { label: '+ New', onPress: () => navigation.navigate('LedgerEntry', { group: fixedGroup?.split(',').pop() }) } : undefined}
      >
        <View style={{ marginTop: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Name, city, phone, GSTIN…" onDark /></View>
        {!fixedGroup ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
            {FILTERS.map((f) => (
              <TouchableOpacity key={f.key} onPress={() => setGroup(f.key)} style={[st.chip, group === f.key && { backgroundColor: C.white }]}>
                <Text style={{ color: group === f.key ? accent.dark : C.white, fontWeight: '700', fontSize: 12.5 }}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        <StatStrip items={[{ label: 'Ledgers', value: String(shown.length) }, { label: 'Total Dr', value: money(dr) }, { label: 'Total Cr', value: money(cr) }]} />
      </TopBar>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading && !rows.length ? <Loading color={accent.main} /> : (
        <FlatList
          data={shown}
          keyExtractor={(l) => String(l.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[accent.main]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: l }) => (
            <Card onPress={() => open(l)} style={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[st.avatar, { backgroundColor: accent.soft }]}>
                  <Text style={{ color: accent.dark, fontWeight: '900', fontSize: 16 }}>{l.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={st.name} numberOfLines={1}>{l.name}</Text>
                  <Text style={st.meta} numberOfLines={1}>{l.group_name}{l.city ? ` · ${l.city}` : ''}{l.phone ? ` · ${l.phone}` : ''}</Text>
                </View>
                <Text style={[st.bal, { color: l.balance < -0.004 ? C.cr : l.balance > 0.004 ? C.dr : C.faint }]}>{drcr(l.balance)}</Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={!loading && !error ? <Empty icon="📒" title="No ledgers here" sub="Create one with + New." /> : null}
        />
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  meta: { fontSize: 12, color: C.sub, marginTop: 2 },
  bal: { fontSize: 14.5, fontWeight: '800' },
});
