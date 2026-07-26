const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthEnvironment = {
  allowedEmail: string;
  googleId: string;
  googleSecret: string;
  issues: string[];
  ready: boolean;
  secret: string;
  trustHost: boolean;
  url: string;
};

function read(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getAuthEnvironment(): AuthEnvironment {
  const secret = read("AUTH_SECRET");
  const googleId = read("AUTH_GOOGLE_ID");
  const googleSecret = read("AUTH_GOOGLE_SECRET");
  const allowedEmail = read("AUTH_ALLOWED_EMAIL").toLowerCase();
  const trustHost = read("AUTH_TRUST_HOST").toLowerCase() === "true";
  const url = read("AUTH_URL");
  const issues: string[] = [];

  if (secret.length < 32) issues.push("AUTH_SECRET");
  if (!googleId) issues.push("AUTH_GOOGLE_ID");
  if (!googleSecret) issues.push("AUTH_GOOGLE_SECRET");
  if (!emailPattern.test(allowedEmail)) issues.push("AUTH_ALLOWED_EMAIL");
  if (!trustHost) issues.push("AUTH_TRUST_HOST");
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    issues.push("AUTH_URL");
  }

  return {
    allowedEmail,
    googleId,
    googleSecret,
    issues,
    ready: issues.length === 0,
    secret,
    trustHost,
    url
  };
}

export function isAllowedAdminEmail(email: string | null | undefined) {
  const environment = getAuthEnvironment();
  return environment.ready && email?.trim().toLowerCase() === environment.allowedEmail;
}
