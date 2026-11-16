import { monotonicFactory } from 'ulid';

const factory = monotonicFactory();

/** ULID generated in code, never by the database. */
export const newId = (): string => factory();
