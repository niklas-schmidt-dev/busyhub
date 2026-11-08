# My BUSY Bar app

Made with BusyHub's starter: a title, a counter on the wheel, a setting and storage.

| Control | Does |
| --- | --- |
| Wheel | Count up or down |
| OK | Reset |
| Back | Quit and save the count |

## Change it

Edit `src/main.ts`, then press **Run** in BusyHub. Choose **On the bar** to install it there, or **On this computer** to run it from here.

- `src/appmeta/manifest.json`: the app's name, version and description.
- `src/appmeta/settings.json`: settings BusyHub and the bar show as a form. Mark API keys `"sensitive": true`.
- `hub.json`: how BusyHub's catalog shows the app.

The [BUSY JS app guide](https://docs.busy.app/bar/dev/js-apps/build) explains drawing, input, settings and `fetch`.

## Without BusyHub

```sh
npm install
npm run build          # dist/<id>.tgz
npm run app:install    # over USB, or add --addr <bar-ip> --password <password>
npm run app:run
```
