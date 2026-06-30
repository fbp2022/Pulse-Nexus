import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MetricCard } from '@/components/MetricCard';
import { InsightCard } from '@/components/InsightCard';
import {
  getTodaySnapshot,
  requestHealthPermissions,
  type DailyHealthSnapshot,
} from '@/lib/healthkit';
import {
  getLatestWhoopCycle,
  getLatestWhoopRecovery,
  getLatestWhoopSleep,
  isWhoopConnected,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
} from '@/lib/whoop';
import { generateInsights, type CombinedSnapshot } from '@/lib/assistant';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<DailyHealthSnapshot | null>(null);
  const [whoop, setWhoop] = useState<{
    recovery: WhoopRecovery | null;
    sleep: WhoopSleep | null;
    cycle: WhoopCycle | null;
  }>({ recovery: null, sleep: null, cycle: null });

  const load = useCallback(async () => {
    setError(null);
    try {
      await requestHealthPermissions().catch(() => {});
      const [h, connected] = await Promise.all([
        getTodaySnapshot().catch(() => null),
        isWhoopConnected(),
      ]);
      setHealth(h);
      if (connected) {
        const [recovery, sleep, cycle] = await Promise.all([
          getLatestWhoopRecovery().catch(() => null),
          getLatestWhoopSleep().catch(() => null),
          getLatestWhoopCycle().catch(() => null),
        ]);
        setWhoop({ recovery, sleep, cycle });
      } else {
        setWhoop({ recovery: null, sleep: null, cycle: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const combined: CombinedSnapshot = { health, whoop };
  const insights = generateInsights(combined);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.section}>Today</Text>
            <View style={styles.row}>
              <MetricCard
                label="Steps"
                value={health?.steps != null ? health.steps.toLocaleString() : '—'}
              />
              <MetricCard
                label="Active kcal"
                value={
                  health?.activeEnergyKcal != null
                    ? Math.round(health.activeEnergyKcal).toLocaleString()
                    : '—'
                }
              />
            </View>
            <View style={styles.row}>
              <MetricCard
                label="Resting HR"
                value={
                  health?.restingHR != null
                    ? `${Math.round(health.restingHR)} bpm`
                    : whoop.recovery
                    ? `${whoop.recovery.score.resting_heart_rate} bpm`
                    : '—'
                }
                sub={whoop.recovery ? 'WHOOP available' : undefined}
              />
              <MetricCard
                label="HRV"
                value={
                  whoop.recovery?.score.hrv_rmssd_milli
                    ? `${Math.round(whoop.recovery.score.hrv_rmssd_milli)} ms`
                    : health?.hrvMs != null
                    ? `${Math.round(health.hrvMs)} ms`
                    : '—'
                }
              />
            </View>
            <View style={styles.row}>
              <MetricCard
                label="Recovery"
                value={whoop.recovery ? `${whoop.recovery.score.recovery_score}%` : '—'}
                sub={whoop.recovery ? 'WHOOP' : 'Connect WHOOP'}
              />
              <MetricCard
                label="Strain"
                value={whoop.cycle?.score.strain != null ? whoop.cycle.score.strain.toFixed(1) : '—'}
              />
            </View>

            <Text style={styles.section}>Insights</Text>
            {insights.map((i, idx) => (
              <InsightCard key={idx} insight={i} />
            ))}

            <View style={styles.nav}>
              <Link href="/ask" asChild>
                <Pressable style={styles.navBtn}>
                  <Text style={styles.navBtnText}>Ask the web →</Text>
                </Pressable>
              </Link>
              <Link href="/connect" asChild>
                <Pressable style={styles.navBtn}>
                  <Text style={styles.navBtnText}>Connect WHOOP →</Text>
                </Pressable>
              </Link>
              <Link href="/settings" asChild>
                <Pressable style={styles.navBtn}>
                  <Text style={styles.navBtnText}>Settings →</Text>
                </Pressable>
              </Link>
            </View>

            <Text style={styles.note}>
              Insights on this screen are generated by deterministic rules — not AI. Web answers
              (in the Ask tab) use Google Gemini and are labeled as such.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { padding: 8, paddingBottom: 40 },
  section: {
    color: '#f5f7fa',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 4,
    marginLeft: 8,
  },
  row: { flexDirection: 'row' },
  error: { color: '#ff8a65', margin: 12 },
  nav: { marginTop: 18 },
  navBtn: {
    backgroundColor: '#141a22',
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 6,
    marginVertical: 4,
  },
  navBtnText: { color: '#f5f7fa', fontSize: 16, fontWeight: '600' },
  note: { color: '#6c8094', fontSize: 12, margin: 14, lineHeight: 18 },
});
