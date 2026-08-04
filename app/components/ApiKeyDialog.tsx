"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Tip } from "@/app/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import ApiKeyForm from "./ApiKeyForm";

export default function ApiKeyDialog({
  open,
  onOpenChange,
  apiKey,
  onSave,
  credits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  onSave: (key: string) => void;
  credits: number;
}) {
  const hasKey = apiKey.trim().length > 0;
  const outOfCredits = !hasKey && credits <= 0;
  const [draft, setDraft] = useState(apiKey);

  // Reset the draft to the saved key each time the dialog opens.
  useEffect(() => {
    if (open) setDraft(apiKey);
  }, [open, apiKey]);

  function save() {
    const next = draft.trim();
    // Light shape check only (formats change): catches pasted fragments and
    // stray text, which would otherwise "save" fine and then 401 confusingly
    // on the first real generation.
    if (next && (/\s/.test(next) || next.length < 20)) {
      toast({
        variant: "destructive",
        title: "That doesn't look like an API key",
        description:
          "Check you copied the whole key from api.together.xyz (no spaces).",
      });
      return;
    }
    onSave(next);
    toast({
      title: next ? "API key saved" : "API key removed",
      description: next
        ? "It's stored only in this browser and used for your next generation."
        : undefined,
    });
    // Close a beat later: saving here can immediately open another modal (the
    // brand kit, when a build was waiting on the key). Letting that modal's
    // backdrop cover the screen first means the two dialog overlays don't
    // cross-fade and flash the page through the dip. Harmless for a plain save.
    setTimeout(() => onOpenChange(false), 220);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tip
        label={
          outOfCredits
            ? "Out of credits, add a key"
            : hasKey
              ? "Your API key"
              : "Add API key"
        }
        side="bottom"
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Together AI key"
            className="relative flex size-10 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-9"
          >
            <KeyRound className="size-[1.05rem]" />
            {hasKey && (
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-primary" />
            )}
            {outOfCredits && (
              <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full border-2 border-background bg-amber-400" />
              </span>
            )}
          </button>
        </DialogTrigger>
      </Tip>

      <DialogContent className="max-w-md gap-5 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[1.0625rem]">
            {outOfCredits ? "You're out of free credits" : "Together AI key"}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {outOfCredits
              ? "Add your own Together AI key to keep generating. It's free to get and stored only in your browser."
              : "Optional: add your own Together AI key for unlimited generations. Stored only in your browser."}
          </DialogDescription>
        </DialogHeader>

        <ApiKeyForm
          value={draft}
          onChange={setDraft}
          onSubmit={save}
          autoFocus
        />

        <div className="flex items-center gap-2">
          {hasKey && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft("");
                onSave("");
                toast({ title: "API key removed" });
                onOpenChange(false);
              }}
              className="mr-auto px-2 text-muted-foreground hover:text-foreground"
            >
              Remove
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="ml-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={draft.trim() === apiKey.trim()}
            className="font-semibold"
          >
            Save key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
