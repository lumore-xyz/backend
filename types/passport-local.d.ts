declare module "passport-local" {
  import { Strategy } from "passport-strategy";
  interface LocalStrategyOptions {
    usernameField?: string;
    passwordField?: string;
    passReqToCallback?: boolean;
  }

  class LocalStrategy extends Strategy {
    constructor(
      options: LocalStrategyOptions,
      verify: (
        username: string,
        password: string,
        done: (err: any, user?: any, info?: any) => void
      ) => void
    );
  }

  export = LocalStrategy;
}
