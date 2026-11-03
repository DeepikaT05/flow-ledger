import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView, Modal,
  TextInputProps, ViewStyle, StyleProp, TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { C, R, shadow, Accent } from '../theme';
import { Period, presetPeriods, dmy, parseDmy, today } from '../utils/format';

const NAVY: Accent = { main: C.navy2, soft: '#E6ECF5', dark: C.navy };

// ---------------------------------------------------------------- screen + header
export const Screen: React.FC<{ children: React.ReactNode; accent?: Accent }> = ({ children, accent = NAVY }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: accent.dark }} edges={['top']}>
    <StatusBar style="light" backgroundColor={accent.dark} />
    <View style={{ flex: 1, backgroundColor: C.bg }}>{children}</View>
  </SafeAreaView>
);

interface TopBarProps {
  title: string;
  subtitle?: string;
  accent?: Accent;
  onBack?: () => void;
  right?: { label: string; onPress: () => void; busy?: boolean };
  children?: React.ReactNode;   // extra content inside the coloured band (totals, search…)
}
export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, accent = NAVY, onBack, right, children }) => (
  <View style={[s.bar, { backgroundColor: accent.main }]}>
    <View style={s.barRow}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={10}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.barTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.barSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? (
        <TouchableOpacity onPress={right.onPress} disabled={right.busy} style={s.barBtn}>
          {right.busy ? <ActivityIndicator color={accent.dark} size="small" />
            : <Text style={[s.barBtnTxt, { color: accent.dark }]}>{right.label}</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
    {children}
  </View>
);

// ---------------------------------------------------------------- building blocks
export const Card: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }> = ({ children, style, onPress }) =>
  onPress ? (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[s.card, style]}>{children}</TouchableOpacity>
  ) : (
    <View style={[s.card, style]}>{children}</View>
  );

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <View style={s.secRow}>
    <Text style={s.secTitle}>{children}</Text>
    {right}
  </View>
);

export const Badge: React.FC<{ label: string; color: string; soft?: boolean }> = ({ label, color, soft }) => (
  <View style={[s.badge, { backgroundColor: soft ? `${color}1F` : color }]}>
    <Text style={[s.badgeTxt, { color: soft ? color : C.white }]}>{label}</Text>
  </View>
);

export const Btn: React.FC<{ label: string; onPress: () => void; color?: string; ghost?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }> =
  ({ label, onPress, color = C.navy2, ghost, busy, style, small }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      style={[s.btn, small && s.btnSmall, ghost ? { borderWidth: 1.5, borderColor: color, backgroundColor: 'transparent' } : { backgroundColor: color }, style]}
    >
      {busy ? <ActivityIndicator color={ghost ? color : C.white} />
        : <Text style={[s.btnTxt, small && { fontSize: 13 }, { color: ghost ? color : C.white }]}>{label}</Text>}
    </TouchableOpacity>
  );

export const Field: React.FC<TextInputProps & { label: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }> =
  ({ label, style, inputStyle, ...rest }) => (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={C.faint} style={[s.input, inputStyle]} {...rest} />
    </View>
  );

/** Tappable field that opens a picker. */
export const SelectField: React.FC<{ label: string; value?: string; placeholder?: string; onPress: () => void; style?: StyleProp<ViewStyle>; sub?: string }> =
  ({ label, value, placeholder, onPress, style, sub }) => (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity onPress={onPress} style={[s.input, s.select]} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: value ? C.text : C.faint, fontSize: 15, fontWeight: value ? '600' : '400' }} numberOfLines={1}>
            {value || placeholder || 'Select'}
          </Text>
          {sub ? <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <Text style={{ color: C.faint, fontSize: 18 }}>▾</Text>
      </TouchableOpacity>
    </View>
  );

/** Date entry in DD-MM-YYYY with a Today shortcut; value/onChange are ISO. */
export const DateField: React.FC<{ label: string; value: string; onChange: (iso: string) => void; style?: StyleProp<ViewStyle> }> =
  ({ label, value, onChange, style }) => {
    const [text, setText] = useState(dmy(value));
    const [bad, setBad] = useState(false);
    React.useEffect(() => { setText(dmy(value)); }, [value]);
    return (
      <View style={[{ marginBottom: 12 }, style]}>
        <Text style={s.label}>{label}</Text>
        <View style={[s.input, s.select, bad && { borderColor: C.danger }]}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              const iso = parseDmy(t);
              setBad(!iso);
              if (iso) onChange(iso);
            }}
            placeholder="DD-MM-YYYY"
            placeholderTextColor={C.faint}
            keyboardType="numbers-and-punctuation"
            style={{ flex: 1, fontSize: 15, color: C.text, padding: 0 }}
          />
          {value !== today() ? (
            <TouchableOpacity onPress={() => { setBad(false); onChange(today()); }}>
              <Text style={{ color: C.navy3, fontWeight: '700', fontSize: 12 }}>TODAY</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

/** Value the user can see but not change (serial no., today's date, M.R., GST %). */
export const LockedField: React.FC<{ label: string; value: string; style?: StyleProp<ViewStyle> }> = ({ label, value, style }) => (
  <View style={[{ marginBottom: 12 }, style]}>
    <Text style={s.label}>{label}</Text>
    <View style={[s.input, s.select, { backgroundColor: '#EEF2F8' }]}>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }} numberOfLines={1}>{value || '—'}</Text>
      <Text style={{ fontSize: 12 }}>🔒</Text>
    </View>
  </View>
);

