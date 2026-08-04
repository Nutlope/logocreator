"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  Dices,
  Github,
  HelpCircle,
  History,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import Logo from "./components/Logo";
import ThemeToggle from "./components/ThemeToggle";
import { AuthControls, useAuth } from "./components/AuthProvider";
import ApiKeyDialog from "./components/ApiKeyDialog";
import StylePicker, { SURPRISE_STYLE } from "./components/StylePicker";
import ColorSwatches, { AUTO_COLOR } from "./components/ColorSwatches";
import Segmented from "./components/Segmented";
import LogoTypeSelect, { LOGO_TYPES } from "./components/LogoTypeSelect";
import TogetherCredit from "./components/TogetherCredit";
import GenerationModal from "./components/GenerationModal";
import BrandKitModal from "./components/BrandKitModal";
import BrandKitDock from "./components/BrandKitDock";
import { useBrandKit } from "./hooks/use-brand-kit";
import Gallery, { type GenParams, type Generation } from "./components/Gallery";
import ReferenceUpload, {
  type ReferenceState,
  type ReferenceStatus,
} from "./components/ReferenceUpload";
import HistoryDashboard from "./components/HistoryDashboard";
import WelcomeModal from "./components/WelcomeModal";
import BrandNameField, {
  type BrandImportResult,
} from "./components/BrandNameField";
import { Tip } from "./components/ui/tooltip";
import { formatUsd, pricePerLogo } from "./lib/pricing";
import {
  STARTER_PRESETS,
  DESCRIBE_SUGGESTIONS,
  type StarterPreset,
} from "./lib/presets";
import {
  loadImage,
  toDataUrl,
  extractBrandPalette,
  brandColorFromImport,
} from "./lib/brand-kit";
import {
  saveLogo,
  getAllLogos,
  deleteLogo,
  clearLogos,
  patchLogo,
} from "./lib/history-db";
import { FREE_CREDITS } from "./lib/credits";

