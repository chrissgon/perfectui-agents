#### Components

# Modal

Built on `<dialog>`. The browser handles the top layer, the backdrop, focus trapping and the escape key.

```html live name=basic
<button class="pui-btn pui-solid pui-theme" commandfor="confirm" command="show-modal">Open</button>
<dialog class="pui-modal" id="confirm" closedby="any">
  <div class="pui-card">This cannot be undone.</div>
</dialog>
```

### A static backdrop

Leave `closedby` off and the backdrop stops dismissing the dialog.
