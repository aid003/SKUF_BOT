"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
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
