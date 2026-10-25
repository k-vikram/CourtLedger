export type Bindings = {
  DB: D1Database;
  APP_ORIGINS: string;
  COOKIE_NAME: string;
  OWNER_NAME: string;
  OWNER_RECOVERY_TOKEN_HASH: string;
};

export type Member = {
  id: string;
  display_name: string;
  role: 'owner' | 'scorer';
  active: number;
  system_owner: number;
};

export type Variables = {
  requestId: string;
  member: Member;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
