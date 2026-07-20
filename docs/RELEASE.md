# Release Checklist

Releases are cut from `main` after tests, package checks, and version metadata checks pass.

## Preconditions

- npm account is logged in locally.
- npm scope ownership is confirmed for scoped packages.
- No npm token, OTP, or auth value is committed to the repository.
- `CHANGELOG.md` has a dated entry for the release.
- `main` is clean and synced with `origin/main`.

## Validate

```sh
npm run release:check
```

`release:check` runs tests, builds all workspaces, dry-runs package packing, and verifies that workspace package versions, package-lock versions, and adapter `@youp-grid/core` dependencies all match the root version.

When registry access and npm auth are available, run the networked publish dry-run before the real publish:

```sh
npm run publish:dry-run
```

## Version

Update the root workspace version and all package versions together:

- `package.json`
- `packages/core/package.json`
- `packages/formula/package.json`
- `packages/charts-echarts/package.json`
- `packages/react/package.json`
- `packages/vue/package.json`
- `packages/vanilla/package.json`
- `package-lock.json`

All adapter packages must depend on the same `@youp-grid/core` version.

```sh
npm version 0.0.0 --workspaces --include-workspace-root --no-git-tag-version
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/formula
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/charts-echarts
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/react
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/vue
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/vanilla
npm install --package-lock-only --ignore-scripts --fund=false --audit=false
npm run release:check
```

## Publish

Publish from core to adapters. Enter OTP only in the npm prompt when required; do not put tokens or OTP values in committed files.

```sh
npm publish -w @youp-grid/core --access public
npm publish -w @youp-grid/formula --access public
npm publish -w @youp-grid/charts-echarts --access public
npm publish -w @youp-grid/react --access public
npm publish -w @youp-grid/vue --access public
npm publish -w @youp-grid/vanilla --access public
```

If the local npm cache has permission issues, use the project release cache explicitly:

```sh
npm publish -w @youp-grid/core --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/formula --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/charts-echarts --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/react --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/vue --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/vanilla --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
```

## Verify

```sh
npm view @youp-grid/core version
npm view @youp-grid/formula version
npm view @youp-grid/charts-echarts version
npm view @youp-grid/react version
npm view @youp-grid/vue version
npm view @youp-grid/vanilla version
```

Create and push a git tag, then create the GitHub release after the npm versions are visible:

```sh
git tag v0.0.0
git push origin v0.0.0
gh release create v0.0.0 --title "v0.0.0" --notes "Release notes"
```

The release is complete only when the root package version, workspace package versions, git tag, GitHub release tag, and npm `view` versions all match.
