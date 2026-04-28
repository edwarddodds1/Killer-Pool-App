import React from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

type RulesGameMode = 'killer' | 'multiball' | 'timer' | 'oneVone'

type RulesModalProps = {
  visible: boolean
  onClose: () => void
  gameMode: RulesGameMode
}

const RULES_BY_MODE: Record<RulesGameMode, { title: string; rules: string[] }> = {
  killer: {
    title: 'Killer Pool - Single Ball',
    rules: [
      'Each player is assigned one ball to protect.',
      "Take turns potting any ball that isn't yours.",
      'If you pot the cue ball, your turn ends immediately. The next player shoots forward from behind the baulk line.',
      'You are eliminated when your ball is potted by another player.',
      'Last player with their ball still on the table wins.',
    ],
  },
  multiball: {
    title: 'Killer Pool - Multi Ball',
    rules: [
      "Each player is assigned multiple balls; everyone else's balls must be potted to eliminate them.",
      'Take turns potting balls not assigned to you.',
      'If you pot the cue ball, your turn ends immediately. The next player plays from behind the baulk line, shooting forward.',
      'A player is eliminated only when all of their assigned balls have been potted.',
      'Last player with at least one ball remaining wins.',
    ],
  },
  timer: {
    title: 'Timer Pool',
    rules: [
      'Pot all balls on the table as fast as possible.',
      'All balls must be completely stationary before you play your next shot.',
      'Potting the cue ball = shot from behind the baulk line.',
      'Touching any ball to your advantage = +10 second penalty.',
      'White ball leaving the table = +10 second penalty.',
    ],
  },
  oneVone: {
    title: 'Duel',
    rules: [
      'Standard professional pool rules apply.',
      'Players alternate turns. Pot a ball of your assigned type to continue your turn.',
      'Pot the white or commit a foul and your opponent gets ball-in-hand.',
      'Pot the 8 ball after all your balls are cleared to win.',
      'Potting the black early or off the table = instant loss.',
      'At the end of the game, record the winner and how many balls remain on the table for stats tracking.',
    ],
  },
}

export function RulesModal({ visible, onClose, gameMode }: RulesModalProps) {
  const content = RULES_BY_MODE[gameMode]

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{content.title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close rules">
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <View style={styles.list}>
            {content.rules.map((rule, index) => (
              <Text key={rule} style={styles.rule}>
                {index + 1}. {rule}
              </Text>
            ))}
          </View>
          <Pressable style={styles.gotItBtn} onPress={onClose}>
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function RulesHelpHeaderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.helpBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel="Mode rules">
      <Text style={styles.helpText}>?</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
    justifyContent: 'center',
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#171C24',
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { flex: 1, color: '#E8ECF3', fontWeight: '800', fontSize: 17 },
  close: { color: '#E8ECF3', fontSize: 28, lineHeight: 28, paddingHorizontal: 6 },
  list: { gap: 8 },
  rule: { color: '#CBD5E1', fontSize: 14, lineHeight: 20 },
  gotItBtn: {
    alignSelf: 'flex-end',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2B313C',
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  gotItText: { color: '#F1F3F7', fontWeight: '700' },
  helpBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#2B313C',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171C24',
  },
  helpText: { color: '#F1F3F7', fontSize: 18, fontWeight: '800', lineHeight: 20 },
})
