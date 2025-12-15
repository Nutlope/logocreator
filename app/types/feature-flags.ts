export type FeatureFlag = {
    name: string;
    enabled: boolean;
    description?: string;
};

export type FeatureFlagContextType = {
    flags: Record<FeatureFlags, boolean>;
    isEnabled: (flagName: FeatureFlags) => boolean;
};

export type FeatureFlags = "AUTH" | "CUSTOM_COLOR_INPUT" | "DARK_MODE" | "ANALYTICS";