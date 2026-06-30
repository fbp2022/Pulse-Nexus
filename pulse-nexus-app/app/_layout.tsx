import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerStyle: { backgroundColor: '#0b0f14' },
          headerTintColor: '#f5f7fa',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Pulse Nexus' }} />
        <Stack.Screen name="chat" options={{ title: 'Coach' }} />
        <Stack.Screen name="workouts" options={{ title: 'Workouts' }} />
        <Stack.Screen name="connect" options={{ title: 'Connect devices' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
