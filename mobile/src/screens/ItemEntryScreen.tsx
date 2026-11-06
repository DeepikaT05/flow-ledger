import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Screen, TopBar, Card, Field, SectionTitle, Btn, Loading, Stepper, ui } from '../components/ui';
import { QrCode } from '../components/QrCode';
import { Scanner } from '../components/Scanner';
import { ItemService } from '../api/services';
import { useAuth } from '../context/AuthContext';
import { Item } from '../types';
import { codeOf, newCode, printLabels, printJewelTags, encodeJewelQr, parseJewelCode, JewelTagData } from '../utils/codes';
import { MODULE, C, R } from '../theme';

const GST = [0, 3, 5, 12, 18, 28];
const n = (s: string) => Number(String(s).replace(/,/g, '')) || 0;
const str = (v: unknown) => (v === null || v === undefined || Number(v) === 0 ? '' : String(v));

/**
 * Item master (web: Masters ▸ Item Master / NEW PRODUCT). Every item gets a QR code:
 * In a Jewellery company, it captures GW, LESS, NW (auto GW-LESS), MKG, and prints a 2-sided tag.
 */
export const ItemEntryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { company } = useAuth();
  const id: number | undefined = route.params?.id;
  const accent = MODULE.purchase;

  const isJewel = /JEWEL/i.test(company?.business_type ?? '') || /JEWEL/i.test(company?.details ?? '');

  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<Item | null>(null);
  const [scan, setScan] = useState(false);
  const [copies, setCopies] = useState(2);
  const [f, setF] = useState({
    name: '', company: '', pack: '', unit: isJewel ? 'GM' : 'PCS', hsn: isJewel ? '7113' : '',
    gst_rate: isJewel ? 3 : 18, mrp: '', sale_rate: '', purchase_rate: '',
    opening_stock: '', min_stock: '', barcode: String(route.params?.barcode ?? ''),
    // Jewellery fields
    gw: '', less: '', nw: '', mkg: '5.00 %', metal: 'SILVER',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const onGwChange = (v: string) => {
    const g = Number(v) || 0;
    const l = Number(f.less) || 0;
    const net = Math.max(0, g - l);
    setF((o) => ({ ...o, gw: v, nw: net ? net.toFixed(3) : '' }));
  };

  const onLessChange = (v: string) => {
    const g = Number(f.gw) || 0;
    const l = Number(v) || 0;
    const net = Math.max(0, g - l);
    setF((o) => ({ ...o, less: v, nw: net ? net.toFixed(3) : '' }));
  };

  useEffect(() => {
    if (!id) return;
    ItemService.get(id).then((it) => {
      setItem(it);
      let d: Record<string, any> = {};
      try { d = JSON.parse(it.details || '{}'); } catch {}
      const gw = str(d.jw_gw ?? d.jw_weight);
      const less = str(d.jw_less);
      const nw = str(d.jw_nw ?? (n(gw) ? Math.max(0, n(gw) - n(less)).toFixed(3) : ''));
      const mkg = String(d.jw_mkg ?? (d.jw_making ? `${d.jw_making} ${d.jw_making_unit || '%'}` : '5.00 %'));

      setF({
        name: it.name, company: it.company ?? '', pack: it.pack ?? '', unit: it.unit ?? (isJewel ? 'GM' : 'PCS'), hsn: it.hsn ?? '',
        gst_rate: Number(it.gst_rate ?? (isJewel ? 3 : 0)), mrp: str(it.mrp), sale_rate: str(it.sale_rate), purchase_rate: str(it.purchase_rate),
        opening_stock: str(it.opening_stock), min_stock: str(it.min_stock), barcode: codeOf(it),
        gw, less, nw, mkg, metal: d.jw_metal || 'SILVER',
      });
    }).catch((e) => Alert.alert('Error', e.message)).finally(() => setLoading(false));
  }, [id, isJewel]);

  const save = async () => {
    if (!f.name.trim()) { Alert.alert('Name required', 'Enter the item name.'); return; }
    setSaving(true);
    try {
      const base: Record<string, unknown> = item ? { ...item } : {};
      let det: Record<string, any> = {};
      try { det = JSON.parse(String((base as any).details || '{}')); } catch {}

      const cleanCode = f.barcode.trim();
      if (cleanCode) det.barcode = cleanCode;

      if (isJewel || n(f.gw)) {
        det.jw_gw = n(f.gw);
        det.jw_less = n(f.less);
        det.jw_nw = n(f.nw) || Math.max(0, n(f.gw) - n(f.less));
        det.jw_mkg = f.mkg.trim();
        det.jw_metal = f.metal;
        det.jw_weight = det.jw_nw;
      }

      const body = {
        ...base,
        name: f.name.trim().toUpperCase(), company: f.company.trim().toUpperCase(), pack: f.pack.trim().toUpperCase(),
        unit: f.unit.trim().toUpperCase() || (isJewel ? 'GM' : 'PCS'), hsn: f.hsn.trim(), gst_rate: f.gst_rate,
        mrp: n(f.mrp), sale_rate: n(f.sale_rate), purchase_rate: n(f.purchase_rate),
        opening_stock: n(f.opening_stock), min_stock: n(f.min_stock),
        details: det,
      };

      let itemId = id;
      if (id) await ItemService.update(id, body);
      else itemId = (await ItemService.create(body)).id;

      // Ensure item has a barcode / QR code (e.g. PA000012 or FL000012)
      const prefix = isJewel ? (f.name.slice(0, 2).toUpperCase() || 'JW') : 'FL';
      const code = cleanCode || newCode(itemId!, prefix);
      await ItemService.setBarcode(itemId!, code);

      Alert.alert('Saved ✓', `${body.name} saved.\nTag / QR Code: ${code}`, [
        { text: 'Print Tag / Label', onPress: () => navigation.replace('ItemEntry', { id: itemId }) },
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const linkCode = async (rawCode: string) => {
    const jewelParsed = parseJewelCode(rawCode);
    if (jewelParsed) {
      setF((o) => ({
        ...o,
        barcode: jewelParsed.code || o.barcode,
        name: jewelParsed.name || o.name,
        gw: jewelParsed.gw ? String(jewelParsed.gw) : o.gw,
        less: jewelParsed.less ? String(jewelParsed.less) : o.less,
        nw: jewelParsed.nw ? String(jewelParsed.nw) : o.nw,
        mkg: jewelParsed.mkg || o.mkg,
      }));
      if (id && jewelParsed.code) {
        try { await ItemService.setBarcode(id, jewelParsed.code); } catch {}
      }
      return;
    }

    setF((o) => ({ ...o, barcode: rawCode.trim() }));
    if (!id) return;
    try { await ItemService.setBarcode(id, rawCode.trim()); Alert.alert('Linked ✓', `Code ${rawCode} now opens ${f.name}.`); } catch (e: any) { Alert.alert('Could not link', e.message); }
  };

  if (loading) return <Screen accent={accent}><TopBar title="Item" accent={accent} onBack={() => navigation.goBack()} /><Loading color={accent.main} /></Screen>;
  const code = f.barcode.trim();

  const jewelData: JewelTagData = {
    type: 'JEWEL',
    code: code || 'NEW-TAG',
    name: f.name || 'ITEM NAME',
    gw: n(f.gw),
    less: n(f.less),
    nw: n(f.nw) || Math.max(0, n(f.gw) - n(f.less)),
    mkg: f.mkg || '5.00 %',
    metal: f.metal,
  };

  const qrValue = (isJewel || n(f.gw))
    ? encodeJewelQr(jewelData)
    : (code || 'FL000000');

  const onPrint = async () => {
    try {
      if (isJewel || n(f.gw)) {
        await printJewelTags(jewelData, copies);
      } else if (item) {
        await printLabels({ ...item, name: f.name, mrp: n(f.mrp) }, code, copies);
      }
    } catch (e: any) {
      Alert.alert('Print failed', e.message);
    }
  };

  return (
    <Screen accent={accent}>
      <TopBar
        title={id ? (isJewel ? 'Modify Jewellery Item' : 'Modify Item') : (isJewel ? 'New Jewellery Item' : 'New Item')}
        subtitle={code ? `Tag / QR: ${code}` : 'QR code is created on save'}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={{ label: 'SAVE', onPress: save, busy: saving }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          
          {/* QR / Barcode Card */}
          <SectionTitle>QR Code &amp; Tag</SectionTitle>
          <Card>
            {code ? (
              <View style={{ alignItems: 'center' }}>
                <QrCode value={qrValue} size={170} />
                {(isJewel || n(f.gw)) ? (
                  <View style={st.tagBox}>
                    <View style={st.tagSideA}>
                      <Text style={st.tagA1}>{code}</Text>
                      <Text style={st.tagA2} numberOfLines={1}>{f.name || 'ITEM NAME'}</Text>
                    </View>
                    <View style={st.tagDivider} />
                    <View style={st.tagSideB}>
                      <View style={st.wRow}><Text style={st.wK}>GW</Text><Text style={st.wV}>{n(f.gw).toFixed(3)}</Text></View>
                      <View style={st.wRow}><Text style={st.wK}>LESS</Text><Text style={st.wV}>{n(f.less).toFixed(3)}</Text></View>
                      <View style={[st.wRow, st.wBld]}><Text style={st.wK}>NW</Text><Text style={st.wV}>{jewelData.nw.toFixed(3)}</Text></View>
                      <View style={st.wRow}><Text style={st.wK}>MKG</Text><Text style={st.wV}>{f.mkg || '5.00 %'}</Text></View>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: C.sub, textAlign: 'center', marginVertical: 10 }}>
                No code yet. Save to generate QR tag with GW, LESS, NW &amp; MKG.
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn small label="📷 Scan QR / Tag" color={accent.main} onPress={() => setScan(true)} style={{ flex: 1 }} />
              {id && !code ? (
                <Btn small ghost label="⚡ Generate Tag" color={accent.main}
                  onPress={() => linkCode(newCode(id, isJewel ? (f.name.slice(0, 2).toUpperCase() || 'JW') : 'FL'))}
                  style={{ flex: 1 }} />
              ) : null}
            </View>

            {code ? (
              <View style={st.print}>
                <Text style={[ui.label, { marginBottom: 0, flex: 1 }]}>Copies</Text>
                <Stepper value={copies} min={1} onChange={setCopies} color={accent.main} />
                <Btn small label="🖨️ Print Tag" color={C.navy2} style={{ marginLeft: 10 }} onPress={onPrint} />
              </View>
            ) : null}
          </Card>

          {/* Jewellery Weight & Making Section */}
          {(isJewel || n(f.gw)) ? (
            <>
              <SectionTitle>Jewellery Details (GW · LESS · NW · MKG)</SectionTitle>
              <Card>
                <View style={st.row}>
                  <Field label="GW (Gross Wt gm) *" value={f.gw} onChangeText={onGwChange} keyboardType="decimal-pad" placeholder="185.200" style={{ flex: 1 }} />
                  <Field label="LESS (Stone/Lac gm)" value={f.less} onChangeText={onLessChange} keyboardType="decimal-pad" placeholder="24.300" style={{ flex: 1 }} />
                </View>
                <View style={st.row}>
                  <Field label="NW (Net Wt gm) [Auto]" value={f.nw || (n(f.gw) ? Math.max(0, n(f.gw) - n(f.less)).toFixed(3) : '')} onChangeText={set('nw')} keyboardType="decimal-pad" placeholder="160.900" style={{ flex: 1 }} />
                  <Field label="MKG (Making Charges)" value={f.mkg} onChangeText={set('mkg')} placeholder="5.00 %" style={{ flex: 1 }} />
                </View>
                <View style={st.row}>
                  <Field label="Metal (GOLD / SILVER)" value={f.metal} onChangeText={set('metal')} autoCapitalize="characters" style={{ flex: 1, marginBottom: 0 }} />
                  <Field label="Tag / Barcode No." value={f.barcode} onChangeText={set('barcode')} autoCapitalize="characters" placeholder="e.g. PA002332" style={{ flex: 1.4, marginBottom: 0 }} />
                </View>
              </Card>
            </>
          ) : null}

          {/* Item Master Fields */}
          <SectionTitle>Item Master</SectionTitle>
          <Card>
            <Field label="Item Name *" value={f.name} onChangeText={set('name')} autoCapitalize="characters" placeholder="e.g. PAYAL AAGRA" />
            <View style={st.row}>
              <Field label="Company / Brand" value={f.company} onChangeText={set('company')} autoCapitalize="characters" style={{ flex: 1.4 }} />
              <Field label="Pack / Size" value={f.pack} onChangeText={set('pack')} autoCapitalize="characters" style={{ flex: 1 }} />
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
                  <Text style={{ fontWeight: '800', color: f.gst_rate === g ? C.white : C.sub }}>{g}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <SectionTitle>Rates &amp; Stock</SectionTitle>
          <Card>
            <View style={st.row}>
              <Field label="M.R.P." value={f.mrp} onChangeText={set('mrp')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Sale Rate" value={f.sale_rate} onChangeText={set('sale_rate')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Purc. Rate" value={f.purchase_rate} onChangeText={set('purchase_rate')} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <View style={st.row}>
              {!id ? <Field label="Opening Qty" value={f.opening_stock} onChangeText={set('opening_stock')} keyboardType="decimal-pad" style={{ flex: 1 }} /> : null}
              <Field label="Min. Stock" value={f.min_stock} onChangeText={set('min_stock')} keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
            </View>
            {id ? <Text style={{ color: C.sub, fontSize: 12 }}>New stock is added through a Purchase bill (Items ▸ + Stock).</Text> : null}
          </Card>

          <Btn label={id ? 'Save Changes' : 'Create Item'} color={accent.main} busy={saving} onPress={save} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Scanner visible={scan} accent={accent} title="Scan Jewellery QR / Tag" onCode={linkCode} onClose={() => setScan(false)} />
    </Screen>
  );
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  gst: { flex: 1, paddingVertical: 10, borderRadius: R.sm, borderWidth: 1.2, borderColor: C.line, alignItems: 'center', backgroundColor: C.white },
  print: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  tagBox: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#333',
    borderRadius: 6,
    flexDirection: 'row',
    backgroundColor: '#fff',
    overflow: 'hidden',
    width: '100%',
    maxWidth: 320,
    elevation: 2,
  },
  tagSideA: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagA1: { fontSize: 13, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#111' },
  tagA2: { fontSize: 11, fontWeight: '700', color: '#222', marginTop: 4, textTransform: 'uppercase' },
  tagDivider: { width: 8, backgroundColor: '#f0f0f0', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#ccc' },
  tagSideB: {
    flex: 1.1,
    padding: 8,
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  wRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  wBld: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 2, marginVertical: 1 },
  wK: { fontSize: 12, fontWeight: '600', color: '#444', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  wV: { fontSize: 12, fontWeight: '800', color: '#111', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
