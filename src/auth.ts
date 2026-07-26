import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getAuthEnvironment, isAllowedAdminEmail } from "@/auth-environment";

const unconfiguredSecret = "patryoga-unconfigured-fail-closed-secret";

export const { auth, handlers, signIn, signOut } = NextAuth(() => {
  const environment = getAuthEnvironment();

  return {
    secret: environment.ready ? environment.secret : unconfiguredSecret,
    trustHost: environment.trustHost,
    providers: environment.ready
      ? [
          Google({
            clientId: environment.googleId,
            clientSecret: environment.googleSecret
          })
        ]
      : [],
    pages: {
      error: "/login",
      signIn: "/login"
    },
    session: {
      strategy: "jwt"
    },
    callbacks: {
      authorized({ auth: session, request }) {
        const pathname = request.nextUrl.pathname;
        if (
          pathname === "/login"
          || pathname === "/api/health"
          || pathname.startsWith("/api/auth/")
        ) {
          return true;
        }

        if (!environment.ready) {
          if (pathname.startsWith("/api/")) {
            return Response.json(
              { error: "Authentication is not configured" },
              { status: 503 }
            );
          }

          const loginUrl = new URL("/login", request.url);
          loginUrl.searchParams.set("error", "Configuration");
          return Response.redirect(loginUrl);
        }

        const verifiedUser = session?.user as
          | { email?: string | null; googleEmailVerified?: boolean }
          | undefined;
        if (
          verifiedUser?.googleEmailVerified === true
          && isAllowedAdminEmail(verifiedUser.email)
        ) {
          return true;
        }
        if (pathname.startsWith("/api/")) {
          return Response.json(
            { error: "Authentication required" },
            { status: 401 }
          );
        }

        return false;
      },
      signIn({ account, profile }) {
        if (account?.provider !== "google") return false;

        const googleProfile = profile as
          | { email?: string | null; email_verified?: boolean }
          | undefined;

        return googleProfile?.email_verified === true
          && isAllowedAdminEmail(googleProfile.email);
      },
      jwt({ token, account, profile }) {
        if (account?.provider === "google") {
          const googleProfile = profile as
            | { email_verified?: boolean }
            | undefined;
          token.googleEmailVerified = googleProfile?.email_verified === true;
        }

        return token;
      },
      session({ session, token }) {
        if (session.user) {
          const verifiedUser = session.user as typeof session.user & {
            googleEmailVerified?: boolean;
          };
          verifiedUser.googleEmailVerified = token.googleEmailVerified === true;
        }

        return session;
      }
    }
  };
});
