"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AssetSpec,
  aiAssetSpecs,
  categoryPreviews,
  deterministicAssetSpecs,
  downloadBlob,
  isLightInkLogo,
  kitPalette,
  loadImage,
  makeTransparent,
  paletteFiles,
  pickBrandColor,
  readme,
  slugify,
  toDataUrl,
  transparentFraction,
  zipFiles,
} from "@/app/lib/brand-kit";
import { logoToSvgBlob } from "@/app/lib/svg-export";
import { buildStyleGuide } from "@/app/lib/style-guide";
import {
  type KitAsset,
  clearKits,
  deleteKit,
  getKit,
  getKitIds,
  saveKit,
} from "@/app/lib/history-db";
import { toast } from "@/hooks/use-toast";
import type { Generation } from "@/app/components/Gallery";

export type BrandKitStatus = "pending" | "building" | "done" | "error";
export type BrandKitItem = {
  group: string;
  name: string;
  filename: string;
  status: BrandKitStatus;
  url?: string;
  /** Built + zipped but not shown as a tile. */
  hidden?: boolean;
  /** A metered AI render (the modal derives costs and counts from this). */
  ai?: boolean;
};

export type BrandKitPhase = "configure" | "building" | "done";

// How many AI (image-edit) renders run at once.
const AI_CONCURRENCY = 4;

export type BrandKitController = {
  gen: Generation | null;
  open: boolean;
  items: BrandKitItem[];
  palette: string[];
  previews: Record<string, string>;
  phase: BrandKitPhase;
  /** prepare() failed (decode/fetch); the configure step shows an error + retry. */
  prepareError: boolean;
  /** Reading a saved kit back from on-device storage (brief). */
  restoring: boolean;
  /** True once the kit on screen has been saved against its logo. */
  saved: boolean;
  /** Logo ids that have a saved kit, so the UI can flip "Create" → "Open". */
  savedKitIds: Set<string>;
  doneCount: number;
  total: number;
  zipping: boolean;
  guiding: boolean;
  /** Open a kit: restores a saved one instantly, else opens the configure step. */
  start: (gen: Generation, apiKeyOverride?: string) => void;
  /** Build only the chosen categories (the rest are dropped). */
  build: (selectedGroups: string[]) => void;
  /** Re-run prepare() for the current logo after a prepare failure. */
  retry: () => void;
  /** Throw away the saved kit and return to the configure step to rebuild it. */
  rebuild: () => void;
  show: () => void;
  minimize: () => void;
  discard: () => void;
  /** Delete a logo's saved kit (called when its logo is removed, or on request). */
  removeKit: (logoId: string) => void;
  /** Forget every saved kit (called when history is cleared). */
  clearAllKits: () => void;
  downloadAll: () => Promise<void>;
  /** Download just the brand-guidelines PDF (without zipping the whole kit). */
  downloadGuide: () => Promise<void>;
};

/**
 * The brand-kit engine, lifted out of the modal so the build survives closing
 * the modal. Opening a kit prepares the asset list + previews (free, instant)
 * and shows a category selector; only the categories the user confirms are
 * actually built, so the paid AI renders never run without consent.
 */
