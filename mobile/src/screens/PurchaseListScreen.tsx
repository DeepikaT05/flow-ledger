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
import { Bill } from '../types';
import { BillService } from '../api/services';

export const PurchaseListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const data = await BillService.list('PURCHASE');
      setBills(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadPurchases();
    });
    return unsub;
  }, [navigation]);

  const filtered = bills.filter((b) =>
    b.no.toLowerCase().includes(search.toLowerCase()) ||
    (b.party_name && b.party_name.toLowerCase().includes(search.toLowerCase())) ||
    b.mode.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filtered.reduce((s, b) => s + Number(b.net || 0), 0);

  return (
    <View style={styles.container}>
      <Header
        title="PURCHASE INVOICES"
        subtitle={`${filtered.length} Bills • Total: ₹${totalAmount.toFixed(2)}`}
        onBack={() => navigation.goBack()}
        rightActionText="+ New Purchase"
        onRightAction={() => navigation.navigate('PurchaseEntry')}
      />

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Bill No, Supplier, Mode..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading && !bills.length ? (
        <ActivityIndicator size="large" color="#003366" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadPurchases} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('PurchaseDetail', { billId: item.id })}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.billNo}>Purc #{item.no}</Text>
                  <Text style={styles.dateText}>{item.date}</Text>
                </View>
                <View style={[styles.modeBadge, { backgroundColor: item.mode === 'CASH' ? '#2e7d32' : '#0277bd' }]}>
                  <Text style={styles.modeText}>{item.mode}</Text>
                </View>
              </View>

              <Text style={styles.partyName}>{item.party_name || 'Cash Purchase'}</Text>

              <View style={styles.cardBottom}>
                <Text style={styles.taxableText}>Taxable: ₹{(item.taxable || 0).toFixed(2)}</Text>
                <Text style={styles.netAmount}>₹{(item.net || 0).toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ padding: 14 }}
          ListEmptyComponent={() => (
            <Text style={styles.empty}>No purchase bills found.</Text>
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
  searchBox: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#0288d1',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  billNo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#003366',
  },
  dateText: {
    fontSize: 12,
    color: '#78909c',
    marginTop: 2,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  partyName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#263238',
    marginTop: 8,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  taxableText: {
    fontSize: 12,
    color: '#607d8b',
  },
  netAmount: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0288d1',
  },
  empty: {
    textAlign: 'center',
    color: '#90a4ae',
    marginTop: 40,
  },
});
