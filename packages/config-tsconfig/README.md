# @q9labsai/config-tsconfig

Strict TypeScript bases. Extend one per package:

| File                    | Use for                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `tsconfig.base.json`    | flags only; every other file extends it                                         |
| `tsconfig.library.json` | published packages (`composite`, `declaration`, `rootDir: src`, `outDir: dist`) |
| `tsconfig.react.json`   | React apps (DOM libs, `react-jsx`)                                              |
| `tsconfig.workers.json` | Cloudflare Workers entries                                                      |
| `tsconfig.node.json`    | Node scripts / APIs                                                             |

```json
{ "extends": "@q9labsai/config-tsconfig/tsconfig.library.json", "include": ["src"] }
```

`exactOptionalPropertyTypes` is the first flag to relax if a dependency fights it — do it per package, with a comment saying which dependency.
