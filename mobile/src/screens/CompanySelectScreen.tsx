import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Screen, SearchBar } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { Company } from '../types';
import { C, R, shadow } from '../theme';

/** LIST OF COMPANIES (web F1) — pick which company's books to open. */
export const CompanySelectScreen: React.FC = () => {
  const { companies, selectCompany, user, logout } = useAuth();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const shown = companies.filter((c) => `${c.name} ${c.station ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  const pick = async (c: Company) => {
    setBusy(c.id);
    try {
      await selectCompany(c);
    } catch (e: any) {
      Alert.alert('Could not open company', e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={st.head}>
        <Text style={st.hello}>Welcome, {user?.name}</Text>
        <Text style={st.title}>Select Company</Text>
        <View style={{ marginTop: 14 }}><SearchBar value={q} onChange={setQ} placeholder="Search company" onDark /></View>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 14 }}
        renderItem={({ item: c }) => (
          <TouchableOpacity style={st.card} onPress={() => pick(c)} activeOpacity={0.75} disabled={busy !== null}>
            <View style={st.logo}><Text style={{ color: C.navy, fontWeight: '900', fontSize: 18 }}>{c.name.slice(0, 2).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{c.name}</Text>
              <Text style={st.meta}>{[c.station, c.state, c.gstin].filter(Boolean).join(' · ')}</Text>
            </View>
            {busy === c.id ? <ActivityIndicator color={C.navy2} /> : <Text style={{ fontSize: 24, color: C.faint }}>›</Text>}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity onPress={logout} style={{ alignItems: 'center', padding: 20 }}>
            <Text style={{ color: C.danger, fontWeight: '700' }}>Logout</Text>
          </TouchableOpacity>
        }
      />
    </Screen>
  );
};

const st = StyleSheet.create({
  head: { backgroundColor: C.navy, padding: 18, paddingBottom: 20, borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl },
  hello: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  title: { color: C.gold, fontSize: 26, fontWeight: '900', marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 10, ...shadow },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  name: { fontSize: 16, fontWeight: '800', color: C.text },
  meta: { fontSize: 12.5, color: C.sub, marginTop: 3 },
});
