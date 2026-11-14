// Env comes from the monorepo .env, which Bun loads (--env-file in this
// app's scripts, inherited from the root script otherwise). No dotenv:
// Bun reads .env natively, so the package was a Node habit, not a need.
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: process.env.DATABASE_URL,
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    },
});
