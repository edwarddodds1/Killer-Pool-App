import React, { useEffect, useMemo, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { allocateBalls } from '../services/game';
import { getRoom, getRoomRemote, upsertRoom, upsertRoomRemote } from '../services/store';
import type { RootStackParamList } from '../types/navigation';
import type { RoomState } from '../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'Room'>;

export function RoomScreen({ route }: Props): React.JSX.Element {
  const [room, setRoom] = useState<RoomState | null>(null);
  const code = route.params.code;

  useEffect(() => {
    (async () => {
      const loaded = (await getRoomRemote(code)) ?? (await getRoom(code));
      setRoom(loaded ?? null);
    })();
  }, [code]);

  const me = useMemo(() => {
    if (!room) return null;
    return room.players[0] ?? null;
  }, [room]);

  const start = async (): Promise<void> => {
    if (!room) return;
    const allocation = allocateBalls(room.players, room.mode, room.killerAllocationMode);
    const next: RoomState = {
      ...room,
      status: 'inGame',
      playOrder: room.players.map((p) => p.id),
      players: room.players.map((player) => ({
        ...player,
        assignedBalls: allocation.get(player.id) ?? [],
      })),
    };
    setRoom(next);
    await upsertRoom(next);
    await upsertRoomRemote(next);
  };

  if (!room) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Room not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Code: {room.code}</Text>
      <Text style={styles.text}>Status: {room.status}</Text>
      <Button title="Start Match" onPress={() => void start()} />
      {me ? <Text style={styles.text}>You: {me.username}</Text> : null}
      <FlatList
        data={room.players}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.textStrong}>{item.username}</Text>
            <Text style={styles.text}>Balls: {item.assignedBalls.join(', ') || '-'}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10, backgroundColor: '#0F1115' },
  title: { color: '#F1F3F7', fontWeight: '900', fontSize: 24 },
  text: { color: '#D3D8E2' },
  textStrong: { color: '#F1F3F7', fontWeight: '700' },
  card: {
    backgroundColor: '#171C24',
    borderWidth: 1,
    borderColor: '#2B313C',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
});
