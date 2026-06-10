# Contributing

Thanks for taking time to improve Youp Grid.

This project keeps changes small and explicit. Please open an issue first for large API changes, behavior changes, or new feature areas.

## Local Setup

```sh
npm install
npm test
npm run build
npm run pack:dry-run
```

## Development Rules

- Keep core data behavior in `@youp-grid/core`.
- Keep React-only rendering and browser event handling in `@youp-grid/react`.
- Do not add framework-specific logic to the core package.
- Prefer narrow pull requests with one user-visible behavior change.
- Add or update tests when core behavior changes.
- Update docs when public props, types, keyboard behavior, or package usage changes.

## Pull Requests

Before opening a pull request, include:

- the problem being fixed
- the behavior after the change
- validation commands you ran
- screenshots or recordings for visible UI changes when useful

## Release Process

Releases are published from `main`.

```sh
npm test
npm run build
npm run pack:dry-run
```

Then update package versions, update `CHANGELOG.md`, tag the release, and publish the workspaces.

See [docs/RELEASE.md](docs/RELEASE.md) for the full checklist.

## License

By contributing, you agree that your contribution is licensed under the MIT license in this repository.
