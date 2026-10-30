-- Email is optional for customer accounts. New registrations are identified
-- and verified by their required phone number; administrator invitations and
-- Google accounts may still retain an email address.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
