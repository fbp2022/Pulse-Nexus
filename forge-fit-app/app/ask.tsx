import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { askWeb, type AskResult } from '@/lib/gemini';

export default function AskScreen() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await askWeb(q.trim());
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <DisclaimerBanner />

          <TextInput
            placeholder="Ask anything — e.g. 'What does an HRV of 45 ms typically mean?'"
            placeholderTextColor="#6c8094"
            value={q}
            onChangeText={setQ}
            style={styles.input}
            multiline
            editable={!loading}
            onSubmitEditing={submit}
            blurOnSubmit
          />

          <Pressable
            onPress={submit}
            disabled={loading || !q.trim()}
            style={[styles.button, (loading || !q.trim()) && { opacity: 0.5 }]}
          >
            <Text style={styles.buttonText}>{loading ? 'Searching…' : 'Search the web'}</Text>
          </Pressable>

          {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 16 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {result ? (
            <View style={styles.answer}>
              <Text style={styles.answerText}>{result.text || 'No answer was returned.'}</Text>

              {result.sources.length > 0 ? (
                <>
                  <Text style={styles.sourcesHeader}>Sources</Text>
                  {result.sources.map((s, i) => (
                    <Pressable key={i} onPress={() => Linking.openURL(s.uri)}>
                      <Text style={styles.sourceLink}>
                        {i + 1}. {s.title || s.uri}
                      </Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 12, paddingBottom: 40 },
  input: {
    backgroundColor: '#141a22',
    color: '#f5f7fa',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginHorizontal: 6,
  },
  button: {
    backgroundColor: '#3ddc97',
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#0b0f14', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff8a65', margin: 12 },
  answer: { marginTop: 16, marginHorizontal: 6 },
  answerText: { color: '#f5f7fa', fontSize: 16, lineHeight: 24 },
  sourcesHeader: {
    color: '#8aa0b4',
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  sourceLink: { color: '#7fb5ff', fontSize: 14, marginVertical: 4, textDecorationLine: 'underline' },
});
