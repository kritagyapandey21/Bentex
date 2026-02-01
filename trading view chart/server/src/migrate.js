/**
 * Database migration runner
 */

import { runMigrations } from './db.js';

console.log('Running database migrations...');
runMigrations();
console.log('Done!');
