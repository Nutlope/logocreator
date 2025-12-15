
'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { FeatureFlagContextType } from '@/app/types/feature-flags';

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export function useFeatureFlags() {
    const context = useContext(FeatureFlagContext);
    if (context === undefined) {
        throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
    }
    return context;
}

type FeatureFlagProviderProps = {
    children: ReactNode;
    initialFlags: Record<string, boolean>;
};

export function FeatureFlagProvider({ children, initialFlags }: FeatureFlagProviderProps) {

    const value: FeatureFlagContextType = useMemo(() => ({
        flags: initialFlags,
        isEnabled: (flagName: string) => initialFlags[flagName] ?? false,
    }), [initialFlags]);

    return (
        <FeatureFlagContext.Provider value={value}>
            {children}
        </FeatureFlagContext.Provider>
    );
}