export function useBrandKit(apiKey: string): BrandKitController {
  const [gen, setGen] = useState<Generation | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BrandKitItem[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<BrandKitPhase>("configure");
  const [prepareError, setPrepareError] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedKitIds, setSavedKitIdsState] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [guiding, setGuiding] = useState(false);

  const blobs = useRef<Map<string, Blob>>(new Map());
  const urls = useRef<string[]>([]);
  const tokenRef = useRef(0); // bumping this cancels the running build
  const genRef = useRef<Generation | null>(null);
  const paletteRef = useRef<string[]>([]);
  const specsRef = useRef<AssetSpec[]>([]); // all candidate specs (pre-selection)
  // Mirror of savedKitIds for synchronous reads inside callbacks (no stale closure).
  const savedKitIdsRef = useRef<Set<string>>(new Set());
  const applyKitIds = useCallback((next: Set<string>) => {
    savedKitIdsRef.current = next;
    setSavedKitIdsState(next);
  }, []);

  // Which logos already have a saved kit (ids only, no blobs loaded).
  useEffect(() => {
    getKitIds()
      .then((ids) => applyKitIds(new Set(ids)))
      .catch(() => {});
  }, [applyKitIds]);

  const cleanup = useCallback(() => {
    tokenRef.current++;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    blobs.current = new Map();
  }, []);

  // Close + drop the IN-MEMORY kit. A finished kit stays saved on its logo, so
  // this never loses built work; it just clears the live view.
  const discard = useCallback(() => {
    cleanup();
    genRef.current = null;
    paletteRef.current = [];
    specsRef.current = [];
    setGen(null);
    setOpen(false);
    setItems([]);
    setPalette([]);
    setPreviews({});
    setPhase("configure");
    setPrepareError(false);
    setRestoring(false);
    setSaved(false);
  }, [cleanup]);

  // Compute the full candidate asset list + palette + previews, WITHOUT building
  // anything. Lands on the "configure" step for the user to choose categories.
  const prepare = useCallback(async (g: Generation, key: string) => {
    const token = tokenRef.current;
    const alive = () => token === tokenRef.current;
    setPrepareError(false);
    try {
      // History-restored logos are blob: object URLs the server can't fetch;
      // resolve once to a data URL for all server-bound AI assets.
      const dataUrl = await toDataUrl(g.image);
      if (!alive()) return;
      const img = await loadImage(dataUrl);
      if (!alive()) return;
      // Let the just-opened configure modal paint and finish its enter
      // animation before the heavy synchronous canvas work below (background
      // removal + previews); otherwise it blocks the main thread mid-transition
      // and the modal opens with a visible stutter.
      await new Promise<void>((r) => setTimeout(r, 0));
      if (!alive()) return;
      const transparent = makeTransparent(img);
      const pal = kitPalette(img);
      paletteRef.current = pal;
      setPalette(pal);

      const brandColor = pickBrandColor(g.params.primaryColor, pal);
      const det = deterministicAssetSpecs(img, transparent, {
        logoType: g.params.logoType,
        companyName: g.companyName,
        brandColor,
        palette: pal,
      });
      // Trace the cutout when there is one: the SVG then ships with a truly
      // transparent background and real counter holes (background keyed out
      // of the trace), instead of a baked backdrop rectangle.
      const svgFromCutout = transparentFraction(transparent) > 0.06;
      det.push({
        group: "Logo variants",
        // Honest label: this is an on-device auto-trace of the raster, not a
        // hand-drawn vector (good for scaling, not designer-grade paths).
        name: "SVG (auto-traced)",
        filename: "variants/logo.svg",
        build: () =>
          svgFromCutout
            ? logoToSvgBlob(transparent.toDataURL("image/png"), {
                keyOut: true,
              })
            : logoToSvgBlob(dataUrl),
      });
      // Light logos need dark surfaces in the AI product shots too, or a white
      // logo prints invisibly on a white card / white wall.
      const ai = aiAssetSpecs(key, dataUrl, isLightInkLogo(transparent));
      const specs = [...det, ...ai];
      specsRef.current = specs;
      if (!alive()) return;
      setItems(
        specs.map((s) => ({
          ...s,
          status: "pending" as BrandKitStatus,
          hidden: s.hidden,
          ai: s.ai,
        })),
      );
      // Previews are the heaviest step (they render preview canvases, including
      // a composited mockup scene). Defer them one more frame so the category
      // cards render first and the previews fill in just after, instead of
      // janking the open.
      await new Promise<void>((r) => setTimeout(r, 0));
      if (!alive()) return;
      // Async: the merch preview loads its plate photo before compositing.
      const previews = await categoryPreviews(img, transparent, {
        logoType: g.params.logoType,
        companyName: g.companyName,
        brandColor,
      });
      if (!alive()) return;
      setPreviews(previews);
    } catch {
      // toDataUrl / loadImage / decode failure: surface it instead of leaving
      // the configure spinner hanging forever, and let the user retry.
      if (alive()) {
        setPrepareError(true);
        toast({
          variant: "destructive",
          title: "Couldn't prepare this logo's assets",
          description: "Try again, or close and reopen the brand kit.",
        });
      }
    }
  }, []);

  const build = useCallback(
    async (selectedGroups: string[]) => {
      const token = tokenRef.current;
      const alive = () => token === tokenRef.current;
      const sel = new Set(selectedGroups);
      const specs = specsRef.current.filter((s) => sel.has(s.group));
      if (!specs.length) return;

      // Narrow the kit to the chosen categories, then build.
      setItems(
        specs.map((s) => ({
          ...s,
          status: "pending" as BrandKitStatus,
          hidden: s.hidden,
          ai: s.ai,
        })),
      );
      setPhase("building");

      const set = (filename: string, patch: Partial<BrandKitItem>) => {
        if (!alive()) return;
        setItems((prev) =>
          prev.map((it) =>
            it.filename === filename ? { ...it, ...patch } : it,
          ),
        );
      };
      const store = (spec: AssetSpec, blob: Blob) => {
        blobs.current.set(spec.filename, blob);
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        set(spec.filename, { status: "done", url });
      };
      const buildOne = async (spec: AssetSpec) => {
        if (!alive()) return;
        set(spec.filename, { status: "building" });
        try {
          const blob = await spec.build();
          if (!alive()) return;
          store(spec, blob);
        } catch {
          if (!alive()) return;
          set(spec.filename, { status: "error" });
        }
      };

      // Deterministic canvas assets first (instant), then AI with concurrency.
      const det = specs.filter((s) => !s.ai);
      const ai = specs.filter((s) => s.ai);
      for (const spec of det) {
        if (!alive()) return;
        await buildOne(spec);
      }
      let idx = 0;
      const worker = async () => {
        while (alive()) {
          const i = idx++;
          if (i >= ai.length) return;
          await buildOne(ai[i]);
        }
      };
      await Promise.all(Array.from({ length: AI_CONCURRENCY }, () => worker()));

      if (!alive()) return;
      setPhase("done");

      // Save the finished kit against its logo so re-opening restores it instantly
      // instead of rebuilding (which would re-spend on the paid AI assets). Only
      // the assets that actually built are stored; quota failures are non-fatal.
      const g = genRef.current;
      if (g && blobs.current.size > 0) {
        const files: KitAsset[] = specs
          .filter((s) => blobs.current.has(s.filename))
          .map((s) => ({
            path: s.filename,
            group: s.group,
            name: s.name,
            hidden: !!s.hidden,
            ai: !!s.ai,
            blob: blobs.current.get(s.filename)!,
          }));
        const aiCount = files.filter((f) => f.ai).length;
        saveKit({
          logoId: g.id,
          companyName: g.companyName,
          createdAt: Date.now(),
          palette: paletteRef.current,
          aiCount,
          files,
        })
          .then(() => {
            if (genRef.current?.id === g.id) setSaved(true);
            applyKitIds(new Set(savedKitIdsRef.current).add(g.id));
          })
          .catch(() => {
            /* out of storage: the kit still works this session, just not saved */
          });
      }
    },
    [applyKitIds],
  );

  // Bring a previously-saved kit back from on-device storage, straight to its
  // "done" view (every tile + the zip / style-guide downloads work again),
  // without re-running any builders or AI calls.
  const restore = useCallback(
    async (g: Generation) => {
      cleanup(); // revoke any prior live urls, bump the token, reset blobs
      genRef.current = g;
      specsRef.current = [];
      setGen(g);
      setItems([]);
      setPalette([]);
      setPreviews({});
      setPrepareError(false);
      setSaved(true);
      setRestoring(true);
      setPhase("done");
      setOpen(true);
      const token = tokenRef.current;
      try {
        const rec = await getKit(g.id);
        // A newer start()/discard() ran while we were reading: abandon.
        if (token !== tokenRef.current) return;
        if (!rec) {
          // The id was in the index but the record is gone (evicted/cleared):
          // fall back to a fresh build rather than showing an empty kit.
          const next = new Set(savedKitIdsRef.current);
          next.delete(g.id);
          applyKitIds(next);
          setRestoring(false);
          startFresh(g, apiKey);
          return;
        }
        paletteRef.current = rec.palette;
        setPalette(rec.palette);
        const restored: BrandKitItem[] = rec.files.map((f) => {
          const url = URL.createObjectURL(f.blob);
          urls.current.push(url);
          blobs.current.set(f.path, f.blob);
          return {
            group: f.group,
            name: f.name,
            filename: f.path,
            hidden: f.hidden,
            ai: f.ai,
            status: "done" as BrandKitStatus,
            url,
          };
        });
        if (token !== tokenRef.current) return;
        setItems(restored);
        setRestoring(false);
      } catch {
        if (token !== tokenRef.current) return;
        setRestoring(false);
        toast({
          variant: "destructive",
          title: "Couldn't open the saved kit",
          description: "Try rebuilding it.",
        });
      }
    },
    // startFresh is declared below; it is stable (its own deps), so referencing
    // it here is safe at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiKey, cleanup, applyKitIds],
  );

  // Open a kit to its configure step and compute its candidate assets/previews.
  const startFresh = useCallback(
    (g: Generation, key: string) => {
      cleanup();
      genRef.current = g;
      paletteRef.current = [];
      specsRef.current = [];
      setGen(g);
      setItems([]);
      setPalette([]);
      setPreviews({});
      setSaved(false);
      setRestoring(false);
      setPhase("configure");
      setOpen(true);
      prepare(g, key);
    },
    [cleanup, prepare],
  );

  const start = useCallback(
    (g: Generation, apiKeyOverride?: string) => {
      // Same logo → just re-open (keep whatever phase it's in).
      if (genRef.current?.id === g.id) {
        setOpen(true);
        return;
      }
      // Has a saved kit → restore it (free, instant). Else build fresh.
      if (savedKitIdsRef.current.has(g.id)) {
        restore(g);
        return;
      }
      startFresh(g, apiKeyOverride ?? apiKey);
    },
    [apiKey, restore, startFresh],
  );

  // Discard the saved kit and go back to the configure step to build a new one.
  const rebuild = useCallback(() => {
    const g = genRef.current;
    if (!g) return;
    startFresh(g, apiKey);
  }, [apiKey, startFresh]);

  const downloadAll = useCallback(async () => {
    const g = genRef.current;
    if (!g || zipping) return;
    // Don't hand back a "brand kit" that is only the palette + README because
    // every asset failed (e.g. a bad key knocked out the AI renders and the
    // canvas work errored).
    if (blobs.current.size === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to download yet",
        description:
          "No assets were built. Check your API key or connection and try again.",
      });
      return;
    }
    setZipping(true);
    try {
      const files: { path: string; data: Blob | string }[] = [];
      blobs.current.forEach((data, path) => files.push({ path, data }));
      const pal = paletteRef.current;
      const { css, json } = paletteFiles(pal);
      files.push({ path: "brand-colors.css", data: css });
      files.push({ path: "brand-colors.json", data: json });
      files.push({ path: "README.txt", data: readme(g.companyName, pal) });
      // A printable brand-guidelines PDF, built from the assets already in hand.
      // Best-effort: a PDF failure must never block the rest of the kit.
      try {
        files.push({
          path: "style-guide.pdf",
          data: await buildStyleGuide(g, pal, blobs.current),
        });
      } catch {
        /* skip the guide; ship the rest of the kit */
      }
      const blob = await zipFiles(files);
      downloadBlob(blob, `${slugify(g.companyName)}-brand-kit.zip`);
      toast({
        title: "Brand kit downloaded",
        description: `${files.length} files zipped.`,
      });
    } catch {
      toast({ variant: "destructive", title: "Couldn't build the zip" });
    } finally {
      setZipping(false);
    }
  }, [zipping]);

  const downloadGuide = useCallback(async () => {
    const g = genRef.current;
    if (!g || guiding) return;
    setGuiding(true);
    try {
      const blob = await buildStyleGuide(g, paletteRef.current, blobs.current);
      downloadBlob(blob, `${slugify(g.companyName)}-style-guide.pdf`);
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't build the style guide",
      });
    } finally {
      setGuiding(false);
    }
  }, [guiding]);

  const retry = useCallback(() => {
    const g = genRef.current;
    if (g) prepare(g, apiKey);
  }, [apiKey, prepare]);

  // Forget a logo's saved kit (e.g. its logo was deleted). Closes the live view
  // if it's the one on screen.
  const removeKit = useCallback(
    (logoId: string) => {
      deleteKit(logoId).catch(() => {});
      const next = new Set(savedKitIdsRef.current);
      if (next.delete(logoId)) applyKitIds(next);
      if (genRef.current?.id === logoId) discard();
    },
    [applyKitIds, discard],
  );

  const clearAllKits = useCallback(() => {
    clearKits().catch(() => {});
    applyKitIds(new Set());
    if (genRef.current) discard();
  }, [applyKitIds, discard]);

  const show = useCallback(() => setOpen(true), []);
  const minimize = useCallback(() => setOpen(false), []);

  return {
    gen,
    open,
    items,
    palette,
    previews,
    phase,
    prepareError,
    restoring,
    saved,
    savedKitIds,
    // Hidden items (favicon size variants) still build + zip, but aren't shown
    // or counted, so the progress matches the visible tiles.
    doneCount: items.filter((i) => !i.hidden && i.status === "done").length,
    total: items.filter((i) => !i.hidden).length,
    zipping,
    guiding,
    start,
    build,
    retry,
    rebuild,
    show,
    minimize,
    discard,
    removeKit,
    clearAllKits,
    downloadAll,
    downloadGuide,
  };
}
