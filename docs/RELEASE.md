# Release Checklist

Releases are cut from `main` after tests and package checks pass.

## Preconditions

- npm account is logged in locally.
- npm scope ownership is confirmed for scoped packages.
- No npm token, OTP, or auth value is committed to the repository.
- `CHANGELOG.md` has a dated entry for the release.

## Validate

```sh
npm test
npm run build
npm run pack:dry-run
```

## Version

Update the root workspace version and both package versions together:

- `package.json`
- `packages/core/package.json`
- `packages/react/package.json`
- `package-lock.json`

`@youp-grid/react` must depend on the same `@youp-grid/core` version.

## Publish

```sh
npm publish -w @youp-grid/core --access public
npm publish -w @youp-grid/react --access public
```

## Verify

```sh
npm view @youp-grid/core version
npm view @youp-grid/react version
```

Create and push a git tag after the npm versions are visible:

```sh
git tag v0.0.0
git push origin v0.0.0
```
