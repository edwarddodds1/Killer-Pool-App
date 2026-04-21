import React, { useEffect, useRef } from 'react';
import { CommonActions, NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'react-native';
import 'react-native-url-polyfill/auto';

import { HomeScreen } from './src/screens/HomeScreen';
import { JoinScreen } from './src/screens/JoinScreen';
import { RoomScreen } from './src/screens/RoomScreen';
import { TimerScreen } from './src/screens/TimerScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { AppProviders, useAppState } from './src/state/AppProviders';
import type { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

function ProfileSessionNavSync(): React.JSX.Element | null {
  const navigation = useNavigation();
  const { profile, hydrated } = useAppState();
  const hadProfileRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (profile) {
      hadProfileRef.current = true;
      return;
    }
    if (hadProfileRef.current) {
      hadProfileRef.current = false;
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Home' }] }));
    }
  }, [hydrated, profile, navigation]);

  return null;
}

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <StatusBar barStyle="light-content" />
          <NavigationContainer>
            <ProfileSessionNavSync />
            <Stack.Navigator
              initialRouteName="Home"
              screenOptions={{
                headerStyle: { backgroundColor: '#0F1115' },
                headerTintColor: '#F1F3F7',
                contentStyle: { backgroundColor: '#0F1115' },
              }}
            >
              <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Killer Pool' }} />
              <Stack.Screen name="Join" component={JoinScreen} options={{ title: 'Join Party' }} />
              <Stack.Screen name="Room" component={RoomScreen} options={{ title: 'Room' }} />
              <Stack.Screen name="Timer" component={TimerScreen} options={{ title: 'Timer Pool' }} />
              <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
