/**
 * Rule-based insights generator. NO machine learning, NO model calls.
 *
 * Takes the combined Apple Health + WHOOP snapshot and produces plain-English
 * insights using deterministic rules. Anything this function says can be traced
 * directly to a comparison in the code below.
 */
import type { DailyHealthSnapshot } from './healthkit';
import type { WhoopRecovery, WhoopSleep, WhoopCycle } from './whoop';

export type Insight = {
  level: 'good' | 'neutral' | 'warn';
  title: string;
  detail: string;
};

export type CombinedSnapshot = {
  health: DailyHealthSnapshot | null;
  whoop: {
    recovery: WhoopRecovery | null;
    sleep: WhoopSleep | null;
    cycle: WhoopCycle | null;
  };
};

function fmt(n: number | null | undefined, digits = 0, suffix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
}

export function generateInsights(snap: CombinedSnapshot): Insight[] {
  const out: Insight[] = [];
  const { health, whoop } = snap;

  if (whoop.recovery) {
    const r = whoop.recovery.score.recovery_score;
    if (r >= 67) {
      out.push({
        level: 'good',
        title: `Recovery ${r}% — green zone`,
        detail: 'Body is ready for higher strain today. Consider a harder session if you planned one.',
      });
    } else if (r >= 34) {
      out.push({
        level: 'neutral',
        title: `Recovery ${r}% — yellow zone`,
        detail: 'Moderate readiness. Keep effort steady rather than maxing out.',
      });
    } else {
      out.push({
        level: 'warn',
        title: `Recovery ${r}% — red zone`,
        detail: 'Low recovery. Prioritize easy movement, hydration, and sleep.',
      });
    }
  }

  if (whoop.recovery && health?.restingHR) {
    const whoopRHR = whoop.recovery.score.resting_heart_rate;
    const diff = whoopRHR - health.restingHR;
    if (Math.abs(diff) >= 3) {
      out.push({
        level: 'neutral',
        title: `Resting HR varies by ${Math.abs(diff).toFixed(0)} bpm between sources`,
        detail: `WHOOP says ${fmt(whoopRHR, 0, ' bpm')}, Apple Health says ${fmt(
          health.restingHR,
          0,
          ' bpm',
        )}. Different measurement windows; treat both as estimates.`,
      });
    }
  }

  if (whoop.recovery?.score.hrv_rmssd_milli && health?.hrvMs) {
    const whoopHrv = whoop.recovery.score.hrv_rmssd_milli;
    out.push({
      level: 'neutral',
      title: 'HRV from both sources',
      detail: `WHOOP overnight HRV: ${fmt(whoopHrv, 0, ' ms')}. Apple Health today: ${fmt(
        health.hrvMs,
        0,
        ' ms',
      )}.`,
    });
  }

  if (whoop.sleep) {
    const inBedHrs = whoop.sleep.score.stage_summary.total_in_bed_time_milli / 3_600_000;
    const neededHrs = whoop.sleep.score.sleep_needed_milli / 3_600_000;
    const debt = neededHrs - inBedHrs;
    if (debt > 0.5) {
      out.push({
        level: 'warn',
        title: `Sleep debt ${fmt(debt, 1, ' h')}`,
        detail: `You slept ${fmt(inBedHrs, 1, ' h')} vs the ${fmt(
          neededHrs,
          1,
          ' h',
        )} WHOOP says you needed. Aim for an earlier bedtime tonight.`,
      });
    } else {
      out.push({
        level: 'good',
        title: `Sleep met need (${fmt(inBedHrs, 1, ' h')})`,
        detail: `WHOOP needed ${fmt(neededHrs, 1, ' h')}; you got ${fmt(inBedHrs, 1, ' h')}.`,
      });
    }
  } else if (health?.sleepHours) {
    if (health.sleepHours < 6) {
      out.push({
        level: 'warn',
        title: `Short sleep: ${fmt(health.sleepHours, 1, ' h')}`,
        detail: 'Under 6 hours typically degrades next-day strain tolerance and decision quality.',
      });
    } else {
      out.push({
        level: 'good',
        title: `Sleep: ${fmt(health.sleepHours, 1, ' h')}`,
        detail: 'In the typical adult target range.',
      });
    }
  }

  if (whoop.cycle?.score.strain != null) {
    const strain = whoop.cycle.score.strain;
    if (strain >= 18) {
      out.push({
        level: 'warn',
        title: `Strain ${fmt(strain, 1)} — all-out day`,
        detail: 'Heavy load. Recovery and fueling matter more than usual tonight.',
      });
    } else if (strain >= 14) {
      out.push({
        level: 'neutral',
        title: `Strain ${fmt(strain, 1)} — strenuous`,
        detail: 'Solid workload — keep an eye on sleep and HRV tomorrow.',
      });
    } else if (strain >= 10) {
      out.push({
        level: 'good',
        title: `Strain ${fmt(strain, 1)} — moderate`,
        detail: 'Productive day without overreaching.',
      });
    } else {
      out.push({
        level: 'neutral',
        title: `Strain ${fmt(strain, 1)} — light`,
        detail: 'Restorative day. Fine if planned; otherwise consider a small bout of movement.',
      });
    }
  }

  if (health?.steps != null) {
    if (health.steps >= 10000) {
      out.push({
        level: 'good',
        title: `${fmt(health.steps)} steps`,
        detail: 'Hit a classic daily step benchmark.',
      });
    } else if (health.steps < 4000) {
      out.push({
        level: 'warn',
        title: `${fmt(health.steps)} steps so far`,
        detail: 'Mostly sedentary day. A 10–15 min walk would lift this materially.',
      });
    }
  }

  if (health?.exerciseMinutes != null && health.exerciseMinutes < 20) {
    out.push({
      level: 'neutral',
      title: `Exercise minutes: ${fmt(health.exerciseMinutes)}`,
      detail: 'WHO suggests 150 min/week of moderate activity — pace accordingly.',
    });
  }

  if (out.length === 0) {
    out.push({
      level: 'neutral',
      title: 'No data yet',
      detail: 'Grant Apple Health permission and connect WHOOP to start seeing insights.',
    });
  }

  return out;
}
