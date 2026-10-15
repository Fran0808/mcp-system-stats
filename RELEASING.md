# Release process

## One-time npm setup

In the npm package settings for `@fran0808/system-stats`, configure a GitHub Actions trusted publisher:

- Owner: `Fran0808`
- Repository: `mcp-system-stats`
- Workflow file: `ci.yml`
- Environment: leave empty (this workflow has no GitHub environment)
- Allow direct `npm publish` if you want a matching version tag to publish automatically.

This account-side setup cannot be completed by committing a workflow. Current npm rules may expire an unvalidated publisher configuration after two days; configure it when ready to publish. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

The workflow grants `id-token: write`, installs npm 11 (11.5.1 or later is required), and publishes with provenance. It does not use `NPM_TOKEN` or `NODE_AUTH_TOKEN`. After a successful OIDC publish, obsolete publishing tokens can be revoked in the account settings.

## Prepare a release

1. Choose the version using SemVer. Fixes that preserve the contract are patches; compatible additions are minor releases; API/runtime incompatibilities require a major release. Do not rewrite published tags or versions.
2. Update package.json and package-lock.json together (`npm version ... --no-git-tag-version` can do this), and update CHANGELOG.md. The handshake reads the package version automatically.
3. Run:

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run test:integration
   npm run test:package
   npm run check:release
   npm audit
   ```

4. Review the changes and confirm CI passes on all supported platforms and Node versions.
5. When ready to publish, commit the release and create a tag exactly matching `v<package.json version>`. Push that commit and tag. The workflow checks the tag against package.json, package-lock.json and the runtime before publishing.

`npm pack`/`npm publish` automatically runs `prepack` to compile TypeScript. `test:package` installs the generated tarball with production dependencies into a verified temporary directory and checks the real stdio handshake, schemas, tools, resources and prompts.
