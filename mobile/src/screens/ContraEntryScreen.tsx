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
import { Ledger } from '../types';
import { VoucherService, LedgerService } from '../api/services';

export const ContraEntryScreen: React.FC<{ navigation: any; route: any }> = ({
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

  const [depositInto, setDepositInto] = useState<Partial<Ledger> | null>(null);
  const [withdrawFrom, setWithdrawFrom] = useState<Partial<Ledger> | null>(null);

  const [cashBankList, setCashBankList] = useState<Ledger[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    LedgerService.list('Cash-in-hand,Bank Accounts').then((res) => {
      setCashBankList(res);
      if (res.length >= 2 && !editVoucher) {
        setDepositInto(res[1]); // e.g. Bank
        setWithdrawFrom(res[0]); // e.g. Cash
      }
    }).catch(() => {});

    if (!editVoucher) {
      VoucherService.getNextNo('CONTRA').then((res) => {
        if (res && res.no) setVoucherNo(res.no);
      }).catch(() => {});
    } else {
      const drLine = editVoucher.lines?.find((l: any) => l.debit > 0);
      const crLine = editVoucher.lines?.find((l: any) => l.credit > 0);
      if (drLine) setDepositInto({ id: drLine.ledger_id, name: drLine.ledger_name });
      if (crLine) setWithdrawFrom({ id: crLine.ledger_id, name: crLine.ledger_name });
    }
  }, [editVoucher]);

  const handleSave = async () => {
    const numAmt = Number(amount);
    if (!depositInto?.id || !withdrawFrom?.id) {
      Alert.alert('Validation', 'Please select both Deposit and Withdrawal accounts');
      return;
    }
    if (depositInto.id === withdrawFrom.id) {
      Alert.alert('Validation', 'Deposit and Withdrawal accounts cannot be the same account');
      return;
    }
    if (!numAmt || numAmt <= 0) {
      Alert.alert('Validation', 'Please enter a valid transfer amount');
      return;
    }

    setSaving(true);
    try {
      const lines = [
        // Debit: Deposited into Account
        { ledger_id: depositInto.id, debit: numAmt, credit: 0 },
        // Credit: Withdrawn from Account
        { ledger_id: withdrawFrom.id, debit: 0, credit: numAmt },
      ];

      const payload = {
        type: 'CONTRA' as const,
        no: voucherNo,
        date,
        narration: narration.trim() || `Contra transfer ${withdrawFrom.name} -> ${depositInto.name}`,
        lines,
      };

      if (editVoucher?.id) {
        await VoucherService.update(editVoucher.id, payload);
        Alert.alert('Success', 'Contra voucher updated successfully!');
      } else {
        await VoucherService.create(payload);
        Alert.alert('Success', 'Contra voucher saved successfully!');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save contra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title={editVoucher ? `Edit Contra #${editVoucher.no}` : 'New Contra Voucher'}
        subtitle="Cash / Bank Transfer (Delete Locked)"
        onBack={() => navigation.goBack()}
        rightActionText={saving ? 'Saving...' : 'SAVE (F10)'}
        onRightAction={handleSave}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>TRANSFER DETAILS</Text>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Voucher No</Text>
              <TextInput
                style={styles.input}
                value={voucherNo}
                onChangeText={setVoucherNo}
                placeholder="C000001"
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

          {/* Deposit Into */}
          <Text style={styles.label}>Deposited Into (Dr) - Destination Account</Text>
          <View style={styles.accountRow}>
            {cashBankList.map((acc) => (
              <TouchableOpacity
                key={`into_${acc.id}`}
                style={[
                  styles.accPill,
                  depositInto?.id === acc.id && styles.accPillIntoActive,
                ]}
                onPress={() => setDepositInto(acc)}
              >
                <Text
                  style={[
                    styles.accPillText,
                    depositInto?.id === acc.id && styles.accPillTextActive,
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Withdrawn From */}
          <Text style={[styles.label, { marginTop: 14 }]}>
            Withdrawn From (Cr) - Source Account
          </Text>
          <View style={styles.accountRow}>
            {cashBankList.map((acc) => (
              <TouchableOpacity
                key={`from_${acc.id}`}
                style={[
                  styles.accPill,
                  withdrawFrom?.id === acc.id && styles.accPillFromActive,
                ]}
                onPress={() => setWithdrawFrom(acc)}
              >
                <Text
                  style={[
                    styles.accPillText,
                    withdrawFrom?.id === acc.id && styles.accPillTextActive,
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={styles.label}>Transfer Amount (₹)</Text>
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
            placeholder="e.g. Cash deposited into bank / ATM cash withdrawal"
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
            <Text style={styles.saveBtnText}>SAVE CONTRA TRANSFER</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    color: '#e65100',
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
    borderColor: '#ccc',
    marginRight: 8,
    marginBottom: 6,
    backgroundColor: '#f5f5f5',
  },
  accPillIntoActive: {
    backgroundColor: '#00796b',
    borderColor: '#00796b',
  },
  accPillFromActive: {
    backgroundColor: '#e65100',
    borderColor: '#e65100',
  },
  accPillText: {
    color: '#444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  accPillTextActive: {
    color: '#ffffff',
  },
  saveBtn: {
    backgroundColor: '#e65100',
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
