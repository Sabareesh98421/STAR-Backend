// user.repository.ts
export interface CreateUserInput {
    email: string;
    firstName: string;
    secondName: string | null;
    passwordHash: string;
}

export interface UserRecord {
    id: string;
    email: string;
    firstName: string;
    secondName: string | null;
    passwordHash: string;
    createdAt: string;
}

export interface IUserRepository {
    create(input: CreateUserInput): Promise<UserRecord>;
    findByEmail(email: string): Promise<UserRecord | null>;
}
