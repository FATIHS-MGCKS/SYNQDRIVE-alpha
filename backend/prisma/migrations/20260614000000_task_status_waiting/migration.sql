-- V4.8.3 Task Action Layer — add the WAITING status.
-- Kept in its own migration: PostgreSQL forbids using a freshly added enum
-- value within the same transaction that adds it, so the column/table changes
-- live in the following migration.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'WAITING';
