'use client';

import { Toaster } from "@/app/components/ui/toaster";
import { FeatureFlagProvider, useFeatureFlags } from "@/app/contexts/FeatureFlagContext";
import { ClerkProvider } from "@clerk/nextjs";
import PlausibleProvider from "next-plausible";
import { Fragment } from "react";

export function ClientProviders({
    children,
    featureFlags,
}: {
    children: React.ReactNode;
    featureFlags: Record<string, boolean>;
}) {
    return (
        <FeatureFlagProvider initialFlags={featureFlags}>
            <Wrapper>{children}</Wrapper>
            <Toaster />
        </FeatureFlagProvider>
    );
}

const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const { isEnabled } = useFeatureFlags();
    const AuthWrapper = isEnabled('AUTH') ? ClerkProvider : Fragment;
    const isAnalyticsEnabled = isEnabled('ANALYTICS');

    return (
        <AuthWrapper>
            {isAnalyticsEnabled && <PlausibleProvider domain="logo-creator.io" />}
            {children}
        </AuthWrapper>
    )
}