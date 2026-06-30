import * as SecureStore from 'expo-secure-store';

const PREFIX = 'pulsenexus.';

export async function setSecret(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(PREFIX + key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(PREFIX + key);
}

export async function deleteSecret(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(PREFIX + key);
}
