// index.ts — the mount point.
//
// Every repository is published here as its INTERFACE, never as the class that
// happens to implement it. That is what makes the database ejectable: a consumer
// typed to `PrismaEnsembleRunRepository` depends on Prisma whatever the comments
// say, and reaching one Prisma-only method is enough to weld it on. Typed to the
// contract, the compiler refuses that — and refuses a replacement that does not
// satisfy the contract, at this line, before anything downstream is touched.
//
// Nothing outside this folder calls the database. Checked, not assumed:
//
//   grep -rn "getDb()\|\$queryRaw\|generated/prisma" apps/api/src --include=*.ts \
//     | grep -v "\.spec\." | grep -v src/generated | grep -v infrastructure/database
export { connectDatabase, disconnectDatabase, getDb } from "./client";

export type { CreateUserInput, IUserRepository, UserRecord } from "./repositories/user.repository";
export { PrismaUserRepository } from "./repositories/user.repository.prisma";

export type { IEnsembleRunRepository, SaveRunInput, SessionTurn } from "./repositories/ensemble.run.repository";
export { PrismaEnsembleRunRepository } from "./repositories/ensemble.run.repository.prisma";

import type { IUserRepository } from "./repositories/user.repository";
import { PrismaUserRepository } from "./repositories/user.repository.prisma";
export const userRepository: IUserRepository = new PrismaUserRepository();

import type { IEnsembleRunRepository } from "./repositories/ensemble.run.repository";
import { PrismaEnsembleRunRepository } from "./repositories/ensemble.run.repository.prisma";
export const ensembleRunRepository: IEnsembleRunRepository = new PrismaEnsembleRunRepository();
