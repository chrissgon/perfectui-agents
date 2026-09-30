#### Getting Started

# Installation

Install Perfect UI from a CDN or a package manager, and load its small script only for the overlays.

### CDN

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@chrissgon/perfectui@latest/dist/perfectui.css"
/>
```

```html
<script type="module">
  import "https://cdn.jsdelivr.net/npm/@chrissgon/perfectui@latest/dist/js/index.js";
</script>
```

### Install by package manager

```bash
# npm
npm i @chrissgon/perfectui

# yarn
yarn add @chrissgon/perfectui
```

Import everything:

```js
import "@chrissgon/perfectui/perfectui.css";
```

Or import only what you use:

```js
import "@chrissgon/perfectui/core.css";
import "@chrissgon/perfectui/components/button.css";
```

### What the script does

```js
import "@chrissgon/perfectui";
```
