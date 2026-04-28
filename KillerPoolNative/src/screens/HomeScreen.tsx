import React, { useLayoutEffect, useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppState } from '../state/AppProviders';
import { buildNewRoom } from '../services/game';
import { getRoomRemote, getRooms, upsertRoom, upsertRoomRemote } from '../services/store';
import type { RootStackParamList } from '../types/navigation';
import { RulesHelpHeaderButton, RulesModal } from '../components/ui/RulesModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { profile, setProfile, hydrated, signOut } = useAppState();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <RulesHelpHeaderButton onPress={() => setShowRules(true)} />,
    });
  }, [navigation]);

  if (!hydrated) {
    return <View style={styles.container}><Text style={styles.text}>Loading...</Text></View>;
  }

  const createGuest = async (): Promise<void> => {
    const clean = username.trim();
    if (clean.length < 2) {
      setError('Enter at least 2 characters.');
      return;
    }
    await setProfile({ id: String(Date.now()), username: clean });
    setError('');
  };

  const startKiller = async (): Promise<void> => {
    if (!profile) return;
    const rooms = await getRooms();
    const room = buildNewRoom(profile, 'killer', 'single');
    while (rooms[room.code] || (await getRoomRemote(room.code))) {
      room.code = String(Math.floor(1000 + Math.random() * 9000));
    }
    await upsertRoom(room);
    await upsertRoomRemote(room);
    navigation.navigate('Room', { code: room.code });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Killer Pool</Text>
      {!profile ? (
        <>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor="#7A7F89"
            style={styles.input}
          />
          <Button title="Continue as Guest" onPress={() => void createGuest()} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : (
        <>
          <Text style={styles.text}>Signed in as {profile.username}</Text>
          <View style={styles.actions}>
            <Button title="Start Killer Game" onPress={() => void startKiller()} />
            <Button title="Join Party" onPress={() => navigation.navigate('Join')} />
            <Button title="Timer Pool" onPress={() => navigation.navigate('Timer')} />
            <Button title="Leaderboard" onPress={() => navigation.navigate('Leaderboard')} />
            <Button
              title="Sign Out"
              color="#c64141"
              onPress={() => {
                void signOut();
              }}
            />
          </View>
        </>
      )}
      <RulesModal visible={showRules} onClose={() => setShowRules(false)} gameMode="killer" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#0F1115' },
  title: { fontSize: 36, color: '#F1F3F7', fontWeight: '900' },
  text: { color: '#D3D8E2', fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#2B313C',
    borderRadius: 10,
    color: '#F1F3F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  actions: { gap: 10 },
  error: { color: '#E66D6D', fontWeight: '700' },
});
