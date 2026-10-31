import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, company, permissions, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    todaySale: 0,
    todayPurc: 0,
    cash: 0,
    bank: 0,
    debtors: 0,
    creditors: 0,
  });

  const loadStats = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [daybook, trial] = await Promise.allSettled([
        api.get<any>(`/reports/daybook?date=${today}`),
        api.get<any[]>('/reports/trial-balance'),
      ]);

      let cashVal = 0;
      let bankVal = 0;
      let recvVal = 0;
      let payVal = 0;

      if (trial.status === 'fulfilled' && Array.isArray(trial.value)) {
        for (const row of trial.value) {
          if (row.group_name === 'Bank Accounts') bankVal += Number(row.balance || 0);
          else if (row.group_name === 'Cash-in-hand') cashVal += Number(row.balance || 0);
          else if (row.group_name === 'Sundry Debtors') recvVal += Number(row.balance || 0);
          else if (row.group_name === 'Sundry Creditors') payVal += Number(row.balance || 0);
        }
      }

      let saleVal = 0;
      let purcVal = 0;
      if (daybook.status === 'fulfilled' && daybook.value) {
        saleVal = daybook.value.sales || 0;
        purcVal = daybook.value.purchases || 0;
      }

      setStats({
        todaySale: saleVal,
        todayPurc: purcVal,
        cash: cashVal,
        bank: bankVal,
        debtors: recvVal,
        creditors: payVal,
      });
    } catch {
      // keep fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const menuItems = [
    {
      title: 'SALE',
      sub: 'Sale Invoices, Counter & Returns',
      badge: 'Active (No Delete)',
      icon: '🛒',
      color: '#00796b',
      route: 'SaleList',
    },
    {
      title: 'PURCHASE',
      sub: 'Inward Bills & Supplier Invoices',
      badge: 'Active (No Delete)',
      icon: '📥',
      color: '#0288d1',
      route: 'PurchaseList',
    },
    {
      title: 'RECEIPT',
      sub: 'Customer Collections & Cash In',
      badge: 'Active (No Delete)',
      icon: '💵',
      color: '#2e7d32',
      route: 'ReceiptList',
    },
    {
      title: 'PAYMENT',
      sub: 'Vendor Payments & Expenses',
      badge: 'Active (No Delete)',
      icon: '💸',
      color: '#c2185b',
      route: 'PaymentList',
    },
    {
      title: 'CONTRA',
      sub: 'Cash ↔ Bank Internal Transfers',
      badge: 'Active (No Delete)',
      icon: '🔄',
      color: '#f57c00',
      route: 'ContraList',
    },
    {
      title: 'LEDGER',
      sub: 'Party Statements & Accounts',
      badge: 'Active (No Delete)',
      icon: '📑',
      color: '#512da8',
      route: 'LedgerList',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Top Banner */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.companyName}>{company?.name || 'TAMRAKAR AGRO'}</Text>
          <Text style={styles.gstinText}>
            {company?.gstin ? `GSTIN: ${company.gstin}` : 'Financial Year 2026-2027'}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadStats} colors={['#003366']} />
        }
      >
        {/* Permission Safeguard Notice */}
        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>🛡️</Text>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.permTitle}>Permissions Enforced</Text>
            <Text style={styles.permDesc}>
              View, Create & Edit enabled • Delete permission strictly locked.
            </Text>
          </View>
        </View>

        {/* Live Balance Summary Cards */}
        <Text style={styles.sectionTitle}>LIVE BALANCE SNAPSHOT</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: '#00796b' }]}>
            <Text style={styles.statLabel}>Today's Sale</Text>
            <Text style={styles.statValue}>₹{stats.todaySale.toFixed(2)}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#0288d1' }]}>
            <Text style={styles.statLabel}>Today's Purchase</Text>
            <Text style={styles.statValue}>₹{stats.todayPurc.toFixed(2)}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#2e7d32' }]}>
            <Text style={styles.statLabel}>Cash in Hand</Text>
            <Text style={styles.statValue}>₹{stats.cash.toFixed(2)}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#512da8' }]}>
            <Text style={styles.statLabel}>Bank Balance</Text>
            <Text style={styles.statValue}>₹{stats.bank.toFixed(2)}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#f57c00' }]}>
            <Text style={styles.statLabel}>Debtors (Receivable)</Text>
            <Text style={styles.statValue}>₹{stats.debtors.toFixed(2)}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#c2185b' }]}>
            <Text style={styles.statLabel}>Creditors (Payable)</Text>
            <Text style={styles.statValue}>₹{stats.creditors.toFixed(2)}</Text>
          </View>
        </View>

        {/* The 6 Core Menus */}
        <Text style={styles.sectionTitle}>CORE MODULES</Text>
        <View style={styles.menuGrid}>
          {menuItems.map((m, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.menuCard, { borderTopColor: m.color }]}
              onPress={() => navigation.navigate(m.route)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.menuIcon}>{m.icon}</Text>
                <View style={[styles.badge, { backgroundColor: m.color }]}>
                  <Text style={styles.badgeText}>{m.title}</Text>
                </View>
              </View>
              <Text style={styles.menuTitle}>{m.title}</Text>
              <Text style={styles.menuSub}>{m.sub}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.openText}>Open Menu ›</Text>
                <Text style={styles.safeTag}>No Delete</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  topHeader: {
    backgroundColor: '#003366',
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 3,
    borderBottomColor: '#ffcc00',
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  gstinText: {
    fontSize: 12,
    color: '#ffcc00',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#d32f2f',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scroll: {
    padding: 16,
  },
  permissionNotice: {
    backgroundColor: '#e8f5e9',
    borderColor: '#81c784',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  permissionIcon: {
    fontSize: 24,
  },
  permTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  permDesc: {
    fontSize: 11,
    color: '#388e3c',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#455a64',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#ffffff',
    width: '48%',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 4,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  statLabel: {
    fontSize: 11,
    color: '#78909c',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#263238',
    marginTop: 4,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuCard: {
    backgroundColor: '#ffffff',
    width: '48%',
    padding: 14,
    borderRadius: 8,
    borderTopWidth: 4,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuIcon: {
    fontSize: 24,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  menuSub: {
    fontSize: 11,
    color: '#607d8b',
    marginTop: 4,
    height: 32,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  openText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003366',
  },
  safeTag: {
    fontSize: 9,
    color: '#c62828',
    backgroundColor: '#ffebee',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: 'bold',
  },
  bottomSpace: {
    height: 30,
  },
});

