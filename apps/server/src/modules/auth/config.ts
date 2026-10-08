export interface AuthConfig {
  sessionSecret: string;
  allowedOrigins: string[];
  secureCookies: boolean;
}

export function authConfigFromEnvironment(environment: NodeJS.ProcessEnv): AuthConfig {
  const sessionSecret = environment.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 64) throw new Error('SESSION_SECRET must contain at least 64 characters. Run npm run setup.');
  const allowedOrigins = (environment.APP_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowedOrigins.length) throw new Error('APP_ORIGINS is required.');
  const insecureLocal = environment.ALLOW_INSECURE_LOCAL_HTTP === 'true';
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.origin !== origin) throw new Error('APP_ORIGINS must contain origins without paths or credentials.');
    if (url.protocol !== 'https:' && !(insecureLocal && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
      throw new Error('HTTP origins are only allowed for explicit loopback development.');
    }
  }
  return { sessionSecret, allowedOrigins, secureCookies: !insecureLocal };
}
