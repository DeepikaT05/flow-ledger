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
import { Voucher } from '../types';
import { VoucherService } from '../api/services';

export const PaymentListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadPayments = async () => {
    setLoading(true);
    try {
      const data = await VoucherService.list('PAYMENT');
      setVouchers(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadPayments();
    });
    return unsub;
  }, [navigation]);

  const filtered = vouchers.filter((v) =>
    v.no.toLowerCase().includes(search.toLowerCase()) ||
    (v.narration && v.narration.toLowerCase().includes(search.toLowerCase())) ||
    v.lines?.some((l) => l.ledger_name?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalAmount = filtered.reduce((s, v) => s + Number(v.amount || 0), 0);

  return (
    <View style={styles.container}>
      <Header
        title="PAYMENT VOUCHERS"
        subtitle={`${filtered.length} Vouchers • Total: ₹${totalAmount.toFixed(2)}`}
        onBack={() => navigation.goBack()}
        rightActionText="+ New Payment"
        onRightAction={() => navigation.navigate('PaymentEntry')}
      />

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Voucher No, Supplier, Narration..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading && !vouchers.length ? (
        <ActivityIndicator size="large" color="#003366" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadPayments} />}
          renderItem={({ item }) => {
            const drLine = item.lines?.find((l) => l.debit > 0);
            const crLine = item.lines?.find((l) => l.credit > 0);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('PaymentEntry', { voucher: item })}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.vNo}>Pay #{item.no}</Text>
                    <Text style={styles.dateText}>{item.date}</Text>
                  </View>
                  <Text style={styles.amountText}>₹{(item.amount || drLine?.debit || 0).toFixed(2)}</Text>
                </View>

                <View style={styles.partyRow}>
                  <Text style={styles.partyLabel}>Paid To: </Text>
                  <Text style={styles.partyName}>{drLine?.ledger_name || 'Vendor / Expense'}</Text>
                </View>
                <View style={styles.partyRow}>
                  <Text style={styles.partyLabel}>Paid From: </Text>
                  <Text style={styles.fromName}>{crLine?.ledger_name || 'Cash / Bank'}</Text>
                </View>

                {item.narration ? (
                  <Text style={styles.narration}>Note: {item.narration}</Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ padding: 14 }}
          ListEmptyComponent={() => (
            <Text style={styles.empty}>No payment vouchers found.</Text>
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
    borderLeftColor: '#c2185b',
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  vNo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#003366',
  },
  dateText: {
    fontSize: 12,
    color: '#78909c',
    marginTop: 2,
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#c2185b',
  },
  partyRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  partyLabel: {
    fontSize: 12,
    color: '#777',
  },
  partyName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#263238',
  },
  fromName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  narration: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
  empty: {
    textAlign: 'center',
    color: '#90a4ae',
    marginTop: 40,
  },
});
