-- ZB-I integration P1: add REGISTRATION_CERTIFICATE document type (isolated migration — do not run on production until owner approval).
ALTER TYPE "DocumentExtractionType" ADD VALUE IF NOT EXISTS 'REGISTRATION_CERTIFICATE';
