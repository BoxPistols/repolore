import { hello } from '../bar/b.js';

export function greet(): string {
  return hello() + ' from a';
}
