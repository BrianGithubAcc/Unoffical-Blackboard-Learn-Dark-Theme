# Blackboard Learn Dark Theme for Firefox

A lightweight Firefox add-on that recolors Blackboard Learn's Ultra and Original interfaces with a deep slate background, soft teal accents, readable text, and dark form controls.


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
