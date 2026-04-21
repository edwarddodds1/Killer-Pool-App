import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { Profile } from '../types/domain';
import { getProfile, saveProfile as saveProfileStore, clearProfile as clearProfileStore } from '../services/store';

type AppState = {
  profile: Profile | null;
  setProfile: (profile: Profile) => Promise<void>;
  signOut: () => Promise<void>;
  hydrated: boolean;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [profile, setProfileValue] = useState<Profile | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await getProfile();
      setProfileValue(existing);
      setHydrated(true);
    })();
  }, []);

  const value = useMemo<AppState>(
    () => ({
      profile,
      hydrated,
      setProfile: async (next) => {
        setProfileValue(next);
        await saveProfileStore(next);
      },
      signOut: async () => {
        setProfileValue(null);
        await clearProfileStore();
      },
    }),
    [profile, hydrated],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be used inside AppProviders.');
  }
  return value;
}
