/*
  Warnings:

  - You are about to drop the column `canJoinGroups` on the `TelegramUser` table. All the data in the column will be lost.
  - You are about to drop the column `canReadAllGroupMessages` on the `TelegramUser` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `TelegramUser` table. All the data in the column will be lost.
  - You are about to drop the column `supportsInlineQueries` on the `TelegramUser` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TelegramUser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TelegramUser" DROP COLUMN "canJoinGroups",
DROP COLUMN "canReadAllGroupMessages",
DROP COLUMN "createdAt",
DROP COLUMN "supportsInlineQueries",
DROP COLUMN "updatedAt";
