import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getConnectedAccount } from "@/lib/play-store/google-play-oauth";
import { publishListingToPlayStore } from "@/lib/play-store/publish-listing-to-play-store";
import {
  fetchListingPublicationUnlockState,
} from "@/lib/db/listing-generations";
import { isListingPublicationUnlocked } from "@/lib/listing/listing-export-unlock";

const bodySchema = z.object({
  locale: z.string().min(2).max(10).default("en"),
  title: z.string().min(1).max(30),
  shortDescription: z.string().min(1).max(80),
  fullDescription: z.string().min(1).max(4000),
});

type Ctx = { params: Promise<{ workspaceId: string; appId: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const { workspaceId, appId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id, package_name")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appErr || !appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "App not found in this workspace." } },
      { status: 404 },
    );
  }

  const packageName =
    typeof appRow.package_name === "string" ? appRow.package_name.trim() : "";

  if (!packageName) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message: "No package name is set for this app. Add it in Workspace & Apps settings.",
        },
      },
      { status: 422 },
    );
  }

  const account = await getConnectedAccount(workspaceId);
  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "not_connected",
          message:
            "No Google Play account connected. Go to Settings → Integrations → Connected Stores to connect.",
        },
      },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input.", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  const unlockState = await fetchListingPublicationUnlockState(supabase, {
    workspaceId,
    userId: user.id,
    appId,
  });
  if (
    !unlockState ||
    !isListingPublicationUnlocked({
      creditsLedgerId: unlockState.creditsLedgerId,
      promptVersion: unlockState.promptVersion,
    })
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "publication_locked",
          message:
            "This listing is still a free preview. Run Full AI Generation (Finalize) to unlock export and Play Console publish.",
        },
      },
      { status: 402 },
    );
  }

  const result = await publishListingToPlayStore({
    workspaceId,
    packageName,
    locale: input.locale,
    listing: {
      title: input.title,
      shortDescription: input.shortDescription,
      fullDescription: input.fullDescription,
    },
  });

  if (!result.ok) {
    const status =
      result.code === "not_connected" || result.code === "auth_error" ? 422
      : result.code === "no_package_name" || result.code === "validation_error" ? 400
      : 502;
    return NextResponse.json(
      { ok: false, error: { code: result.code, message: result.message } },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    editId: result.editId,
    language: result.language,
    packageName,
    authorizedEmail: account.authorizedEmail,
  });
}
