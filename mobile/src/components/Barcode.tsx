import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { canCode128, code128 } from '../utils/code128';

/** Code 128 barcode drawn with plain Views (same idea as QrCode: no native SVG module). */
export const Barcode: React.FC<{ value: string; width?: number; height?: number }> = ({ value, width = 240, height = 50 }) => {
  const bars = useMemo(() => (canCode128(value) ? code128(value) : null), [value]);
  if (!bars) return <Text style={{ color: '#B00020', fontSize: 12 }}>Barcode needs plain A–Z / 0–9 code</Text>;
  const unit = Math.max(1, Math.floor(width / (bars.length + 20)));
  return (
    <View style={{ flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: unit * 10, alignSelf: 'center' }}>
      {bars.map((on, i) => <View key={i} style={{ width: unit, height, backgroundColor: on ? '#000' : '#fff' }} />)}
    </View>
  );
};
