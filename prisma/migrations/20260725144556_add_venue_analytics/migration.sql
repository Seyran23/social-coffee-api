-- CreateEnum
CREATE TYPE "VisitSource" AS ENUM ('CHECK_IN', 'REDEMPTION');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "owner_id" TEXT;

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "VisitSource" NOT NULL,
    "campaign_id" TEXT,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_views" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "offer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visits_venue_id_visited_at_idx" ON "visits"("venue_id", "visited_at");

-- CreateIndex
CREATE INDEX "visits_venue_id_user_id_idx" ON "visits"("venue_id", "user_id");

-- CreateIndex
CREATE INDEX "visits_campaign_id_idx" ON "visits"("campaign_id");

-- CreateIndex
CREATE INDEX "venue_views_venue_id_viewed_at_idx" ON "venue_views"("venue_id", "viewed_at");

-- CreateIndex
CREATE INDEX "campaigns_venue_id_start_date_idx" ON "campaigns"("venue_id", "start_date");

-- CreateIndex
CREATE INDEX "venues_owner_id_idx" ON "venues"("owner_id");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_views" ADD CONSTRAINT "venue_views_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_views" ADD CONSTRAINT "venue_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
