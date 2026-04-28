import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import type { TimerScore } from '../types/domain';
import { deleteTimerScore, getTimerScores } from '../services/store';
import { useAppState } from '../state/AppProviders';
import { RulesHelpHeaderButton, RulesModal } from '../components/ui/RulesModal';
import {
  formatRecentRunDayMonth,
  formatTimerElapsedMs,
  timerScoreBelongsToProfile,
  timerScoreKey,
} from '../../../shared/timerLeaderboard';

export function LeaderboardScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const { profile, hydrated } = useAppState();
  const [scores, setScores] = useState<TimerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <RulesHelpHeaderButton onPress={() => setShowRules(true)} />,
    });
  }, [navigation]);

  const loadScores = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getTimerScores();
      setScores(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScores();
  }, [loadScores]);

  const userRuns = useMemo(() => {
    if (!profile) return [];
    return scores
      .filter((s) => timerScoreBelongsToProfile(s, profile))
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [scores, profile]);

  const userBest = userRuns.reduce<TimerScore | null>((best, s) => {
    if (!best) return s;
    return s.elapsedMs < best.elapsedMs ? s : best;
  }, null);

  const userAverageMs = userRuns.length
    ? Math.round(userRuns.reduce((sum, run) => sum + run.elapsedMs, 0) / userRuns.length)
    : null;

  const recent5Runs = userRuns.slice(0, 5);

  const leaderboard = useMemo(
    () => scores.slice().sort((a, b) => a.elapsedMs - b.elapsedMs).slice(0, 10),
    [scores],
  );

  const onDeleteRun = (score: TimerScore) => {
    if (!profile) return;
    if (!timerScoreBelongsToProfile(score, profile)) return;
    const key = timerScoreKey(score);
    Alert.alert('Delete attempt', 'Remove this run from the leaderboard?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const prev = scores;
            setScores((p) => p.filter((r) => timerScoreKey(r) !== key));
            setDeletingKey(key);
            try {
              await deleteTimerScore({
                profileId: score.profileId,
                elapsedMs: score.elapsedMs,
                createdAt: score.createdAt,
              });
            } catch {
              setScores(prev);
              Alert.alert('Error', 'Could not delete that attempt.');
            } finally {
              setDeletingKey(null);
            }
          })();
        },
      },
    ]);
  };

  if (!hydrated) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#99A2B5" />
        </View>
      ) : null}

      {profile ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your performance</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Best</Text>
            <Text style={styles.summaryValue}>
              {userBest ? formatTimerElapsedMs(userBest.elapsedMs) : '--:--.--'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Runs</Text>
            <Text style={styles.summaryValue}>{userRuns.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Average</Text>
            <Text style={styles.summaryValue}>
              {userAverageMs !== null ? formatTimerElapsedMs(userAverageMs) : '--:--.--'}
            </Text>
          </View>

          <Text style={styles.sectionHeading}>Recent</Text>
          {recent5Runs.length ? (
            recent5Runs.map((item, index) => {
              const key = timerScoreKey(item);
              const busy = deletingKey === key;
              return (
                <View key={key} style={styles.recentRow}>
                  <Text style={styles.rank}>#{index + 1}</Text>
                  <Text style={styles.time}>{formatTimerElapsedMs(item.elapsedMs)}</Text>
                  <Text style={styles.recentDate}>{formatRecentRunDayMonth(item.createdAt)}</Text>
                  <Pressable
                    accessibilityLabel="Delete attempt"
                    style={styles.deleteHit}
                    disabled={busy}
                    onPress={() => onDeleteRun(item)}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#F87171" />
                    ) : (
                      <Text style={styles.deleteIcon}>🗑</Text>
                    )}
                  </Pressable>
                </View>
              );
            })
          ) : (
            <Text style={styles.muted}>No recent runs yet.</Text>
          )}
        </View>
      ) : (
        <Text style={styles.muted}>Sign in on Home to see your timer stats.</Text>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>All-time leaderboard</Text>
        {leaderboard.length ? (
          leaderboard.map((item, index) => (
            <View key={timerScoreKey(item)} style={styles.leaderRow}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <Text style={styles.user} numberOfLines={1}>
                {item.username}
              </Text>
              <Text style={styles.time}>{formatTimerElapsedMs(item.elapsedMs)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Leaderboard is empty.</Text>
        )}
      </View>
      <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="oneVone" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0F1115' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },
  centered: { flex: 1, backgroundColor: '#0F1115', alignItems: 'center', justifyContent: 'center' },
  loadingRow: { paddingVertical: 8, alignItems: 'center' },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#171C24',
    padding: 12,
    gap: 8,
  },
  cardTitle: { color: '#E8ECF3', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  sectionHeading: { color: '#99A2B5', fontWeight: '700', fontSize: 13, marginTop: 8 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#12161C',
  },
  summaryLabel: { color: '#99A2B5', fontWeight: '700', fontSize: 14 },
  summaryValue: { color: '#E8ECF3', fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#12161C',
  },
  leaderRow: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#12161C',
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  rank: { color: '#99A2B5', width: 36, fontWeight: '700' },
  user: { color: '#E8ECF3', flex: 1, fontWeight: '600' },
  time: { color: '#E8ECF3', fontWeight: '800', fontVariant: ['tabular-nums'] },
  recentDate: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', flex: 1 },
  deleteHit: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    backgroundColor: '#450A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: { fontSize: 16, color: '#F87171' },
  muted: { color: '#99A2B5', textAlign: 'center', marginTop: 4 },
});
