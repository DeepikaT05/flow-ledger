import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, SearchBar, StatStrip, Segmented, Badge, Empty, ErrorBox, Loading } from '../components/ui';
import { ItemService } from '../api/services';
import { Batch, Item } from '../types';
import { MODULE, C, R } from '../theme';
import { amt, money } from '../utils/format';
import { fifoOrder } from '../utils/fifo';

/** Every item with its stock, rates and GST; tap one for its batches in FIFO order. */
export const StockScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const accent = MODULE.sale;
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<number | null>(null);
  const [batches, setBatches] = useState<Record<number, Batch[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setItems(await ItemService.list()); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (it: Item) => {
    setOpen((o) => (o === it.id ? null : it.id));
    if (!batches[it.id]) {
      const bs = await ItemService.batches(it.id).catch(() => [] as Batch[]);
      setBatches((m) => ({ ...m, [it.id]: bs }));
    }
  };

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => {
    const st = Number(i.stock ?? 0);
    if (filter === 'in' && st <= 0) return false;
    if (filter === 'out' && st > 0) return false;
    return words.every((w) => `${i.name} ${i.company ?? ''} ${i.pack ?? ''} ${i.hsn ?? ''}`.toLowerCase().includes(w));
  });
  const units = shown.reduce((s, i) => s + Math.max(0, Number(i.stock ?? 0)), 0);
  const value = shown.reduce((s, i) => s + Math.max(0, Number(i.stock ?? 0)) * Number(i.sale_rate ?? 0), 0);

  return (
    <Screen accent={accent}>
      <TopBar title="Stock / Items" subtitle="Stock · rate · MRP · GST · batches" accent={accent} onBack={() => navigation.goBack()}>
        <View style={{ marginTop: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Item, company, pack, HSN…" onDark /></View>
        <StatStrip items={[{ label: 'Items', value: String(shown.length) }, { label: 'Units', value: String(units) }, { label: 'Sale Value', value: money(value) }]} />
      </TopBar>
      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
        <Segmented value={filter} onChange={setFilter} color={accent.main}
          options={[{ key: 'all', label: 'All' }, { key: 'in', label: 'In Stock' }, { key: 'out', label: 'Out of Stock' }]} />
      </View>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading && !items.length ? <Loading color={accent.main} /> : (
        <FlatList
          data={shown}
          keyExtractor={(i) => String(i.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[accent.main]} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          renderItem={({ item: i }) => {
            const stock = Number(i.stock ?? 0);
            const bs = fifoOrder(batches[i.id] ?? []);
            return (
              <TouchableOpacity style={st.row} activeOpacity={0.75} onPress={() => toggle(i)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={st.name} numberOfLines={2}>{i.name}</Text>
                    <Text style={st.meta}>{[i.company, i.pack, i.hsn && `HSN ${i.hsn}`].filter(Boolean).join(' · ')}</Text>
                    <Text style={st.meta}>Rate ₹{amt(i.sale_rate)} · MRP ₹{amt(i.mrp)} · GST {i.gst_rate ?? 0}%</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.stock, { color: stock > 0 ? C.cr : C.danger }]}>{stock}</Text>
                    <Text style={st.meta}>{i.unit || 'stock'}</Text>
                  </View>
                </View>
                {open === i.id ? (
                  <View style={st.batches}>
                    <Text style={st.bHead}>Batches (FIFO — billed in this order)</Text>
                    {!batches[i.id] ? <Text style={st.meta}>Loading…</Text> : !bs.length ? <Text style={st.meta}>No stock in any batch</Text> : bs.map((b, n) => (
                      <View key={`${b.id}-${b.batch}`} style={st.bRow}>
                        <Badge label={String(n + 1)} color={accent.main} soft />
                        <Text style={{ flex: 1, marginLeft: 8, fontWeight: '700', color: C.text }}>{b.batch || 'Opening'}</Text>
                        <Text style={st.meta}>Exp {b.expiry || '—'} · ₹{amt(b.rate)}  </Text>
                        <Text style={{ fontWeight: '800', color: C.cr }}>{b.stock}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={!loading && !error ? <Empty icon="📦" title="No items" sub="Try another search or filter." /> : null}
        />
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  row: { backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  name: { fontSize: 15, fontWeight: '800', color: C.text },
  meta: { fontSize: 12, color: C.sub, marginTop: 2 },
  stock: { fontSize: 20, fontWeight: '900' },
  batches: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line },
  bHead: { fontSize: 11, fontWeight: '800', color: C.sub, letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' },
  bRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
});
