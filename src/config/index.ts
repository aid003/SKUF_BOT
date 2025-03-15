import dotenv from "dotenv";

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN,
  roleForBroadcast: process.env.ROLE_FOR_BROADCAST,
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  broadcastLimit: Number(process.env.BROADCAST_LIMIT),
  strapiUrl: process.env.STRAPI_URL,
  paymentUrl: process.env.PAYMENT_URL,
  secretKey: process.env.PRODAMUS_SECRET_KEY,
  amount: Number(process.env.AMOUNT),
};
