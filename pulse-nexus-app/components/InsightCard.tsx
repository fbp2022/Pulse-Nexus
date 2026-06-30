import { StyleSheet, Text, View } from 'react-native';
import type { Insight } from '@/lib/assistant';

const COLORS: Record<Insight['level'], { bg: string; bar: string; text: string }> = {
  good: { bg: '#0f2018', bar: '#3ddc97', text: '#bff5db' },
  neutral: { bg: '#0f1620', bar: '#5b8def', text: '#d0dcf3' },
  warn: { bg: '#221410', bar: '#ff8a65', text: '#f7c7b8' },
};

export function InsightCard({ insight }: { insight: Insight }) {
  const c = COLORS[insight.level];
  return (
    <View style={[styles.card, { backgroundColor: c.bg, borderLeftColor: c.bar }]}>
      <Text style={[styles.title, { color: c.text }]}>{insight.title}</Text>
      <Text style={styles.detail}>{insight.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginVertical: 6,
    marginHorizontal: 6,
  },
  title: { fontSize: 16, fontWeight: '700' },
  detail: { color: '#c2cfdb', fontSize: 14, marginTop: 6, lineHeight: 20 },
});
