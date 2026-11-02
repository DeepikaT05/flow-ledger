import React, { useState } from 'react';
import { ScrollView, Alert, Text } from 'react-native';
import { Screen, TopBar, Card, Field, Segmented, Btn, ui } from '../components/ui';
import { LedgerService } from '../api/services';
import { MODULE } from '../theme';

/** Masters ▸ Account Groups ▸ New Group. */
export const GroupEntryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const accent = MODULE.ledger;
  const [name, setName] = useState('');
  const [nature, setNature] = useState('ASSET');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Enter the group name.'); return; }
    setSaving(true);
    try {
      await LedgerService.createGroup(name.trim(), nature);
      Alert.alert('Saved ✓', `Group ${name.trim()} created.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen accent={accent}>
      <TopBar title="New Account Group" accent={accent} onBack={() => navigation.goBack()} right={{ label: 'SAVE', onPress: save, busy: saving }} />
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Group Name *" value={name} onChangeText={setName} autoFocus />
          <Text style={ui.label}>Nature</Text>
          <Segmented
            color={accent.main}
            value={nature}
            onChange={setNature}
            options={[{ key: 'ASSET', label: 'Asset' }, { key: 'LIABILITY', label: 'Liability' }, { key: 'INCOME', label: 'Income' }, { key: 'EXPENSE', label: 'Expense' }]}
          />
        </Card>
        <Btn label="Create Group" color={accent.main} busy={saving} onPress={save} style={{ marginTop: 18 }} />
      </ScrollView>
    </Screen>
  );
};
