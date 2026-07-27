-- CreateTable
CREATE TABLE "venue_strategies" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metrics_snapshot" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_strategies_venue_id_key" ON "venue_strategies"("venue_id");

-- AddForeignKey
ALTER TABLE "venue_strategies" ADD CONSTRAINT "venue_strategies_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
