const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthEnvironment = {
  allowedEmails: string[];
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

export function parseAllowedAdminEmails(value: string | undefined) {
  const emails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase());

  if (emails.length === 0 || emails.some((email) => !emailPattern.test(email))) {
    return null;
  }

  return [...new Set(emails)];
}

export function getAuthEnvironment(): AuthEnvironment {
  const secret = read("AUTH_SECRET");
  const googleId = read("AUTH_GOOGLE_ID");
  const googleSecret = read("AUTH_GOOGLE_SECRET");
  const allowedEmails = parseAllowedAdminEmails(process.env.AUTH_ALLOWED_EMAIL);
  const trustHost = read("AUTH_TRUST_HOST").toLowerCase() === "true";
  const url = read("AUTH_URL");
  const issues: string[] = [];

  if (secret.length < 32) issues.push("AUTH_SECRET");
  if (!googleId) issues.push("AUTH_GOOGLE_ID");
  if (!googleSecret) issues.push("AUTH_GOOGLE_SECRET");
  if (!allowedEmails) issues.push("AUTH_ALLOWED_EMAIL");
  if (!trustHost) issues.push("AUTH_TRUST_HOST");
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    issues.push("AUTH_URL");
  }

  return {
    allowedEmails: allowedEmails ?? [],
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
  const normalizedEmail = email?.trim().toLowerCase();
  return environment.ready
    && normalizedEmail !== undefined
    && environment.allowedEmails.includes(normalizedEmail);
}
