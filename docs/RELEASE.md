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

`release:check` runs tests, builds all workspaces, dry-runs package packing, and verifies that all seven workspace versions, internal dependencies, and root/demo lockfile metadata match the root version. Run `npm run verify` to include the React/Vue browser workflow tests.

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
- `packages/xlsx/package.json`
- `package-lock.json`
- `examples/react-basic/package-lock.json`

All internal dependencies must use the release version, including `@youp-grid/core` and the React/Vue dependencies on `@youp-grid/vanilla`. Replace `0.0.0` below with the intended release version.

```sh
npm version 0.0.0 --workspaces --include-workspace-root --no-git-tag-version --ignore-scripts --workspaces-update=false
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/formula
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/charts-echarts
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/react
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/vue
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/vanilla
npm pkg set "dependencies.@youp-grid/core=0.0.0" -w @youp-grid/xlsx
npm pkg set "dependencies.@youp-grid/vanilla=0.0.0" -w @youp-grid/react -w @youp-grid/vue
npm install --package-lock-only --ignore-scripts --fund=false --audit=false
npm install --prefix examples/react-basic --package-lock-only --ignore-scripts --fund=false --audit=false
npm run verify
```

## Publish

After validation, commit and push the release metadata. Publish dependencies before their consumers. The root package is private; publish the seven workspaces below. Enter OTP only in the npm prompt when required; do not put tokens or OTP values in committed files.

```sh
npm publish -w @youp-grid/core --access public
npm publish -w @youp-grid/vanilla --access public
npm publish -w @youp-grid/formula --access public
npm publish -w @youp-grid/xlsx --access public
npm publish -w @youp-grid/charts-echarts --access public
npm publish -w @youp-grid/react --access public
npm publish -w @youp-grid/vue --access public
```

If the local npm cache has permission issues, use the project release cache explicitly:

```sh
npm publish -w @youp-grid/core --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/vanilla --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/formula --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/xlsx --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/charts-echarts --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/react --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
npm publish -w @youp-grid/vue --access public --registry=https://registry.npmjs.org/ --cache /private/tmp/youp-grid-npm-cache
```

## Verify

```sh
npm view @youp-grid/core version
npm view @youp-grid/formula version
npm view @youp-grid/charts-echarts version
npm view @youp-grid/react version
npm view @youp-grid/vue version
npm view @youp-grid/vanilla version
npm view @youp-grid/xlsx version
```

Create and push a git tag, then create the GitHub release after the npm versions are visible:

```sh
git tag v0.0.0
git push origin v0.0.0
gh release create v0.0.0 --title "v0.0.0" --notes "Release notes"
```

The release is complete only when the root package version, workspace package versions, git tag, GitHub release tag, and npm `view` versions all match.
