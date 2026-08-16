// database.config.ts
export const databaseConfig = {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/star_dev",
};
