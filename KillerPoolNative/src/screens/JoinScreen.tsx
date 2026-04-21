import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppState } from '../state/AppProviders';
import { getRoom, getRoomRemote, upsertRoom, upsertRoomRemote } from '../services/store';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

export function JoinScreen({ navigation }: Props): React.JSX.Element {
  const { profile } = useAppState();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const onJoin = async (): Promise<void> => {
    if (!profile) {
      setError('Sign in from home first.');
      return;
    }
    const cleanCode = code.replace(/\D/g, '').slice(0, 4);
    const room = (await getRoomRemote(cleanCode)) ?? (await getRoom(cleanCode));
    if (!room) {
      setError('No party found for that code.');
      return;
    }
    if (!room.players.some((player) => player.id === profile.id)) {
      room.players.push({
        id: profile.id,
        username: profile.username,
        avatarIcon: profile.avatarIcon,
        isBot: false,
        ready: false,
        assignedBalls: [],
        pottedBalls: [],
        turns: 0,
        kills: 0,
        eliminated: false,
      });
    }
    await upsertRoom(room);
    await upsertRoomRemote(room);
    navigation.replace('Room', { code: cleanCode });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Join with 4-digit code</Text>
      <TextInput
        value={code}
        onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        placeholder="0000"
        placeholderTextColor="#7A7F89"
        style={styles.input}
      />
      <Button title="Enter Lobby" onPress={() => void onJoin()} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#0F1115' },
  label: { color: '#D3D8E2', fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#2B313C',
    borderRadius: 10,
    color: '#F1F3F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  error: { color: '#E66D6D', fontWeight: '700' },
});
