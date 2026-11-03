import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Segmented } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ReportService } from '../api/services';
import { Mis, ModuleKey } from '../types';
import { MENUS, visibleMenu, MenuNode } from '../menus';
import { MODULE, C, R, shadow } from '../theme';
import { money, today, periodByKey } from '../utils/format';

const ORDER: ModuleKey[] = ['sale', 'purchase', 'receipt', 'payment', 'contra', 'ledger'];
const QUICK: { label: string; module: ModuleKey; screen: string; params: Record<string, unknown>; perm: string }[] = [
  { label: 'Sale', module: 'sale', screen: 'BillEntry', params: { type: 'SALE' }, perm: 'sale.bill' },
  { label: 'Purchase', module: 'purchase', screen: 'BillEntry', params: { type: 'PURCHASE' }, perm: 'purchase.bill' },
  { label: 'Receipt', module: 'receipt', screen: 'VoucherEntry', params: { type: 'RECEIPT' }, perm: 'voucher.receipt' },
  { label: 'Payment', module: 'payment', screen: 'VoucherEntry', params: { type: 'PAYMENT' }, perm: 'voucher.payment' },
];
const countLeaves = (ns: MenuNode[]): number => ns.reduce((s, n) => s + (n.children ? countLeaves(n.children) : n.soon ? 0 : 1), 0);

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, company, companies, logout, changeCompany, can, canModule } = useAuth();
  const [range, setRange] = useState('today');
  const [mis, setMis] = useState<Mis | null>(null);
  const [misErr, setMisErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const p = range === 'today' ? { from: today(), to: today() } : periodByKey(range);
    try {
      setMis(await ReportService.mis(p.from, p.to));
      setMisErr('');
    } catch (e: any) {
      setMisErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canEdit = user?.app_perms?.edit !== false;
  const modules = ORDER.filter((m) => canModule(m)).map((m) => ({ m, items: visibleMenu(MENUS[m], can, canEdit) })).filter((x) => x.items.length);
  const quick = QUICK.filter((q) => canModule(q.module) && can([q.perm]));
  const hour = new Date().getHours();

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.navy2]} />} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={st.hero}>
          <View style={st.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={st.hello}>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {user?.name}</Text>
              <Text style={st.company} numberOfLines={1}>{company?.name}</Text>
              <Text style={st.role}>{user?.role}{company?.station ? ` · ${company.station}` : ''}</Text>
              {/* Only the companies SuperAdmin gave this user are listed (server filters /companies). */}
              {companies.length > 1 ? (
                <TouchableOpacity onPress={changeCompany} activeOpacity={0.75} style={st.switchCo}>
                  <Text style={st.switchTxt}>🏢 Switch Company ({companies.length})</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={st.logout}
              onPress={() => Alert.alert('Logout', 'Sign out of Flow Ledger?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Logout', style: 'destructive', onPress: logout }])}
            >
              <Text style={{ fontSize: 18 }}>⏻</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 16 }}>
            <Segmented
              value={range}
              onChange={setRange}
              color={C.navy3}
              options={[{ key: 'today', label: 'Today' }, { key: 'month', label: 'This Month' }, { key: 'fy', label: 'This F.Y.' }]}
            />
          </View>

          {mis ? (
            <View style={st.kpis}>
              <Kpi label="Sale" value={money(mis.sales.s)} sub={`${mis.sales.c} bills`} color={MODULE.sale.main} />
              <Kpi label="Purchase" value={money(mis.purchase.s)} sub={`${mis.purchase.c} bills`} color={MODULE.purchase.main} />
              <Kpi label="Receipt" value={money(mis.receipt.s)} sub={`${mis.receipt.c} vouchers`} color={MODULE.receipt.main} />
              <Kpi label="Payment" value={money(mis.payment.s)} sub={`${mis.payment.c} vouchers`} color={MODULE.payment.main} />
            </View>
          ) : misErr ? <Text style={st.misErr}>{misErr.includes('needs') ? 'Live figures need the “Daily reports” permission.' : misErr}</Text> : null}
        </View>

        {mis ? (
          <View style={st.balRow}>
            <Bal label="Cash" value={money(mis.cash)} />
            <Bal label="Bank" value={money(mis.bank)} />
            <Bal label="Receivable" value={money(mis.receivable)} color={C.dr} />
            <Bal label="Payable" value={money(mis.payable)} color={C.cr} />
          </View>
        ) : null}

        {quick.length ? (
          <>
            <Text style={st.section}>Quick Entry</Text>
            <View style={st.quick}>
              {quick.map((q) => (
                <TouchableOpacity key={q.label} style={st.quickBtn} onPress={() => navigation.navigate(q.screen, q.params)} activeOpacity={0.75}>
                  <View style={[st.quickIcon, { backgroundColor: MODULE[q.module].main }]}><Text style={{ fontSize: 20 }}>{MODULE[q.module].icon}</Text></View>
                  <Text style={st.quickLbl}>+ {q.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={st.quickBtn} onPress={() => navigation.navigate('Stock')} activeOpacity={0.75}>
                <View style={[st.quickIcon, { backgroundColor: C.navy3 }]}><Text style={{ fontSize: 20 }}>📋</Text></View>
                <Text style={st.quickLbl}>Items</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        <Text style={st.section}>Modules</Text>
        <View style={st.grid}>
          {modules.map(({ m, items }) => {
            const a = MODULE[m];
            return (
              <TouchableOpacity key={m} style={[st.mod, { backgroundColor: a.main }]} onPress={() => navigation.navigate('Menu', { module: m })} activeOpacity={0.85}>
                <View style={st.modBubble} />
                <Text style={{ fontSize: 30 }}>{a.icon}</Text>
                <Text style={st.modTitle}>{a.title}</Text>
                <Text style={st.modTag} numberOfLines={2}>{a.tag}</Text>
                <View style={st.modCount}><Text style={{ color: a.dark, fontWeight: '800', fontSize: 11 }}>{countLeaves(items)} options ›</Text></View>
              </TouchableOpacity>
            );
          })}
        </View>
        {!modules.length ? <Text style={{ textAlign: 'center', color: C.sub, margin: 20 }}>No modules are enabled for your user. Ask the SuperAdmin.</Text> : null}
        <Text style={st.footer}>🔒 Delete is locked on the mobile app · Flow Ledger</Text>
      </ScrollView>
    </Screen>
  );
};

const Kpi: React.FC<{ label: string; value: string; sub: string; color: string }> = ({ label, value, sub, color }) => (
  <View style={st.kpi}>
    <View style={[st.kpiDot, { backgroundColor: color }]} />
    <Text style={st.kpiLbl}>{label}</Text>
    <Text style={st.kpiVal} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={st.kpiSub}>{sub}</Text>
  </View>
);
const Bal: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = C.text }) => (
  <View style={st.bal}>
    <Text style={st.balLbl}>{label}</Text>
    <Text style={[st.balVal, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>
);

const st = StyleSheet.create({
  hero: { backgroundColor: C.navy, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 46, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start' },
  hello: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  company: { color: C.gold, fontSize: 23, fontWeight: '900', marginTop: 3, letterSpacing: 0.3 },
  switchCo: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(255,201,60,0.18)', borderWidth: 1, borderColor: C.gold, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  switchTxt: { color: C.gold, fontWeight: '800', fontSize: 12 },
  role: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  logout: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 14 },
  kpi: { width: '48.5%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: R.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  kpiDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', right: 12, top: 14 },
  kpiLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  kpiVal: { color: C.white, fontSize: 19, fontWeight: '900', marginTop: 4 },
  kpiSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  misErr: { color: 'rgba(255,255,255,0.65)', marginTop: 14, fontSize: 12.5 },
  balRow: { flexDirection: 'row', marginHorizontal: 14, marginTop: -30, backgroundColor: C.card, borderRadius: R.lg, paddingVertical: 12, ...shadow },
  bal: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  balLbl: { color: C.sub, fontSize: 11, fontWeight: '700' },
  balVal: { fontSize: 13.5, fontWeight: '900', marginTop: 4 },
  section: { fontSize: 12, fontWeight: '800', color: C.sub, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 22, marginBottom: 10, marginHorizontal: 18 },
  quick: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 14 },
  quickBtn: { alignItems: 'center', flex: 1 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...shadow },
  quickLbl: { fontSize: 12, fontWeight: '800', color: C.text, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 14 },
  mod: { width: '48.5%', borderRadius: 20, padding: 16, marginBottom: 12, minHeight: 156, overflow: 'hidden', ...shadow },
  modBubble: { position: 'absolute', right: -30, top: -30, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.13)' },
  modTitle: { color: C.white, fontSize: 20, fontWeight: '900', marginTop: 8 },
  modTag: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 3, lineHeight: 15 },
  modCount: { alignSelf: 'flex-start', backgroundColor: C.white, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 10 },
  footer: { textAlign: 'center', color: C.faint, fontSize: 11.5, marginTop: 16 },
});
