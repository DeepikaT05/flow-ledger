import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Header } from '../components/Header';
import { Ledger } from '../types';
import { LedgerService } from '../api/services';

const TABS = [
  { label: 'ALL', group: '' },
  { label: 'DEBTORS', group: 'Sundry Debtors' },
  { label: 'CREDITORS', group: 'Sundry Creditors' },
  { label: 'CASH/BANK', group: 'Cash-in-hand,Bank Accounts' },
  { label: 'EXPENSES', group: 'Indirect Expenses,Direct Expenses' },
];

export const LedgerListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');

  const loadLedgers = async () => {
    setLoading(true);
    try {
      const g = TABS[activeTab].group;
      const data = await LedgerService.list(g);
      setLedgers(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load ledgers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedgers();
  }, [activeTab]);

  const filtered = ledgers.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.city && l.city.toLowerCase().includes(search.toLowerCase())) ||
    (l.phone && l.phone.includes(search)) ||
    (l.gstin && l.gstin.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      <Header
        title="LEDGER ACCOUNTS"
        subtitle={`${filtered.length} Accounts`}
        onBack={() => navigation.goBack()}
        rightActionText="+ New Ledger"
        onRightAction={() => navigation.navigate('LedgerEntry')}
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.tabItem, activeTab === i && styles.tabItemActive]}
            onPress={() => setActiveTab(i)}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Name, Station/City, Phone, GSTIN..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading && !ledgers.length ? (
        <ActivityIndicator size="large" color="#003366" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLedgers} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('LedgerStatement', { ledgerId: item.id, ledgerName: item.name })}
              activeOpacity={0.7}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.ledgerName}>{item.name}</Text>
                <Text style={styles.metaText}>
                  {item.city ? `${item.city} • ` : ''}
                  {item.group_name}
                  {item.phone ? ` • Ph: ${item.phone}` : ''}
                </Text>
                {item.credit_limit ? (
                  <Text style={styles.crLimit}>Cr. Limit: ₹{item.credit_limit.toFixed(2)}</Text>
                ) : null}
              </View>

              <View style={styles.cardRight}>
                <Text
                  style={[
                    styles.balanceVal,
                    { color: item.balance >= 0 ? '#00796b' : '#c62828' },
                  ]}
                >
                  ₹{Math.abs(item.balance).toFixed(2)}
                </Text>
                <Text
                  style={[
                    styles.balanceType,
                    { color: item.balance >= 0 ? '#00796b' : '#c62828' },
                  ]}
                >
                  {item.balance >= 0 ? 'Dr' : 'Cr'}
                </Text>
                <TouchableOpacity
                  style={styles.editPill}
                  onPress={() => navigation.navigate('LedgerEntry', { ledger: item })}
                >
                  <Text style={styles.editPillText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={() => (
            <Text style={styles.empty}>No ledger accounts found.</Text>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#002244',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tabItem: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginRight: 4,
  },
  tabItemActive: {
    backgroundColor: '#ffcc00',
  },
  tabText: {
    color: '#90caf9',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: '#002244',
  },
  searchBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#f0f4f8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
  cardLeft: {
    flex: 1,
    marginRight: 10,
  },
  ledgerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#263238',
  },
  metaText: {
    fontSize: 12,
    color: '#78909c',
    marginTop: 2,
  },
  crLimit: {
    fontSize: 11,
    color: '#f57c00',
    marginTop: 2,
    fontWeight: '600',
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  balanceVal: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  balanceType: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  editPill: {
    marginTop: 6,
    backgroundColor: '#e8eaf6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
  },
  editPillText: {
    fontSize: 11,
    color: '#3949ab',
    fontWeight: 'bold',
  },
  empty: {
    textAlign: 'center',
    color: '#90a4ae',
    marginTop: 40,
  },
});
