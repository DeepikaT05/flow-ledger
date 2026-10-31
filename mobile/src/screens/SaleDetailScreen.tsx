import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Header } from '../components/Header';
import { Bill } from '../types';
import { BillService } from '../api/services';

export const SaleDetailScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const billId = route.params?.billId;
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBill = async () => {
    setLoading(true);
    try {
      const data = await BillService.get(billId);
      setBill(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load bill');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadBill();
    });
    return unsub;
  }, [navigation, billId]);

  if (loading || !bill) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#003366" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={`SALE BILL #${bill.no}`}
        subtitle={`${bill.date} • ${bill.mode}`}
        onBack={() => navigation.goBack()}
        rightActionText="Edit Bill"
        onRightAction={() => navigation.navigate('SaleEntry', { bill })}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Banner */}
        <View style={styles.card}>
          <Text style={styles.partyLabel}>Customer / Debtor</Text>
          <Text style={styles.partyName}>{bill.party_name || 'Cash Customer'}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Bill No: <b>{bill.no}</b></Text>
            <Text style={styles.metaText}>Date: <b>{bill.date}</b></Text>
            <Text style={styles.metaText}>Mode: <b>{bill.mode}</b></Text>
          </View>
        </View>

        {/* Product Items Table */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>ITEMS BREAKDOWN</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 2 }]}>Product</Text>
            <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Rate</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Amount</Text>
          </View>

          {bill.items?.map((it, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 2 }}>
                <Text style={styles.itemName}>{it.item_name}</Text>
                <Text style={styles.itemMeta}>
                  {it.batch ? `Batch: ${it.batch}` : ''}
                  {it.expiry ? ` • Exp: ${it.expiry}` : ''}
                </Text>
              </View>
              <Text style={[styles.td, { flex: 0.8, textAlign: 'center' }]}>{it.qty}</Text>
              <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>₹{it.rate.toFixed(2)}</Text>
              <Text style={[styles.tdAmount, { flex: 1.2, textAlign: 'right' }]}>
                ₹{it.amount.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Value:</Text>
            <Text style={styles.summaryVal}>₹{(bill.gross || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount:</Text>
            <Text style={styles.summaryVal}>₹{(bill.discount || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Taxable Value:</Text>
            <Text style={styles.summaryVal}>₹{(bill.taxable || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GST Total:</Text>
            <Text style={styles.summaryVal}>₹{(bill.tax || 0).toFixed(2)}</Text>
          </View>
          {bill.round_off !== 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Round Off:</Text>
              <Text style={styles.summaryVal}>₹{(bill.round_off || 0).toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.netRow]}>
            <Text style={styles.netLabel}>FINAL NET AMOUNT:</Text>
            <Text style={styles.netVal}>₹{(bill.net || 0).toFixed(2)}</Text>
          </View>
        </View>

        {/* Protection Note */}
        <View style={styles.lockNotice}>
          <Text style={styles.lockText}>
            🔒 Invoices are protected from mobile deletion. Alteration / Modification is enabled.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#003366',
    marginBottom: 8,
  },
  partyLabel: {
    fontSize: 11,
    color: '#78909c',
  },
  partyName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#263238',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  metaText: {
    fontSize: 12,
    color: '#555',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#eef3f8',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  th: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#003366',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
  },
  itemMeta: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  td: {
    fontSize: 12,
    color: '#444',
  },
  tdAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00796b',
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
  lockNotice: {
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ffe082',
    padding: 10,
    borderRadius: 6,
    marginBottom: 20,
  },
  lockText: {
    fontSize: 11,
    color: '#8d6e63',
    textAlign: 'center',
    fontWeight: '600',
  },
});
