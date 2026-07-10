-- Platform-wide default outbound email sender (Master Admin configurable)
CREATE TABLE "platform_email_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "default_from_email" TEXT NOT NULL,
    "default_from_name" TEXT NOT NULL,
    "default_reply_to_email" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_email_settings_pkey" PRIMARY KEY ("id")
);
