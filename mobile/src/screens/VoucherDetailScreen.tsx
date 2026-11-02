import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, TopBar, Card, KV, SectionTitle, Loading, ErrorBox, Btn } from '../components/ui';
import { VoucherService } from '../api/services';
import { Voucher } from '../types';
import { VOUCHER, accentOf } from '../labels';
import { useAuth } from '../context/AuthContext';
import { C, R } from '../theme';
import { money, dmy } from '../utils/format';

export const VoucherDetailScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const id: number = route.params.id;
  const { can, user } = useAuth();
  const [v, setV] = useState<Voucher | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  useFocusEffect(useCallback(() => { VoucherService.get(id).then(setV).catch((e) => setError(e.message)); }, [id]));

  const kind = v ? VOUCHER[v.type] : VOUCHER.RECEIPT;
  const accent = accentOf(kind.module);
  const lines = v?.lines ?? [];
  const total = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const canEdit = v && user?.app_perms?.edit !== false && can(['voucher.modify']);
  const canDelete = v && !!user?.app_perms?.delete && can(['feature.delete']);

  const confirmDelete = () => {
    if (!v) return;
    Alert.alert(
      'Delete Voucher',
      `Are you sure you want to permanently delete ${kind.title} ${v.no}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await VoucherService.delete(v.id);
              Alert.alert('Deleted', `${kind.title} ${v.no} has been deleted.`, [
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
        title={v ? `${kind.title} ${v.no}` : 'Voucher'}
        subtitle={v ? dmy(v.date) : undefined}
        accent={accent}
        onBack={() => navigation.goBack()}
        right={v && canEdit ? { label: '✏️ Modify', onPress: () => navigation.navigate('VoucherEntry', { type: v.type, id }) } : undefined}
      >
        {v ? (
          <View style={{ marginTop: 14 }}>
            <Text style={st.heroLbl}>Amount</Text>
            <Text style={st.heroAmt}>{money(total)}</Text>
          </View>
        ) : null}
      </TopBar>
      {error ? <ErrorBox message={error} /> : !v ? <Loading color={accent.main} /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          <SectionTitle>Entries</SectionTitle>
          {lines.map((l, i) => (
            <View key={l.id ?? i} style={st.line}>
              <View style={[st.side, { backgroundColor: l.debit ? '#FDECEC' : '#E3F4E8' }]}>
                <Text style={{ fontWeight: '900', color: l.debit ? C.dr : C.cr, fontSize: 12 }}>{l.debit ? 'Dr' : 'Cr'}</Text>
              </View>
              <Text style={st.ledger} numberOfLines={2}>{l.ledger}</Text>
              <Text style={[st.amt, { color: l.debit ? C.dr : C.cr }]}>{money(l.debit || l.credit)}</Text>
            </View>
          ))}

          {v.adjustments?.length ? (
            <>
              <SectionTitle>Bill Adjustment</SectionTitle>
              <Card>
                {v.adjustments.map((a, i) => (
                  <KV key={i} k={a.bill_no ? `${a.bill_no} · ${dmy(a.bill_date)}` : (a.remark || 'On Account')} v={money(a.amount)} />
                ))}
              </Card>
            </>
          ) : null}

          {v.narration ? (
            <>
              <SectionTitle>Narration</SectionTitle>
              <Card><Text style={{ color: C.text, fontSize: 14.5 }}>{v.narration}</Text></Card>
            </>
          ) : null}

          {canEdit ? <Btn label="✏️  Modify this voucher" color={accent.main} onPress={() => navigation.navigate('VoucherEntry', { type: v.type, id })} style={{ marginTop: 18 }} /> : null}
          {canDelete ? (
            <Btn label="🗑️  Delete this voucher" color={C.dr} busy={deleting} onPress={confirmDelete} style={{ marginTop: 10 }} />
          ) : (
            <Text style={st.lock}>🔒 Delete is locked on this mobile account.</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  );
};

const st = StyleSheet.create({
  heroLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  heroAmt: { color: C.white, fontSize: 30, fontWeight: '900', marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  side: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  ledger: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  amt: { fontSize: 15.5, fontWeight: '800', marginLeft: 8 },
  lock: { textAlign: 'center', color: C.faint, fontSize: 12, marginTop: 16 },
});
