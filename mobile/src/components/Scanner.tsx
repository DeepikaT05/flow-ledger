import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Btn } from './ui';
import { C, R, Accent } from '../theme';

interface Props {
  visible: boolean;
  title?: string;
  accent: Accent;
  /** Keep the camera open after a scan (billing: scan item after item). */
  continuous?: boolean;
  /** Line shown under the camera after a scan, e.g. "✓ TILT 250ML · qty 2". */
  status?: string;
  onCode: (code: string) => void;
  onClose: () => void;
}

const TYPES = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'datamatrix'] as const;

/** Camera QR / barcode scanner, with a box to type the code when the camera can't read it. */
export const Scanner: React.FC<Props> = ({ visible, title = 'Scan QR / Barcode', accent, continuous, status, onCode, onClose }) => {
  const [perm, ask] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  useEffect(() => { if (visible && perm && !perm.granted && perm.canAskAgain) ask(); }, [visible, perm?.granted]);

  const hit = (code: string) => {
    const c = code.trim();
    if (!c) return;
    // The camera reports the same code many times a second — take it once per 1.5 s.
    const now = Date.now();
    if (c === last.current.code && now - last.current.at < 1500) return;
    last.current = { code: c, at: now };
    onCode(c);
    if (!continuous) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={st.wrap}>
        <View style={st.top}>
          <Text style={st.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={st.close}><Text style={{ color: C.white, fontSize: 18 }}>✕</Text></TouchableOpacity>
        </View>
        <View style={st.camBox}>
          {perm?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...TYPES] }}
              onBarcodeScanned={visible ? (r) => hit(r.data) : undefined}
            />
          ) : (
            <View style={st.noCam}>
              <Text style={{ color: C.white, textAlign: 'center', marginBottom: 12 }}>
                {perm && !perm.canAskAgain ? 'Camera permission is off. Allow it in phone Settings, or type the code below.' : 'Camera permission is needed to scan.'}
              </Text>
              {perm?.canAskAgain !== false ? <Btn label="Allow Camera" color={accent.main} onPress={ask} small /> : null}
            </View>
          )}
          <View pointerEvents="none" style={[st.frame, { borderColor: accent.main }]} />
        </View>
        {status ? <View style={[st.status, { backgroundColor: accent.main }]}><Text style={st.statusTxt}>{status}</Text></View> : null}
        <View style={st.manual}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="…or type the code"
            placeholderTextColor={C.faint}
            autoCapitalize="characters"
            style={st.input}
            onSubmitEditing={() => { hit(typed); setTyped(''); }}
          />
          <Btn label="Add" small color={accent.main} onPress={() => { hit(typed); setTyped(''); }} style={{ paddingHorizontal: 18 }} />
        </View>
        {continuous ? <Btn label="✓ Done" color={accent.main} onPress={onClose} style={{ margin: 14 }} /> : null}
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 40 },
  title: { flex: 1, color: C.white, fontSize: 18, fontWeight: '800' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  camBox: { flex: 1, margin: 14, borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  noCam: { padding: 24, alignItems: 'center' },
  frame: { width: 240, height: 240, borderWidth: 3, borderRadius: 18 },
  status: { marginHorizontal: 14, borderRadius: R.md, padding: 10 },
  statusTxt: { color: C.white, fontWeight: '800', textAlign: 'center' },
  manual: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 12, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.white, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text },
});
