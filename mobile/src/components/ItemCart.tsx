import React, { useState } from 'react';
import { View, Text, Modal, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SearchBar, Stepper, Badge, Btn, Loading, ui } from './ui';
import { Item } from '../types';
import { C, R, Accent } from '../theme';
import { amt, money } from '../utils/format';

interface Props {
  visible: boolean;
  items: Item[];
  loading?: boolean;
  accent: Accent;
  qtyOf: (itemId: number) => number;
  rateOf: (it: Item) => number;
  onSet: (it: Item, qty: number) => void;
  onClose: () => void;
}

/** Every item with stock & rate; ADD puts 1 on the bill, − / + change it. Batches are taken FIFO on save. */
export const ItemCart: React.FC<Props> = ({ visible, items, loading, accent, qtyOf, rateOf, onSet, onClose }) => {
  const [q, setQ] = useState('');
  const [inStock, setInStock] = useState(false);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => (!inStock || Number(i.stock) > 0)
    && words.every((w) => `${i.name} ${i.company ?? ''} ${i.pack ?? ''} ${i.hsn ?? ''}`.toLowerCase().includes(w)));
  const picked = items.filter((i) => qtyOf(i.id) > 0);
  const total = picked.reduce((s, i) => s + qtyOf(i.id) * rateOf(i) * (1 + Number(i.gst_rate ?? 0) / 100), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ui.overlay}>
        <View style={[ui.sheet, { height: '92%', paddingBottom: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={[ui.sheetTitle, { flex: 1, marginBottom: 0 }]}>Items</Text>
            <TouchableOpacity onPress={() => setInStock((v) => !v)} style={[st.toggle, inStock && { backgroundColor: accent.main }]}>
              <Text style={{ color: inStock ? C.white : C.sub, fontWeight: '700', fontSize: 12 }}>In stock only</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={[ui.closeBtn, { marginLeft: 8 }]}><Text style={{ fontSize: 16, color: C.sub }}>✕</Text></TouchableOpacity>
          </View>
          <SearchBar value={q} onChange={setQ} placeholder="Item, company, pack…" />
          {loading ? <Loading color={accent.main} /> : (
            <FlatList
              style={{ marginTop: 8 }}
              data={shown}
              keyExtractor={(i) => String(i.id)}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              renderItem={({ item: i }) => {
                const n = qtyOf(i.id);
                const stock = Number(i.stock ?? 0);
                return (
                  <View style={[st.row, n > 0 && { borderColor: accent.main, backgroundColor: accent.soft }]}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={st.name} numberOfLines={2}>{i.name}</Text>
                      <Text style={st.meta} numberOfLines={1}>{[i.company, i.pack].filter(Boolean).join(' · ')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <Badge label={`Stk ${stock}`} color={stock > 0 ? C.cr : C.danger} soft />
                        <Text style={st.meta}>MRP ₹{amt(i.mrp)} · GST {i.gst_rate ?? 0}%</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[st.rate, { color: accent.dark }]}>₹{amt(rateOf(i))}</Text>
                      <View style={{ marginTop: 6 }}>
                        {n > 0 ? <Stepper value={n} onChange={(v) => onSet(i, v)} color={accent.main} /> : (
                          <TouchableOpacity onPress={() => onSet(i, 1)} style={[st.add, { borderColor: accent.main }]}>
                            <Text style={{ color: accent.main, fontWeight: '900' }}>ADD</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.faint, marginTop: 30 }}>No item matches</Text>}
            />
          )}
          <Btn
            label={picked.length ? `✓ Done · ${picked.length} item${picked.length > 1 ? 's' : ''} · ${money(total)}` : 'Close'}
            color={accent.main}
            onPress={onClose}
            style={{ marginTop: 8 }}
          />
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1.2, borderColor: C.line },
  name: { fontSize: 14.5, fontWeight: '800', color: C.text },
  meta: { fontSize: 11.5, color: C.sub, marginTop: 2 },
  rate: { fontSize: 15.5, fontWeight: '900' },
  add: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 7 },
  toggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#E8EDF5' },
});
