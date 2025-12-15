import type { FeatureFlag, FeatureFlags } from "@/app/types/feature-flags";

// Parse environment variable for feature flag overrides
// Format: FEATURE_FLAGS="AUTH=true,ANALYTICS=false"
export function parseFeatureFlagEnvVar(): Record<string, boolean> {
    const flagsStr = process.env.FEATURE_FLAGS;
    if (!flagsStr) return {};

    return flagsStr.split(',').reduce((acc, flag) => {
        const [key, value] = flag.split('=');
        if (key && value) {
            acc[key.trim()] = value.trim().toLowerCase() === 'true';
        }
        return acc;
    }, {} as Record<string, boolean>);
}

export const DEFAULT_FLAGS: Record<FeatureFlags, FeatureFlag> = {
    AUTH: {
        name: 'AUTH',
        enabled: true,
        description: 'Enables authentication features'
    },
    CUSTOM_COLOR_INPUT: {
        name: 'CUSTOM_COLOR_INPUT',
        enabled: false,
        description: 'Enables custom color input'
    },
    DARK_MODE: {
        name: 'DARK_MODE',
        enabled: false,
        description: 'Enables dark mode support'
    },
    ANALYTICS: {
        name: 'ANALYTICS',
        enabled: true,
        description: 'Enables analytics tracking'
    }
};