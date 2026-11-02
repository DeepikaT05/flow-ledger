import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Field, Btn, KV, ui } from './ui';
import { Batch, BillLine } from '../types';
import { C, R, Accent } from '../theme';
import { money, r2 } from '../utils/format';

/** A bill line being edited; `stock` / `name` are for display only. */
export interface EditLine extends BillLine { item_name: string; stock?: number }

export const lineCalc = (l: Pick<BillLine, 'qty' | 'rate' | 'disc_pct' | 'gst_rate'>) => {
  const gross = r2((Number(l.qty) || 0) * (Number(l.rate) || 0));
  const taxable = r2(gross * (1 - (Number(l.disc_pct) || 0) / 100));
  const tax = r2(taxable * (Number(l.gst_rate) || 0) / 100);
  return { gross, taxable, tax, amount: r2(taxable + tax) };
};

const n = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/,/g, '')) || 0);
const str = (v: number | undefined) => (v ? String(v) : '');

interface Props {
  visible: boolean;
  line: EditLine | null;
  inward: boolean;
  batches: Batch[];
  accent: Accent;
  onSave: (l: EditLine) => void;
  onRemove?: () => void;
  onClose: () => void;
}

/** Qty / free / rate / disc / GST for one line; inward entries also type batch, expiry and M.R.P. */
export const LineEditor: React.FC<Props> = ({ visible, line, inward, batches, accent, onSave, onRemove, onClose }) => {
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!line) return;
    setF({
      qty: str(line.qty), free: str(line.free), rate: str(line.rate), disc: str(line.disc_pct), gst: String(line.gst_rate ?? 0),
      batch: line.batch ?? '', expiry: line.expiry ?? '', mrp: str(line.mrp),
    });
  }, [line]);
  if (!line) return null;

  const set = (k: string) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const draft = { qty: n(f.qty ?? ''), rate: n(f.rate ?? ''), disc_pct: n(f.disc ?? ''), gst_rate: n(f.gst ?? '') };
  const c = lineCalc(draft);
  const over = !inward && line.stock !== undefined && draft.qty + n(f.free ?? '') > line.stock;

  const save = () => {
    if (draft.qty + n(f.free ?? '') <= 0) return;
    const batch = (f.batch ?? '').trim().toUpperCase();
    // Typed a different batch on an inward bill → server creates / finds that batch.
    const sameBatch = batches.find((b) => b.batch.toUpperCase() === batch);
    onSave({
      ...line, ...draft, free: n(f.free ?? ''),
      batch, expiry: (f.expiry ?? '').trim(), mrp: n(f.mrp ?? ''),
      batch_id: inward ? (sameBatch && sameBatch.id ? sameBatch.id : null) : line.batch_id,
      ...c,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={ui.overlay}>
        <View style={[ui.sheet, { maxHeight: '92%' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[ui.sheetTitle, { marginBottom: 2 }]} numberOfLines={2}>{line.item_name}</Text>
              <Text style={{ color: C.sub, fontSize: 12.5 }}>
                {line.pack ? `${line.pack} · ` : ''}{!inward && line.batch ? `Batch ${line.batch} · ` : ''}
                {line.stock !== undefined ? `Stock ${line.stock}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={ui.closeBtn}><Text style={{ fontSize: 16, color: C.sub }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {inward ? (
              <>
                {batches.filter((b) => b.id).length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
                    {batches.filter((b) => b.id).map((b) => (
                      <TouchableOpacity
                        key={b.id}
                        style={[st.bchip, f.batch?.toUpperCase() === b.batch.toUpperCase() && { borderColor: accent.main, backgroundColor: accent.soft }]}
                        onPress={() => setF((o) => ({ ...o, batch: b.batch, expiry: b.expiry || o.expiry, mrp: str(b.mrp) || o.mrp }))}
                      >
                        <Text style={{ fontWeight: '700', color: C.text, fontSize: 12.5 }}>{b.batch}</Text>
                        <Text style={{ color: C.sub, fontSize: 11 }}>{b.expiry || '—'} · ₹{b.mrp}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={st.row}>
                  <Field label="Batch" value={f.batch} onChangeText={set('batch')} autoCapitalize="characters" style={{ flex: 1.3 }} />
                  <Field label="Expiry (MM/YY)" value={f.expiry} onChangeText={set('expiry')} placeholder="12/27" style={{ flex: 1 }} />
                  <Field label="M.R.P." value={f.mrp} onChangeText={set('mrp')} keyboardType="decimal-pad" style={{ flex: 1 }} />
                </View>
              </>
            ) : null}
            <View style={st.row}>
              <Field label="Qty" value={f.qty} onChangeText={set('qty')} keyboardType="decimal-pad" autoFocus style={{ flex: 1 }}
                inputStyle={[{ fontSize: 18, fontWeight: '800' }, over && { borderColor: C.danger }]} />
              <Field label="Free" value={f.free} onChangeText={set('free')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Rate (excl. GST)" value={f.rate} onChangeText={set('rate')} keyboardType="decimal-pad" style={{ flex: 1.4 }}
                inputStyle={{ fontSize: 18, fontWeight: '800' }} />
            </View>
            {over ? <Text style={{ color: C.danger, fontSize: 12, marginTop: -6, marginBottom: 8 }}>⚠ More than stock ({line.stock})</Text> : null}
            <View style={st.row}>
              <Field label="Disc %" value={f.disc} onChangeText={set('disc')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <View style={{ flex: 2 }}>
                <Text style={ui.label}>GST %</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['0', '5', '12', '18', '28'].map((g) => (
                    <TouchableOpacity key={g} onPress={() => set('gst')(g)} style={[st.gst, Number(f.gst) === Number(g) && { backgroundColor: accent.main, borderColor: accent.main }]}>
                      <Text style={{ fontWeight: '800', color: Number(f.gst) === Number(g) ? C.white : C.sub }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <View style={st.calc}>
              <KV k="Taxable" v={money(c.taxable)} />
              <KV k="GST" v={money(c.tax)} />
              <KV k="Line Amount" v={money(c.amount)} bold color={accent.dark} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 6 }}>
              {onRemove ? <Btn label="Remove" ghost color={C.danger} onPress={onRemove} style={{ flex: 1 }} /> : null}
              <Btn label="✓ Done" color={accent.main} onPress={save} style={{ flex: 2 }} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  gst: { flex: 1, paddingVertical: 11, borderRadius: R.sm, borderWidth: 1.2, borderColor: C.line, alignItems: 'center', backgroundColor: C.white },
  calc: { backgroundColor: C.white, borderRadius: R.md, padding: 12, borderWidth: 1, borderColor: C.line },
  bchip: { borderWidth: 1.2, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.white },
});