// Image edits run through Together's image-edit model, which is occasionally
// flaky (intermittent 500/429 or a slow response). Retry transient failures a
// couple of times with a short backoff and a per-attempt timeout, so a single
// hiccup never surfaces to the user as a hard error. Non-retryable client errors
// (e.g. an invalid key) throw immediately with the server's message.
async function editWithRetry(
  payload: {
    userAPIKey: string;
    image: string;
    prompt: string;
    width: number;
    height: number;
  },
  attempts = 3,
): Promise<{ b64_json: string; remaining?: number }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 100_000);
    let res: Response | null = null;
    try {
      res = await fetch("/api/edit-logo", {
        method: "POST",
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      lastErr = e; // network error or timeout (abort) → retry
    } finally {
      clearTimeout(timer);
    }
    if (res) {
      if (res.ok) return await res.json();
      // A non-retryable client error (e.g. invalid key) won't fix itself;
      // surface the server's message right away.
      if (res.status < 500 && res.status !== 429) {
        const text = res.headers.get("Content-Type")?.includes("text/plain")
          ? await res.text()
          : "";
        throw new Error(text || "edit failed");
      }
      lastErr = new Error(`status ${res.status}`);
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr ?? new Error("edit failed");
}

// Write to localStorage without ever throwing (private mode / quota). Returns
// whether it stuck, so callers can warn the user if a save was lost.
function safeSetLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// Stable id with a fallback for non-secure contexts (crypto.randomUUID needs
// https/localhost: a plain-http LAN/preview deploy would otherwise throw).
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// Did an IndexedDB write fail because the device is out of storage?
function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

// Map a non-text generation error status to an actionable message.
function genErrorMessage(status: number): string {
  if (status === 401)
    return "Your API key looks invalid. Check it and try again.";
  if (status === 429)
    return "Rate limit reached. Add your own Together key for unlimited generations.";
  if (status === 403)
    return "Your Together account can't access this model yet.";
  if (status >= 500)
    return "Together AI's image service is busy right now. Give it another try.";
  return "Something went wrong. Please try again.";
}

// Each style cycles through several different marks on hover; frame 0 (resting)
// is our own LogoCreator mark rendered in that style. Generated by
// scripts/gen-style-variants.mjs. (The old fox default still lives at
// `/styles/${key}.png` if we ever want to revert frame 0.)
const styleFrames = (key: string) => [
  `/styles/${key}-logo.png`,
  `/styles/${key}-1.png`,
  `/styles/${key}-2.png`,
  `/styles/${key}-3.png`,
  `/styles/${key}-4.png`,
];

const logoStyles = [
  { name: "Minimal", frames: styleFrames("minimal") },
  { name: "Geometric", frames: styleFrames("geometric") },
  { name: "Gradient", frames: styleFrames("gradient") },
  { name: "Mascot", frames: styleFrames("mascot") },
  { name: "Hand-drawn", frames: styleFrames("hand-drawn") },
  { name: "Luxury", frames: styleFrames("luxury") },
  { name: "Retro", frames: styleFrames("retro") },
  { name: "3D", frames: styleFrames("3d") },
];

// All 8 style names in random order, for "Surprise me" runs where each
// variation should land in a DIFFERENT style (distinct while n <= 8).
function shuffledStyleNames(): string[] {
  const names = logoStyles.map((s) => s.name);
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names;
}

const primaryColors = [
  { name: "Blue", color: "#2F6FF5" },
  { name: "Red", color: "#E5484D" },
  { name: "Green", color: "#30A46C" },
  { name: "Yellow", color: "#F2C40F" },
];

const backgroundColors = [
  { name: "White", color: "#FFFFFF" },
  { name: "Gray", color: "#C9C8C2" },
  { name: "Black", color: "#14130F" },
];

const detailLevels = ["Minimal", "Balanced", "Detailed"] as const;

// WCAG relative luminance + contrast ratio, to warn on hard-to-see color pairs.
function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length < 6) return 1; // not a color: skip the contrast warning
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

// One chrome icon-button treatment, shared by the header row and the footer
// social row so they read as siblings (same size, border and hover).
// Footer chrome is quieter than the header's controls, so these run ~8px
// smaller; the invisible before-inset keeps the touch target comfortable.
const socialLink =
  "relative flex size-8 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-7";

export default function Page() {
  // Inputs
  const [companyName, setCompanyName] = useState("");
  const [logoType, setLogoType] = useState(LOGO_TYPES[0].key as string);
  const [selectedStyle, setSelectedStyle] = useState(logoStyles[0].name);
  // Default both colors to "auto": the AI picks a fitting palette unless the
  // user overrides it (or a preset / brand import sets one).
  const [primaryColor, setPrimaryColor] = useState<string>(AUTO_COLOR);
  const [backgroundColor, setBackgroundColor] = useState<string>(AUTO_COLOR);
  const [detailLevel, setDetailLevel] = useState<string>("Balanced");
  const [monochrome, setMonochrome] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Reference logo (read by a vision model → auto-applies style + color)
  const [reference, setReference] = useState<ReferenceState | null>(null);
  const [refStatus, setRefStatus] = useState<ReferenceStatus>("idle");

  // Brand imported from a website/logo → pre-fills name + brand color.
  const [imported, setImported] = useState<{
    source: string;
    color: string;
    name?: string | null;
    logo?: string | null;
    palette?: string[]; // detected brand colors the user can re-pick from
  } | null>(null);

  // Optional Clerk auth: when configured, signing in is the gate for the free
  // credits (server-tracked); without keys this reports disabled and the
  // account-less flow below is unchanged.
  const auth = useAuth();

  // Account-less state
  const [userAPIKey, setUserAPIKey] = useState("");
  const [credits, setCredits] = useState(FREE_CREDITS);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  // Generation state. A "run" fires N parallel requests (a set of variations);
  // pendingCount is how many are still in flight (drives the skeletons).
  const [pendingCount, setPendingCount] = useState(0);
  // One variation by default: the fastest first taste, and a signed-in free
  // user's 2 credits cover two distinct runs instead of one clamped batch.
  const [variationCount, setVariationCount] = useState(1);
  const isGenerating = pendingCount > 0;
  // Screen-reader announcements for async results (aria-live region).
  const [liveMessage, setLiveMessage] = useState("");
  // "Keep editing" runs independently of the main generate flow, so it gets its
  // own flag (otherwise an edit would spawn a phantom skeleton in the gallery).
  const [isEditing, setIsEditing] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);

  // Modals
  const [activeGen, setActiveGen] = useState<Generation | null>(null);
  const [pendingBrandKitGen, setPendingBrandKitGen] =
    useState<Generation | null>(null);

  // Brand kit lives in a hook so it survives the modal closing (minimize → dock).
  const brandKit = useBrandKit(userAPIKey);

  // On-device logo history (IndexedDB).
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyLoadedRef = useRef(false);
  const quotaWarnedRef = useRef(false); // warn once if on-device storage fills
  const refReqRef = useRef(0); // cancels a stale reference-read response
  const importReqRef = useRef(0); // cancels a stale brand-import response
  // Bumped on every MANUAL style/color pick. A slow vision read (~25s) only
  // auto-applies its detected style/color if the user hasn't touched that
  // control since the upload started: manual intent always wins.
  const styleTouchRef = useRef(0);
  const colorTouchRef = useRef(0);
  // Synchronous single-flight guards. A React state flag (isGenerating/isEditing)
  // updates too late to stop a fast double-click, which would double-charge a
  // free credit and spawn phantom skeletons; a ref flips immediately.
  const runningRef = useRef(false);
  const editingRef = useRef(false);
  // Warn once if a non-quota persistence write fails (so it isn't silent).
  const persistWarnedRef = useRef(false);
  // The gallery pane, so a phone-layout generation can scroll the results
  // into view (they'd otherwise render invisibly below the controls).
  const galleryRef = useRef<HTMLElement | null>(null);
  // Per-logo save promises, so a fast favorite/rename can wait for the record
  // to exist before patching it.
  const savePromises = useRef<Map<string, Promise<unknown>>>(new Map());

  // First-visit welcome modal.
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Mirror of `generations` for the unmount cleanup below (an effect with []
  // deps would otherwise close over the initial empty array).
  const generationsRef = useRef<Generation[]>([]);
  useEffect(() => {
    generationsRef.current = generations;
  }, [generations]);
  // Revoke every blob: object URL when the page unmounts, the counterpart to
  // the per-delete/clear revocations.
  useEffect(() => {
    return () => {
      generationsRef.current.forEach((g) => {
        if (g.image.startsWith("blob:")) URL.revokeObjectURL(g.image);
      });
    };
  }, []);

  // Load persisted key + credits after mount (avoids hydration mismatches).
  useEffect(() => {
    setUserAPIKey(localStorage.getItem("userAPIKey") || "");
    const stored = localStorage.getItem("lc_credits");
    if (stored !== null) setCredits(Math.max(0, parseInt(stored, 10) || 0));

    // Show the welcome modal on the first visit only.
    try {
      if (!localStorage.getItem("lc_welcomed")) setWelcomeOpen(true);
    } catch {
      /* localStorage blocked, skip onboarding */
    }

    // Restore saved logos from IndexedDB into the gallery (once; the ref guard
    // survives React StrictMode's double-invoke so we don't duplicate them).
    if (!historyLoadedRef.current) {
      historyLoadedRef.current = true;
      // Only hydrate the most recent window (each record costs a Blob in
      // memory + an object URL + a mounted cell); older logos stay in
      // IndexedDB without ever being read.
      getAllLogos(60)
        .then((recs) => {
          if (!recs.length) return;
          const restored: Generation[] = recs.map((r) => ({
            id: r.id,
            image: URL.createObjectURL(r.blob),
            companyName: r.companyName,
            params: r.params,
            createdAt: r.createdAt,
            favorite: r.favorite,
            name: r.name,
            restored: true,
          }));
          // Merge by id (a logo generated before restore finished may already
          // be in state via its own save) and re-sort newest-first, so the
          // order is stable and React keys never collide.
          setGenerations((prev) => {
            const seen = new Set(prev.map((g) => g.id));
            const add = restored.filter((r) => !seen.has(r.id));
            return [...prev, ...add].sort(
              (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
            );
          });
        })
        .catch(() => {});
    }
  }, []);

  const hasOwnKey = userAPIKey.trim().length > 0;

  // With Clerk configured, free credits are gated behind sign-in and the
  // server tracks each user's remaining count (written to their Clerk
  // metadata after every run); the local counter only rules the account-less
  // mode. Signed out with auth on = no free credits until you sign in.
  const effectiveCredits = auth.enabled
    ? auth.isSignedIn
      ? (auth.remaining ?? FREE_CREDITS)
      : 0
    : credits;

  // Adjust credits by a delta using a functional update, so overlapping flows
  // (e.g. an edit fired while a batch is still generating) can never clobber
  // each other's charge/refund by reading a stale `credits` from a closure.
  function adjustCredits(delta: number) {
    setCredits((c) => {
      const n = Math.max(0, c + delta);
      safeSetLocal("lc_credits", String(n));
      return n;
    });
  }

  // Persisting a logo to IndexedDB failed. If the device is out of storage, tell
  // the user once (so a logo silently vanishing on reload isn't a mystery).
  function onPersistError(e: unknown) {
    if (isQuotaError(e)) {
      if (quotaWarnedRef.current) return;
      quotaWarnedRef.current = true;
      toast({
        variant: "destructive",
        title: "On-device storage is full",
        description:
          "New logos won't be saved across reloads. Download anything you want to keep, or clear your history.",
      });
      return;
    }
    // Any other persistence failure (private mode, blocked IndexedDB, a missing
    // record): warn once so a logo / favorite / rename silently vanishing on
    // reload isn't a mystery.
    if (persistWarnedRef.current) return;
    persistWarnedRef.current = true;
    toast({
      variant: "destructive",
      title: "Couldn't save to this device",
      description:
        "Your logos may not survive a reload here. Download anything you want to keep.",
    });
  }

  function handleApiKeySave(key: string) {
    setUserAPIKey(key);
    if (!safeSetLocal("userAPIKey", key)) {
      toast({
        variant: "destructive",
        title: "Couldn't save your key",
        description:
          "Browser storage is blocked (private mode?). It'll work this session but won't persist.",
      });
    }
    // If they were trying to make a brand kit, continue into it now.
    if (key.trim() && pendingBrandKitGen) {
      brandKit.start(pendingBrandKitGen, key);
      setPendingBrandKitGen(null);
    }
  }

  // Building a NEW kit needs the user's own key; re-opening a kit they've
  // already saved is free (no AI calls), so it skips the key gate entirely.
  function handleCreateBrandKit(gen: Generation) {
    // Open the next modal FIRST, then close the lightbox a beat later, once
    // the new modal's backdrop has covered the screen. Closing it in the same
    // tick cross-fades the two dialog overlays, and their combined opacity dips
    // mid-transition, flashing the gallery through. Behind the new overlay the
    // lightbox close is invisible, so the swap reads as one smooth step.
    if (brandKit.savedKitIds.has(gen.id) || userAPIKey.trim()) {
      brandKit.start(gen);
    } else if (auth.enabled && !auth.isSignedIn) {
      // Keys are an account feature: signing in comes first.
      setWelcomeOpen(true);
    } else {
      setPendingBrandKitGen(gen);
      setApiKeyOpen(true);
    }
    window.setTimeout(() => setActiveGen(null), 220);
  }

  // One logo. On success it pops into the gallery (and on-device history) the
  // moment it lands; returns a result the batch uses for credit/error handling
  // (including the new Generation, so Redo can follow it in the lightbox).
  async function generateOne(
    params: GenParams,
  ): Promise<{
    ok: boolean;
    error?: string;
    gen?: Generation;
    remaining?: number;
  }> {
    try {
      const res = await fetch("/api/generate-logo", {
        method: "POST",
        body: JSON.stringify({ userAPIKey, ...params }),
      });
      if (res.ok) {
        const json = await res.json();
        const id = newId();
        // Decode once to a Blob and keep a small object URL in state, not the
        // multi-MB base64 string (which would sit on the JS heap all session).
        const blob = await (
          await fetch(`data:image/png;base64,${json.b64_json}`)
        ).blob();
        const image = URL.createObjectURL(blob);
        const createdAt = Date.now();
        const next: Generation = {
          id,
          image,
          companyName: params.companyName,
          params,
          createdAt,
        };
        setGenerations((prev) => [next, ...prev]);
        // Each successful image costs one credit (charged on landing, so a
        // failed variation never burns one). Account-less mode charges the
        // local counter; with auth on the server ledger already spent it and
        // reports the fresh balance on the response.
        if (!hasOwnKey && !auth.enabled) adjustCredits(-1);
        const savePromise = saveLogo({
          id,
          companyName: params.companyName,
          params,
          createdAt,
          blob,
        }).catch(onPersistError);
        savePromises.current.set(id, savePromise);
        return {
          ok: true,
          gen: next,
          remaining:
            typeof json.remaining === "number" ? json.remaining : undefined,
        };
      }
      const text = res.headers.get("Content-Type")?.includes("text/plain")
        ? await res.text()
        : genErrorMessage(res.status);
      return { ok: false, error: text };
    } catch {
      return {
        ok: false,
        error: "Network error. Check your connection and try again.",
      };
    }
  }

  // A "run": fire N parallel generations (a set of variations). Each
  // successful logo costs 1 free credit, so a free run is capped at the
  // balance. Returns the per-generation results so callers like Redo can
  // follow the new logo.
  async function runBatch(
    params: GenParams,
    n: number,
  ): Promise<{ ok: boolean; error?: string; gen?: Generation }[] | undefined> {
    if (runningRef.current) return;
    if (!hasOwnKey && effectiveCredits <= 0) {
      // Signed out with auth configured → the free credits live behind
      // sign-in, so lead there; otherwise the answer is a key.
      if (auth.enabled && !auth.isSignedIn) setWelcomeOpen(true);
      else setApiKeyOpen(true);
      return;
    }
    // Free runs can't outspend the wallet: trim the set to the credits left
    // instead of letting the server bounce the overflow as errors.
    if (!hasOwnKey && n > effectiveCredits) {
      n = Math.max(1, effectiveCredits);
      toast({
        title: `Making ${n} ${n === 1 ? "logo" : "logos"} this run`,
        description:
          "That's what your free credits cover. Add your own key for full sets.",
      });
    }
    runningRef.current = true;
    try {
      setPendingCount(n);
      setLiveMessage(n > 1 ? `Generating ${n} logos…` : "Generating a logo…");

      // On the single-column phone layout the gallery sits below the controls,
      // so a generation kicked off from the form would render off-screen with
      // no visible feedback. Bring the skeletons into view. Desktop's two-pane
      // layout always shows the gallery; a lightbox Redo stays in the modal.
      if (
        !activeGen &&
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 767px)").matches
      ) {
        requestAnimationFrame(() => {
          galleryRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }

      // "Surprise me" resolves to a concrete random style PER variation (each
      // of the 4 gets a different style, not 4 logos of one random style).
      // Every generation stores its own resolved params, so Redo/Vary on a
      // result reproduces that result's actual style.
      const isSurprise = params.selectedStyle === SURPRISE_STYLE;
      const stylePool = isSurprise ? shuffledStyleNames() : [];
      const paramsFor = (i: number): GenParams =>
        isSurprise
          ? { ...params, selectedStyle: stylePool[i % stylePool.length] }
          : params;

      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          (async () => {
            // Stagger the burst: the Gemini image model rate-limits on short
            // windows, so simultaneous variation requests can 429. A few
            // hundred ms between starts is invisible next to a ~12s render
            // and keeps a full set from tripping it.
            if (i) await new Promise((r) => setTimeout(r, i * 400));
            return generateOne(paramsFor(i));
          })().finally(() => setPendingCount((c) => Math.max(0, c - 1))),
        ),
      );
      // Safety net: the run is over, so no skeleton can be left stuck.
      setPendingCount(0);

      const oks = results.filter((r) => r.ok).length;
      setLiveMessage(
        oks === 0
          ? "Generation failed."
          : `${oks} ${oks === 1 ? "logo" : "logos"} ready.`,
      );
      if (oks === 0) {
        // Nothing was charged (we only charge on a successful logo), so no
        // refund needed.
        toast({
          variant: "destructive",
          title: "Couldn't generate",
          description:
            results.find((r) => r.error)?.error ?? "Please try again.",
        });
      } else if (oks < n) {
        toast({
          title: `Generated ${oks} of ${n}`,
          description: "Some variations didn't come through. Vary for more.",
        });
      }
      // With auth on, each response carried the ledger balance after its own
      // spend; the minimum is the final state (parallel responses land out of
      // order). Failed variations were refunded server-side, so reconcile
      // with a fresh read whenever anything failed.
      if (auth.enabled && auth.isSignedIn && !hasOwnKey) {
        const reported = results
          .map((r) => r.remaining)
          .filter((v): v is number => typeof v === "number");
        if (reported.length) auth.noteRemaining(Math.min(...reported));
        if (oks < n || !reported.length) void auth.refresh();
      }
      return results;
    } finally {
      runningRef.current = false;
    }
  }

  // Redo from the lightbox: regenerate with the same settings while the modal
  // stays open (matching how an edit behaves), then follow the fresh result if
  // the user is still looking at the logo they redid.
  async function redoInModal(gen: Generation) {
    const results = await runBatch(gen.params, 1);
    const fresh = results?.find((r) => r.ok)?.gen;
    if (fresh) {
      setActiveGen((cur) => (cur && cur.id === gen.id ? fresh : cur));
    }
  }

  // "Keep editing": image-to-image edit of an existing logo via FLUX.2-pro. The
  // result becomes a new logo (added to the gallery + history); the lightbox
  // updates in place so you can keep iterating.
  // Returns whether the edit succeeded, so the composer can keep the user's
  // typed instruction on failure (nothing more frustrating than losing it).
  async function runEdit(
    gen: Generation,
    instruction: string,
  ): Promise<boolean> {
    const text = instruction.trim();
    if (editingRef.current || !text) return false;
    if (!hasOwnKey && effectiveCredits <= 0) {
      if (auth.enabled && !auth.isSignedIn) setWelcomeOpen(true);
      else setApiKeyOpen(true);
      return false;
    }
    editingRef.current = true;
    setIsEditing(true);
    try {
      // History-restored logos are blob: object URLs the server can't fetch;
      // resolve to a data URL first (fresh data URLs pass through untouched).
      const sourceImage = await toDataUrl(gen.image);
      const json = await editWithRetry({
        userAPIKey,
        image: sourceImage,
        // A light preservation frame: without it, a vague "make it bolder" can
        // make the model redraw the whole mark, shift colors, or invent text.
        // Kept short so the user's intent stays dominant; the raw text is what
        // gets stored on the result's params.
        prompt: `${text}. Keep the same overall logo identity, colors and letterforms unless this instruction explicitly changes them. Output on a clean flat background and add no extra text.`,
        width: 1024,
        height: 1024,
      });
      const id = newId();
      // Same as generateOne: keep a Blob + object URL, not a base64 string.
      const blob = await (
        await fetch(`data:image/png;base64,${json.b64_json}`)
      ).blob();
      const image = URL.createObjectURL(blob);
      const createdAt = Date.now();
      const params: GenParams = { ...gen.params, additionalInfo: text };
      const next: Generation = {
        id,
        image,
        companyName: gen.companyName,
        params,
        createdAt,
      };
      setGenerations((prev) => [next, ...prev]);
      const savePromise = saveLogo({
        id,
        companyName: gen.companyName,
        params,
        createdAt,
        blob,
      }).catch(onPersistError);
      savePromises.current.set(id, savePromise);
      // An edit costs a credit like a generation. Account-less mode charges
      // the local counter; with auth on the server ledger spent it and the
      // response carries the fresh balance.
      if (!hasOwnKey && !auth.enabled) adjustCredits(-1);
      if (
        auth.enabled &&
        auth.isSignedIn &&
        !hasOwnKey &&
        typeof json.remaining === "number"
      ) {
        auth.noteRemaining(json.remaining);
      }
      setActiveGen(next); // keep the lightbox on the new result to iterate
      return true;
    } catch (err) {
      // A meaningful message means a non-retryable problem (e.g. invalid key);
      // anything else is a transient hiccup after retries were exhausted.
      const msg = err instanceof Error ? err.message : "";
      const meaningful = msg && !/^(status \d+|edit failed)$/.test(msg);
      toast({
        variant: "destructive",
        title: "Couldn't apply that edit",
        description: meaningful
          ? msg
          : "Together AI's image service is busy right now. Your text is still here. Give it another try. (No credit was used.)",
      });
      return false;
    } finally {
      setIsEditing(false);
      editingRef.current = false;
    }
  }

  function currentParams(): GenParams {
    return {
      companyName,
      // SURPRISE_STYLE passes through unresolved; runBatch rolls a distinct
      // random style per variation (and the lightbox shows the resolved one).
      selectedStyle,
      logoType,
      primaryColor,
      backgroundColor,
      detailLevel,
      monochrome,
      additionalInfo,
      referenceDescription: reference?.description || undefined,
    };
  }

  // "I'm feeling lucky": random style + AI-chosen color, generate immediately.
  // SURPRISE_STYLE rides through so runBatch rolls a fresh style per variation.
  function handleLucky() {
    if (runningRef.current) return;
    setSelectedStyle(SURPRISE_STYLE);
    setPrimaryColor(AUTO_COLOR);
    setActivePreset(null);
    // The form just visibly changed under the user (style → Surprise, color →
    // Auto): say so, so it doesn't read as the controls glitching.
    toast({
      title: "Feeling lucky",
      description: "Rolling surprise styles with an AI-picked color.",
    });
    runBatch(
      {
        companyName,
        logoType,
        selectedStyle: SURPRISE_STYLE,
        primaryColor: AUTO_COLOR,
        backgroundColor,
        detailLevel,
        monochrome,
        additionalInfo,
        referenceDescription: reference?.description || undefined,
      },
      variationCount,
    );
  }

  // Seed the whole form from a one-tap starter preset. Tapping the active
  // preset again toggles it off, resetting the fields it seeded back to their
  // defaults so a preset can be cleared as easily as it was applied.
  function applyPreset(p: StarterPreset) {
    if (activePreset === p.id) {
      setLogoType(LOGO_TYPES[0].key as string);
      setSelectedStyle(logoStyles[0].name);
      setPrimaryColor(AUTO_COLOR);
      setBackgroundColor(AUTO_COLOR);
      setDetailLevel("Balanced");
      setAdditionalInfo("");
      setActivePreset(null);
      return;
    }
    setLogoType(p.logoType);
    setSelectedStyle(p.style);
    setPrimaryColor(p.primaryColor);
    setBackgroundColor(p.backgroundColor);
    setDetailLevel(p.detailLevel);
    setAdditionalInfo(p.describe);
    setActivePreset(p.id);
  }

  // Pre-fill the form from an imported website / logo: set the brand color
  // (vivid theme-color, else read from their logo) and the company name, so the
  // next generation lands in their colors. No vision, no credits.
  async function handleBrandImport(r: BrandImportResult) {
    const myReq = ++importReqRef.current;
    let vivid: string[] = [];
    if (r.logoDataUrl) {
      try {
        const img = await loadImage(r.logoDataUrl);
        vivid = extractBrandPalette(img);
      } catch {
        /* couldn't decode their logo, fall back to theme-color / default */
      }
    }
    // A newer import (or another one) superseded this one, don't clobber.
    if (myReq !== importReqRef.current) return;
    const color = brandColorFromImport(r.themeColor ?? null, vivid);
    // The colors offered in the pill's picker: the chosen color first, then the
    // rest of the detected vivid colors (+ a valid theme-color), de-duplicated.
    const themeHex =
      r.themeColor && /^#[0-9a-f]{6}$/i.test(r.themeColor)
        ? r.themeColor.toUpperCase()
        : null;
    const palette = Array.from(
      new Set([color, ...vivid, themeHex].filter(Boolean) as string[]),
    ).slice(0, 6);
    const name = r.name?.trim();
    if (name) setCompanyName(name);
    setPrimaryColor(color);
    setMonochrome(false);
    setActivePreset(null);
    setImported({
      source: r.source,
      color,
      name,
      logo: r.logoDataUrl,
      palette,
    });
    toast({
      title: "Brand imported",
      description: name
        ? `${name} · matched their brand color`
        : "Matched your logo's colors",
    });
  }

  // Re-pick the brand color from the detected palette (in the import pill).
  function pickImportedColor(hex: string) {
    setPrimaryColor(hex);
    setImported((cur) => (cur ? { ...cur, color: hex } : cur));
  }

  // Update a logo in the gallery + lightbox in place (and persist metadata).
  function updateGen(id: string, patch: Partial<Generation>) {
    setGenerations((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
    setActiveGen((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
  }

  async function toggleFavorite(gen: Generation) {
    const favorite = !gen.favorite;
    updateGen(gen.id, { favorite });
    // Wait for the logo's own save to land first (a just-generated logo's record
    // may not exist yet), then persist the change and surface any failure.
    await savePromises.current.get(gen.id);
    patchLogo(gen.id, { favorite }).catch(onPersistError);
  }

  async function renameLogo(gen: Generation, name: string) {
    const trimmed = name.trim();
    updateGen(gen.id, { name: trimmed || undefined });
    await savePromises.current.get(gen.id);
    patchLogo(gen.id, { name: trimmed }).catch(onPersistError);
  }

  async function handleReferenceFile(file: File) {
    const okTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!okTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Unsupported file",
        description: "Use PNG, JPG, WebP or SVG.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Keep the reference under 5 MB.",
      });
      return;
    }

    // Token so a newer pick (or a Clear) cancels this read's late writes
    // (otherwise a slow vision response could clobber a newer/removed reference).
    const myReq = ++refReqRef.current;
    const stale = () => myReq !== refReqRef.current;
    // Snapshot the manual-pick counters: the auto-apply below only fires if
    // the user hasn't re-picked that control while we were reading.
    const styleTouchAtStart = styleTouchRef.current;
    const colorTouchAtStart = colorTouchRef.current;

    // Show the busy state IMMEDIATELY: reading + rasterizing a 5 MB file takes
    // a beat, and silence here makes people click the dropzone again.
    setRefStatus("reading");

    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(file);
    }).catch(() => "");
    if (!rawDataUrl) {
      if (!stale()) setRefStatus(reference ? "ready" : "idle");
      toast({ variant: "destructive", title: "Couldn't read that file" });
      return;
    }
    // Thumbnail appears as soon as the bytes are read, while the (slower)
    // rasterize + vision phases continue behind the spinner.
    if (stale()) return;
    setReference({
      dataUrl: rawDataUrl,
      description: "",
      styleGuess: null,
      dominantColor: "auto",
    });

    // Rasterize SVG (on white) and downscale large rasters to ≤1024px long edge.
    let dataUrl = rawDataUrl;
    try {
      const img = await loadImage(rawDataUrl);
      const w = img.naturalWidth || img.width || 1024;
      const h = img.naturalHeight || img.height || 1024;
      const isSvg = file.type === "image/svg+xml";
      const maxEdge = Math.max(w, h);
      if (isSvg || maxEdge > 1024) {
        const scale = Math.min(1024 / maxEdge, 1);
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (isSvg) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, tw, th);
          }
          ctx.drawImage(img, 0, 0, tw, th);
          dataUrl = canvas.toDataURL("image/png");
        }
      }
    } catch {
      /* keep rawDataUrl */
    }

    if (stale()) return;
    setReference({
      dataUrl,
      description: "",
      styleGuess: null,
      dominantColor: "auto",
    });

    // Reading needs serverless chat access on the Together account; it can also
    // be slow. Time it out so the spinner never hangs, and always leave the form
    // usable (the typed description is the fallback).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch("/api/read-reference", {
        method: "POST",
        body: JSON.stringify({ userAPIKey, image: dataUrl }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const msg = (res.headers.get("Content-Type") || "").includes(
          "text/plain",
        )
          ? await res.text()
          : "Couldn't read that image.";
        if (stale()) return;
        toast({
          variant: "destructive",
          title: "Couldn't read the reference",
          description: `${msg} You can describe it in the box above instead.`,
        });
        setRefStatus("error");
        return;
      }
      const json = await res.json();
      if (stale()) return;
      setReference({
        dataUrl,
        description: json.description || "",
        styleGuess: json.styleGuess ?? null,
        dominantColor: json.dominantColor || "auto",
        keywords: json.keywords,
      });
      setRefStatus("ready");

      // Auto-apply the detected style + color, UNLESS the user manually
      // re-picked that control while the read was in flight (manual wins).
      const styleUntouched = styleTouchRef.current === styleTouchAtStart;
      const colorUntouched = colorTouchRef.current === colorTouchAtStart;
      if (
        styleUntouched &&
        json.styleGuess &&
        logoStyles.some((s) => s.name === json.styleGuess)
      ) {
        setSelectedStyle(json.styleGuess);
      }
      if (
        colorUntouched &&
        json.dominantColor &&
        json.dominantColor !== "auto"
      ) {
        setPrimaryColor(json.dominantColor);
      }
      const bits = [
        styleUntouched ? json.styleGuess : null,
        colorUntouched && json.dominantColor !== "auto"
          ? json.dominantColor
          : null,
      ].filter(Boolean);
      toast({
        title: "Reference read",
        description: bits.length
          ? `Set ${bits.join(" · ")}`
          : "We'll use it as inspiration.",
      });
    } catch (err) {
      if (stale()) return;
      const aborted = err instanceof DOMException && err.name === "AbortError";
      toast({
        variant: "destructive",
        title: "Couldn't read the reference",
        description: aborted
          ? "It took too long. Describe it in the box above instead."
          : "Something went wrong. Describe it in the box above instead.",
      });
      setRefStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  function handleClearReference() {
    refReqRef.current++; // cancel any in-flight read so it can't resurrect this
    setReference(null);
    setRefStatus("idle");
  }

  // Repopulate the whole form from a saved logo's params.
  function loadIntoCreator(params: GenParams) {
    setCompanyName(params.companyName);
    setLogoType(params.logoType);
    setSelectedStyle(params.selectedStyle);
    setPrimaryColor(params.primaryColor);
    setBackgroundColor(params.backgroundColor);
    setDetailLevel(params.detailLevel);
    setMonochrome(params.monochrome);
    setAdditionalInfo(params.additionalInfo);
    // Saved params carry no reference image, so loading starts clean: a
    // leftover active reference would silently blend into the regeneration.
    handleClearReference();
    setActivePreset(null);
    if (
      params.monochrome ||
      params.detailLevel !== "Balanced" ||
      params.additionalInfo
    ) {
      setShowAdvanced(true);
    }
    setHistoryOpen(false);
  }

  function handleDeleteLogo(id: string) {
    setGenerations((prev) => {
      const gone = prev.find((g) => g.id === id);
      if (gone?.image.startsWith("blob:")) URL.revokeObjectURL(gone.image);
      return prev.filter((g) => g.id !== id);
    });
    savePromises.current.delete(id);
    deleteLogo(id).catch(onPersistError);
    // A logo's brand kit goes with it (no point keeping an orphaned kit).
    brandKit.removeKit(id);
  }

  function handleClearHistory() {
    const n = generations.length;
    generations.forEach((g) => {
      if (g.image.startsWith("blob:")) URL.revokeObjectURL(g.image);
    });
    setGenerations([]);
    clearLogos().catch(() => {});
    brandKit.clearAllKits();
    toast({
      title: "History cleared",
      description: `${n} ${n === 1 ? "logo" : "logos"} removed from this device.`,
    });
  }

  function dismissWelcome() {
    try {
      localStorage.setItem("lc_welcomed", "1");
    } catch {
      /* ignore */
    }
    setWelcomeOpen(false);
  }

  // Clerk's sign-in modal opens ON TOP of our welcome modal. The welcome is a
  // NON-modal Radix dialog (see WelcomeModal), specifically so it doesn't
  // disable pointer events outside itself: that lets the very first click land
  // on Clerk ("Continue with Google" etc.) instead of being spent dismissing
  // our dialog. The welcome simply stays open behind Clerk's backdrop; once
  // sign-in lands, this finishes the hand-off (dismiss + confirm credits). The
  // welcomeOpen guard also keeps it from firing for a visitor who loaded
  // already signed in.
  const wasSignedInRef = useRef(false);
  useEffect(() => {
    if (auth.isSignedIn && !wasSignedInRef.current && welcomeOpen) {
      dismissWelcome();
      const n = auth.remaining ?? FREE_CREDITS;
      toast({
        title: "You're in!",
        description: `${n} free ${n === 1 ? "credit" : "credits"} ready. Make something great.`,
      });
    }
    wasSignedInRef.current = auth.isSignedIn;
    // dismissWelcome is stable in practice (setState + localStorage).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isSignedIn, auth.remaining, welcomeOpen]);

  const creditCaption = hasOwnKey
    ? variationCount > 1
      ? `Using your key · ~${formatUsd(pricePerLogo(logoType) * variationCount)} / set`
      : `Using your key · ~${formatUsd(pricePerLogo(logoType))} / logo`
    : auth.enabled && !auth.isSignedIn
      ? `Sign in for ${FREE_CREDITS} free credits`
      : effectiveCredits > 0
        ? `${effectiveCredits} free ${effectiveCredits === 1 ? "credit" : "credits"} left`
        : "Out of free credits";

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveMessage}
      </div>
      <div className="app-shell min-h-[100svh] md:h-[100svh] md:overflow-hidden">
        {/* ── Header ────────────────────────────────────── */}
        <header className="area-header flex items-center justify-between gap-2 border-b border-border/60 px-5 py-4 md:border-b-0 md:border-r">
          <Logo />
          <div className="flex items-center gap-1.5">
            {/* Signed out with auth on, the header holds exactly one action:
                the sign-in CTA. History and the API key are account things,
                so they appear once inside; the theme picker lives in the
                account menu then (header version is account-less only). */}
            {(!auth.enabled || auth.isSignedIn) && (
              <>
                <Tip label="Logo history" side="bottom">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    aria-label="Logo history"
                    className="flex size-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <History className="size-[1.05rem]" />
                  </button>
                </Tip>
                <ApiKeyDialog
                  open={apiKeyOpen}
                  onOpenChange={(o) => {
                    setApiKeyOpen(o);
                    // Closing without saving abandons the "brand kit needs a
                    // key" intent; otherwise adding a key later (for any
                    // reason) would surprise-launch a kit for that stale logo.
                    if (!o) setPendingBrandKitGen(null);
                  }}
                  apiKey={userAPIKey}
                  onSave={handleApiKeySave}
                  credits={effectiveCredits}
                />
              </>
            )}
            {!auth.enabled && <ThemeToggle />}
            <AuthControls
              hasOwnKey={hasOwnKey}
              onManageKey={() => setApiKeyOpen(true)}
            />
          </div>
        </header>

        {/* ── Controls ──────────────────────────────────── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runBatch(currentParams(), variationCount);
          }}
          aria-label="Logo settings"
          className="area-controls flex min-h-0 flex-col border-border md:overflow-hidden md:border-r"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-3">
            <BrandNameField
              companyName={companyName}
              onCompanyNameChange={setCompanyName}
              onResult={handleBrandImport}
              imported={imported}
              onClear={() => {
                importReqRef.current++; // cancel any in-flight import
                setImported(null);
              }}
              onPickColor={pickImportedColor}
              disabled={isGenerating}
            />

            <div>
              <span className="label-eyebrow mb-2 block">Quick start</span>
              <div
                role="group"
                aria-label="Quick start presets"
                className="scroll-fade-x -mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 pr-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {STARTER_PRESETS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      aria-pressed={activePreset === p.id}
                      title={`${p.label}: ${p.style} style (seeds the whole form)`}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        activePreset === p.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      <Icon aria-hidden className="size-3.5 shrink-0" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="label-eyebrow mb-2 block">
                Describe it
                <span className="ml-1 lowercase tracking-normal text-muted-foreground">
                  (optional)
                </span>
              </span>
              <Textarea
                value={additionalInfo}
                onChange={(e) => {
                  setAdditionalInfo(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="A fox, friendly and modern, with a subtle leaf…"
              />
              {additionalInfo.trim() === "" && (
                <div
                  role="group"
                  aria-label="Description suggestions"
                  className="scroll-fade-x -mx-1 mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 pr-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {DESCRIBE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAdditionalInfo(s)}
                      title={s}
                      className="shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1.5 text-[0.7rem] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card sm:py-1"
                    >
                      {s.length > 24 ? s.slice(0, 22) + "…" : s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {reference && refStatus === "ready" && (
              <div className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs">
                <Sparkles className="size-3 text-primary" />
                <span className="text-muted-foreground">
                  Inspired by reference
                </span>
                {reference.styleGuess && (
                  <span className="font-medium text-foreground">
                    · {reference.styleGuess}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleClearReference}
                  aria-label="Remove reference"
                  className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}

            <div>
              <span className="label-eyebrow mb-2 block">Logo type</span>
              <LogoTypeSelect
                value={logoType}
                onChange={(v) => {
                  setLogoType(v);
                  setActivePreset(null);
                }}
              />
            </div>

            <div>
              <span className="label-eyebrow mb-2.5 block">Style</span>
              <StylePicker
                styles={logoStyles}
                value={selectedStyle}
                onChange={(v) => {
                  styleTouchRef.current++;
                  setSelectedStyle(v);
                  setActivePreset(null);
                }}
              />
            </div>

            <div>
              <div className="flex flex-wrap gap-x-10 gap-y-5">
                <ColorSwatches
                  label="Brand color"
                  presets={primaryColors}
                  value={primaryColor}
                  onChange={(v) => {
                    colorTouchRef.current++;
                    setPrimaryColor(v);
                    setActivePreset(null);
                  }}
                />
                <ColorSwatches
                  label="Background"
                  presets={backgroundColors}
                  value={backgroundColor}
                  onChange={(v) => {
                    setBackgroundColor(v);
                    setActivePreset(null);
                  }}
                />
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                {primaryColor === AUTO_COLOR ||
                backgroundColor === AUTO_COLOR ? (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 shrink-0 text-primary" />
                    AI will pick a fitting color. Regenerate for different
                    looks.
                  </span>
                ) : contrastRatio(primaryColor, backgroundColor) < 1.6 ? (
                  <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Low contrast: your logo may be hard to see on this
                    background.
                  </span>
                ) : (
                  "Colors your icon and name together."
                )}
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="label-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
                aria-expanded={showAdvanced}
              >
                <ChevronRight
                  className={cn(
                    "size-3 transition-transform duration-200",
                    showAdvanced && "rotate-90",
                  )}
                />
                Advanced
                <span className="ml-1 lowercase tracking-normal text-muted-foreground">
                  (optional)
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4">
                  <div>
                    <span className="label-eyebrow mb-2 block">Detail</span>
                    <Segmented
                      options={detailLevels}
                      value={detailLevel}
                      onChange={setDetailLevel}
                      ariaLabel="Detail level"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      id="monochrome-label"
                      onClick={() => setMonochrome((v) => !v)}
                      className="label-eyebrow cursor-pointer select-none"
                    >
                      Monochrome
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={monochrome}
                      aria-labelledby="monochrome-label"
                      onClick={() => setMonochrome((v) => !v)}
                      className={cn(
                        "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        monochrome ? "bg-primary" : "bg-input",
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out",
                          monochrome ? "left-[1.125rem]" : "left-0.5",
                        )}
                      />
                    </button>
                  </div>

                  <div>
                    <span className="label-eyebrow mb-2 block">
                      Reference logo
                    </span>
                    <ReferenceUpload
                      value={reference}
                      status={refStatus}
                      onFile={handleReferenceFile}
                      onClear={handleClearReference}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* On the single-column phone layout this action bar sticks to the
                bottom of the viewport, so Generate stays one thumb-tap away no
                matter how far the user has scrolled into the controls. Desktop
                keeps it as the static bottom of the sidebar. */}
          <div className="sticky bottom-0 z-30 space-y-2.5 border-t border-border bg-background/95 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm md:static md:z-auto md:space-y-3 md:bg-transparent md:pb-4 md:pt-4 md:backdrop-blur-none">
            <div className="flex items-center justify-between gap-3">
              <span className="label-eyebrow">Variations</span>
              <div className="w-28 md:w-[7rem]">
                <Segmented
                  options={["1", "2", "4"]}
                  value={String(variationCount)}
                  onChange={(v) => setVariationCount(Number(v))}
                  ariaLabel="Number of variations"
                  compact
                />
              </div>
            </div>
            <div className="flex items-stretch gap-2">
              <Tip label="Feeling lucky" side="top">
                <button
                  type="button"
                  onClick={handleLucky}
                  disabled={isGenerating}
                  aria-label="Feeling lucky: random style and AI-picked color"
                  className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50"
                >
                  <Dices className="size-5" />
                </button>
              </Tip>
              <Button
                type="submit"
                size="lg"
                disabled={isGenerating}
                className="flex-1 rounded-xl text-[0.95rem] font-bold"
              >
                {isGenerating ? (
                  <span className="spinner-ring size-4" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isGenerating
                  ? "Generating…"
                  : !hasOwnKey && effectiveCredits <= 0
                    ? auth.enabled && !auth.isSignedIn
                      ? "Sign in to generate"
                      : "Add a key to generate"
                    : variationCount > 1
                      ? `Generate ${variationCount} logos`
                      : "Generate logo"}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {auth.enabled && !auth.isSignedIn && !hasOwnKey ? (
                // The invitation is the action: tapping it opens sign-in.
                <button
                  type="button"
                  onClick={auth.openSignIn}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                >
                  {creditCaption}
                </button>
              ) : (
                <span
                  className={cn(
                    // Amber = genuinely out of credits, a real warning tone.
                    !hasOwnKey &&
                      effectiveCredits <= 0 &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {creditCaption}
                </span>
              )}
              {/* BYOK is signed-in-only when auth is on, so the side link
                  hides for visitors: their one path is signing in. */}
              {!hasOwnKey && (!auth.enabled || auth.isSignedIn) && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setApiKeyOpen(true)}
                    className="font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                  >
                    {effectiveCredits <= 0 ? "Add your key" : "Use your key"}
                  </button>
                </>
              )}
            </p>
          </div>
        </form>

        {/* ── Footer (bottom of the generation column) ──── */}
        <footer className="area-footer flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          <TogetherCredit />
          <div className="flex items-center gap-1.5">
            <Tip label="What's this?">
              <button
                type="button"
                onClick={() => setWelcomeOpen(true)}
                aria-label="What's this?"
                className={socialLink}
              >
                <HelpCircle className="size-3.5" />
              </button>
            </Tip>
            <Tip label="GitHub">
              <a
                href="https://github.com/Nutlope/logocreator"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className={socialLink}
              >
                <Github className="size-3.5" />
              </a>
            </Tip>
            <Tip label="X (Twitter)">
              <a
                href="https://x.com/nutlope"
                target="_blank"
                rel="noreferrer"
                aria-label="X (Twitter)"
                className={socialLink}
              >
                <XLogo className="size-3" />
              </a>
            </Tip>
          </div>
        </footer>

        {/* ── Gallery ───────────────────────────────────── */}
        <main
          ref={galleryRef}
          className="area-gallery relative min-h-0 border-b border-border/60 md:overflow-y-auto md:border-b-0"
        >
          {/* Orientation cue for the phone layout, where scrolling (or the
              generate auto-scroll) lands here without the desktop pane split. */}
          {(generations.length > 0 || pendingCount > 0) && (
            <h2 className="label-eyebrow px-5 pt-4 md:hidden">
              Your logos
              {generations.length > 0 ? ` (${generations.length})` : ""}
            </h2>
          )}
          <Gallery
            generations={generations}
            pendingCount={pendingCount}
            savedKitIds={brandKit.savedKitIds}
            onVary={(gen) => runBatch(gen.params, variationCount)}
            onOpen={(gen) => setActiveGen(gen)}
            onCreateBrandKit={handleCreateBrandKit}
            onToggleFavorite={toggleFavorite}
          />
        </main>
      </div>

      <GenerationModal
        gen={activeGen}
        editing={isEditing}
        busy={isGenerating}
        hasOwnKey={hasOwnKey}
        credits={effectiveCredits}
        hasKit={!!activeGen && brandKit.savedKitIds.has(activeGen.id)}
        onClose={() => setActiveGen(null)}
        onRegenerate={redoInModal}
        onCreateBrandKit={handleCreateBrandKit}
        onEdit={runEdit}
        onToggleFavorite={toggleFavorite}
        onRename={renameLogo}
      />
      <BrandKitModal
        open={brandKit.open && !!brandKit.gen}
        gen={brandKit.gen}
        items={brandKit.items}
        palette={brandKit.palette}
        previews={brandKit.previews}
        prepareError={brandKit.prepareError}
        restoring={brandKit.restoring}
        saved={brandKit.saved}
        phase={brandKit.phase}
        doneCount={brandKit.doneCount}
        total={brandKit.total}
        zipping={brandKit.zipping}
        guiding={brandKit.guiding}
        onMinimize={brandKit.minimize}
        onDiscard={brandKit.discard}
        onRebuild={brandKit.rebuild}
        onRemoveKit={() => brandKit.gen && brandKit.removeKit(brandKit.gen.id)}
        onDownloadAll={brandKit.downloadAll}
        onDownloadGuide={brandKit.downloadGuide}
        onBuild={brandKit.build}
        onRetry={brandKit.retry}
      />
      <BrandKitDock
        gen={brandKit.gen}
        visible={
          !!brandKit.gen && !brandKit.open && brandKit.phase !== "configure"
        }
        phase={brandKit.phase}
        doneCount={brandKit.doneCount}
        total={brandKit.total}
        onOpen={brandKit.show}
        onDiscard={brandKit.discard}
      />
      <HistoryDashboard
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        generations={generations}
        savedKitIds={brandKit.savedKitIds}
        onOpen={(gen) => {
          setHistoryOpen(false);
          setActiveGen(gen);
        }}
        onCreateBrandKit={(gen) => {
          setHistoryOpen(false);
          handleCreateBrandKit(gen);
        }}
        onLoad={loadIntoCreator}
        onDelete={handleDeleteLogo}
        onClear={handleClearHistory}
        onToggleFavorite={toggleFavorite}
      />
      <WelcomeModal
        open={welcomeOpen}
        onOpenChange={(o) => {
          if (!o) dismissWelcome();
        }}
        apiKey={userAPIKey}
        onSave={handleApiKeySave}
        onStart={dismissWelcome}
        freeCredits={FREE_CREDITS}
        needsSignIn={auth.enabled && !auth.isSignedIn}
        signedIn={auth.enabled && auth.isSignedIn}
        onSignIn={auth.openSignIn}
      />
    </MotionConfig>
  );
}
