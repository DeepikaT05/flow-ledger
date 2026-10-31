import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Header } from '../components/Header';
import { Ledger, LedgerStatementRow } from '../types';
import { LedgerService } from '../api/services';

export const LedgerStatementScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const ledgerId = route.params?.ledgerId;
  const ledgerName = route.params?.ledgerName;

  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [statement, setStatement] = useState<{
    rows: LedgerStatementRow[];
    opening: number;
    opening_type: string;
    closing: number;
  }>({
    rows: [],
    opening: 0,
    opening_type: 'Dr',
    closing: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadStatement = async () => {
    setLoading(true);
    try {
      const [lData, sData] = await Promise.all([
        LedgerService.get(ledgerId),
        LedgerService.statement(ledgerId),
      ]);
      setLedger(lData);
      setStatement(sData);
    } catch (err: any) {
      alert(err.message || 'Failed to load ledger statement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [ledgerId]);

  const totalDebit = statement.rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = statement.rows.reduce((s, r) => s + Number(r.credit || 0), 0);

  return (
    <View style={styles.container}>
      <Header
        title={ledgerName || 'Ledger Statement'}
        subtitle={ledger?.city ? `${ledger.city} • ${ledger.group_name}` : ledger?.group_name}
        onBack={() => navigation.goBack()}
        rightActionText="Edit Party"
        onRightAction={() => {
          if (ledger) navigation.navigate('LedgerEntry', { ledger });
        }}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#003366" style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Header Balance Banner */}
          <View style={styles.balanceBanner}>
            <View>
              <Text style={styles.bannerLabel}>Opening Balance</Text>
              <Text style={styles.bannerVal}>
                ₹{Math.abs(statement.opening).toFixed(2)} {statement.opening_type}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.bannerLabel}>Closing Balance</Text>
              <Text
                style={[
                  styles.closingVal,
                  { color: statement.closing >= 0 ? '#00796b' : '#c62828' },
                ]}
              >
                ₹{Math.abs(statement.closing).toFixed(2)} {statement.closing >= 0 ? 'Dr' : 'Cr'}
              </Text>
            </View>
          </View>

          {/* Statement Table */}
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 1.1 }]}>Date</Text>
            <Text style={[styles.th, { flex: 2.2 }]}>Particulars</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Debit (₹)</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Credit (₹)</Text>
          </View>

          <FlatList
            data={statement.rows}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={styles.tableRow}>
                <Text style={[styles.tdDate, { flex: 1.1 }]}>{item.date}</Text>
                <View style={{ flex: 2.2 }}>
                  <Text style={styles.tdPart}>{item.particulars || item.type}</Text>
                  <Text style={styles.tdNo}>#{item.no}</Text>
                </View>
                <Text style={[styles.tdDebit, { flex: 1.2, textAlign: 'right' }]}>
                  {item.debit > 0 ? `₹${item.debit.toFixed(2)}` : '-'}
                </Text>
                <Text style={[styles.tdCredit, { flex: 1.2, textAlign: 'right' }]}>
                  {item.credit > 0 ? `₹${item.credit.toFixed(2)}` : '-'}
                </Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={() => (
              <Text style={styles.empty}>No transactions recorded in this period.</Text>
            )}
          />

          {/* Totals Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerLabel}>TOTAL TRANSACTIONS</Text>
            <View style={{ flexDirection: 'row' }}>
              <Text style={styles.footerDebit}>Dr: ₹{totalDebit.toFixed(2)}</Text>
              <Text style={styles.footerCredit}>Cr: ₹{totalCredit.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  balanceBanner: {
    backgroundColor: '#002244',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bannerLabel: {
    fontSize: 11,
    color: '#90caf9',
  },
  bannerVal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 2,
  },
  closingVal: {
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 2,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#cfd8dc',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  th: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#37474f',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  tdDate: {
    fontSize: 11,
    color: '#607d8b',
  },
  tdPart: {
    fontSize: 13,
    fontWeight: '600',
    color: '#263238',
  },
  tdNo: {
    fontSize: 10,
    color: '#90a4ae',
    marginTop: 1,
  },
  tdDebit: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00796b',
  },
  tdCredit: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#c62828',
  },
  sep: {
    height: 1,
    backgroundColor: '#eceff1',
  },
  empty: {
    textAlign: 'center',
    color: '#90a4ae',
    marginTop: 40,
  },
  footer: {
    backgroundColor: '#eceff1',
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#cfd8dc',
  },
  footerLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#37474f',
  },
  footerDebit: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00796b',
    marginRight: 14,
  },
  footerCredit: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#c62828',
  },
});
