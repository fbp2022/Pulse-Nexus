import { StyleSheet, Text, View } from 'react-native';
import type { Workout, WorkoutSource } from '@/lib/workouts';

const SOURCE_COLOR: Record<WorkoutSource, string> = {
  'Apple Health': '#fa5252',
  WHOOP: '#3ddc97',
  Fitbit: '#5b8def',
  Garmin: '#7c5cff',
};

function fmtDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function strainColor(s: number | undefined): string {
  if (s == null) return '#8aa0b4';
  if (s >= 18) return '#ff8a65';
  if (s >= 14) return '#f1c40f';
  if (s >= 10) return '#3ddc97';
  return '#5b8def';
}

export function WorkoutCard({ workout }: { workout: Workout }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.sourcePill, { backgroundColor: SOURCE_COLOR[workout.source] }]}>
          <Text style={styles.sourcePillText}>{workout.source}</Text>
        </View>
        {workout.strainOrLoad != null ? (
          <View style={[styles.strainPill, { borderColor: strainColor(workout.strainOrLoad) }]}>
            <Text style={[styles.strainPillText, { color: strainColor(workout.strainOrLoad) }]}>
              Strain {workout.strainOrLoad.toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.type}>{workout.type}</Text>
      <Text style={styles.time}>{fmtTime(workout.start)}</Text>

      <View style={styles.statsRow}>
        <Stat label="Duration" value={fmtDuration(workout.durationMin)} />
        {workout.distanceKm != null ? (
          <Stat label="Distance" value={`${workout.distanceKm.toFixed(2)} km`} />
        ) : null}
        {workout.calories != null ? (
          <Stat label="kcal" value={Math.round(workout.calories).toLocaleString()} />
        ) : null}
        {workout.avgHR != null ? <Stat label="Avg HR" value={`${Math.round(workout.avgHR)}`} /> : null}
        {workout.maxHR != null ? <Stat label="Max HR" value={`${Math.round(workout.maxHR)}`} /> : null}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141a22',
    borderRadius: 14,
    padding: 14,
    marginVertical: 6,
    marginHorizontal: 6,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourcePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  sourcePillText: { color: '#0b0f14', fontSize: 11, fontWeight: '700' },
  strainPill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  strainPillText: { fontSize: 11, fontWeight: '700' },
  type: { color: '#f5f7fa', fontSize: 18, fontWeight: '700', marginTop: 10 },
  time: { color: '#8aa0b4', fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginHorizontal: -6 },
  stat: { paddingHorizontal: 6, marginTop: 6, minWidth: 80 },
  statLabel: {
    color: '#6c8094',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: { color: '#f5f7fa', fontSize: 16, fontWeight: '700', marginTop: 2 },
});
