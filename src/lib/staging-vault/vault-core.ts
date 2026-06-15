/**
 * VaultCore — centralized, schema-aware workspace_staging_vault access layer.
 *
 * - All INSERT/UPDATE paths go through safeUpsert / safeUpdate.
 * - Universal writes (state_en/state_ar) fall back to legacy content without PGRST204.
 * - Legacy content is always written when available so unmigrated readers keep working.
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  buildStagingVaultContentPayload,
  serialiseStagingVaultContent,
  type StagingVaultContentPayload,
} from "@/lib/staging-vault/staging-vault-content";
import { enrichStagingVaultMetadata } from "@/lib/staging-vault/staging-vault-metadata";
import {
  hasLegacySignalColumns,
  hasUniversalVaultColumns,
} from "@/lib/staging-vault/staging-vault-schema";
import { resolveVaultAppId } from "@/lib/staging-vault/resolve-vault-app-id";
import type { VaultSignalType } from "@/lib/staging-vault/vault-core.types";
import type {
  VaultLegacyPatchPayload,
  VaultLegacySignalPayload,
  VaultUniversalKeywordPayload,
  VaultUniversalSoftDeletePayload,
  VaultUniversalStatePayload,
  VaultUpdatePayload,
  VaultUpdateResult,
  VaultUpsertPayload,
  VaultUpsertResult,
} from "@/lib/staging-vault/vault-core.types";

const UNIVERSAL_SKIP_WARNING =
  "Universal vault columns missing, proceeding with legacy write only";

export class VaultCore {
  /**
   * Schema-aware upsert. Routes by payload.type.
   * Never throws PGRST204 — missing universal columns trigger legacy fallback.
   */
  static async safeUpsert(
    supabase: SupabaseClient,
    payload: VaultUpsertPayload,
  ): Promise<VaultUpsertResult> {
    switch (payload.type) {
      case "legacy_signal":
        return VaultCore.upsertLegacySignal(supabase, payload);
      case "universal_state":
        return VaultCore.upsertUniversalState(supabase, payload);
      case "universal_keyword":
        return VaultCore.upsertUniversalKeyword(supabase, payload);
      default: {
        const _exhaustive: never = payload;
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: `Unknown vault payload type: ${(_exhaustive as VaultUpsertPayload).type}`,
        };
      }
    }
  }

  /** Schema-aware partial update (archive, restore, soft-delete). */
  static async safeUpdate(
    supabase: SupabaseClient,
    payload: VaultUpdatePayload,
  ): Promise<VaultUpdateResult> {
    switch (payload.type) {
      case "legacy_patch":
        return VaultCore.patchLegacyRow(supabase, payload);
      case "universal_soft_delete":
        return VaultCore.softDeleteUniversalVault(supabase, payload);
      default: {
        const _exhaustive: never = payload;
        return {
          ok: false,
          writePath: "none",
          error: `Unknown vault update type: ${(_exhaustive as VaultUpdatePayload).type}`,
        };
      }
    }
  }

  // ── Legacy signal path ───────────────────────────────────────────────

  private static async upsertLegacySignal(
    supabase: SupabaseClient,
    payload: VaultLegacySignalPayload,
  ): Promise<VaultUpsertResult> {
    const now = payload.expiresAt ? undefined : new Date().toISOString();
    const createdAt = now ?? new Date().toISOString();

    const contentPayload = buildStagingVaultContentPayload({
      keyword: payload.content,
      language: payload.locale,
      metadata: payload.metadata,
    });

    const serialisedContent =
      payload.signalType === "keyword"
        ? serialiseStagingVaultContent(contentPayload)
        : payload.content.trim();

    const finalMetadata: Record<string, unknown> = enrichStagingVaultMetadata({
      signalType: payload.signalType,
      source: payload.source,
      sourceContext: payload.sourceContext,
      category: payload.category,
      metadata: {
        ...(payload.metadata ?? {}),
        content_payload: contentPayload,
        targetAsset: contentPayload.targetAsset,
        descriptionDraft: contentPayload.descriptionDraft,
        signal_created_at: createdAt,
      },
    });

    const legacyAvailable = await hasLegacySignalColumns(supabase);
    const universalAvailable = await hasUniversalVaultColumns(supabase);

    let legacyWritten = false;
    let universalWritten = false;
    let id: string | undefined;
    let idempotent = false;

    if (legacyAvailable) {
      const legacyResult = await VaultCore.insertLegacyRow(supabase, {
        workspace_id: payload.workspaceId,
        signal_type: payload.signalType,
        content: serialisedContent,
        source: payload.source,
        source_app_id: payload.sourceAppId ?? null,
        source_context: payload.sourceContext ?? null,
        source_context_id: payload.sourceContextId ?? null,
        language: payload.locale,
        is_rtl: payload.isRtl ?? payload.locale === "ar",
        metadata: finalMetadata,
        created_at: createdAt,
        created_by_user_id: payload.userId ?? null,
        expires_at: payload.expiresAt ?? null,
      });

      if (legacyResult.ok || legacyResult.idempotent) {
        legacyWritten = true;
        id = legacyResult.id;
        idempotent = legacyResult.idempotent ?? false;
      } else if (!universalAvailable) {
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: legacyResult.error,
        };
      }
    }

    if (universalAvailable) {
      const metadataPackageName =
        typeof finalMetadata.packageName === "string"
          ? finalMetadata.packageName
          : undefined;

      const appId = await resolveVaultAppId(
        supabase,
        payload.workspaceId,
        payload.sourceAppId ?? metadataPackageName ?? null,
      );

      if (appId) {
        if (payload.signalType === "keyword") {
          const universalResult = await VaultCore.upsertUniversalKeyword(supabase, {
            type: "universal_keyword",
            workspaceId: payload.workspaceId,
            appId,
            keyword: contentPayload.keyword,
            locale: payload.locale,
            metadata: finalMetadata,
            userId: payload.userId,
          });

          if (universalResult.ok && universalResult.universalWritten) {
            universalWritten = true;
            id = universalResult.id ?? id;
          }
        } else {
          const universalResult = await VaultCore.upsertUniversalFeatureSignal(
            supabase,
            {
              workspaceId: payload.workspaceId,
              appId,
              locale: payload.locale,
              signalType: payload.signalType,
              content: serialisedContent,
              source: payload.source,
              sourceContext: payload.sourceContext,
              sourceContextId: payload.sourceContextId,
              metadata: finalMetadata,
              userId: payload.userId,
            },
          );

          if (universalResult.ok && universalResult.universalWritten) {
            universalWritten = true;
            id = universalResult.id ?? id;
          }
        }
      } else if (!legacyAvailable) {
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error:
            "Universal vault requires an app_id. Pass sourceAppId or add an app to the workspace.",
        };
      }
    }

    if (!legacyWritten && !universalWritten) {
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error:
          "No writable vault schema detected. Apply migrations or refresh the API schema.",
      };
    }

    const writePath: VaultUpsertResult["writePath"] =
      legacyWritten && universalWritten
        ? "hybrid"
        : legacyWritten
          ? "legacy"
          : "universal";

    return {
      ok: true,
      id: id ?? `vault-${Date.now()}`,
      writePath,
      legacyWritten,
      universalWritten,
      idempotent,
      createdAt,
      message: idempotent
        ? "Signal already exists in vault (idempotent success)"
        : `Signal staged via ${writePath} path`,
    };
  }

  private static async insertLegacyRow(
    supabase: SupabaseClient,
    row: Record<string, unknown>,
  ): Promise<{ ok: boolean; id?: string; idempotent?: boolean; error?: string }> {
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .insert([row])
      .select("id, created_at");

    if (error) {
      if (error.code === "23505") {
        return { ok: true, id: `existing-${Date.now()}`, idempotent: true };
      }
      if (VaultCore.isSchemaColumnError(error)) {
        console.warn(`[VaultCore] ⚠️ Legacy insert skipped: ${error.message}`);
        return { ok: false, error: error.message };
      }
      return { ok: false, error: `${error.message} (${error.code})` };
    }

    if (!data?.length) {
      return { ok: false, error: "Legacy insert returned no id" };
    }

    return { ok: true, id: data[0].id as string };
  }

  // ── Universal state path (producer router) ───────────────────────────

  private static async upsertUniversalState(
    supabase: SupabaseClient,
    payload: VaultUniversalStatePayload,
  ): Promise<VaultUpsertResult> {
    const universalAvailable = await hasUniversalVaultColumns(supabase);
    if (!universalAvailable) {
      console.warn(`[VaultCore] ⚠️ ${UNIVERSAL_SKIP_WARNING}`);
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: "universal_columns_missing",
      };
    }

    const row = {
      id: payload.vault.id,
      workspace_id: payload.vault.workspace_id,
      app_id: payload.vault.app_id,
      state_en: payload.vault.state_en,
      state_ar: payload.vault.state_ar,
      active_features: payload.vault.active_features,
      last_modified_by: payload.vault.last_modified_by,
      change_count: payload.vault.change_count,
      updated_at: payload.vault.updated_at ?? new Date().toISOString(),
      is_deleted: payload.vault.is_deleted ?? false,
    };

    const { data, error } = payload.vault.id
      ? await supabase
          .from("workspace_staging_vault")
          .upsert(row, { onConflict: "id" })
          .select("id")
          .single()
      : await supabase
          .from("workspace_staging_vault")
          .insert([row])
          .select("id")
          .single();

    if (error) {
      if (VaultCore.isSchemaColumnError(error)) {
        console.warn(`[VaultCore] ⚠️ Universal state write skipped: ${error.message}`);
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: error.message,
        };
      }
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: error.message,
      };
    }

    return {
      ok: true,
      id: data?.id as string | undefined,
      writePath: "universal",
      legacyWritten: false,
      universalWritten: true,
      createdAt: new Date().toISOString(),
    };
  }

  // ── Universal keyword path ───────────────────────────────────────────

  private static async upsertUniversalKeyword(
    supabase: SupabaseClient,
    payload: VaultUniversalKeywordPayload,
  ): Promise<VaultUpsertResult> {
    const universalAvailable = await hasUniversalVaultColumns(supabase);
    if (!universalAvailable) {
      console.warn(`[VaultCore] ⚠️ ${UNIVERSAL_SKIP_WARNING}`);
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: "universal_columns_missing",
      };
    }

    if (!payload.appId) {
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: "missing_app_id",
      };
    }

    try {
      const contentPayload = buildStagingVaultContentPayload({
        keyword: payload.keyword,
        language: payload.locale,
        metadata: payload.metadata,
      });

      const signalEntry = VaultCore.buildKeywordSignalEntry(contentPayload);
      const key = VaultCore.keywordKey(contentPayload.keyword);
      const stateKey = payload.locale === "ar" ? "state_ar" : "state_en";
      const now = new Date().toISOString();

      const { data: existing, error: fetchError } = await supabase
        .from("workspace_staging_vault")
        .select(`id, ${stateKey}, active_features, change_count`)
        .eq("workspace_id", payload.workspaceId)
        .eq("app_id", payload.appId)
        .is("deleted_at", null)
        .maybeSingle();

      if (fetchError && VaultCore.isSchemaColumnError(fetchError)) {
        console.warn(`[VaultCore] ⚠️ Universal keyword read skipped: ${fetchError.message}`);
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: fetchError.message,
        };
      }
      if (fetchError) {
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: fetchError.message,
        };
      }

      const emptyState = VaultCore.emptyLocaleState(
        payload.workspaceId,
        payload.appId,
        payload.locale,
        now,
      );

      const branch =
        (existing?.[stateKey as keyof typeof existing] as Record<string, unknown>) ??
        emptyState;
      const features = { ...(branch.features as Record<string, unknown>) };

      const kt = { ...((features.keyword_tracker ?? {}) as Record<string, unknown>) };
      const ktSignals = { ...((kt.signals ?? {}) as Record<string, unknown>) };
      ktSignals[key] = signalEntry;
      kt.signals = ktSignals;
      features.keyword_tracker = kt;

      const kv = { ...((features.keyword_validator ?? {}) as Record<string, unknown>) };
      const kvSignals = { ...((kv.signals ?? {}) as Record<string, unknown>) };
      kvSignals[key] = signalEntry;
      kv.signals = kvSignals;
      features.keyword_validator = kv;

      const embedded = Array.isArray(features.staged_signals)
        ? [...(features.staged_signals as Record<string, unknown>[])]
        : [];
      embedded.unshift({
        id: `kt-${key}-${Date.now()}`,
        signal_type: "keyword",
        content: serialiseStagingVaultContent(contentPayload),
        source: "keyword_tracker",
        source_context: "keyword_tracker_alert",
        source_context_id: key,
        created_at: now,
        metadata: {
          ...payload.metadata,
          content_payload: contentPayload,
          targetAsset: contentPayload.targetAsset,
        },
      });
      features.staged_signals = embedded.slice(0, 50);

      const nextState = {
        ...branch,
        features,
        metadata: {
          ...(branch.metadata as Record<string, unknown>),
          last_producer: "keyword_tracker",
          last_producer_timestamp: now,
        },
      };

      const activeFeatures = new Set<string>(
        Array.isArray(existing?.active_features)
          ? (existing.active_features as string[])
          : [],
      );
      activeFeatures.add("keyword_tracker");
      activeFeatures.add("keyword_validator");

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from("workspace_staging_vault")
          .update({
            [stateKey]: nextState,
            active_features: [...activeFeatures],
            updated_at: now,
            last_modified_by: payload.userId ?? null,
            change_count: existing.change_count
              ? Number(existing.change_count) + 1
              : 1,
          })
          .eq("id", existing.id);

        if (updateError) {
          if (VaultCore.isSchemaColumnError(updateError)) {
            console.warn(`[VaultCore] ⚠️ ${UNIVERSAL_SKIP_WARNING}`);
            return {
              ok: false,
              writePath: "none",
              legacyWritten: false,
              universalWritten: false,
              error: updateError.message,
            };
          }
          return {
            ok: false,
            writePath: "none",
            legacyWritten: false,
            universalWritten: false,
            error: updateError.message,
          };
        }

        return {
          ok: true,
          id: existing.id as string,
          writePath: "universal",
          legacyWritten: false,
          universalWritten: true,
          createdAt: now,
        };
      }

      const insertRow: Record<string, unknown> = {
        workspace_id: payload.workspaceId,
        app_id: payload.appId,
        state_en:
          payload.locale === "en"
            ? nextState
            : VaultCore.emptyLocaleState(payload.workspaceId, payload.appId, "en", now),
        state_ar:
          payload.locale === "ar"
            ? nextState
            : VaultCore.emptyLocaleState(payload.workspaceId, payload.appId, "ar", now),
        active_features: [...activeFeatures],
        last_modified_by: payload.userId ?? null,
        change_count: 1,
        is_deleted: false,
      };

      const { data: created, error: insertError } = await supabase
        .from("workspace_staging_vault")
        .insert([insertRow])
        .select("id")
        .single();

      if (insertError) {
        if (VaultCore.isSchemaColumnError(insertError)) {
          console.warn(`[VaultCore] ⚠️ ${UNIVERSAL_SKIP_WARNING}`);
          return {
            ok: false,
            writePath: "none",
            legacyWritten: false,
            universalWritten: false,
            error: insertError.message,
          };
        }
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: insertError.message,
        };
      }

      return {
        ok: true,
        id: created?.id as string | undefined,
        writePath: "universal",
        legacyWritten: false,
        universalWritten: true,
        createdAt: now,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[VaultCore] ⚠️ Universal keyword write failed: ${message}`);
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: message,
      };
    }
  }

  // ── Universal feature signal path (competitor / review / insight) ───

  private static async upsertUniversalFeatureSignal(
    supabase: SupabaseClient,
    args: {
      workspaceId: string;
      appId: string;
      locale: "en" | "ar";
      signalType: VaultSignalType;
      content: string;
      source: string;
      sourceContext?: string;
      sourceContextId?: string;
      metadata: Record<string, unknown>;
      userId?: string;
    },
  ): Promise<VaultUpsertResult> {
    const universalAvailable = await hasUniversalVaultColumns(supabase);
    if (!universalAvailable) {
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: "universal_columns_missing",
      };
    }

    const stateKey = args.locale === "ar" ? "state_ar" : "state_en";
    const now = new Date().toISOString();
    const producer =
      args.signalType === "competitor_weakness"
        ? "competitor_spy"
        : args.signalType === "review_issue"
          ? "review_analysis"
          : args.source;

    const { data: existing, error: fetchError } = await supabase
      .from("workspace_staging_vault")
      .select(`id, ${stateKey}, active_features, change_count`)
      .eq("workspace_id", args.workspaceId)
      .eq("app_id", args.appId)
      .maybeSingle();

    if (fetchError && !VaultCore.isSchemaColumnError(fetchError)) {
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: fetchError.message,
      };
    }

    const emptyState = VaultCore.emptyLocaleState(
      args.workspaceId,
      args.appId,
      args.locale,
      now,
      producer,
    );

    const branch =
      (existing?.[stateKey as keyof typeof existing] as Record<string, unknown>) ??
      emptyState;
    const features = { ...(branch.features as Record<string, unknown>) };

    if (args.signalType === "competitor_weakness") {
      const competitorId = String(
        args.metadata.competitor_id ?? args.sourceContextId ?? "",
      ).trim();
      const spy = { ...((features.competitor_spy ?? {}) as Record<string, unknown>) };
      const competitors = Array.isArray(spy.competitors)
        ? [...(spy.competitors as Record<string, unknown>[])]
        : [];

      const entry = {
        competitor_id: competitorId,
        id: competitorId,
        app_name: args.metadata.competitor_name ?? "Competitor",
        name: args.metadata.competitor_name ?? "Competitor",
        keywords: args.metadata.keywords ?? [],
        keywords_by_strategy: args.metadata.keywords_by_strategy ?? {},
        vulnerabilities: args.metadata.vulnerabilities ?? [],
        weaknesses: args.metadata.vulnerabilities ?? [],
        category_label: args.metadata.category_label,
        staged: true,
        staged_at: now,
      };

      const idx = competitors.findIndex(
        (c) =>
          String(c.competitor_id ?? c.id ?? "") === competitorId,
      );
      if (idx >= 0) competitors[idx] = { ...competitors[idx], ...entry };
      else competitors.push(entry);

      spy.competitors = competitors;
      features.competitor_spy = spy;
    }

    if (args.signalType === "review_issue") {
      const review = { ...((features.review_analysis ?? {}) as Record<string, unknown>) };
      const opportunities = Array.isArray(review.opportunities)
        ? [...(review.opportunities as Record<string, unknown>[])]
        : [];
      opportunities.unshift({
        issue: args.content,
        theme: args.content,
        staged: true,
        pinned: true,
        staged_at: now,
        ...args.metadata,
      });
      review.opportunities = opportunities.slice(0, 50);
      features.review_analysis = review;
    }

    const embedded = Array.isArray(features.staged_signals)
      ? [...(features.staged_signals as Record<string, unknown>[])]
      : [];
    embedded.unshift({
      id: `${args.signalType}-${args.sourceContextId ?? Date.now()}`,
      signal_type: args.signalType,
      content: args.content,
      source: args.source,
      source_context: args.sourceContext,
      source_context_id: args.sourceContextId,
      created_at: now,
      metadata: args.metadata,
    });
    features.staged_signals = embedded.slice(0, 50);

    const nextState = {
      ...branch,
      features,
      metadata: {
        ...(branch.metadata as Record<string, unknown>),
        last_producer: producer,
        last_producer_timestamp: now,
      },
    };

    const activeFeatures = new Set<string>(
      Array.isArray(existing?.active_features)
        ? (existing.active_features as string[])
        : [],
    );
    if (args.signalType === "competitor_weakness") activeFeatures.add("competitor_spy");
    if (args.signalType === "review_issue") activeFeatures.add("review_analysis");
    activeFeatures.add("staging_vault");

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("workspace_staging_vault")
        .update({
          [stateKey]: nextState,
          active_features: [...activeFeatures],
          updated_at: now,
          last_modified_by: args.userId ?? null,
          change_count: existing.change_count
            ? Number(existing.change_count) + 1
            : 1,
        })
        .eq("id", existing.id);

      if (updateError) {
        return {
          ok: false,
          writePath: "none",
          legacyWritten: false,
          universalWritten: false,
          error: updateError.message,
        };
      }

      return {
        ok: true,
        id: existing.id as string,
        writePath: "universal",
        legacyWritten: false,
        universalWritten: true,
        createdAt: now,
      };
    }

    const insertRow: Record<string, unknown> = {
      workspace_id: args.workspaceId,
      app_id: args.appId,
      state_en:
        args.locale === "en"
          ? nextState
          : VaultCore.emptyLocaleState(args.workspaceId, args.appId, "en", now, producer),
      state_ar:
        args.locale === "ar"
          ? nextState
          : VaultCore.emptyLocaleState(args.workspaceId, args.appId, "ar", now, producer),
      active_features: [...activeFeatures],
      last_modified_by: args.userId ?? null,
      change_count: 1,
      is_deleted: false,
    };

    const { data: created, error: insertError } = await supabase
      .from("workspace_staging_vault")
      .insert([insertRow])
      .select("id")
      .single();

    if (insertError) {
      return {
        ok: false,
        writePath: "none",
        legacyWritten: false,
        universalWritten: false,
        error: insertError.message,
      };
    }

    return {
      ok: true,
      id: created?.id as string | undefined,
      writePath: "universal",
      legacyWritten: false,
      universalWritten: true,
      createdAt: now,
    };
  }

  // ── Updates ──────────────────────────────────────────────────────────

  private static async patchLegacyRow(
    supabase: SupabaseClient,
    payload: VaultLegacyPatchPayload,
  ): Promise<VaultUpdateResult> {
    const legacyAvailable = await hasLegacySignalColumns(supabase);
    if (!legacyAvailable) {
      return { ok: false, writePath: "none", error: "legacy_columns_missing" };
    }

    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .update(payload.patch)
      .eq("id", payload.id)
      .eq("workspace_id", payload.workspaceId)
      .select("id");

    if (error) {
      if (VaultCore.isSchemaColumnError(error)) {
        console.warn(`[VaultCore] ⚠️ Legacy patch skipped: ${error.message}`);
        return { ok: false, writePath: "none", error: error.message };
      }
      return { ok: false, writePath: "legacy", error: error.message };
    }

    if (!data?.length) {
      return { ok: false, writePath: "legacy", error: "row_not_found" };
    }

    return { ok: true, id: data[0].id as string, writePath: "legacy" };
  }

  private static async softDeleteUniversalVault(
    supabase: SupabaseClient,
    payload: VaultUniversalSoftDeletePayload,
  ): Promise<VaultUpdateResult> {
    const universalAvailable = await hasUniversalVaultColumns(supabase);
    if (!universalAvailable) {
      console.warn(`[VaultCore] ⚠️ Universal soft-delete skipped — columns missing`);
      return { ok: false, writePath: "none", error: "universal_columns_missing" };
    }

    const patch: Record<string, unknown> = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("workspace_staging_vault")
      .update(patch)
      .eq("workspace_id", payload.workspaceId)
      .eq("app_id", payload.appId);

    if (error) {
      if (VaultCore.isSchemaColumnError(error)) {
        console.warn(`[VaultCore] ⚠️ Universal soft-delete skipped: ${error.message}`);
        return { ok: false, writePath: "none", error: error.message };
      }
      return { ok: false, writePath: "universal", error: error.message };
    }

    return { ok: true, writePath: "universal" };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  static isSchemaColumnError(error: PostgrestError | { code?: string; message?: string }): boolean {
    const code = error.code ?? "";
    const message = error.message ?? "";
    return (
      code === "PGRST204" ||
      code === "42703" ||
      /could not find the .* column/i.test(message) ||
      /column .* does not exist/i.test(message)
    );
  }

  private static keywordKey(term: string): string {
    return term.trim().toLowerCase().replace(/\s+/g, "_");
  }

  private static buildKeywordSignalEntry(
    payload: StagingVaultContentPayload,
  ): Record<string, unknown> {
    return {
      keyword: payload.keyword,
      target_asset: payload.targetAsset ?? null,
      description_draft: payload.descriptionDraft ?? null,
      staged_at: payload.stagedAt,
      discovery_source: payload.discoverySource ?? "keyword_tracker",
      listing_generation_id: payload.listingGenerationId ?? null,
      market: payload.market ?? null,
      locale: payload.locale,
      confidence: 70,
      difficulty: 5,
      search_volume: 0,
      recommendation: "MEDIUM_OPPORTUNITY",
    };
  }

  private static emptyLocaleState(
    workspaceId: string,
    appId: string,
    locale: "en" | "ar",
    timestamp: string,
    producer = "vault_core",
  ): Record<string, unknown> {
    return {
      features: {},
      metadata: {
        workspace_id: workspaceId,
        app_id: appId,
        locale,
        schema_version: "1.0",
        last_producer: producer,
        last_producer_timestamp: timestamp,
        feature_count: 0,
        total_bytes: 0,
        dirty_flags: {},
      },
    };
  }
}

export type {
  VaultLegacySignalPayload,
  VaultUniversalKeywordPayload,
  VaultUniversalStatePayload,
  VaultUpsertPayload,
  VaultUpdatePayload,
  VaultUpsertResult,
  VaultUpdateResult,
} from "@/lib/staging-vault/vault-core.types";
