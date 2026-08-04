"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ClerkProvider, useClerk, useUser } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import {
  KeyRound,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  Sun,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { FREE_CREDITS } from "@/app/lib/credits";

/**
 * Optional Clerk auth, wrapped so the rest of the app never imports Clerk
 * hooks directly. With no publishable key the provider renders nothing extra
 * and `useAuth()` reports auth as disabled, so the account-less BYOK flow
 * keeps working exactly as before. With a key, sign-in becomes the friction
 * gate for the free credits (image models cost real money); the balance is
 * a server-truth read of the Upstash ledger via /api/credits.
 */

// Module constant: NEXT_PUBLIC_ vars are inlined at build time, so this can
// never change between renders (safe to branch around hooks).
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export type AuthState = {
  /** Whether Clerk is configured at all (false = account-less mode). */
  enabled: boolean;
  /** False while Clerk is still resolving the session on load. */
  isLoaded: boolean;
  isSignedIn: boolean;
  /**
   * Free credits left per the server's Upstash ledger, or null when unknown
   * (signed out, still loading, or no ledger configured).
   */
  remaining: number | null;
  /** Signed-in identity for the account menu; null when signed out. */
  user: { name: string; email: string; imageUrl: string } | null;
  /** Open Clerk's sign-in modal. */
  openSignIn: () => void;
  /** Open Clerk's account management modal (profile, email, delete…). */
  openUserProfile: () => void;
  signOut: () => Promise<void>;
  /** Re-read the credit balance from the server. */
  refresh: () => Promise<void>;
  /** Push a balance reported by a generate/edit response (no round-trip). */
  noteRemaining: (n: number) => void;
};

const DISABLED_AUTH: AuthState = {
  enabled: false,
  isLoaded: true,
  isSignedIn: false,
  remaining: null,
  user: null,
  openSignIn: () => {},
  openUserProfile: () => {},
  signOut: async () => {},
  refresh: async () => {},
  noteRemaining: () => {},
};

const AuthContext = createContext<AuthState>(DISABLED_AUTH);

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Reads Clerk state and republishes it as the app-level AuthState. */
function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const [remaining, setRemaining] = useState<number | null>(null);

  // Server-truth credits: the same Upstash ledger the API routes spend from.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (!res.ok) return;
      const json: { remaining?: number | null } = await res.json();
      setRemaining(
        typeof json.remaining === "number" ? Math.max(0, json.remaining) : null,
      );
    } catch {
      /* transient; the next generation response carries the balance anyway */
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) void refresh();
    else setRemaining(null);
  }, [isSignedIn, refresh]);

  const value = useMemo<AuthState>(() => {
    const email = user?.primaryEmailAddress?.emailAddress ?? "";
    return {
      enabled: true,
      isLoaded,
      isSignedIn: !!isSignedIn,
      remaining,
      user: user
        ? {
            name: user.fullName || user.username || email.split("@")[0] || "",
            email,
            imageUrl: user.imageUrl,
          }
        : null,
      openSignIn: () => clerk.openSignIn({}),
      openUserProfile: () => clerk.openUserProfile({}),
      signOut: async () => {
        await clerk.signOut();
      },
      refresh,
      noteRemaining: (n: number) => setRemaining(Math.max(0, n)),
    };
  }, [isLoaded, isSignedIn, remaining, user, clerk, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The app's design tokens (globals.css), restated for Clerk's appearance API
// so every Clerk surface (sign-in modal, account modal) reads as native UI
// rather than a third-party widget dropped on top.
const CLERK_VARS = {
  light: {
    colorPrimary: "hsl(231 45% 51%)",
    colorText: "hsl(40 8% 9%)",
    colorTextSecondary: "hsl(40 4% 42%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInputBackground: "hsl(0 0% 100%)",
    colorInputText: "hsl(40 8% 9%)",
    colorNeutral: "hsl(40 8% 9%)",
    colorDanger: "hsl(8 72% 51%)",
  },
  dark: {
    colorPrimary: "hsl(230 66% 67%)",
    colorText: "hsl(45 22% 95%)",
    colorTextSecondary: "hsl(45 6% 60%)",
    colorBackground: "hsl(40 5% 8%)",
    colorInputBackground: "hsl(40 4% 13%)",
    colorInputText: "hsl(45 22% 95%)",
    colorNeutral: "hsl(45 22% 95%)",
    colorDanger: "hsl(8 64% 52%)",
  },
} as const;

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  if (!CLERK_ENABLED) return <>{children}</>;
  const isDark = resolvedTheme === "dark";
  return (
    <ClerkProvider
      appearance={{
        // Clerk's modals follow the app theme instead of defaulting to light.
        theme: isDark ? dark : undefined,
        variables: {
          ...(isDark ? CLERK_VARS.dark : CLERK_VARS.light),
          borderRadius: "0.75rem",
          fontFamily: "var(--font-satoshi), ui-sans-serif, system-ui, sans-serif",
          fontFamilyButtons:
            "var(--font-satoshi), ui-sans-serif, system-ui, sans-serif",
        },
        elements: {
          // Tailwind classes from the app bundle: keep Clerk's cards, buttons
          // and inputs on the app's radii and weights.
          card: "rounded-2xl border border-border/60",
          headerTitle: "font-black tracking-tight",
          formButtonPrimary: "rounded-xl font-bold",
          formFieldInput: "rounded-xl",
          socialButtonsBlockButton: "rounded-xl font-semibold",
          footerActionLink: "font-semibold",
        },
      }}
    >
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

/** Two tiny pips showing the free-credit balance at a glance. */
function CreditPips({ left }: { left: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: FREE_CREDITS }, (_, i) => (
        <span
          key={i}
          className={
            i < left
              ? "size-1.5 rounded-full bg-primary"
              : "size-1.5 rounded-full bg-border"
          }
        />
      ))}
    </span>
  );
}

