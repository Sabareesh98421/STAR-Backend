import { test, expect } from "@playwright/test";
import { logger } from "@/infrastructure/logger";
import { NotFoundError } from "@/shared/errors";
import { createWorker } from "./worker";

const settled = () => new Promise((resolve) => setTimeout(resolve, 10));

test.describe("createWorker", () => {
    test("runs the logic with the arguments it was called with", async () => {
        const seen: string[] = [];
        const run = createWorker("collector", async (value: string) => {
            seen.push(value);
        });

        expect(run("first")).toBeUndefined();
        run("second");
        await settled();

        expect(seen).toEqual(["first", "second"]);
    });

    test("logs a failing job instead of rejecting", async () => {
        const logged: Record<string, unknown>[] = [];
        const original = logger.error.bind(logger);
        logger.error = (payload: Record<string, unknown>) => { logged.push(payload); };

        try {
            const run = createWorker("failing-job", async () => {
                throw new NotFoundError("Pending signup");
            });
            run();
            await settled();

            expect(logged).toHaveLength(1);
            expect(logged[0]?.job).toBe("failing-job");
            expect(logged[0]?.err).toBeInstanceOf(NotFoundError);
        } finally {
            logger.error = original;
        }
    });
});
