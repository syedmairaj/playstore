"use client";

import { useCallback, useState } from "react";
import type { AddOptimizationQueueInput } from "@/lib/optimization-queue";
import {
  ManualClusterRequiredError,
  withResolvedSignalCluster,
  type SignalCluster,
} from "@/lib/optimization-queue/signal-cluster";
import { SignalCategorizationModal } from "@/components/optimization-queue/signal-categorization-modal";

type PendingManualAdd = {
  inputs: AddOptimizationQueueInput[];
  resolve: (items: AddOptimizationQueueInput[]) => void;
  reject: (error: Error) => void;
};

/**
 * Ensures manual queue rows have a cluster before persistence.
 * Opens SignalCategorizationModal when cluster is missing.
 */
export function useCategorizedManualQueueAdd(isRtl = false) {
  const [pending, setPending] = useState<PendingManualAdd | null>(null);
  const [preview, setPreview] = useState("");

  const prepareInputs = useCallback(
    (
      inputs: AddOptimizationQueueInput[],
    ): Promise<AddOptimizationQueueInput[]> => {
      const manualMissing = inputs.filter(
        (i) =>
          i.source === "manual" &&
          !i.signalCluster &&
          !i.metadata?.signal_cluster &&
          !i.metadata?.cluster_category,
      );

      if (manualMissing.length === 0) {
        return Promise.resolve(
          inputs.map((i) => withResolvedSignalCluster(i)),
        );
      }

      return new Promise((resolve, reject) => {
        setPreview(manualMissing[0]?.content ?? "");
        setPending({
          inputs,
          resolve: (categorized) => {
            setPending(null);
            resolve(categorized);
          },
          reject: (error) => {
            setPending(null);
            reject(error);
          },
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(
    (cluster: SignalCluster) => {
      if (!pending) return;
      const categorized = pending.inputs.map((input) => {
        if (input.source !== "manual") return withResolvedSignalCluster(input);
        return withResolvedSignalCluster({
          ...input,
          signalCluster: input.signalCluster ?? cluster,
          metadata: {
            ...(input.metadata ?? {}),
            signal_cluster: cluster,
            cluster_category: cluster,
          },
        });
      });
      pending.resolve(categorized);
    },
    [pending],
  );

  const modal = (
    <SignalCategorizationModal
      open={pending != null}
      onOpenChange={(open) => {
        if (!open && pending) {
          pending.reject(new ManualClusterRequiredError());
          setPending(null);
        }
      }}
      contentPreview={preview}
      isRtl={isRtl}
      onConfirm={handleConfirm}
    />
  );

  return { prepareInputs, modal };
}

