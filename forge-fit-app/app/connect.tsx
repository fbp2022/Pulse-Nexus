import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { connectWhoop, disconnectWhoop, isWhoopConnected } from '@/lib/whoop';

export default function ConnectScreen() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isWhoopConnected().then(setConnected);
  }, []);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectWhoop();
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectWhoop();
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>WHOOP</Text>
        <Text style={styles.p}>
          Connect your WHOOP account so Forge Fit can read your recovery, sleep, and strain
          alongside your Apple Health data.
        </Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Status</Text>
          {connected === null ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.statusValue, { color: connected ? '#3ddc97' : '#ff8a65' }]}>
              {connected ? 'Connected' : 'Not connected'}
            </Text>
          )}
        </View>

        {connected === false ? (
          <Pressable style={styles.button} onPress={onConnect} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Opening WHOOP…' : 'Sign in with WHOOP'}</Text>
          </Pressable>
        ) : null}

        {connected === true ? (
          <Pressable
            style={[styles.button, { backgroundColor: '#ff8a65' }]}
            onPress={onDisconnect}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{busy ? 'Disconnecting…' : 'Disconnect WHOOP'}</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.h2}>Apple Health</Text>
        <Text style={styles.p}>
          Permissions for Apple Health are requested automatically on the dashboard. If you denied
          them by accident, open the iOS Settings app → Privacy & Security → Health → Forge Fit,
          and enable the categories you want to share.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 18 },
  h1: { color: '#f5f7fa', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  h2: { color: '#f5f7fa', fontSize: 22, fontWeight: '700', marginTop: 28, marginBottom: 8 },
  p: { color: '#c2cfdb', fontSize: 15, lineHeight: 22 },
  statusBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#141a22',
    padding: 16,
    borderRadius: 12,
    marginTop: 18,
  },
  statusLabel: { color: '#8aa0b4', fontSize: 14 },
  statusValue: { fontSize: 16, fontWeight: '700' },
  button: {
    backgroundColor: '#3ddc97',
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#0b0f14', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff8a65', marginTop: 14 },
});
