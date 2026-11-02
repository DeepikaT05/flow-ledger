import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, Card, KV, Badge, SectionTitle, Loading, ErrorBox, Btn } from '../components/ui';
import { BillService } from '../api/services';
import { Bill } from '../types';
import { BILL, accentOf } from '../labels';
import { useAuth } from '../context/AuthContext';
import { C, R } from '../theme';
import { money, dmy, amt } from '../utils/format';

const MODIFY_PERM: Record<string, string> = {
  SALE: 'sale.modify', SALE_CHALLAN: 'sale.modify', COUNTER_SALE: 'sale.modify', SALE_RETURN: 'return.sale',
  PURCHASE: 'purchase.modify', PURCHASE_CHALLAN: 'purchase.modify', PURCHASE_RETURN: 'return.purchase',
};

export const BillDetailScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const id: number = route.params.id;
  const { can, user } = useAuth();
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(useCallback(() => {
    BillService.get(id).then(setBill).catch((e) => setError(e.message));
  }, [id]));

  const kind = bill ? BILL[bill.type] : BILL.SALE;
  const accent = accentOf(kind.module);
  const lines = bill?.lines ?? [];
  const pays = bill?.payments ?? [];
  const due = bill ? Math.max(0, bill.net - (bill.received ?? 0)) : 0;
  const canEdit = bill && user?.app_perms?.edit !== false && can([MODIFY_PERM[bill.type]]);
  const canDelete = bill && !!user?.app_perms?.delete && can(['feature.delete']);

  const confirmDelete = () => {
    if (!bill) return;
    Alert.alert(
      'Delete Entry',
      `Are you sure you want to permanently delete ${kind.short} ${bill.no}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await BillService.delete(bill.id);
              Alert.alert('Deleted', `${kind.short} ${bill.no} has been deleted.`, [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (e: any) {
              Alert.alert('Could not delete', e.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen accent={accent}>
      <TopBar
        title={bill ? `${kind.short} ${bill.no}` : 'Bill'}
        subtitle={bill ? `${dmy(bill.date)} · ${kind.title}` : undefined}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={canEdit ? { label: '✏️ Modify', onPress: () => navigation.navigate('BillEntry', { type: bill!.type, id }) } : undefined}
      >
        {bill ? (
          <View style={st.hero}>
            <Text style={st.heroLbl}>Invoice Value</Text>
            <Text style={st.heroAmt}>{money(bill.net)}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <Badge label={bill.mode} color={C.white} soft />
              {kind.takesPayment && bill.mode === 'CREDIT' && bill.type !== 'PURCHASE' ? (
                <Badge label={due > 0.004 ? `Due ${money(due)}` : 'Fully Received'} color={C.white} soft />
              ) : null}
            </View>
          </View>
        ) : null}
      </TopBar>

      {error ? <ErrorBox message={error} /> : !bill ? <Loading color={accent.main} /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          <Card>
            <Text style={st.lbl}>{kind.partyLabel}</Text>
            <Text style={st.party}>{bill.walkin_name || bill.party}</Text>
            {bill.walkin_mobile ? <Text style={st.meta}>📞 {bill.walkin_mobile}</Text> : null}
            {bill.ref_no ? <Text style={st.meta}>Party Inv. {bill.ref_no}{bill.ref_date ? ` · ${dmy(bill.ref_date)}` : ''}</Text> : null}
            {bill.reason ? <Text style={st.meta}>Reason: {bill.reason}</Text> : null}
            {bill.narration ? <Text style={st.meta}>📝 {bill.narration}</Text> : null}
          </Card>

          <SectionTitle>Items ({lines.length})</SectionTitle>
          {lines.map((l, i) => (
            <View key={l.id ?? i} style={st.line}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={st.itemName} numberOfLines={2}>{l.item_name}</Text>
                <Text style={[st.lineAmt, { color: accent.dark }]}>{money(l.amount)}</Text>
              </View>
              <Text style={st.meta}>
                {[l.pack, l.batch && `Batch ${l.batch}`, l.expiry && `Exp ${l.expiry}`].filter(Boolean).join(' · ')}
              </Text>
              <Text style={st.calc}>
                {l.qty}{l.free ? ` + ${l.free} free` : ''} × ₹{amt(l.rate)}
                {l.disc_pct ? `  −${l.disc_pct}%` : ''}  ·  GST {l.gst_rate}% ₹{amt(l.tax)}
              </Text>
            </View>
          ))}

          <SectionTitle>Totals</SectionTitle>
          <Card>
            <KV k="Gross" v={money(bill.gross)} />
            {bill.discount ? <KV k="Discount" v={`− ${money(bill.discount)}`} /> : null}
            <KV k="Taxable" v={money(bill.taxable)} />
            <KV k="CGST" v={money(bill.tax / 2)} />
            <KV k="SGST" v={money(bill.tax / 2)} />
            {bill.cd_amt ? <KV k="Cash Discount" v={`− ${money(bill.cd_amt)}`} /> : null}
            {bill.freight ? <KV k="Freight" v={money(bill.freight)} /> : null}
            {bill.other_charges ? <KV k="Other Charges" v={money(bill.other_charges)} /> : null}
            <KV k="Round Off" v={money(bill.round_off)} />
            <View style={st.hr} />
            <KV k="Net Amount" v={money(bill.net)} bold color={accent.dark} />
          </Card>

          {pays.length ? (
            <>
              <SectionTitle>Received on Bill</SectionTitle>
              <Card>
                {pays.map((p, i) => <KV key={i} k={p.ledger ?? 'Payment'} v={money(p.amount)} />)}
              </Card>
            </>
          ) : null}

          {canEdit ? (
            <Btn label="✏️  Modify this entry" color={accent.main} onPress={() => navigation.navigate('BillEntry', { type: bill.type, id })} style={{ marginTop: 18 }} />
          ) : null}
          {canDelete ? (
            <Btn label="🗑️  Delete this entry" color={C.dr} busy={deleting} onPress={confirmDelete} style={{ marginTop: 10 }} />
          ) : (
            <Text style={st.lock}>🔒 Delete is locked on this mobile account.</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  hero: { marginTop: 14, alignItems: 'flex-start' },
  heroLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  heroAmt: { color: C.white, fontSize: 30, fontWeight: '900', marginTop: 2 },
  lbl: { fontSize: 11.5, color: C.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  party: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 3 },
  meta: { fontSize: 12.5, color: C.sub, marginTop: 4 },
  line: { backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  itemName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.text, marginRight: 8 },
  lineAmt: { fontSize: 15, fontWeight: '800' },
  calc: { fontSize: 12.5, color: C.text, marginTop: 5 },
  hr: { height: 1, backgroundColor: C.line, marginVertical: 6 },
  lock: { textAlign: 'center', color: C.faint, fontSize: 12, marginTop: 16 },
});
