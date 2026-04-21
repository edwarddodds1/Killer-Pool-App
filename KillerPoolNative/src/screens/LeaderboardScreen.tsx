import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { TimerScore } from '../types/domain';
import { getTimerScores } from '../services/store';

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    centiseconds,
  ).padStart(2, '0')}`;
}

export function LeaderboardScreen(): React.JSX.Element {
  const [scores, setScores] = useState<TimerScore[]>([]);

  useEffect(() => {
    (async () => {
      const next = await getTimerScores();
      setScores(next.slice(0, 20));
    })();
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={scores}
        keyExtractor={(item, index) => `${item.profileId}-${item.createdAt}-${index}`}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <Text style={styles.user} numberOfLines={1}>
              {item.username}
            </Text>
            <Text style={styles.time}>{formatElapsed(item.elapsedMs)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No runs recorded yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0F1115' },
  row: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#171C24',
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  rank: { color: '#99A2B5', width: 36, fontWeight: '700' },
  user: { color: '#E8ECF3', flex: 1, fontWeight: '600' },
  time: { color: '#E8ECF3', fontWeight: '800' },
  empty: { color: '#99A2B5', textAlign: 'center', marginTop: 20 },
});
