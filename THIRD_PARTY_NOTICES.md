# Third-party notices

Dinvolt's own code and the two starter background images created by Nico Andrade (`catalog/ui/welcome-background.webp` and `catalog/registry/admin-panel/auth/login-background.jpg`) are covered by the root [MIT license](LICENSE). Third-party components and assets retain their own licenses; the MIT grant does not relicense them.

Generated applications receive the Dinvolt notice in `docs/licenses/dinvolt.txt`. Independently installable blocks include a `docs/licenses/dinvolt-<block>.txt` notice. Preserve these notices with the starter code; they do not choose a license for your application's original code.

## shadcn/ui

Vendored UI primitives, examples and adapted blocks originate from [shadcn/ui](https://github.com/shadcn-ui/ui), under MIT. Copyright notices are preserved in:

- `catalog/ui/components/LICENSE.shadcn`
- `catalog/registry/LICENSE.shadcn`
- `playground/component-examples/LICENSE.shadcn`
- `playground/showcase/LICENSE.shadcn`

The `upstream.json` files record imported source URLs and snapshot hashes. Dinvolt modifications do not change those historical hashes. Component and block installation preserves the applicable shadcn notices in generated applications.

## Nucleo UI icons

The 23 icon components in `catalog/ui/components/icons/` originate from [Nucleo UI](https://nucleoapp.com/ui-icons). They are **not MIT licensed**. See the [Nucleo license](https://nucleoapp.com/license/) and the accompanying [copyright notice](catalog/ui/components/icons/LICENSE.nucleo).

Nucleo's published terms allow up to 100 icons in templates and open source projects with their copyright notice, and impose separate restrictions on sublicensing and redistribution outside the bundled product. Keep the notice with these icons and review those terms before reusing them in another template, icon collection or distribution. Dinvolt installs the notice alongside the shared icons in generated applications. Adding an attribution does not grant permissions beyond Nucleo's terms.

## Inter

The bundled `catalog/ui/og/Inter-Bold.ttf` is from the [Inter project](https://github.com/rsms/inter) and uses the SIL Open Font License 1.1. Its full notice is in [Inter-OFL.txt](catalog/ui/og/Inter-OFL.txt), copied alongside the font into generated applications.

## Package dependencies and external skills

Dependencies retain the notices and licenses included in their packages. `bun.lock` records the repository's resolved dependencies; generated applications have their own manifests and lockfiles. External agent skills selected in `catalog/skills/config.json` are downloaded from their respective upstream projects and retain those projects' terms.
