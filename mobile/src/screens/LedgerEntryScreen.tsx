import React, { useState } from 'react';
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
import { LedgerService } from '../api/services';

const GROUPS = [
  { id: 1, name: 'Sundry Debtors' },
  { id: 2, name: 'Sundry Creditors' },
  { id: 3, name: 'Bank Accounts' },
  { id: 4, name: 'Cash-in-hand' },
  { id: 5, name: 'Indirect Expenses' },
  { id: 6, name: 'Direct Expenses' },
];

export const LedgerEntryScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const editLedger = route.params?.ledger as Ledger | undefined;

  const [name, setName] = useState(editLedger?.name || '');
  const [groupId, setGroupId] = useState<number>(editLedger?.group_id || 1);
  const [city, setCity] = useState(editLedger?.city || '');
  const [phone, setPhone] = useState(editLedger?.phone || '');
  const [gstin, setGstin] = useState(editLedger?.gstin || '');
  const [state, setState] = useState(editLedger?.state || 'CHHATTISGARH');
  const [creditLimit, setCreditLimit] = useState(
    editLedger?.credit_limit ? String(editLedger.credit_limit) : '0'
  );
  const [opening, setOpening] = useState(
    editLedger?.opening ? String(editLedger.opening) : '0'
  );
  const [openingType, setOpeningType] = useState<'Dr' | 'Cr'>(
    editLedger?.opening_type || 'Dr'
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Please enter Ledger / Party Name');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Ledger> = {
        name: name.trim().toUpperCase(),
        group_id: groupId,
        city: city.trim().toUpperCase(),
        phone: phone.trim(),
        gstin: gstin.trim().toUpperCase(),
        state: state.trim().toUpperCase(),
        credit_limit: Number(creditLimit) || 0,
        opening: Number(opening) || 0,
        opening_type: openingType,
      };

      if (editLedger?.id) {
        await LedgerService.update(editLedger.id, payload);
        Alert.alert('Success', 'Ledger updated successfully!');
      } else {
        await LedgerService.create(payload);
        Alert.alert('Success', 'New Ledger created successfully!');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save ledger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title={editLedger ? `Edit ${editLedger.name}` : 'New Ledger Account'}
        subtitle="Master Account (Delete Locked)"
        onBack={() => navigation.goBack()}
        rightActionText={saving ? 'Saving...' : 'SAVE (F10)'}
        onRightAction={handleSave}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>ACCOUNT MASTER</Text>

          <Text style={styles.label}>Ledger / Party Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. RAM TRADERS or ELECTRICITY EXPENSE"
            value={name}
            onChangeText={setName}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Account Group *</Text>
          <View style={styles.groupContainer}>
            {GROUPS.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.groupPill,
                  groupId === g.id && styles.groupPillActive,
                ]}
                onPress={() => setGroupId(g.id)}
              >
                <Text
                  style={[
                    styles.groupPillText,
                    groupId === g.id && styles.groupPillTextActive,
                  ]}
                >
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Station / City</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. DURG"
                value={city}
                onChangeText={setCity}
                autoCapitalize="characters"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Phone / Mobile</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit phone"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </View>

          <Text style={styles.label}>GSTIN / Tax ID (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="15-character GSTIN"
            value={gstin}
            onChangeText={setGstin}
            autoCapitalize="characters"
          />

          <View style={styles.row}>
            <View style={{ flex: 1.4, marginRight: 8 }}>
              <Text style={styles.label}>Credit Limit (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={creditLimit}
                onChangeText={setCreditLimit}
              />
            </View>
            <View style={{ flex: 1.4, marginLeft: 8 }}>
              <Text style={styles.label}>Opening Balance (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={opening}
                onChangeText={setOpening}
              />
            </View>
            <View style={{ flex: 0.8, marginLeft: 8 }}>
              <Text style={styles.label}>Dr/Cr</Text>
              <TouchableOpacity
                style={styles.drcrToggle}
                onPress={() => setOpeningType(openingType === 'Dr' ? 'Cr' : 'Dr')}
              >
                <Text style={styles.drcrText}>{openingType}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>SAVE LEDGER ACCOUNT</Text>
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
    marginBottom: 12,
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
    marginBottom: 12,
  },
  groupContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  groupPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#f5f5f5',
  },
  groupPillActive: {
    backgroundColor: '#003366',
    borderColor: '#003366',
  },
  groupPillText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '600',
  },
  groupPillTextActive: {
    color: '#ffcc00',
    fontWeight: 'bold',
  },
  drcrToggle: {
    borderWidth: 1,
    borderColor: '#003366',
    backgroundColor: '#003366',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  drcrText: {
    color: '#ffcc00',
    fontWeight: 'bold',
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#003366',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffcc00',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
});
