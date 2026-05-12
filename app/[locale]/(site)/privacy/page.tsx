export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Privacy</h1>
      <p className="mt-4 text-sm leading-relaxed text-neutral-600">
        We collect only what is needed to run PlayStore: account data, workspace
        content you create, and usage needed for billing and security. Data is
        stored with Supabase and protected with row-level access per workspace.
        Contact hello@playstore.xyz for privacy questions.
      </p>
    </div>
  );
}
