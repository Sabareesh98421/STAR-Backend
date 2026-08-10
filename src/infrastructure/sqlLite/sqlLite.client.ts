// db.client.ts
import { Database } from "bun:sqlite";
import { logger } from "@/infrastructure/logger";
import { AppError } from "@/shared/errors";
import appErrorCodes from "@/shared/errors/app.error.codes";
import {type EmailSignupRequest } from '@/modules/auth/providers/email/email.schema';

class DB {
    private db: Database | null = null;

    public connectDb(path: string = "app.sqlite"): DB|undefined{
        try {
            this.db =  new Database(path, { create: true });
            this.db.run("PRAGMA journal_mode = WAL;"); // safer under concurrent access
             this.db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                );
            `);
            return this;
        } catch (error: unknown) {
            logger.error(error);
            throw new AppError(
                "Failed to open SQLite database",
                appErrorCodes.dbStartError.toString(),
                500
            );
        }
    }

    private ensureConnected(): Database {
        if (!this.db) {
            throw new AppError(
                "Db is not yet started, connect it first",
                appErrorCodes.dbStartError.toString(),
                500
            );
        }
        return this.db;
    }

    public set(data: EmailSignupRequest): void {
        if (!data.email) {
            throw new AppError("User data missing id", appErrorCodes.invalidInput.toString(), 400);
        }
        const db = this.ensureConnected();
        db.query(
            `INSERT INTO users (id, data) VALUES ($id, $data)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data;`
        ).run({ $id: data.email, $data: JSON.stringify(data) });
    }

    public get(id: string): unknown | null {
        const db = this.ensureConnected();
        const row = db.query(`SELECT data FROM users WHERE id = $id;`).get({ $id: id }) as
            | { data: string }
            | null;
        return row ? JSON.parse(row.data) : null;
    }

    public disconnect(): void {
        this.db?.close();
        this.db = null;
    }
}

export const db = new DB();