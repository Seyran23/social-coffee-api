-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('USER', 'ADMIN', 'CAFE_MANAGER');

-- CreateEnum
CREATE TYPE "public"."ChatSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."LookingFor" AS ENUM ('ROMANTIC_RELATIONSHIP', 'CASUAL_DATING', 'FRIENDSHIP', 'NETWORKING', 'ACTIVITY_PARTNER', 'STUDY_BUDDY', 'LANGUAGE_EXCHANGE', 'COFFEE_CHAT', 'EVENTS_COMPANION');

-- CreateEnum
CREATE TYPE "public"."VenueStatus" AS ENUM ('ACTIVE', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED');

-- CreateEnum
CREATE TYPE "public"."InteractionType" AS ENUM ('LIKE');

-- CreateEnum
CREATE TYPE "public"."TokenType" AS ENUM ('REFRESH', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "public"."users"
(
  "id"                TEXT              NOT NULL,
  "first_name"        TEXT              NOT NULL,
  "last_name"         TEXT              NOT NULL,
  "birth_date"        TIMESTAMP(3)      NOT NULL,
  "email"             TEXT              NOT NULL,
  "password_hash"     TEXT              NOT NULL,
  "gender"            "public"."Gender" NOT NULL,
  "role"              "public"."Role"   NOT NULL DEFAULT 'USER',
  "profile_image_url" TEXT,
  "bio"               VARCHAR(500)      NOT NULL,
  "created_at"        TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3)      NOT NULL,
  "deleted_at"        TIMESTAMP(3),

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."preferences"
(
  "id"               TEXT              NOT NULL,
  "user_id"          TEXT              NOT NULL,
  "min_age"          INTEGER           NOT NULL,
  "max_age"          INTEGER           NOT NULL,
  "preferred_gender" "public"."Gender" NOT NULL,
  "looking_for"      "public"."LookingFor"[],

  CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."venues"
(
  "id"              TEXT                   NOT NULL,
  "name"            TEXT                   NOT NULL,
  "map_url"         TEXT                   NOT NULL,
  "latitude"        DOUBLE PRECISION,
  "longitude"       DOUBLE PRECISION,
  "geofence_meters" INTEGER                NOT NULL DEFAULT 150,
  "status"          "public"."VenueStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at"      TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)           NOT NULL,

  CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_sessions"
(
  "id"         TEXT                         NOT NULL,
  "venue_id"   TEXT                         NOT NULL,
  "user1_id"   TEXT,
  "user2_id"   TEXT,
  "status"     "public"."ChatSessionStatus" NOT NULL DEFAULT 'PENDING',
  "started_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)                 NOT NULL,

  CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."interests"
(
  "id"         TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_interests"
(
  "user_id"     TEXT         NOT NULL,
  "interest_id" TEXT         NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id", "interest_id")
);

-- CreateTable
CREATE TABLE "public"."messages"
(
  "id"              TEXT         NOT NULL,
  "chat_session_id" TEXT         NOT NULL,
  "sender_id"       TEXT         NOT NULL,
  "content"         TEXT         NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."interactions"
(
  "id"             TEXT                       NOT NULL,
  "venue_id"       TEXT                       NOT NULL,
  "actor_user_id"  TEXT                       NOT NULL,
  "target_user_id" TEXT                       NOT NULL,
  "type"           "public"."InteractionType" NOT NULL,
  "created_at"     TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tokens"
(
  "id"          TEXT                 NOT NULL,
  "user_id"     TEXT                 NOT NULL,
  "token"       TEXT                 NOT NULL,
  "type"        "public"."TokenType" NOT NULL,
  "device_info" TEXT,
  "ip_address"  VARCHAR(45),
  "created_at"  TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"  TIMESTAMP(3)         NOT NULL,

  CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users" ("email");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_user_id_key" ON "public"."preferences" ("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_venue_id_idx" ON "public"."chat_sessions" ("venue_id");

-- CreateIndex
CREATE INDEX "chat_sessions_status_idx" ON "public"."chat_sessions" ("status");

-- CreateIndex
CREATE INDEX "chat_sessions_expires_at_idx" ON "public"."chat_sessions" ("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "interests_name_key" ON "public"."interests" ("name");

-- CreateIndex
CREATE INDEX "user_interests_interest_id_idx" ON "public"."user_interests" ("interest_id");

-- CreateIndex
CREATE INDEX "messages_chat_session_id_idx" ON "public"."messages" ("chat_session_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "public"."messages" ("sender_id");

-- CreateIndex
CREATE INDEX "interactions_actor_user_id_idx" ON "public"."interactions" ("actor_user_id");

-- CreateIndex
CREATE INDEX "interactions_target_user_id_idx" ON "public"."interactions" ("target_user_id");

-- CreateIndex
CREATE INDEX "interactions_venue_id_idx" ON "public"."interactions" ("venue_id");

-- CreateIndex
CREATE UNIQUE INDEX "interactions_venue_id_actor_user_id_target_user_id_type_key" ON "public"."interactions" ("venue_id",
                                                                                                              "actor_user_id",
                                                                                                              "target_user_id",
                                                                                                              "type");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_token_key" ON "public"."tokens" ("token");

-- CreateIndex
CREATE INDEX "tokens_user_id_type_idx" ON "public"."tokens" ("user_id", "type");

-- CreateIndex
CREATE INDEX "tokens_token_idx" ON "public"."tokens" ("token");

-- CreateIndex
CREATE INDEX "tokens_expires_at_idx" ON "public"."tokens" ("expires_at");

-- AddForeignKey
ALTER TABLE "public"."preferences"
  ADD CONSTRAINT "preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_sessions"
  ADD CONSTRAINT "chat_sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_sessions"
  ADD CONSTRAINT "chat_sessions_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_sessions"
  ADD CONSTRAINT "chat_sessions_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_interests"
  ADD CONSTRAINT "user_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_interests"
  ADD CONSTRAINT "user_interests_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "public"."interests" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."interactions"
  ADD CONSTRAINT "interactions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."interactions"
  ADD CONSTRAINT "interactions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."interactions"
  ADD CONSTRAINT "interactions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tokens"
  ADD CONSTRAINT "tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
