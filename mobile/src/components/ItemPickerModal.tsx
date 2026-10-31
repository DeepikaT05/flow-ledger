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
import { Item, Batch } from '../types';
import { ItemService } from '../api/services';

interface ItemPickerModalProps {
  visible: boolean;
  onSelect: (item: Item, batch?: Batch) => void;
  onClose: () => void;
}

export const ItemPickerModal: React.FC<ItemPickerModalProps> = ({
  visible,
  onSelect,
  onClose,
}) => {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedItem(null);
      setBatches([]);
      loadItems();
    }
  }, [visible]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await ItemService.list();
      setItems(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = async (item: Item) => {
    setSelectedItem(item);
    setLoadingBatches(true);
    try {
      const bList = await ItemService.getBatches(item.id);
      if (bList && bList.length > 0) {
        setBatches(bList);
      } else {
        // No explicit batches, select item directly with default
        onSelect(item);
        onClose();
      }
    } catch {
      onSelect(item);
      onClose();
    } finally {
      setLoadingBatches(false);
    }
  };

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.company && i.company.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.top}>
            <Text style={styles.title}>
              {selectedItem ? `Select Batch: ${selectedItem.name}` : 'Select Product / Item'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (selectedItem) setSelectedItem(null);
                else onClose();
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>{selectedItem ? '‹ Back' : '✕'}</Text>
            </TouchableOpacity>
          </View>

          {!selectedItem ? (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Search product by name or company..."
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
                      onPress={() => handleItemPress(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemDetails}>
                          {item.pack ? `${item.pack} • ` : ''}
                          {item.company ? `${item.company} • ` : ''}
                          GST: {item.gst_rate ?? 0}%
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.rateText}>
                          Sale: ₹{(item.sale_rate || item.mrp || 0).toFixed(2)}
                        </Text>
                        <Text style={styles.mrpText}>
                          MRP: ₹{(item.mrp || 0).toFixed(2)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  ListEmptyComponent={() => (
                    <Text style={styles.empty}>No products found.</Text>
                  )}
                />
              )}
            </>
          ) : (
            <>
              {loadingBatches ? (
                <ActivityIndicator size="large" color="#003366" style={{ marginVertical: 30 }} />
              ) : (
                <FlatList
                  data={batches}
                  keyExtractor={(b) => String(b.id || b.batch)}
                  renderItem={({ item: b }) => (
                    <TouchableOpacity
                      style={styles.batchRow}
                      onPress={() => {
                        onSelect(selectedItem, b);
                        onClose();
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.batchName}>Batch: {b.batch}</Text>
                        <Text style={styles.batchExp}>Exp: {b.expiry || 'N/A'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.rateText}>Rate: ₹{(b.rate || 0).toFixed(2)}</Text>
                        <Text style={styles.mrpText}>MRP: ₹{(b.mrp || 0).toFixed(2)}</Text>
                        {b.stock != null && (
                          <Text style={styles.stockText}>Stock: {b.stock}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  ListEmptyComponent={() => (
                    <TouchableOpacity
                      style={styles.defaultBatchBtn}
                      onPress={() => {
                        onSelect(selectedItem);
                        onClose();
                      }}
                    >
                      <Text style={styles.defaultBatchText}>
                        Select with Standard Rate (No Batch)
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
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
    height: '85%',
    padding: 16,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#003366',
    flex: 1,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 16,
    color: '#003366',
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
  batchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: '#f5f9ff',
    borderRadius: 6,
    marginVertical: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
  },
  itemDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  batchName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#003366',
  },
  batchExp: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  rateText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00796b',
  },
  mrpText: {
    fontSize: 11,
    color: '#888',
  },
  stockText: {
    fontSize: 12,
    color: '#d32f2f',
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
  defaultBatchBtn: {
    padding: 16,
    backgroundColor: '#003366',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  defaultBatchText: {
    color: '#ffcc00',
    fontWeight: 'bold',
  },
});

