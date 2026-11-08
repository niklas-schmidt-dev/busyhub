# Signing and notarizing the macOS build

BusyHub updates itself from the GitHub releases. Windows and Linux builds can do that as they are. On macOS, an update only installs when it is signed with the same Developer ID as the running app; an ad-hoc signed build, which is what a release without the secrets below contains, can only tell you that a new version is out.

With the secrets set, the release workflow signs the macOS build with your Developer ID and has Apple notarize it. That also removes the "Open Anyway" step on first launch.

## What you need

- A membership in the [Apple Developer Program](https://developer.apple.com/programs/) (99 USD a year; an individual membership is enough).
- A Mac with Keychain Access, and `gh` signed in to this repository.

## 1. Create the certificate

1. In Xcode, open **Settings → Accounts**, select your Apple ID, then **Manage Certificates… → + → Developer ID Application**.
   Without Xcode: create a certificate signing request in **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**, then upload it at [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/add) as a **Developer ID Application** certificate and open the downloaded file.
2. In **Keychain Access → My Certificates**, find **Developer ID Application: Your Name (TEAMID)**. The ten characters in parentheses are your Team ID.
3. Right-click it, choose **Export**, save it as `DeveloperID.p12` and set a password. The export holds the private key: keep it somewhere safe, such as your password manager.

## 2. Create an app-specific password

Notarization signs in with your Apple ID. At [account.apple.com](https://account.apple.com) → **Sign-In and Security → App-Specific Passwords**, create one named `BusyHub notarization`.

## 3. Store the secrets in the repository

`gh secret set` reads each value from standard input, so none of them lands in your shell history:

```sh
base64 -i DeveloperID.p12 | gh secret set MAC_CERTIFICATE
gh secret set MAC_CERTIFICATE_PASSWORD      # the .p12 export password
gh secret set APPLE_TEAM_ID                 # the ten-character Team ID
gh secret set APPLE_ID                      # your Apple ID email address
gh secret set APPLE_APP_SPECIFIC_PASSWORD   # the password from step 2
```

Then delete the `.p12` file from the folder you exported it to, keeping your safe copy.

## 4. Release

Push a version tag as usual (see [CONTRIBUTING.md](../CONTRIBUTING.md#releases)). The macOS job's log shows `signing ... identityName=Developer ID Application: …` and a notarization step; notarization usually takes a few minutes.

Copies of BusyHub that are already installed with an ad-hoc signature cannot verify the first signed release, so install that one once by hand (the `install.sh` one-liner or the `.dmg`). Every release after it installs itself.

## Renewing

A Developer ID Application certificate lasts five years. Updates check the Team ID, not the certificate itself, so a renewed certificate from the same team keeps updates working: export it and replace `MAC_CERTIFICATE` and `MAC_CERTIFICATE_PASSWORD`.
