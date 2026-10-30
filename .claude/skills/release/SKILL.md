---
name: release
description: Release develop as a new version. Checks, proposes the version and release notes for approval, then pushes develop to main with the tag, which builds and deploys.
disable-model-invocation: true
---

# Release

A release is one atomic push of `develop` to `main` plus an annotated tag `X.Y.Z`. The push runs `.github/workflows/release.yml`, which builds the images, tags them `X.Y.Z`, `X.Y`, `X` and `latest`, and deploys production. The GitHub Release is the changelog: there is no `CHANGELOG.md` and no release commit.

## 1. Preflight

Run `bash scripts/release/prepare.sh`. It refuses unless `develop` is checked out, clean, equal to `origin/develop`, fast-forwardable onto `main`, and passing `check-types` and `check`. On a refusal, report its message and stop. Never work around one.

Its output: the last version, the minimum bump from commit types, every commit since the last version, the self-host-facing diff, and one-way changes.

## 2. Version

Start from the minimum bump. You may raise it, never lower it. Raise to major when a self-hoster must act before updating (a new required variable, a removed setting, a manual data step), even if no commit is marked breaking.

## 3. Release notes

Write them to a file in your scratchpad. Readers are the people the changes reach, in this order, each section only if it has content:

- `### Server admins` for anything the bot or dashboard does differently.
- `### Self-hosters` for compose, `.env`, image or update-procedure changes, with the exact action to take.

Leave out internal changes (refactors, CI, docs, tests). If nothing reaches either audience, write one line saying the release contains internal changes only.

Follow "Copy voice" in `.claude/CLAUDE.md`: state first, one idea per sentence, the glossary's words (publish, auto-publish, server, filter, condition), no internal names. Match the shape of earlier releases (`gh release view <last version>`): a bold lead sentence per bullet, no commit hashes or PR numbers.

## 4. Approval

Show the maintainer the version, the reason for the bump, the notes, and every one-way change from the preflight. A one-way change cannot be undone by the automatic rollback, so say that it must be watched live. Ask for approval with AskUserQuestion: approve, or change the version or notes. Publish nothing without an explicit approval in this conversation.

## 5. Publish

Run `bash scripts/release/publish.sh <X.Y.Z> <notes-file>` with `run_in_background`: it waits for the build and deploy, which take longer than a foreground command may run. It tags, pushes `develop:main` with the tag in one atomic push, creates a draft GitHub Release and publishes it once the workflow passes.

When it finishes, report the release URL. If the workflow failed, report its run URL: the draft stays unpublished, and production is back on the previous deploy if the deploy step failed.
