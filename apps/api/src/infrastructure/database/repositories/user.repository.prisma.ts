// user.repository.prisma.ts
import { Prisma, type User } from "@/generated/prisma/client";
import { getDb } from "../client";
import { ConflictError } from "@/shared/errors";
import { TryCatch, NEXT, type Resolver } from "@/shared/utils/try-catch";
import type { CreateUserInput, IUserRepository, UserRecord } from "./user.repository";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

const resolveDuplicateEmail = (email: string): Resolver<User> => (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new ConflictError(`User with email ${email} already exists`);
    }
    return NEXT;
};

function toUserRecord(user: User): UserRecord {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        secondName: user.secondName,
        passwordHash: user.passwordHash,
        createdAt: user.createdAt.toISOString(),
    };
}

export class PrismaUserRepository implements IUserRepository {
    async create(input: CreateUserInput): Promise<UserRecord> {
        const db = getDb();
        const user = await TryCatch.of(() =>
            db.user.create({
                data: {
                    email: input.email,
                    firstName: input.firstName,
                    secondName: input.secondName,
                    passwordHash: input.passwordHash,
                },
            })
        ).onError(resolveDuplicateEmail(input.email));
        return toUserRecord(user);
    }

    async findByEmail(email: string): Promise<UserRecord | null> {
        const db = getDb();
        const user = await db.user.findUnique({ where: { email } });
        return user ? toUserRecord(user) : null;
    }
}
