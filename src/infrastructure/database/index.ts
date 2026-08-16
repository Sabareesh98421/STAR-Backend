// index.ts
export { connectDatabase, disconnectDatabase, getDb } from "./client";
export type { CreateUserInput, IUserRepository, UserRecord } from "./repositories/user.repository";
export { PrismaUserRepository } from "./repositories/user.repository.prisma";

import { PrismaUserRepository } from "./repositories/user.repository.prisma";
export const userRepository = new PrismaUserRepository();
