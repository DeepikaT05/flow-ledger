import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Screen, TopBar, Card, Field, SelectField, Segmented, SectionTitle, Btn, Loading, PickerModal } from '../components/ui';
import { LedgerService } from '../api/services';
import { useAuth } from '../context/AuthContext';
import { Group } from '../types';
import { MODULE, C } from '../theme';

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** New / modify ledger (web: Masters ▸ Ledger Master). */
export const LedgerEntryScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { user } = useAuth();
  const id: number | undefined = route.params?.id;

  useEffect(() => {
    if (id && user?.app_perms?.edit === false) {
      Alert.alert('Permission Denied', 'Editing is not permitted on this account.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [id, user]);
  const accent = MODULE.ledger;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [picker, setPicker] = useState<'' | 'group' | 'state'>('');
  const [isSystem, setIsSystem] = useState(false);
  const [f, setF] = useState({
    name: '', group_id: 0, address: '', city: '', state: 'Chhattisgarh', phone: '', mobile: '', gstin: '',
    opening: '', opening_type: 'Dr', credit_limit: '', due_days: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const gs = await LedgerService.groups();
        setGroups(gs);
        if (id) {
          const l = await LedgerService.get(id);
          let det: Record<string, string> = {};
          try { det = JSON.parse(l.details || '{}'); } catch { /* old rows */ }
          setIsSystem(!!l.is_system);
          setF({
            name: l.name, group_id: l.group_id, address: l.address ?? '', city: l.city ?? '', state: l.state || '',
            phone: l.phone ?? '', mobile: String(det.mobile ?? ''), gstin: l.gstin ?? '',
            opening: l.opening ? String(l.opening) : '', opening_type: l.opening_type ?? 'Dr',
            credit_limit: l.credit_limit ? String(l.credit_limit) : '', due_days: String(det.due_days ?? ''),
          });
        } else {
          const want = route.params?.group ?? 'Sundry Debtors';
          const g = gs.find((x) => x.name === want);
          setF((o) => ({ ...o, group_id: g?.id ?? gs[0]?.id ?? 0, opening_type: want === 'Sundry Creditors' ? 'Cr' : 'Dr' }));
        }
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const group = groups.find((g) => g.id === f.group_id);
  const isParty = group?.name === 'Sundry Debtors' || group?.name === 'Sundry Creditors';

  const save = async () => {
    if (!f.name.trim()) { Alert.alert('Name required', 'Enter the ledger name.'); return; }
    if (f.gstin && !/^[0-9A-Z]{15}$/.test(f.gstin.trim().toUpperCase())) { Alert.alert('GSTIN', 'GSTIN must be 15 characters.'); return; }
    const body = {
      name: f.name.trim().toUpperCase(), group_id: f.group_id, address: f.address, city: f.city.toUpperCase(), state: f.state,
      phone: f.phone, gstin: f.gstin.trim().toUpperCase(), opening: Number(f.opening) || 0, opening_type: f.opening_type,
      credit_limit: Number(f.credit_limit) || 0,
      details: { mobile: f.mobile, due_days: Number(f.due_days) || 0 },
    };
    setSaving(true);
    try {
      if (id) await LedgerService.update(id, body);
      else await LedgerService.create(body);
      Alert.alert('Saved ✓', `Ledger ${body.name} saved.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen accent={accent}><TopBar title="Ledger" accent={accent} onBack={() => navigation.goBack()} /><Loading color={accent.main} /></Screen>;

  return (
    <Screen accent={accent}>
      <TopBar
        title={id ? 'Modify Ledger' : 'New Ledger'}
        subtitle={group?.name}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={{ label: 'SAVE', onPress: save, busy: saving }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Field label="Ledger Name *" value={f.name} onChangeText={set('name')} autoCapitalize="characters" editable={!isSystem} />
            <SelectField label="Account Group" value={group?.name} sub={group?.nature} onPress={() => setPicker('group')} />
            {isSystem ? <Text style={{ color: C.sub, fontSize: 12 }}>System ledger — name is fixed.</Text> : null}
          </Card>

          {isParty ? (
            <>
              <SectionTitle>Contact & GST</SectionTitle>
              <Card>
                <Field label="Address" value={f.address} onChangeText={set('address')} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="City / Station" value={f.city} onChangeText={set('city')} autoCapitalize="characters" style={{ flex: 1 }} />
                  <SelectField label="State" value={f.state} onPress={() => setPicker('state')} style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" style={{ flex: 1 }} />
                  <Field label="Mobile" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" style={{ flex: 1 }} />
                </View>
                <Field label="GSTIN" value={f.gstin} onChangeText={set('gstin')} autoCapitalize="characters" maxLength={15} style={{ marginBottom: 0 }} />
              </Card>
            </>
          ) : null}

          <SectionTitle>Opening & Credit</SectionTitle>
          <Card>
            <Field label="Opening Balance" value={f.opening} onChangeText={set('opening')} keyboardType="decimal-pad" />
            <Segmented
              color={accent.main}
              value={f.opening_type}
              onChange={set('opening_type')}
              options={[{ key: 'Dr', label: 'Dr (Receivable)' }, { key: 'Cr', label: 'Cr (Payable)' }]}
            />
            {isParty ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Field label="Credit Limit ₹" value={f.credit_limit} onChangeText={set('credit_limit')} keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
                <Field label="Credit Days" value={f.due_days} onChangeText={set('due_days')} keyboardType="number-pad" style={{ flex: 1, marginBottom: 0 }} />
              </View>
            ) : null}
          </Card>
          <Btn label={id ? 'Save Changes' : 'Create Ledger'} color={accent.main} busy={saving} onPress={save} style={{ marginTop: 18 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal<Group>
        visible={picker === 'group'}
        title="Account Group"
        items={groups}
        keyOf={(g) => g.id}
        search={(g) => g.name}
        onClose={() => setPicker('')}
        onPick={(g) => { setF((o) => ({ ...o, group_id: g.id })); setPicker(''); }}
        render={(g) => (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{g.name}</Text>
            <Text style={{ fontSize: 12, color: C.sub }}>{g.nature}</Text>
          </View>
        )}
      />
      <PickerModal<string>
        visible={picker === 'state'}
        title="State"
        items={STATES}
        keyOf={(s) => s}
        search={(s) => s}
        onClose={() => setPicker('')}
        onPick={(s) => { setF((o) => ({ ...o, state: s })); setPicker(''); }}
        render={(s) => <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{s}</Text>}
      />
    </Screen>
  );
};
