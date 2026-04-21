import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
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
import { AppProviders } from './src/state/AppProviders';
import type { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <StatusBar barStyle="light-content" />
          <NavigationContainer>
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
