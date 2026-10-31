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
import { Ledger } from '../types';
import { VoucherService, LedgerService } from '../api/services';

export const PaymentEntryScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const editVoucher = route.params?.voucher;

  const [date, setDate] = useState(
    editVoucher?.date || new Date().toISOString().slice(0, 10)
  );
  const [voucherNo, setVoucherNo] = useState(editVoucher?.no || '');
  const [amount, setAmount] = useState(
    editVoucher?.amount ? String(editVoucher.amount) : ''
  );
  const [narration, setNarration] = useState(editVoucher?.narration || '');

  const [party, setParty] = useState<Partial<Ledger> | null>(null);
  const [account, setAccount] = useState<Partial<Ledger> | null>(null);

  const [cashBankList, setCashBankList] = useState<Ledger[]>([]);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    LedgerService.list('Cash-in-hand,Bank Accounts').then((res) => {
      setCashBankList(res);
      if (res.length > 0 && !editVoucher) {
        setAccount(res[0]);
      }
    }).catch(() => {});

    if (!editVoucher) {
      VoucherService.getNextNo('PAYMENT').then((res) => {
        if (res && res.no) setVoucherNo(res.no);
      }).catch(() => {});
    } else {
      const drLine = editVoucher.lines?.find((l: any) => l.debit > 0);
      const crLine = editVoucher.lines?.find((l: any) => l.credit > 0);
      if (drLine) setParty({ id: drLine.ledger_id, name: drLine.ledger_name });
      if (crLine) setAccount({ id: crLine.ledger_id, name: crLine.ledger_name });
    }
  }, [editVoucher]);

  const handleSave = async () => {
    const numAmt = Number(amount);
    if (!party?.id) {
      Alert.alert('Validation', 'Please select supplier / expense ledger');
      return;
    }
    if (!account?.id) {
      Alert.alert('Validation', 'Please select paying Cash / Bank account');
      return;
    }
    if (!numAmt || numAmt <= 0) {
      Alert.alert('Validation', 'Please enter a valid payment amount');
      return;
    }

    setSaving(true);
    try {
      const lines = [
        // Debit: Supplier ledger cleared or Expense charged
        { ledger_id: party.id, debit: numAmt, credit: 0 },
        // Credit: Cash/Bank paid out
        { ledger_id: account.id, debit: 0, credit: numAmt },
      ];

      const payload = {
        type: 'PAYMENT' as const,
        no: voucherNo,
        date,
        narration: narration.trim() || `Payment to ${party.name}`,
        lines,
      };

      if (editVoucher?.id) {
        await VoucherService.update(editVoucher.id, payload);
        Alert.alert('Success', 'Payment voucher updated successfully!');
      } else {
        await VoucherService.create(payload);
        Alert.alert('Success', 'Payment voucher saved successfully!');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title={editVoucher ? `Edit Pay #${editVoucher.no}` : 'New Payment Voucher'}
        subtitle="Money Out (Delete Locked)"
        onBack={() => navigation.goBack()}
        rightActionText={saving ? 'Saving...' : 'SAVE (F10)'}
        onRightAction={handleSave}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>PAYMENT DETAILS</Text>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Voucher No</Text>
              <TextInput
                style={styles.input}
                value={voucherNo}
                onChangeText={setVoucherNo}
                placeholder="P000001"
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

          <Text style={styles.label}>Paid To (Supplier / Creditor / Expense)</Text>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => setShowPartyPicker(true)}
          >
            <Text style={party ? styles.selectedText : styles.placeholderText}>
              {party ? party.name : '🔍 Tap to Select Supplier / Ledger...'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: 14 }]}>Paid From (Cash or Bank Account)</Text>
          <View style={styles.accountRow}>
            {cashBankList.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accPill,
                  account?.id === acc.id && styles.accPillActive,
                ]}
                onPress={() => setAccount(acc)}
              >
                <Text
                  style={[
                    styles.accPillText,
                    account?.id === acc.id && styles.accPillTextActive,
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={styles.label}>Amount Paid (₹)</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />
          </View>

          <Text style={styles.label}>Narration / Remarks</Text>
          <TextInput
            style={[styles.input, { height: 60 }]}
            multiline
            value={narration}
            onChangeText={setNarration}
            placeholder="e.g. Paid against supplier purchase bill"
          />
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>SAVE PAYMENT VOUCHER</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <PartyPickerModal
        visible={showPartyPicker}
        groupFilter="Sundry Creditors,Indirect Expenses,Direct Expenses,Sundry Debtors"
        onSelect={(p) => setParty(p)}
        onClose={() => setShowPartyPicker(false)}
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    elevation: 2,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#003366',
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
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  amountInput: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#c2185b',
  },
  selectBtn: {
    borderWidth: 1,
    borderColor: '#c2185b',
    backgroundColor: '#fce4ec',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  placeholderText: {
    color: '#c2185b',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedText: {
    color: '#880e4f',
    fontSize: 15,
    fontWeight: 'bold',
  },
  accountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  accPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#003366',
    marginRight: 8,
    marginBottom: 6,
  },
  accPillActive: {
    backgroundColor: '#003366',
  },
  accPillText: {
    color: '#003366',
    fontSize: 12,
    fontWeight: 'bold',
  },
  accPillTextActive: {
    color: '#ffffff',
  },
  saveBtn: {
    backgroundColor: '#c2185b',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
});

