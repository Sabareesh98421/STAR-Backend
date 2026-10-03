// worker.ts
import { logger } from '@/infrastructure/logger';
import { toAppError } from '@/shared/utils/try-catch';

export function createWorker<T extends unknown[]>(
    name: string,
    logic: (...args: T) => Promise<unknown>,
): (...args: T) => void {
    return (...args: T): void => {
        void logic(...args).catch((error) => {
            logger.error({ err: toAppError(error), job: name }, 'Background job failed');
        });
    };
}
