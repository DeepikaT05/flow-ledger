import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Screen, TopBar, Card, Field, SectionTitle, Btn, Loading, Stepper, ui } from '../components/ui';
import { QrCode } from '../components/QrCode';
import { Scanner } from '../components/Scanner';
import { ItemService } from '../api/services';
import { Item } from '../types';
import { codeOf, newCode, printLabels } from '../utils/codes';
import { MODULE, C, R } from '../theme';

const GST = [0, 5, 12, 18, 28];
const n = (s: string) => Number(String(s).replace(/,/g, '')) || 0;
const str = (v: unknown) => (v === null || v === undefined || Number(v) === 0 ? '' : String(v));

/**
 * Item master (web: Masters ▸ Item Master / NEW PRODUCT). Every item gets a QR code: the maker's
 * printed barcode / QR when scanned in, otherwise one we generate (FL000012) and print as labels.
 */
export const ItemEntryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const id: number | undefined = route.params?.id;
  const accent = MODULE.purchase;
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<Item | null>(null);
  const [scan, setScan] = useState(false);
  const [copies, setCopies] = useState(4);
  const [f, setF] = useState({
    name: '', company: '', pack: '', unit: 'PCS', hsn: '', gst_rate: 18, mrp: '', sale_rate: '', purchase_rate: '',
    opening_stock: '', min_stock: '', barcode: String(route.params?.barcode ?? ''),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    if (!id) return;
    ItemService.get(id).then((it) => {
      setItem(it);
      setF({
        name: it.name, company: it.company ?? '', pack: it.pack ?? '', unit: it.unit ?? 'PCS', hsn: it.hsn ?? '',
        gst_rate: Number(it.gst_rate ?? 0), mrp: str(it.mrp), sale_rate: str(it.sale_rate), purchase_rate: str(it.purchase_rate),
        opening_stock: str(it.opening_stock), min_stock: str(it.min_stock), barcode: codeOf(it),
      });
    }).catch((e) => Alert.alert('Error', e.message)).finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!f.name.trim()) { Alert.alert('Name required', 'Enter the item name.'); return; }
    setSaving(true);
    try {
      // PUT replaces every field, so start from the stored item (expiry, batch, reorder qty…).
      const base: Record<string, unknown> = item ? { ...item } : {};
      const body = {
        ...base,
        name: f.name.trim().toUpperCase(), company: f.company.trim().toUpperCase(), pack: f.pack.trim().toUpperCase(),
        unit: f.unit.trim().toUpperCase() || 'PCS', hsn: f.hsn.trim(), gst_rate: f.gst_rate,
        mrp: n(f.mrp), sale_rate: n(f.sale_rate), purchase_rate: n(f.purchase_rate),
        opening_stock: n(f.opening_stock), min_stock: n(f.min_stock),
        details: f.barcode.trim() ? { barcode: f.barcode.trim() } : {},
      };
      let itemId = id;
      if (id) await ItemService.update(id, body);
      else itemId = (await ItemService.create(body)).id;
      // No printed code on the product → give it our own so it can be scanned at billing.
      const code = f.barcode.trim() || newCode(itemId!);
      await ItemService.setBarcode(itemId!, code);
      Alert.alert('Saved ✓', `${body.name} saved. QR code: ${code}`, [
        { text: 'Print QR Labels', onPress: () => navigation.replace('ItemEntry', { id: itemId }) },
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const linkCode = async (code: string) => {
    setF((o) => ({ ...o, barcode: code }));
    if (!id) return;   // new item: saved with the form
    try { await ItemService.setBarcode(id, code); Alert.alert('Linked ✓', `Code ${code} now opens ${f.name}.`); } catch (e: any) { Alert.alert('Could not link', e.message); }
  };

  if (loading) return <Screen accent={accent}><TopBar title="Item" accent={accent} onBack={() => navigation.goBack()} /><Loading color={accent.main} /></Screen>;
  const code = f.barcode.trim();

  return (
    <Screen accent={accent}>
      <TopBar title={id ? 'Modify Item' : 'New Item'} subtitle={code ? `QR / Barcode: ${code}` : 'QR code is created on save'} accent={accent}
        onBack={() => navigation.goBack()} right={{ label: 'SAVE', onPress: save, busy: saving }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <SectionTitle>QR / Barcode</SectionTitle>
          <Card>
            {code ? <QrCode value={code} size={190} /> : (
              <Text style={{ color: C.sub, textAlign: 'center', marginVertical: 10 }}>
                No code yet. Scan the product's own QR / barcode, or save and we generate one.
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn small label="📷 Scan product code" color={accent.main} onPress={() => setScan(true)} style={{ flex: 1 }} />
              {id && !code ? <Btn small ghost label="⚡ Generate" color={accent.main} onPress={() => linkCode(newCode(id))} style={{ flex: 1 }} /> : null}
            </View>
            {id && code && item ? (
              <View style={st.print}>
                <Text style={[ui.label, { marginBottom: 0, flex: 1 }]}>Labels to print</Text>
                <Stepper value={copies} min={1} onChange={setCopies} color={accent.main} />
                <Btn small label="🖨️ Print" color={C.navy2} style={{ marginLeft: 10 }}
                  onPress={() => printLabels({ ...item, name: f.name, mrp: n(f.mrp) }, code, copies).catch((e) => Alert.alert('Print failed', e.message))} />
              </View>
            ) : null}
          </Card>

          <SectionTitle>Item</SectionTitle>
          <Card>
            <Field label="Item Name *" value={f.name} onChangeText={set('name')} autoCapitalize="characters" />
            <View style={st.row}>
              <Field label="Company" value={f.company} onChangeText={set('company')} autoCapitalize="characters" style={{ flex: 1.4 }} />
              <Field label="Pack" value={f.pack} onChangeText={set('pack')} autoCapitalize="characters" style={{ flex: 1 }} />
            </View>
            <View style={st.row}>
              <Field label="Unit" value={f.unit} onChangeText={set('unit')} autoCapitalize="characters" style={{ flex: 1 }} />
              <Field label="HSN / SAC" value={f.hsn} onChangeText={set('hsn')} keyboardType="number-pad" style={{ flex: 1.4 }} />
            </View>
            <Text style={ui.label}>GST %</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {GST.map((g) => (
                <TouchableOpacity key={g} onPress={() => setF((o) => ({ ...o, gst_rate: g }))}
                  style={[st.gst, f.gst_rate === g && { backgroundColor: accent.main, borderColor: accent.main }]}>
                  <Text style={{ fontWeight: '800', color: f.gst_rate === g ? C.white : C.sub }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <SectionTitle>Rates & Stock</SectionTitle>
          <Card>
            <View style={st.row}>
              <Field label="M.R.P." value={f.mrp} onChangeText={set('mrp')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Sale Rate" value={f.sale_rate} onChangeText={set('sale_rate')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Purc. Rate" value={f.purchase_rate} onChangeText={set('purchase_rate')} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <View style={st.row}>
              {!id ? <Field label="Opening Stock" value={f.opening_stock} onChangeText={set('opening_stock')} keyboardType="decimal-pad" style={{ flex: 1 }} /> : null}
              <Field label="Min. Stock" value={f.min_stock} onChangeText={set('min_stock')} keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
            </View>
            {id ? <Text style={{ color: C.sub, fontSize: 12 }}>New stock is added through a Purchase bill (Items ▸ + Stock).</Text> : null}
          </Card>
          <Btn label={id ? 'Save Changes' : 'Create Item'} color={accent.main} busy={saving} onPress={save} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Scanner visible={scan} accent={accent} title="Scan the product's code" onCode={linkCode} onClose={() => setScan(false)} />
    </Screen>
  );
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  gst: { flex: 1, paddingVertical: 10, borderRadius: R.sm, borderWidth: 1.2, borderColor: C.line, alignItems: 'center', backgroundColor: C.white },
  print: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
});
