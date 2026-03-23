-- CreateTable
CREATE TABLE "SchedulePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "serviceIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePlan_userId_scheduleId_key" ON "SchedulePlan"("userId", "scheduleId");

-- CreateIndex
CREATE INDEX "SchedulePlan_userId_idx" ON "SchedulePlan"("userId");

-- AddForeignKey
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
