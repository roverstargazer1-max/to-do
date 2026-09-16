"use client";

import { useEffect, useState } from "react";
import { visualMutations } from "@/lib/mutations/visual";
import type { VisualAsset, VisualAssetVersion } from "@/lib/types/visual";

export interface VisualAssetState {
  asset: VisualAsset | null;
  version: VisualAssetVersion | null;
  url: string | null;
  loading: boolean;
  error: Error | null;
}

/** Loads only the explicitly referenced image and releases its object URL. */
export function useVisualAsset(
  assetId: string | null | undefined,
  versionId?: string | null,
): VisualAssetState {
  const [state, setState] = useState<VisualAssetState>({
    asset: null,
    version: null,
    url: null,
    loading: Boolean(assetId),
    error: null,
  });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!assetId) {
      setState({
        asset: null,
        version: null,
        url: null,
        loading: false,
        error: null,
      });
      return () => {
        active = false;
      };
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    void (async () => {
      try {
        const [asset, bytes] = await Promise.all([
          visualMutations.getAsset(assetId),
          visualMutations.readVersion(assetId, versionId ?? undefined),
        ]);
        if (!asset) throw new Error("Visual asset not found");
        const version = await visualMutations
          .inspect(
            { assetId },
            { versionId: versionId ?? undefined, representation: "original" },
          )
          .then((inspection) => inspection.version);
        if (
          typeof URL !== "undefined" &&
          typeof URL.createObjectURL === "function"
        ) {
          const buffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          objectUrl = URL.createObjectURL(
            new Blob([buffer], { type: version.mime_type }),
          );
        }
        if (active)
          setState({
            asset,
            version,
            url: objectUrl,
            loading: false,
            error: null,
          });
      } catch (error) {
        if (active) {
          setState({
            asset: null,
            version: null,
            url: null,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, versionId]);

  return state;
}
