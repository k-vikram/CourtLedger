import { createHash, randomBytes } from 'node:crypto';

const token = `cl_owner_${randomBytes(32).toString('base64url')}`;
const hash = createHash('sha256').update(token).digest('hex');

console.log('Owner recovery token (save this in your password manager):');
console.log(token);
console.log('\nOWNER_RECOVERY_TOKEN_HASH (store as a Worker secret):');
console.log(hash);
