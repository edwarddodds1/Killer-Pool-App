# React Native to Xcode Handoff

This checklist is for the non-wrapper React Native path.

## What is already done in repo

- Native project scaffold created at `KillerPoolNative/`.
- iOS project exists at `KillerPoolNative/ios`.
- Core app screens and navigation scaffolded in `KillerPoolNative/src`.
- Domain/game/store service migration started from web app logic.
- Supabase hooks wired for room and timer features.

## Mac steps to reach Xcode-ready state

From `KillerPoolNative` on macOS:

1. `npm install`
2. `bundle install`
3. `bundle exec pod install --project-directory=ios`
4. `open ios/HelloWorld.xcworkspace`

In Xcode:

1. Set Team and signing for Debug/Release.
2. Set bundle id and display name.
3. Set version and build number.
4. Add app icon and launch assets.
5. Select an iPhone simulator/device and build.

## Optional iOS target rename

The current iOS target is `HelloWorld` because React Native init failed a rename step on Windows file permissions.

This can be fixed on Mac by:

- renaming target/project in Xcode
- updating `app.json` values
- confirming `PRODUCT_BUNDLE_IDENTIFIER` and scheme names

This rename is cosmetic and not required to archive.

## Environment variables required

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Set them in your shell or via Xcode scheme environment settings.

## Exit condition for this phase

You are at "Xcode-ready" when:

- workspace opens
- pods install succeeds
- app builds and launches on simulator/device
- signing errors are resolved