/**
 * Header auth widget: a quiet "Sign in" pill when signed out; a custom
 * account menu (identity, credit balance, key shortcut, manage, sign out)
 * when signed in. Renders nothing in account-less mode, so the header is
 * unchanged without Clerk keys.
 */
/**
 * Theme picker row for the account menu (the header toggle moves in here when
 * auth is on, freeing that slot for the sign-in CTA). Plain buttons in a
 * non-item row, so picking a theme doesn't dismiss the menu.
 */
function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light theme", Icon: Sun },
    { value: "dark", label: "Dark theme", Icon: Moon },
    { value: "system", label: "Match system theme", Icon: Monitor },
  ] as const;
  return (
    <div className="flex h-11 items-center justify-between gap-2 px-2.5">
      <span className="text-sm text-muted-foreground">Theme</span>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-secondary/50 p-0.5"
      >
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={(theme ?? "system") === value}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={
              (theme ?? "system") === value
                ? "flex size-7 items-center justify-center rounded-md bg-background text-foreground shadow-sm"
                : "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function AuthControls({
  hasOwnKey,
  onManageKey,
}: {
  /** A personal Together key is saved (credits stop mattering). */
  hasOwnKey: boolean;
  /** Open the API-key dialog. */
  onManageKey: () => void;
}) {
  const auth = useAuth();
  if (!auth.enabled) return null;
  if (!auth.isLoaded) {
    // Placeholder keeps the header from shifting when the button pops in.
    return <span aria-hidden className="size-10 sm:size-9" />;
  }
  if (!auth.isSignedIn) {
    // The header's one action while signed out, so it reads as the CTA it is
    // (primary fill, never wraps: sign-in is the door to everything else).
    return (
      <button
        type="button"
        onClick={auth.openSignIn}
        className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 text-[0.8125rem] font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9"
      >
        <LogIn className="size-3.5 shrink-0" />
        Sign in
      </button>
    );
  }

  const left = auth.remaining ?? FREE_CREDITS;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex size-10 items-center justify-center rounded-full transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-9"
        >
          {auth.user?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Clerk avatar host isn't in next/image's allowlist; a 36px avatar doesn't need optimization
            <img
              src={auth.user.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-9 rounded-full border border-border/70 sm:size-8"
            />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground sm:size-8">
              {(auth.user?.name || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="truncate text-sm font-semibold">{auth.user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {auth.user?.email}
          </p>
        </div>
        <DropdownMenuSeparator />
        {hasOwnKey ? (
          <div className="flex h-11 items-center justify-between gap-2 px-2.5">
            <span className="text-sm text-muted-foreground">Generations</span>
            <span className="text-sm font-semibold">Your key · unlimited</span>
          </div>
        ) : (
          <div className="flex h-11 items-center justify-between gap-2 px-2.5">
            <span className="text-sm text-muted-foreground">Free credits</span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <CreditPips left={left} />
              {left} left
            </span>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onManageKey}>
          <KeyRound className="size-4 text-muted-foreground" />
          {hasOwnKey ? "Manage API key" : "Add your own key"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => auth.openUserProfile()}>
          <Settings2 className="size-4 text-muted-foreground" />
          Manage account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeRow />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void auth.signOut().then(() => toast({ title: "Signed out" }));
          }}
        >
          <LogOut className="size-4 text-muted-foreground" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
