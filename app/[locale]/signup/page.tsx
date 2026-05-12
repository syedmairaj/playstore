import { Link } from "@/i18n/navigation";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { PlayStoreLogo } from "@/components/marketing/PlayStoreLogo";

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex flex-col items-center space-y-3 text-center">
        <Link
          href="/"
          className="rounded-xl outline-none ring-offset-background transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlayStoreLogo size="md" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground">Start a workspace and track Google Play keywords in minutes.</p>
      </div>
      <AuthPageShell intent="signup" />
    </div>
  );
}
