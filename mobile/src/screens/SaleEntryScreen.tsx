import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Header } from '../components/Header';
import { PartyPickerModal } from '../components/PartyPickerModal';
import { ItemPickerModal } from '../components/ItemPickerModal';
import { Ledger, Item, Batch, BillItem } from '../types';
import { BillService } from '../api/services';

export const SaleEntryScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const editBill = route.params?.bill;

  const [date, setDate] = useState(
    editBill?.date || new Date().toISOString().slice(0, 10)
  );
  const [billNo, setBillNo] = useState(editBill?.no || '');
  const [mode, setMode] = useState<'CREDIT' | 'CASH'>(editBill?.mode || 'CREDIT');
  const [selectedParty, setSelectedParty] = useState<Partial<Ledger> | null>(
    editBill
      ? { id: editBill.party_id, name: editBill.party_name }
      : null
  );

  const [items, setItems] = useState<BillItem[]>(editBill?.items || []);
  const [saving, setSaving] = useState(false);

  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);

  useEffect(() => {
    if (!editBill) {
      BillService.getNextNo('SALE').then((r) => {
        if (r && r.no) setBillNo(r.no);
      }).catch(() => {});
    }
  }, [editBill]);

  const handleSelectItem = (it: Item, batch?: Batch) => {
    const rate = batch?.rate || it.sale_rate || it.mrp || 0;
    const gstRate = it.gst_rate ?? 0;
    const qty = 1;
    const taxable = qty * rate;
    const tax = taxable * (gstRate / 100);
    const amount = taxable + tax;

    const newItem: BillItem = {
      item_id: it.id,
      item_name: it.name,
      pack: it.pack,
      company: it.company,
      batch: batch?.batch || '',
      expiry: batch?.expiry || '',
      qty,
      free: 0,
      rate,
      disc_pct: 0,
      gst_rate: gstRate,
      taxable,
      tax,
      amount,
    };

    setItems([...items, newItem]);
  };

  const updateItemRow = (idx: number, field: keyof BillItem, val: any) => {
    const copy = [...items];
    const row = { ...copy[idx], [field]: val };

    const qty = Number(row.qty || 0);
    const rate = Number(row.rate || 0);
    const discPct = Number(row.disc_pct || 0);
    const gstRate = Number(row.gst_rate || 0);

    const base = qty * rate;
    const discAmt = base * (discPct / 100);
    const taxable = Math.max(0, base - discAmt);
    const tax = taxable * (gstRate / 100);
    const amount = taxable + tax;

    row.taxable = Math.round(taxable * 100) / 100;
    row.tax = Math.round(tax * 100) / 100;
    row.amount = Math.round(amount * 100) / 100;

    copy[idx] = row;
    setItems(copy);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const grossTotal = items.reduce((s, it) => s + (it.qty * it.rate), 0);
  const taxableTotal = items.reduce((s, it) => s + it.taxable, 0);
  const taxTotal = items.reduce((s, it) => s + it.tax, 0);
  const rawNet = taxableTotal + taxTotal;
  const netTotal = Math.round(rawNet);
  const roundOff = Math.round((netTotal - rawNet) * 100) / 100;

  const handleSave = async () => {
    if (!selectedParty?.id) {
      Alert.alert('Validation', 'Please select a customer / party');
      return;
    }
    if (!items.length) {
      Alert.alert('Validation', 'Please add at least one product');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<any> = {
        type: 'SALE',
        no: billNo,
        date,
        party_id: selectedParty.id,
        mode,
        gross: Math.round(grossTotal * 100) / 100,
        discount: Math.round((grossTotal - taxableTotal) * 100) / 100,
        taxable: Math.round(taxableTotal * 100) / 100,
        tax: Math.round(taxTotal * 100) / 100,
        round_off: roundOff,
        net: netTotal,
        items,
      };

      if (editBill?.id) {
        await BillService.update(editBill.id, payload);
        Alert.alert('Success', 'Sale Bill updated successfully!');
      } else {
        await BillService.create(payload);
        Alert.alert('Success', 'Sale Bill created successfully!');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title={editBill ? `Edit Sale #${editBill.no}` : 'New Sale Bill'}
        subtitle="View & Modify Enabled (Delete Locked)"
        onBack={() => navigation.goBack()}
        rightActionText={saving ? 'Saving...' : 'SAVE (F10)'}
        onRightAction={handleSave}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Bill Meta */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>INVOICE DETAILS</Text>
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Bill No</Text>
              <TextInput
                style={styles.input}
                value={billNo}
                onChangeText={setBillNo}
                placeholder="A000001"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-10-31"
              />
            </View>
          </View>

          <Text style={styles.label}>Payment Mode</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'CREDIT' && styles.modeBtnActive]}
              onPress={() => setMode('CREDIT')}
            >
              <Text style={[styles.modeBtnText, mode === 'CREDIT' && styles.modeBtnTextActive]}>
                CREDIT (Udhaar)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'CASH' && styles.modeBtnActive]}
              onPress={() => setMode('CASH')}
            >
              <Text style={[styles.modeBtnText, mode === 'CASH' && styles.modeBtnTextActive]}>
                CASH (Rokad)
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Customer / Party</Text>
          <TouchableOpacity
            style={styles.partySelectBtn}
            onPress={() => setShowPartyPicker(true)}
          >
            <Text style={selectedParty ? styles.partySelectedText : styles.partyPlaceholderText}>
              {selectedParty ? selectedParty.name : '🔍 Tap to Select Customer / Party...'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bill Items */}
        <View style={styles.section}>
          <View style={styles.itemsHeader}>
            <Text style={styles.sectionHeading}>PRODUCTS ({items.length})</Text>
            <TouchableOpacity
              style={styles.addItemBtn}
              onPress={() => setShowItemPicker(true)}
            >
              <Text style={styles.addItemBtnText}>+ Add Product</Text>
            </TouchableOpacity>
          </View>

          {items.map((it, idx) => (
            <View key={idx} style={styles.itemCard}>
              <View style={styles.itemCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNameText}>{it.item_name}</Text>
                  <Text style={styles.itemMetaText}>
                    {it.company ? `${it.company} • ` : ''}
                    {it.pack ? `${it.pack} • ` : ''}
                    Batch: {it.batch || 'DEFAULT'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.itemFieldsRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Qty</Text>
                  <TextInput
                    style={styles.fieldInput}
                    keyboardType="numeric"
                    value={String(it.qty)}
                    onChangeText={(v) => updateItemRow(idx, 'qty', Number(v) || 0)}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Rate</Text>
                  <TextInput
                    style={styles.fieldInput}
                    keyboardType="numeric"
                    value={String(it.rate)}
                    onChangeText={(v) => updateItemRow(idx, 'rate', Number(v) || 0)}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Disc%</Text>
                  <TextInput
                    style={styles.fieldInput}
                    keyboardType="numeric"
                    value={String(it.disc_pct || 0)}
                    onChangeText={(v) => updateItemRow(idx, 'disc_pct', Number(v) || 0)}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>GST%</Text>
                  <Text style={styles.readOnlyField}>{it.gst_rate ?? 0}%</Text>
                </View>
                <View style={[styles.fieldCol, { flex: 1.2 }]}>
                  <Text style={styles.fieldLabel}>Amount</Text>
                  <Text style={styles.amountField}>₹{it.amount.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          ))}

          {!items.length && (
            <TouchableOpacity
              style={styles.emptyAddBox}
              onPress={() => setShowItemPicker(true)}
            >
              <Text style={styles.emptyAddText}>+ Tap here to add products to bill</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bill Summary Totals */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Amount:</Text>
            <Text style={styles.summaryVal}>₹{grossTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Taxable Value:</Text>
            <Text style={styles.summaryVal}>₹{taxableTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GST Total:</Text>
            <Text style={styles.summaryVal}>₹{taxTotal.toFixed(2)}</Text>
          </View>
          {roundOff !== 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Round Off:</Text>
              <Text style={styles.summaryVal}>₹{roundOff.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.netRow]}>
            <Text style={styles.netLabel}>NET BILL AMOUNT:</Text>
            <Text style={styles.netVal}>₹{netTotal.toFixed(2)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.bigSaveBtn}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bigSaveBtnText}>SAVE & PRINT INVOICE</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modals */}
      <PartyPickerModal
        visible={showPartyPicker}
        groupFilter="Sundry Debtors,Sundry Creditors"
        onSelect={(p) => setSelectedParty(p)}
        onClose={() => setShowPartyPicker(false)}
      />

      <ItemPickerModal
        visible={showItemPicker}
        onSelect={handleSelectItem}
        onClose={() => setShowItemPicker(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  scroll: {
    padding: 14,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#003366',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  modeToggle: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#003366',
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 6,
  },
  modeBtnActive: {
    backgroundColor: '#003366',
  },
  modeBtnText: {
    color: '#003366',
    fontWeight: 'bold',
    fontSize: 12,
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },
  partySelectBtn: {
    borderWidth: 1,
    borderColor: '#003366',
    backgroundColor: '#f5f9ff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  partyPlaceholderText: {
    color: '#003366',
    fontSize: 14,
    fontWeight: '600',
  },
  partySelectedText: {
    color: '#002244',
    fontSize: 15,
    fontWeight: 'bold',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addItemBtn: {
    backgroundColor: '#00796b',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  addItemBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemCard: {
    backgroundColor: '#f9fbfd',
    borderColor: '#e0e0e0',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  itemCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#222',
  },
  itemMetaText: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  removeText: {
    color: '#d32f2f',
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemFieldsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  fieldCol: {
    flex: 1,
    marginRight: 6,
  },
  fieldLabel: {
    fontSize: 10,
    color: '#777',
    marginBottom: 2,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 13,
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  readOnlyField: {
    fontSize: 12,
    color: '#555',
    paddingVertical: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  amountField: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00796b',
    paddingVertical: 4,
    textAlign: 'right',
  },
  emptyAddBox: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderStyle: 'dashed',
    borderRadius: 6,
    padding: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyAddText: {
    color: '#003366',
    fontWeight: 'bold',
    fontSize: 14,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  netRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    marginTop: 4,
  },
  netLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#003366',
  },
  netVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00796b',
  },
  bigSaveBtn: {
    backgroundColor: '#003366',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 30,
  },
  bigSaveBtnText: {
    color: '#ffcc00',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
});

