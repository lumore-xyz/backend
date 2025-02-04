// config/passport.js
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import User from "../models/User.js";

// Local Strategy (Email, Username, Phone Authentication)
passport.use(
  new LocalStrategy(
    { usernameField: "identifier" },
    async (identifier, password, done) => {
      try {
        const user = await User.findOne({
          $or: [
            { email: identifier },
            { username: identifier },
            { phoneNumber: identifier },
          ],
        });

        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid credentials" });
        }

        return done(null, user);
      } catch (error) {
        console.error("❌ Local Strategy Error:", error);
        return done(error);
      }
    }
  )
);

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id, emails, displayName } = profile;
        const email = emails?.[0]?.value;

        let user = await User.findOne({ googleId: id });

        if (!user) {
          // Check if user exists with the same email but without Google ID
          const existingUser = await User.findOne({ email });
          if (existingUser) {
            existingUser.googleId = id;
            await existingUser.save();
            return done(null, existingUser);
          }

          // Create a new user
          user = await User.create({
            googleId: id,
            email,
            username: displayName,
            isVerified: true,
          });
        }

        return done(null, user);
      } catch (error) {
        console.error("❌ Google OAuth Error:", error);
        return done(error);
      }
    }
  )
);

// Serialize User (Convert User Object to ID)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize User (Convert ID Back to User Object)
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    console.error("❌ Deserialize Error:", error);
    done(error, null);
  }
});

export default passport;
