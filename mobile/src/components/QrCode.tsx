import React, { useMemo } from 'react';
import { View } from 'react-native';
import { qrMatrix } from '../utils/codes';

/** QR code drawn with plain Views (no native SVG module needed). */
export const QrCode: React.FC<{ value: string; size?: number }> = ({ value, size = 200 }) => {
  const m = useMemo(() => qrMatrix(value), [value]);
  const cell = Math.floor(size / (m.length + 4));
  return (
    <View style={{ backgroundColor: '#fff', padding: cell * 2, alignSelf: 'center' }}>
      {m.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((on, c) => <View key={c} style={{ width: cell, height: cell, backgroundColor: on ? '#000' : '#fff' }} />)}
        </View>
      ))}
    </View>
  );
};
