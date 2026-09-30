# Migrating from 0.x

`1.0.0` is a rewrite. Every class is prefixed.

<!-- site: tags: [guide, migration] -->
<!-- site: from: 0.23.0 -->
<!-- site: to: 1.0.0-beta.1 -->

### 2. Add the prefix

```diff
-<button class="btn style-solid-primary">Save</button>
+<button class="pui-btn pui-solid pui-theme">Save</button>
```

### 3. Split style from color

| `0.23.0`              | `1.0.0`                 |
| --------------------- | ----------------------- |
| `style-solid-primary` | `pui-solid pui-theme`   |
| `style-*-secondary`   | `pui-<style> pui-muted` |
| `style-white`         | `pui-solid pui-surface` |

### 4. Components

| `0.23.0`                                                                                                  | `1.0.0`                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`btn`](https://github.com/chrissgon/perfectui/blob/v0.23.0/docs/button.md)                               | `pui-btn`                                         |
| [`card`](https://github.com/chrissgon/perfectui/blob/v0.23.0/docs/card.md), `card-header`, `card-content` | `pui-card`, `pui-card-header`, `pui-card-content` |

#### Modal

```diff
-<div class="modal" id="confirm">
-  <div class="card">…</div>
-</div>
+<dialog class="pui-modal" id="confirm" closedby="any">
+  <div class="pui-card">…</div>
+</dialog>
```

### 5. Dark mode

```diff
-<html class="dark">
+<html data-pui-mode="dark">
```

### 7. Things that were removed with no replacement

| Removed                                | What to do instead                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `.bg-*`, `.text-*`, `.border-*`        | Your own CSS, or Tailwind                                                        |
| `list-bordered`, `unmarker`, `.active` | Composition: `pui-outline pui-surface`, `list-style: none`, `pui-soft pui-theme` |

`table-striped`, `table-hoverable`, `list-striped` and `list-hoverable` survive
as `pui-striped` and `pui-hoverable`.