/** − qty + buttons. */
export const Stepper: React.FC<{ value: number; onChange: (n: number) => void; color: string; min?: number; big?: boolean }> =
  ({ value, onChange, color, min = 0, big }) => {
    const sz = big ? 40 : 32;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, value - 1))}
          style={{ width: sz, height: sz, borderRadius: sz / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={6}
        >
          <Text style={{ color, fontSize: big ? 22 : 18, fontWeight: '900', marginTop: -2 }}>−</Text>
        </TouchableOpacity>
        <Text style={{ minWidth: big ? 52 : 38, textAlign: 'center', fontSize: big ? 20 : 16, fontWeight: '900', color: C.text }}>{value}</Text>
        <TouchableOpacity
          onPress={() => onChange(value + 1)}
          style={{ width: sz, height: sz, borderRadius: sz / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={6}
        >
          <Text style={{ color: C.white, fontSize: big ? 22 : 18, fontWeight: '900', marginTop: -2 }}>+</Text>
        </TouchableOpacity>
      </View>
    );
  };

export const Segmented: React.FC<{ options: { key: string; label: string }[]; value: string; onChange: (k: string) => void; color?: string }> =
  ({ options, value, onChange, color = C.navy2 }) => (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity key={o.key} onPress={() => onChange(o.key)} style={[s.segBtn, on && { backgroundColor: color }]} activeOpacity={0.8}>
            <Text style={[s.segTxt, on && { color: C.white }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

export const SearchBar: React.FC<{ value: string; onChange: (t: string) => void; placeholder?: string; onDark?: boolean }> =
  ({ value, onChange, placeholder, onDark }) => (
    <View style={[s.search, onDark && { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'transparent' }]}>
      <Text style={{ marginRight: 8, color: onDark ? C.white : C.faint }}>🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Search'}
        placeholderTextColor={onDark ? 'rgba(255,255,255,0.7)' : C.faint}
        style={{ flex: 1, fontSize: 15, color: onDark ? C.white : C.text, paddingVertical: 0 }}
        autoCorrect={false}
      />
      {value ? <TouchableOpacity onPress={() => onChange('')}><Text style={{ color: onDark ? C.white : C.faint }}>✕</Text></TouchableOpacity> : null}
    </View>
  );

export const Loading: React.FC<{ color?: string }> = ({ color = C.navy2 }) => (
  <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator size="large" color={color} /></View>
);

export const Empty: React.FC<{ icon?: string; title: string; sub?: string; action?: { label: string; onPress: () => void; color?: string } }> =
  ({ icon = '🗒️', title, sub, action }) => (
    <View style={s.empty}>
      <Text style={{ fontSize: 44 }}>{icon}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {sub ? <Text style={s.emptySub}>{sub}</Text> : null}
      {action ? <Btn label={action.label} onPress={action.onPress} color={action.color} style={{ marginTop: 16, paddingHorizontal: 22 }} /> : null}
    </View>
  );

export const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <View style={s.err}>
    <Text style={{ color: C.danger, fontWeight: '700', marginBottom: 4 }}>Could not load</Text>
    <Text style={{ color: C.text }}>{message}</Text>
    {onRetry ? <TouchableOpacity onPress={onRetry}><Text style={{ color: C.navy3, fontWeight: '700', marginTop: 8 }}>Retry ↻</Text></TouchableOpacity> : null}
  </View>
);

/** Label / value pair used in totals and detail screens. */
export const KV: React.FC<{ k: string; v: string; bold?: boolean; color?: string }> = ({ k, v, bold, color }) => (
  <View style={s.kv}>
    <Text style={[s.kvK, bold && { color: C.text, fontWeight: '700' }]}>{k}</Text>
    <Text style={[s.kvV, bold && { fontSize: 17, fontWeight: '800' }, color ? { color } : null]}>{v}</Text>
  </View>
);

/** White pill row of totals that sits inside the coloured TopBar. */
export const StatStrip: React.FC<{ items: { label: string; value: string }[] }> = ({ items }) => (
  <View style={s.strip}>
    {items.map((it, i) => (
      <View key={it.label} style={[s.stripCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)' }]}>
        <Text style={s.stripLbl}>{it.label}</Text>
        <Text style={s.stripVal} numberOfLines={1}>{it.value}</Text>
      </View>
    ))}
  </View>
);

// ---------------------------------------------------------------- period chips
export const PeriodChips: React.FC<{ value: Period; onChange: (p: Period) => void; onDark?: boolean }> = ({ value, onChange, onDark = true }) => {
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const chips = presetPeriods();
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4, gap: 8 }}>
        {[...chips, { key: 'custom', label: value.key === 'custom' ? `${dmy(value.from)} → ${dmy(value.to)}` : 'Custom…', from: value.from, to: value.to }].map((p) => {
          const on = p.key === value.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => (p.key === 'custom' ? (setFrom(value.from), setTo(value.to), setCustom(true)) : onChange(p))}
              style={[s.chip, onDark ? s.chipDark : s.chipLight, on && (onDark ? s.chipDarkOn : s.chipLightOn)]}
            >
              <Text style={[s.chipTxt, { color: onDark ? C.white : C.sub }, on && { color: onDark ? C.navy : C.white }]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Modal visible={custom} transparent animationType="fade" onRequestClose={() => setCustom(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { paddingBottom: 20 }]}>
            <Text style={s.sheetTitle}>Custom Period</Text>
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Cancel" ghost onPress={() => setCustom(false)} style={{ flex: 1 }} />
              <Btn label="Apply" onPress={() => { setCustom(false); onChange({ key: 'custom', label: 'Custom', from, to }); }} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ---------------------------------------------------------------- generic searchable picker
export interface PickerProps<T> {
  visible: boolean;
  title: string;
  items: T[];
  loading?: boolean;
  keyOf: (t: T) => string | number;
  search: (t: T) => string;
  render: (t: T) => React.ReactNode;
  onPick: (t: T) => void;
  onClose: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}
export function PickerModal<T>({ visible, title, items, loading, keyOf, search, render, onPick, onClose, header, footer }: PickerProps<T>) {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? items.filter((t) => { const h = search(t).toLowerCase(); return words.every((w) => h.includes(w)); }) : items;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { height: '86%' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[s.sheetTitle, { flex: 1, marginBottom: 0 }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}><Text style={{ fontSize: 16, color: C.sub }}>✕</Text></TouchableOpacity>
          </View>
          <SearchBar value={q} onChange={setQ} placeholder="Type to search…" />
          {header}
          {loading ? <Loading /> : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
              {shown.slice(0, 300).map((t) => (
                <TouchableOpacity key={keyOf(t)} onPress={() => { setQ(''); onPick(t); }} style={s.pickRow} activeOpacity={0.6}>
                  {render(t)}
                </TouchableOpacity>
              ))}
              {!shown.length ? <Text style={{ textAlign: 'center', color: C.faint, marginTop: 30 }}>Nothing matches “{q}”</Text> : null}
              {shown.length > 300 ? <Text style={{ textAlign: 'center', color: C.faint, marginVertical: 12 }}>Showing 300 of {shown.length} — type to narrow</Text> : null}
            </ScrollView>
          )}
          {footer}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl },
  barRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  backTxt: { color: C.white, fontSize: 28, lineHeight: 30, fontWeight: '600', marginTop: -2 },
  barTitle: { color: C.white, fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  barSub: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, marginTop: 2 },
  barBtn: { backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, minWidth: 64, alignItems: 'center' },
  barBtnTxt: { fontWeight: '800', fontSize: 13.5 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, ...shadow },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8, paddingHorizontal: 2 },
  secTitle: { fontSize: 12, fontWeight: '800', color: C.sub, letterSpacing: 1.2, textTransform: 'uppercase' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  btn: { borderRadius: R.md, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btnTxt: { fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  label: { fontSize: 12, fontWeight: '700', color: C.sub, marginBottom: 6, letterSpacing: 0.3 },
  input: { backgroundColor: C.white, borderWidth: 1.2, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.text },
  select: { flexDirection: 'row', alignItems: 'center' },
  seg: { flexDirection: 'row', backgroundColor: '#E8EDF5', borderRadius: R.md, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: R.sm + 1, alignItems: 'center' },
  segTxt: { fontWeight: '700', color: C.sub, fontSize: 13 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.line },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginTop: 10, textAlign: 'center' },
  emptySub: { fontSize: 13.5, color: C.sub, marginTop: 6, textAlign: 'center' },
  err: { margin: 14, padding: 14, borderRadius: R.md, backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F5C2C2' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  kvK: { color: C.sub, fontSize: 14 },
  kvV: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  strip: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: R.md, marginTop: 12, paddingVertical: 8 },
  stripCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  stripLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  stripVal: { color: C.white, fontSize: 15, fontWeight: '800', marginTop: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16 },
  chipDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  chipDarkOn: { backgroundColor: C.white },
  chipLight: { backgroundColor: '#E8EDF5' },
  chipLightOn: { backgroundColor: C.navy2 },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 12 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8EDF5', alignItems: 'center', justifyContent: 'center' },
  pickRow: { backgroundColor: C.white, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
});

export const ui = s;
