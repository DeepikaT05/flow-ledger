import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getApiBaseUrl, setApiBaseUrl } from '../config';

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('NK');
  const [password, setPassword] = useState('marg');
  const [serverUrl, setServerUrl] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(setServerUrl);
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      alert('Please enter username and password');
      return;
    }
    if (serverUrl.trim()) {
      await setApiBaseUrl(serverUrl);
    }
    await login(username.trim(), password);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.brandBox}>
          <Text style={styles.brandTitle}>FLOW LEDGER</Text>
          <Text style={styles.brandSubtitle}>MARG ERP 9+ Mobile Suite</Text>
          <View style={styles.tag}>
            <Text style={styles.tagText}>Sale • Purchase • Receipt • Payment • Contra • Ledger</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.loginTitle}>User Login</Text>

          <Text style={styles.label}>Operator Username</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. NK or USER"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>SIGN IN / ENTER</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.configToggle}
            onPress={() => setShowConfig(!showConfig)}
          >
            <Text style={styles.configToggleText}>
              {showConfig ? 'Hide Server URL Settings ▲' : 'Configure Backend Server URL ▼'}
            </Text>
          </TouchableOpacity>

          {showConfig && (
            <View style={styles.configBox}>
              <Text style={styles.configLabel}>API Endpoint URL</Text>
              <TextInput
                style={styles.configInput}
                placeholder="https://flowledger.stafftrack.cloud/api"
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.configHelp}>
                Points to live Flow Ledger backend instance.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.footerNote}>
          Role Mode: Standard (Create, View & Edit enabled • Delete strictly disabled)
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#002244',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  brandBox: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandTitle: {
    color: '#ffcc00',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  brandSubtitle: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#003366',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ffcc00',
  },
  tagText: {
    color: '#ffcc00',
    fontSize: 11,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#003366',
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#444',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  loginBtn: {
    backgroundColor: '#003366',
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  loginBtnText: {
    color: '#ffcc00',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 1,
  },
  configToggle: {
    marginTop: 18,
    alignItems: 'center',
  },
  configToggleText: {
    color: '#0066cc',
    fontSize: 12,
    fontWeight: '600',
  },
  configBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  configLabel: {
    fontSize: 11,
    color: '#777',
    marginBottom: 4,
  },
  configInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    backgroundColor: '#f5f5f5',
  },
  configHelp: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  footerNote: {
    textAlign: 'center',
    color: '#90caf9',
    fontSize: 11,
    marginTop: 20,
  },
});
