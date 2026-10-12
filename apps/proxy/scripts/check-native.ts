import { createRequire } from 'node:module';

// bullmq silently falls back to plain-JS msgpack when the prebuild is missing.
const msgpackr = createRequire(import.meta.resolve('bullmq'))('msgpackr');
if (!msgpackr.isNativeAccelerationEnabled) throw new Error('msgpackr-extract did not load');
