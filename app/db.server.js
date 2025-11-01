import { PrismaClient } from "@prisma/client";

// Create a singleton Prisma Client instance
const createPrismaClient = () => {
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  } catch (error) {
    console.error("Failed to create Prisma Client:", error);
    throw new Error(
      "Prisma Client initialization failed. Please run: npx prisma generate"
    );
  }
};

// Use global variable to prevent multiple instances in development
let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = createPrismaClient();
} else {
  if (typeof global !== "undefined") {
    if (!global.prismaGlobal) {
      global.prismaGlobal = createPrismaClient();
    }
    prisma = global.prismaGlobal;
  } else {
    prisma = createPrismaClient();
  }
}

// Validate that Prisma Client has Customer model
if (!prisma) {
  throw new Error("Prisma Client is not initialized");
}

export default prisma;
