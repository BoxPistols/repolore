import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function readHeadCommit(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}
