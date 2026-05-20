export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_SECRET?: string;
  SMS_PROVIDER?: string;
  SMS_API_KEY?: string;
  SMS_WEBHOOK_URL?: string;
  DEV_SMS_CODES?: string;
  APP_ORIGIN?: string;
  ADMIN_RESET_KEY?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface ApiSuccessBody<T> {
  data: T;
}
