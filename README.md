# BetterMykoob

BetterMykoob is a Chrome extension (Manifest V3) that gives the web version of [Mykoob](https://family.mykoob.lv/) a clearer, responsive interface. Mykoob remains responsible for login, school data and actions. The extension runs on `https://family.mykoob.lv/*` and does not require a separate account.

## Installing BetterMykoob

1. Open the [latest GitHub Release](https://github.com/xkyota/betterMykoob/releases/latest).
2. Download `bettermykoob-vX.Y.Z.zip` from **Assets**. Use this file rather than GitHub's automatically generated “Source code” archive.
3. Extract the ZIP. It contains a `BetterMykoob` folder with `manifest.json` and the built extension files. Keep this folder in a permanent location.
4. Open `chrome://extensions` in Google Chrome.
5. Enable **Developer mode** in the top right corner.
6. Click **Load unpacked**.
7. Select the extracted `BetterMykoob` folder (the folder containing `manifest.json`).
8. Open or reload [Mykoob](https://family.mykoob.lv/). BetterMykoob activates automatically on the supported Mykoob domain.

![Chrome Extensions page showing Developer mode, Load unpacked and the installed extension](docs/install/chrome-extensions.svg)

![The BetterMykoob folder to select after extracting the release ZIP](docs/install/select-folder.svg)

The images are visual installation guides; Chrome and the file picker may look different on your computer.

### Updating a GitHub installation

Chrome does not automatically update extensions installed through **Load unpacked**. For a new version, download and extract the latest release ZIP, replace the contents of the same `BetterMykoob` folder, then click **Reload** on the BetterMykoob card at `chrome://extensions`. Reload the open Mykoob page too. Keep `manifest.json` at the top level of the selected folder.

## Build from source

Requirements: Node.js 24, npm, and the `zip` command (available on macOS and GitHub's Ubuntu runner).

```bash
npm ci
npm run check
npm run build
```

`npm run build` creates a complete Chrome extension in `dist/`. Select `dist/` with **Load unpacked** for local development. To create the same ZIP used by GitHub Releases:

```bash
npm run package
```

The command rebuilds the extension and writes `release/bettermykoob-vX.Y.Z.zip`. The ZIP contains only the `BetterMykoob/` production folder. Neither `dist/` nor `release/` is committed to Git.

## Release process for maintainers

1. Update the version in `package.json`, `package-lock.json` and `manifest.json` to the same `X.Y.Z` value.
2. Run `npm ci`, `npm run package`, and check the extension locally in Chrome.
3. Commit and push the release changes to `main`.
4. Create and push the matching tag, for example `git tag v0.1.0` and `git push origin v0.1.0`.

The [release workflow](.github/workflows/release.yml) checks that the tag matches all three version files, runs TypeScript checks, builds the extension, verifies the ZIP and creates a GitHub Release with `bettermykoob-vX.Y.Z.zip` attached. The [build workflow](.github/workflows/ci.yml) checks pushes to `main` and pull requests. A release is published only after a version tag is pushed.

## Project structure

- `manifest.json`: Manifest V3 permissions and supported Mykoob domain.
- `src/mykoob/`: DOM parsing and normalized Mykoob models.
- `src/components/`: React presentation layer for Home, Diary and Grades.
- `src/content/`: content script and responsive styles.
- `scripts/`: version validation, manifest copy and release packaging.
- `public/`: static assets copied into the production build.

The content script reads the existing Mykoob page. Its original controls remain in the document so BetterMykoob can invoke supported Mykoob actions. Pages without a dedicated redesign remain accessible through the original content inside the extension shell. BetterMykoob does not bundle student data or host its own backend.

## License

[MIT](LICENSE)
