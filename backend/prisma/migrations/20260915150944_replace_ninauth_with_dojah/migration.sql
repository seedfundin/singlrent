-- The NINAuth OAuth session table was introduced before SingleRent selected
-- Dojah's direct NIN lookup. It contains only short-lived provider sessions.
ALTER TABLE "ninauth_verifications" DROP CONSTRAINT "ninauth_verifications_userId_fkey";

DROP TABLE "ninauth_verifications";
