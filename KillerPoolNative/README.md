# Killer Pool Native (React Native)

This is the native (non-wrapper) app path for App Store submission.

## Included in this project

- Bare React Native scaffold with iOS and Android folders.
- Native stack navigation and core screens:
  - Home
  - Join
  - Room
  - Timer
  - Leaderboard
- Ported domain model/types and game helpers.
- AsyncStorage + Supabase service layer for profile, room, and timer flows.

## Environment variables

Set these before running Metro/build:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Local development

```sh
npm install
npm start
```

## iOS (macOS) steps

```sh
bundle install
bundle exec pod install --project-directory=ios
open ios/HelloWorld.xcworkspace
```

Note: iOS target naming is currently `HelloWorld` due a Windows rename permission during init. This does not block launch and can be renamed in Xcode before release.

## Xcode-ready checklist

1. Open `ios/HelloWorld.xcworkspace`.
2. Set Team and signing (Debug + Release).
3. Set final bundle identifier.
4. Set app display name to `Killer Pool`.
5. Add icon and launch assets.
6. Set version/build number.
7. Archive and upload to App Store Connect.
