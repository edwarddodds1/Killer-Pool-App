import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppState } from '../state/AppProviders';
import { addTimerScore } from '../services/store';
import type { RootStackParamList } from '../types/navigation';
import { RulesHelpHeaderButton, RulesModal } from '../components/ui/RulesModal';

const MIN_VALID_TIMER_RUN_MS = 20000;

type Props = NativeStackScreenProps<RootStackParamList, 'Timer'>;

export function TimerScreen({ navigation }: Props): React.JSX.Element {
  const { profile } = useAppState();
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showRules, setShowRules] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <RulesHelpHeaderButton onPress={() => setShowRules(true)} />,
    });
  }, [navigation]);

  useEffect(() => {
    if (runningSince === null) return;
    const id = setInterval(() => setElapsedMs(Date.now() - runningSince), 50);
    return () => clearInterval(id);
  }, [runningSince]);

  const display = useMemo(() => {
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    const centiseconds = Math.floor((elapsedMs % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
      centiseconds,
    ).padStart(2, '0')}`;
  }, [elapsedMs]);

  const finish = async (): Promise<void> => {
    if (!profile || elapsedMs < MIN_VALID_TIMER_RUN_MS) {
      navigation.navigate('Leaderboard');
      return;
    }
    await addTimerScore({
      profileId: profile.id,
      username: profile.username,
      elapsedMs,
    });
    navigation.navigate('Leaderboard');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.timer}>{display}</Text>
      {runningSince === null ? (
        <Button title="Start" onPress={() => setRunningSince(Date.now() - elapsedMs)} />
      ) : (
        <Button title="Stop" color="#C64141" onPress={() => setRunningSince(null)} />
      )}
      <Button title="Finish" onPress={() => void finish()} />
      <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="timer" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#0F1115' },
  timer: { color: '#F1F3F7', fontSize: 56, fontWeight: '900', textAlign: 'center' },
});
