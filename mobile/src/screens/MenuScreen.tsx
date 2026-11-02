import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Screen, TopBar, Badge } from '../components/ui';
import { MENUS, MenuNode, visibleMenu } from '../menus';
import { useAuth } from '../context/AuthContext';
import { ModuleKey } from '../types';
import { MODULE, C, R, shadow } from '../theme';

const countLeaves = (n: MenuNode): number => (n.children ? n.children.reduce((s, c) => s + countLeaves(c), 0) : n.soon ? 0 : 1);

/** One level of a module's menu; submenus push another MenuScreen with a longer path. */
export const MenuScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const module: ModuleKey = route.params.module;
  const path: string[] = route.params.path ?? [];
  const accent = MODULE[module];
  const { can, user } = useAuth();
  const canEdit = user?.app_perms?.edit !== false;

  let nodes = visibleMenu(MENUS[module], can, canEdit);
  for (const p of path) nodes = nodes.find((n) => n.label === p)?.children ?? [];

  const open = (n: MenuNode) => {
    if (n.children) navigation.push('Menu', { module, path: [...path, n.label] });
    else if (n.go) navigation.navigate(n.go.screen, n.go.params);
    else Alert.alert(n.label, 'This option is not available yet — it is not built on the web either.');
  };

  const actions = nodes.filter((n) => !n.children);
  const subs = nodes.filter((n) => n.children);

  return (
    <Screen accent={accent}>
      <TopBar
        title={path.length ? path[path.length - 1] : accent.title}
        subtitle={[accent.title, ...path].join('  ›  ')}
        accent={accent}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {actions.length ? (
          <View style={st.grid}>
            {actions.map((n) => (
              <TouchableOpacity key={n.label} style={[st.tile, n.soon && { opacity: 0.55 }]} onPress={() => open(n)} activeOpacity={0.75}>
                <View style={[st.tileIcon, { backgroundColor: accent.soft }]}><Text style={{ fontSize: 22 }}>{n.icon}</Text></View>
                <Text style={st.tileLabel} numberOfLines={2}>{n.label}</Text>
                {n.hint ? <Text style={st.tileHint} numberOfLines={2}>{n.hint}</Text> : null}
                {n.soon ? <View style={{ marginTop: 6 }}><Badge label="SOON" color={C.faint} soft /></View> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {subs.length ? <Text style={st.section}>More</Text> : null}
        {subs.map((n) => (
          <TouchableOpacity key={n.label} style={st.row} onPress={() => open(n)} activeOpacity={0.75}>
            <View style={[st.rowIcon, { backgroundColor: accent.main }]}><Text style={{ fontSize: 20 }}>{n.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.rowLabel}>{n.label}</Text>
              <Text style={st.rowHint} numberOfLines={1}>
                {n.hint ?? n.children!.map((c) => c.label).join(' · ')}
              </Text>
            </View>
            <View style={[st.count, { backgroundColor: accent.soft }]}><Text style={{ color: accent.dark, fontWeight: '800', fontSize: 12 }}>{countLeaves(n)}</Text></View>
            <Text style={{ color: C.faint, fontSize: 24, marginLeft: 6 }}>›</Text>
          </TouchableOpacity>
        ))}

        {!nodes.length ? (
          <Text style={{ textAlign: 'center', color: C.sub, marginTop: 40 }}>
            Your role has no options here. Ask the SuperAdmin to allow them.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
};

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '48.5%', backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 12, minHeight: 128, ...shadow },
  tileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tileLabel: { fontSize: 15, fontWeight: '800', color: C.text },
  tileHint: { fontSize: 11.5, color: C.sub, marginTop: 4, lineHeight: 15 },
  section: { fontSize: 12, fontWeight: '800', color: C.sub, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8, marginBottom: 10, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.lg, padding: 12, marginBottom: 10, ...shadow },
  rowIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowLabel: { fontSize: 15.5, fontWeight: '800', color: C.text },
  rowHint: { fontSize: 12, color: C.sub, marginTop: 3 },
  count: { minWidth: 26, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
