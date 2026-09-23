"use client";

import { useEffect, useState } from "react";
import { Copy, Cpu, Eye, EyeOff, RefreshCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";
import type { McpChannelStatus } from "@/lib/types/electron";
import {
  buildMcpClientSnippets,
  maskMcpToken,
  type McpClientSnippetId,
} from "@/lib/mcp/client-config-snippets";
import { SETTINGS_CARD_CLASS } from "@/components/settings/settingsCardClass";

const SNIPPET_META: Record<
  McpClientSnippetId,
  { titleKey: TranslationKey; hintKey: TranslationKey }
> = {
  "claude-desktop": {
    titleKey: "settings.mcp.snippetClaudeDesktop",
    hintKey: "settings.mcp.snippetClaudeDesktopHint",
  },
  cursor: {
    titleKey: "settings.mcp.snippetCursor",
    hintKey: "settings.mcp.snippetCursorHint",
  },
  "claude-code": {
    titleKey: "settings.mcp.snippetClaudeCode",
    hintKey: "settings.mcp.snippetClaudeCodeHint",
  },
};

/** Rendered by browser builds and any host without the preload bridge. */
const UNAVAILABLE_STATUS: McpChannelStatus = {
  available: false,
  running: false,
  enabled: false,
  token: null,
  url: "",
};

/**
 * Settings surface for the in-app MCP endpoint (ADR-0024). All endpoint state
 * lives in the Electron main process, so this card is a thin view over the
 * preload bridge: it never reads the token file itself.
 */
export function McpChannelCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpChannelStatus | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);

  useEffect(() => {
    const bridge = window.electron?.mcp;
    let active = true;
    (bridge ? bridge.getStatus() : Promise.resolve(UNAVAILABLE_STATUS))
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) notify.error(t("settings.mcp.updateFailed"));
      });
    return () => {
      active = false;
    };
  }, [t]);

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(t("settings.mcp.copied"));
    } catch {
      notify.error(t("settings.mcp.copyFailed"));
    }
  };

  const handleToggle = async (enabled: boolean) => {
    const bridge = window.electron?.mcp;
    if (!bridge) return;
    try {
      setStatus(await bridge.setEnabled(enabled));
    } catch {
      notify.error(t("settings.mcp.updateFailed"));
    }
  };

  const handleResetToken = async () => {
    setIsResetOpen(false);
    const bridge = window.electron?.mcp;
    if (!bridge) return;
    try {
      setStatus(await bridge.resetToken());
      // Every configured client now holds a stale token, so show the new one.
      setShowToken(true);
      notify.success(t("settings.mcp.tokenReset"));
    } catch {
      notify.error(t("settings.mcp.updateFailed"));
    }
  };

  const token = status?.token ?? null;
  const snippets =
    status && token ? buildMcpClientSnippets({ url: status.url, token }) : [];

  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader className="pb-3 px-4 pt-5">
        <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
          <Cpu className="h-4 w-4 text-brand" strokeWidth={2.25} />
          {t("settings.mcp.title")}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground/80">
          {t("settings.mcp.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {status === null ? null : !status.available ? (
          <p className="text-xs text-muted-foreground">
            {t("settings.mcp.desktopOnly")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-muted/40 transition-seijaku-fast">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full border",
                    status.enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-muted text-muted-foreground border-border/60",
                  )}
                >
                  {status.enabled
                    ? t("settings.mcp.statusEnabled")
                    : t("settings.mcp.statusDisabled")}
                </span>
              </div>
              <Switch
                checked={status.enabled}
                onCheckedChange={handleToggle}
                aria-label={t("settings.mcp.enableLabel")}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                {t("settings.mcp.urlLabel")}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 font-mono text-xs">
                  {status.url}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(status.url)}
                  aria-label={t("settings.mcp.copyUrl")}
                >
                  <Copy />
                  {t("settings.mcp.copyUrl")}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                {t("settings.mcp.tokenLabel")}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 font-mono text-xs">
                  {token ? (showToken ? token : maskMcpToken(token)) : "—"}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={
                    showToken
                      ? t("settings.mcp.hideToken")
                      : t("settings.mcp.showToken")
                  }
                >
                  {showToken ? <EyeOff /> : <Eye />}
                  {showToken
                    ? t("settings.mcp.hideToken")
                    : t("settings.mcp.showToken")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(token ?? "")}
                  aria-label={t("settings.mcp.copyToken")}
                >
                  <Copy />
                  {t("settings.mcp.copyToken")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResetOpen(true)}
                >
                  <RefreshCcw />
                  {t("settings.mcp.resetToken")}
                </Button>
              </div>
            </div>

            {snippets.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                  {t("settings.mcp.snippetsTitle")}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  {t("settings.mcp.snippetsHint")}
                </p>
                {snippets.map((snippet) => {
                  const meta = SNIPPET_META[snippet.id];
                  const title = t(meta.titleKey);
                  return (
                    <div
                      key={snippet.id}
                      className="overflow-hidden rounded-md border border-border/40"
                    >
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <div>
                          <p className="text-xs font-medium">{title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t(meta.hintKey)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyValue(snippet.content)}
                          aria-label={`${t("settings.mcp.copySnippet")}: ${title}`}
                        >
                          <Copy />
                          {t("settings.mcp.copySnippet")}
                        </Button>
                      </div>
                      <pre className="max-h-40 overflow-auto border-t border-border/40 bg-background/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed">
                        {snippet.content}
                      </pre>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <DeleteConfirmationDialog
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        onConfirm={handleResetToken}
        title={t("settings.mcp.resetTokenTitle")}
        description={t("settings.mcp.resetTokenDescription")}
        confirmLabel={t("settings.mcp.resetToken")}
      />
    </Card>
  );
}
