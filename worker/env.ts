export interface Env {
  ASSETS:Fetcher;
  DB:D1Database;
  EMAIL?:SendEmail;
  GOOGLE_CLIENT_ID?:string;
  APP_ORIGIN?:string;
  ADMIN_API_TOKEN?:string;
  LINK_VERIFIER_PUBLIC_KEY?:string;
  GA_MEASUREMENT_ID?:string;
  RELEASE_REVISION?:string;
  TURNSTILE_SITE_KEY?:string;
  TURNSTILE_SECRET?:string;
  TURNSTILE_HOSTNAMES?:string;
}
