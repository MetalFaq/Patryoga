import { LockKeyhole, LogIn, Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { getAuthEnvironment, isAllowedAdminEmail } from "@/auth-environment";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

async function loginWithGoogle() {
  "use server";

  if (!getAuthEnvironment().ready) {
    redirect("/login?error=Configuration");
  }

  await signIn("google", { redirectTo: "/" });
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const environment = getAuthEnvironment();
  const parameters = await searchParams;

  if (environment.ready) {
    const session = await auth();
    if (isAllowedAdminEmail(session?.user?.email)) redirect("/");
  }

  const denied = parameters.error === "AccessDenied"
    || parameters.error === "Unauthorized";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-mist bg-white p-6 shadow-soft sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mist text-moss">
          <LockKeyhole aria-hidden="true" size={24} />
        </div>
        <p className="eyebrow mt-6 text-moss">Patryoga · Acceso privado</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Administración</h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Ingresá con la única cuenta de Google autorizada para gestionar el salón.
        </p>

        {denied ? (
          <div className="notice notice-error mt-5" role="alert">
            Esta cuenta de Google no tiene acceso.
          </div>
        ) : null}

        {!environment.ready ? (
          <div className="notice notice-error mt-5 items-start" role="alert">
            <Settings aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <span>
              La autenticación todavía no está configurada.
              <span className="mt-1 block text-xs">
                Variables pendientes: {environment.issues.join(", ")}.
              </span>
            </span>
          </div>
        ) : null}

        <form action={loginWithGoogle} className="mt-6">
          <button
            className="action-button action-button-dark w-full"
            disabled={!environment.ready}
            type="submit"
          >
            <LogIn aria-hidden="true" size={18} />
            Ingresar con Google
          </button>
        </form>
      </section>
    </main>
  );
}
