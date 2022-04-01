import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { argStringToArray } from '@actions/exec/lib/toolrunner';
import { saveCache, restoreCache } from '@actions/cache';
import { exec } from '@actions/exec';

import * as core from '@actions/core';
import * as github from '@actions/github';

function hashString(content: string) {
    const sha256 = createHash('sha256');
    return sha256.update(content).digest('hex');
}

function getPythonVersion() {
    const args = ['-c', 'import sys;print(sys.executable+"\\n"+sys.version)'];
    const res = spawnSync('python', args);
    if (res.status !== 0) {
        throw 'python version check failed';
    }
    return res.stdout.toString();
}

function hashFile(filePath: string) {
    return hashString(readFileSync(filePath).toString());
}

function addToken(url: string, token: string) {
    return url.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

async function main() {
    await core.group('install pre-commit', async () => {
        await exec('pip', ['install', 'pre-commit']);
        await exec('pip', ['freeze', '--local']);
    });

    const args = [
        'run',
        '--show-diff-on-failure',
        '--color=always',
        ...argStringToArray(core.getInput('extra_args')),
    ];
    const token = core.getInput('token');
    const git_user_name = core.getInput('git_user_name');
    const git_user_email = core.getInput('git_user_email');
    const pr = github.context.payload.pull_request;
    const push = !!token && !!pr;

    const cachePaths = [join(homedir(), '.cache', 'pre-commit')];
    const py = getPythonVersion();
    const cacheKey = `pre-commit-2-${hashString(py)}-${hashFile('.pre-commit-config.yaml')}`;
    const restored = await restoreCache(cachePaths, cacheKey);
    const ret = await exec('pre-commit', args, {ignoreReturnCode: push});
    if (!restored) {
        try {
            await saveCache(cachePaths, cacheKey);
        } catch (e) {
            core.warning(
                `There was an error saving the pre-commit environments to cache:

                ${e.message || e}

                This only has performance implications and won't change the result of your pre-commit tests.
                If this problem persists on your default branch, you can try to fix it by editing your '.pre-commit-config.yaml'.
                For example try to run 'pre-commit autoupdate' or simply add a blank line.
                This will result in a different hash value and thus a different cache target.`.replace(/^ +/gm, '')
            );
        }
    }

    if (ret && push) {
        // actions do not run on pushes made by actions.
        // need to make absolute sure things are good before pushing
        // TODO: is there a better way around this limitation?
        await exec('pre-commit', args);

        const diff = await exec(
            'git', ['diff', '--quiet'], {ignoreReturnCode: true}
        );
        if (diff) {
            await core.group('push fixes', async () => {
                await exec('git', ['config', 'user.name', git_user_name]);
                await exec(
                    'git', ['config', 'user.email', git_user_email]
                );

                const branch = pr.head.ref;
                await exec('git', ['checkout', 'HEAD', '-B', branch]);

                await exec('git', ['commit', '-am', 'pre-commit fixes']);
                const url = addToken(pr.head.repo.clone_url, token);
                await exec('git', ['push', url, 'HEAD']);
            });
        }
    }
}

main().catch((e) => core.setFailed(e.message));
