import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';

import * as config from '@/config';
import { findUserById } from '@/controllers/user';
import Team from '@/models/team';
import type { UserDocument } from '@/models/user';
import User from '@/models/user';

import logger from './logger';

passport.serializeUser(function (user, done) {
  done(null, (user as any)._id);
});

passport.deserializeUser(function (id: string, done) {
  findUserById(id)
    .then(user => {
      if (user == null) {
        return done(new Error('User not found'));
      }
      done(null, user as UserDocument);
    })
    .catch(done);
});

// Use local passport strategy via passport-local-mongoose plugin
const passportLocalMongooseAuthenticate = (User as any).authenticate();

passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
    },
    async function (username, password, done) {
      try {
        const { user, error } = await passportLocalMongooseAuthenticate(
          username,
          password,
        );
        if (error) {
          logger.info({
            message: `Login for "${username}" failed, ${error}"`,
            type: 'user_login',
            authType: 'password',
          });
        }
        return done(null, user, error);
      } catch (err) {
        logger.error({ err, username }, 'Login failed with error');
        return done(err);
      }
    },
  ),
);

if (config.GOOGLE_SSO_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new Error('No email returned from Google'));
          }

          // Domain allow-list check
          if (config.GOOGLE_ALLOWED_DOMAINS.length > 0) {
            const domain = email.split('@')[1];
            if (!config.GOOGLE_ALLOWED_DOMAINS.includes(domain)) {
              logger.info(
                { email, domain },
                'Google SSO blocked: domain not in allow-list',
              );
              return done(null, false, 'domainNotAllowed' as any);
            }
          }

          // Return existing user
          const existingUser = await User.findOne({ email });
          if (existingUser) {
            logger.info({ email }, 'Google SSO login: existing user');
            return done(null, existingUser as UserDocument);
          }

          // New user — join the existing team (single-team deployment)
          const team = await Team.findOne({});
          if (!team) {
            return done(new Error('No team found; complete initial setup first'));
          }

          const newUser = new User({
            email,
            name: profile.displayName || email,
            team: team._id,
          });
          await newUser.save();

          logger.info({ email, teamId: team._id }, 'Google SSO login: new user created');
          return done(null, newUser as UserDocument);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );
}

export default passport;
