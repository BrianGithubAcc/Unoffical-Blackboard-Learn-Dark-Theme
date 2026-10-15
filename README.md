# Blackboard Learn Dark Theme for Firefox

A lightweight Firefox add-on that recolors Blackboard Learn's Ultra and Original interfaces with a deep slate background, soft teal accents, readable text, and dark form controls.

## How It Works

The add-on applies a dark theme by overriding Blackboard Learn's existing CSS styles. When enabled, it stays on as you navigate and reload pages on that site. Firefox asks for access to the current site the first time you enable it.

## Bugs, Features, and Contributions

For visual bugs, please use the **Visual Bug** issue template. For other bugs or feature suggestions, open an issue. Pull requests are welcome.
 
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
