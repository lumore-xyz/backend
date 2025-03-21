declare module "passport-google-oauth20" {
  import { Strategy as PassportStrategy } from "passport-strategy";

  interface Profile {
    id: string;
    displayName?: string;
    emails?: Array<{ value: string; verified?: boolean }>;
  }

  interface VerifyCallback {
    (error: any, user?: any, info?: any): void;
  }

  class Strategy extends PassportStrategy {
    constructor(
      options: {
        clientID: string;
        clientSecret: string;
        callbackURL: string;
      },
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback
      ) => void
    );
  }

  export { Strategy, Profile, VerifyCallback };
}
