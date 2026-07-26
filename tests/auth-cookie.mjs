import { encode } from "next-auth/jwt";

export function getConfiguredAllowedEmails() {
  const emails = (process.env.AUTH_ALLOWED_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error("API tests require at least one AUTH_ALLOWED_EMAIL entry.");
  }

  return emails;
}

export async function createAuthCookie(
  baseUrl,
  email = getConfiguredAllowedEmails()[0],
  emailVerified = true
) {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32 || !email) {
    throw new Error(
      "API tests require AUTH_SECRET (32+ characters) and AUTH_ALLOWED_EMAIL."
    );
  }

  const secure = baseUrl.startsWith("https://");
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const token = await encode({
    salt: cookieName,
    secret,
    token: {
      email,
      googleEmailVerified: emailVerified,
      name: "Patryoga API tests",
      sub: "patryoga-api-tests"
    }
  });

  return `${cookieName}=${encodeURIComponent(token)}`;
}
