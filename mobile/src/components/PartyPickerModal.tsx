import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ledger } from '../types';
import { LedgerService } from '../api/services';

interface PartyPickerModalProps {
  visible: boolean;
  groupFilter?: string;
  onSelect: (party: Ledger) => void;
  onClose: () => void;
}

export const PartyPickerModal: React.FC<PartyPickerModalProps> = ({
  visible,
  groupFilter,
  onSelect,
  onClose,
}) => {
  const [parties, setParties] = useState<Ledger[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadParties();
    }
  }, [visible, groupFilter]);

  const loadParties = async () => {
    setLoading(true);
    try {
      const data = await LedgerService.list(groupFilter);
      setParties(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load ledgers');
    } finally {
      setLoading(false);
    }
  };

  const filtered = parties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.city && p.city.toLowerCase().includes(search.toLowerCase())) ||
    (p.phone && p.phone.includes(search))
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.top}>
            <Text style={styles.title}>Select Party / Ledger</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search party by name, city, phone..."
            value={search}
            onChangeText={setSearch}
            autoFocus
          />

          {loading ? (
            <ActivityIndicator size="large" color="#003366" style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partyName}>{item.name}</Text>
                    <Text style={styles.partyDetails}>
                      {item.city ? `${item.city} • ` : ''}
                      {item.group_name}
                      {item.phone ? ` • Ph: ${item.phone}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.balText,
                        { color: item.balance >= 0 ? '#00796b' : '#c62828' },
                      ]}
                    >
                      ₹{Math.abs(item.balance).toFixed(2)} {item.balance >= 0 ? 'Dr' : 'Cr'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={() => (
                <Text style={styles.empty}>No parties found.</Text>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '80%',
    padding: 16,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003366',
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  partyName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
  },
  partyDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  balText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  sep: {
    height: 1,
    backgroundColor: '#eee',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
  },
});

