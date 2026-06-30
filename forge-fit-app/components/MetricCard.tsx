import { StyleSheet, Text, View } from 'react-native';

export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#141a22',
    borderRadius: 14,
    padding: 14,
    margin: 6,
  },
  label: { color: '#8aa0b4', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { color: '#f5f7fa', fontSize: 26, fontWeight: '700', marginTop: 6 },
  sub: { color: '#8aa0b4', fontSize: 12, marginTop: 4 },
});
