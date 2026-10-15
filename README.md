# Blackboard Learn Dark Theme for Firefox

A lightweight Firefox add-on that recolors Blackboard Learn's Ultra and Original interfaces with a deep slate background, soft teal accents, readable text, and dark form controls.

## Use it

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and select this folder's `manifest.json`.
3. Open your institution's Blackboard Learn page and click the moon icon in the toolbar.
4. Use the switch to turn the theme on or off for that tab.
5. Use the **Course banner** color swatch in the popup to choose the gradient and accent line for empty course banners.

The theme is applied only after you click the toolbar button. It works on institution-specific Blackboard addresses because it uses Firefox's temporary access to the active tab instead of requesting access to every website. Refreshing or navigating to another page clears the theme; click the button again to reapply it.

The extension has no background service, sends no data, and stores no browsing information. The selected banner color is saved locally in Firefox. Course content such as images and video is left intact. Some institution-specific layouts may need additional CSS selectors.
