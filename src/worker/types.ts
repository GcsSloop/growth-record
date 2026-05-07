export interface Env {
  DB: D1Database;
  SESSION_SECRET?: string;
  SMS_PROVIDER?: string;
  SMS_API_KEY?: string;
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
