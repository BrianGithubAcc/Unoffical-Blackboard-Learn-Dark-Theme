# Blackboard Learn Dark Theme for Firefox

A lightweight Firefox add-on that recolors Blackboard Learn's Ultra and Original interfaces with a deep slate background, soft teal accents, readable text, and dark form controls.

## How does it work
The addon mostly just forces an overwrite of the exsiting css properties to force a dark theme.
## Bugs,Features and Contribution
For any visual bugs please see the issue template if you have a bug that is not visual please open an issue, for feature suggestion please just open an issue.PRs are welcomed.
 reword
 
## Build The Addon

Install Node.js and Mozilla's `web-ext` tool if needed:

```sh
npm install --global web-ext
```

From the repository root, create the package:

```sh
web-ext build --overwrite-dest --filename="{name}.xpi"
```

The unsigned `.xpi` is written to `web-ext-artifacts/`. An XPI is a ZIP archive with an `.xpi` extension; this command packages the extension but does not sign it.
