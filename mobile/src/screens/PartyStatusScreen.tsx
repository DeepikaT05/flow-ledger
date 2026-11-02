import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, Card, KV, SectionTitle, Loading, ErrorBox, Btn } from '../components/ui';
import { LedgerService } from '../api/services';
import { PartyStatus } from '../types';
import { MODULE, C, R } from '../theme';
import { money, drcr, dmy } from '../utils/format';

/** CUSTOMER / SUPPLIER STATUS — what the receipt & payment windows show on the web. */
export const PartyStatusScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const id: number = route.params.id;
  const kind: 'SALE' | 'PURCHASE' | undefined = route.params?.kind;
  const [s, setS] = useState<PartyStatus | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => { LedgerService.status(id, kind).then(setS).catch((e) => setError(e.message)); }, [id, kind]));

  const sup = s?.is_supplier ?? kind === 'PURCHASE';
  const accent = sup ? MODULE.payment : MODULE.receipt;
  const phone = s?.mobile || s?.phone;

  return (
    <Screen accent={accent}>
      <TopBar title={s?.name ?? 'Status'} subtitle={sup ? 'Supplier Status' : 'Customer Status'} accent={accent} onBack={() => navigation.goBack()}>
        {s ? (
          <View style={st.hero}>
            <View>
              <Text style={st.heroLbl}>Current Balance</Text>
              <Text style={st.heroAmt}>{drcr(s.balance)}</Text>
            </View>
            {phone ? (
              <TouchableOpacity style={st.call} onPress={() => Linking.openURL(`tel:${phone}`)}>
                <Text style={{ fontSize: 18 }}>📞</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </TopBar>
      {error ? <ErrorBox message={error} /> : !s ? <Loading color={accent.main} /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile label="Pending Bills" value={String(s.bills)} />
            <Tile label="Oldest (days)" value={String(s.days)} />
            <Tile label="Avg / Month" value={money(s.avg_pm)} />
          </View>

          <SectionTitle>Account</SectionTitle>
          <Card>
            <KV k={sup ? 'Last Purchase' : 'Last Sale'} v={s.last_sale ? `${money(s.last_sale.net)} · ${dmy(s.last_sale.date)} (${s.last_sale.days}d)` : '—'} />
            <KV k={sup ? 'Last Payment' : 'Last Receipt'} v={s.last_receipt ? `${money(s.last_receipt.amount)} · ${dmy(s.last_receipt.date)}` : '—'} />
            <KV k="Credit Limit" v={s.credit_limit ? money(s.credit_limit) : 'No limit'} />
            <KV k="Credit Days" v={s.credit_days ? `${s.credit_days} days` : '—'} />
            <KV k="Avg Collection Days" v={String(s.avg_coll_days)} />
            <KV k="Turnover Ratio" v={s.turnover_ratio} />
          </Card>

          <SectionTitle>Outstanding Bills</SectionTitle>
          {s.os_bills.length ? s.os_bills.map((b) => (
            <TouchableOpacity key={b.id} style={st.row} onPress={() => navigation.navigate('BillDetail', { id: b.id })}>
              <View style={{ flex: 1 }}>
                <Text style={st.rowTitle}>{b.ref} · {dmy(b.date)}</Text>
                <Text style={st.meta}>Bill {money(b.net)} · {b.days} days</Text>
              </View>
              <Text style={{ fontWeight: '800', color: C.dr }}>{money(b.balance)}</Text>
            </TouchableOpacity>
          )) : <Card><Text style={{ color: C.sub }}>No pending bills 🎉</Text></Card>}

          <SectionTitle>{sup ? 'Recent Payments' : 'Recent Receipts'}</SectionTitle>
          {s.receipts.length ? s.receipts.map((r, i) => (
            <View key={i} style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.rowTitle}>{dmy(r.date)}</Text>
                <Text style={st.meta}>{r.mode} · {r.days} days ago</Text>
              </View>
              <Text style={{ fontWeight: '800', color: C.cr }}>{money(r.amount)}</Text>
            </View>
          )) : <Card><Text style={{ color: C.sub }}>None yet</Text></Card>}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Btn label="📒 Statement" ghost color={accent.main} style={{ flex: 1 }} onPress={() => navigation.navigate('LedgerStatement', { id })} />
            <Btn label={sup ? '💸 Payment' : '💰 Receipt'} color={accent.main} style={{ flex: 1 }} onPress={() => navigation.navigate('VoucherEntry', { type: sup ? 'PAYMENT' : 'RECEIPT' })} />
          </View>
        </ScrollView>
      )}
    </Screen>
  );
};

const Tile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={st.tile}>
    <Text style={st.tileVal} numberOfLines={1}>{value}</Text>
    <Text style={st.tileLbl}>{label}</Text>
  </View>
);

const st = StyleSheet.create({
  hero: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  heroAmt: { color: C.white, fontSize: 28, fontWeight: '900', marginTop: 2 },
  call: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  tile: { flex: 1, backgroundColor: C.white, borderRadius: R.md, padding: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  tileVal: { fontSize: 16, fontWeight: '900', color: C.text },
  tileLbl: { fontSize: 11, color: C.sub, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: C.text },
  meta: { fontSize: 12, color: C.sub, marginTop: 2 },
});
