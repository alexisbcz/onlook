# Onlook mobile template

The starter [Onlook](https://github.com/alexisbcz/onlook) uses for new iOS and Android apps. It lives in `templates/expo/` and is published to the `template-expo` branch so CodeSandbox can clone it.

It's a regular Expo app: Expo Router for screens in `src/app/`, NativeWind for Tailwind `className` styling, and React Native Web so Onlook can render the app on its canvas.

```bash
bun install
bun run dev      # web preview on :8081, the one Onlook frames
bun run ios      # iOS Simulator or Expo Go
bun run android  # Android emulator or Expo Go
```

## The `onlook/` folder

- `babel-plugin-react-native.js` turns `data-oid` props into react-native-web's `dataSet`, so Onlook can map what you click on the canvas back to your code. iOS and Android ignore it.
- `preload.js` is written by Onlook. It loads the editor bridge on web, and only when the app runs inside the Onlook editor.

You can delete both if you stop using Onlook.
