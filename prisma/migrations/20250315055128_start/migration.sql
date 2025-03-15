-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "isBot" BOOLEAN NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "languageCode" TEXT,
    "isPremium" BOOLEAN,
    "addedToAttachmentMenu" BOOLEAN,
    "canJoinGroups" BOOLEAN,
    "canReadAllGroupMessages" BOOLEAN,
    "supportsInlineQueries" BOOLEAN,
    "messagesSentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_userId_key" ON "TelegramUser"("userId");
